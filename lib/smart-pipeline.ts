// Pipeline "smart" — busca + analise visual + rank + selecao por role + copy casada.
import { getAi, MODEL, BRAND_VOICE } from "./claude";
import { searchImages as _searchImages } from "./pipeline";
import { analyzeAndCache, enrichImagesWithPlantId, AnaliseVisual } from "./image-analysis";
import { analyzePrompt } from "./agents/prompt-analyst";
import { critiqueCarousel } from "./agents/carousel-critic";
import { extractJson } from "./utils";
import { getSupabase, ImageBankRow } from "./supabase";
import type { SlideSpec } from "./pipeline";
import { getRecentlyUsedImageIds, saveCarrossel } from "./history";
import { getBrandVoiceReferences } from "./brand-voice";

/**
 * Enriquece linhas da busca semantica (que retornam campos limitados)
 * com o row completo da tabela image_bank (arquivo, plantas, mood, cores,
 * porte, elementos_form, etc).
 */
async function enrichFromImageBank(rows: ImageBankRow[]): Promise<ImageBankRow[]> {
  if (!rows.length) return rows;
  const supabase = getSupabase();
  const ids = rows.map((r) => r.id);
  const { data } = await supabase
    .from("image_bank")
    .select("*")
    .in("id", ids);
  if (!data) return rows;
  const byId = new Map(data.map((d: any) => [d.id, d]));
  return rows.map((r) => {
    const full = byId.get(r.id) || {};
    // preserva similarity da busca semantica
    return { ...full, ...r, analise_visual: full.analise_visual ?? (r as any).analise_visual };
  });
}

export type AnalyzedImage = ImageBankRow & {
  analise_visual: AnaliseVisual;
  score_composto?: number;
  aderencia_tema?: number;
};

export type SmartSelection = {
  cover: AnalyzedImage;
  inner: AnalyzedImage[];   // 4 slides
  cta: AnalyzedImage;
  alternatives: AnalyzedImage[];
  rationale?: string;
};

function composite(img: AnalyzedImage, semanticScore = 1, aderencia = 1): number {
  const a = img.analise_visual;
  // aderencia ao tema pesa 30% do score composto (antes nao pesava)
  return (
    0.35 * a.cover_potential +
    0.15 * a.composicao +
    0.10 * a.qualidade +
    0.10 * semanticScore * 10 +
    0.30 * aderencia * 10
  );
}

/**
 * Mede quao aderente uma imagem e ao tema.
 * Conta interseccao entre palavras do tema (lowercase, 4+ chars) e
 * palavras da analise_visual (descricao_visual, hero_element, palavras_chave).
 * Retorna 0-1.
 */
function aderenciaTema(prompt: string, img: AnalyzedImage): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const STOP = new Set([
    "para", "pela", "pelo", "como", "sobre", "todo", "toda", "essa", "esse", "este",
    "esta", "quando", "onde", "porque", "mais", "menos", "pelo", "pela", "alto",
    "padrao", "jardim", "jardins", "paisagismo", "projeto", "carrossel", "instagram",
    "visual", "voce", "apenas", "entre", "ainda", "sempre", "contra", "tambem",
  ]);
  const termos = norm(prompt)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
  if (!termos.length) return 0.5;
  const hay = norm(
    [
      img.analise_visual.descricao_visual,
      img.analise_visual.hero_element,
      (img.analise_visual.palavras_chave || []).join(" "),
      (img.analise_visual.mood_real || []).join(" "),
      (img.plantas || []).join(" "),
      (img.elementos_form || []).join(" "),
      (img.estilo || []).join(" "),
      img.descricao || "",
    ].join(" "),
  );
  let hits = 0;
  for (const t of termos) if (hay.includes(t)) hits++;
  return hits / termos.length;
}

const SELECT_SYSTEM = `Voce e curador de carrossel de Instagram pra @digitalpaisagismo. Dado um TEMA e uma lista de imagens analisadas (cada uma com descricao_visual, hero_element, scores), escolha as 6 melhores em roles especificos.

Roles:
- COVER (1): maior impacto visual, aderente ao tema, com respiro pro texto da capa. Prefira fotos com cover_potential >= 7.
- INNER (4): narrativa progressiva, diversidade de enquadramento (jamais 2 fotos com cena similar).
- CTA (1): foto que convide contemplacao/fechamento — diferente das anteriores.

REGRAS DURAS (NAO quebre):
1. Os 6 IDs DEVEM ser TODOS DIFERENTES. NUNCA repita o mesmo id em 2 posicoes.
2. cover_id + 4 inner_ids + cta_id = 6 IDs unicos obrigatorios.
3. Se 2 fotos tem descricao_visual muito similar (mesmo contexto/enquadramento), escolha uma so.
4. NAO escolha cover com cover_potential < 6 — prefira >= 7.
5. Varie HERO_ELEMENT entre os inner: nao 4 pataques de piscina, nao 4 corredores, nao 4 muros verdes. Contexto/angulo/escala variados.

Retorne JSON puro:
{
  "cover_id": <id>,
  "inner_ids": [<id>, <id>, <id>, <id>],
  "cta_id": <id>,
  "rationale": "<1 frase justificando a selecao>"
}`;

export async function rankAndSelect(
  prompt: string,
  analyzed: AnalyzedImage[],
): Promise<SmartSelection> {
  if (analyzed.length < 6) {
    throw new Error(`Apenas ${analyzed.length} imagens disponiveis — minimo 6`);
  }

  // Penalidade pra imagens usadas nos ultimos 20 carrosseis (anti-repeticao)
  const recentIds = await getRecentlyUsedImageIds(20);

  // Score composto: cover_potential + composicao + qualidade + semantic + aderencia - penalidade_repeticao
  const withAder = analyzed.map((im) => ({
    img: im,
    ader: aderenciaTema(prompt, im),
    score: 0,
    repeated: recentIds.has(im.id),
  }));
  withAder.forEach((x) => {
    let s = composite(x.img, 1, x.ader);
    if (x.repeated) s -= 2.5; // penalidade (score base tipicamente 3-7, 2.5 e significativo)
    x.score = s;
  });
  withAder.sort((a, b) => b.score - a.score);
  const ranked = withAder.map((x) => x.img);
  const top12 = withAder.slice(0, 12);

  const summary = top12
    .map(
      ({ img, ader, repeated }) =>
        `id=${img.id}${repeated ? " [usada-recente]" : ""} | cover=${img.analise_visual.cover_potential.toFixed(1)} comp=${img.analise_visual.composicao.toFixed(1)} ader=${(ader * 100).toFixed(0)}% | ${img.analise_visual.descricao_visual} | hero: ${img.analise_visual.hero_element}`,
    )
    .join("\n");

  const r = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      { role: "system", content: SELECT_SYSTEM },
      {
        role: "user",
        content: `Tema: "${prompt}"\n\nTop 12 candidatas:\n${summary}\n\nEscolha e retorne JSON puro.`,
      },
    ],
  });
  const raw = r.choices[0]?.message?.content || "";
  const picked = extractJson<{ cover_id: number; inner_ids: number[]; cta_id: number; rationale?: string }>(raw);

  const byId = new Map(analyzed.map((a) => [a.id, a]));
  const cover = byId.get(picked.cover_id);
  const cta = byId.get(picked.cta_id);
  const innerRaw = (picked.inner_ids || [])
    .map((id) => byId.get(id))
    .filter((x): x is AnalyzedImage => !!x);

  // dedupe rigoroso: cover + inner + cta devem ser 6 ids diferentes
  const usedNow = new Set<number>();
  if (cover) usedNow.add(cover.id);
  if (cta) usedNow.add(cta.id);
  const innerUnique: AnalyzedImage[] = [];
  for (const im of innerRaw) {
    if (usedNow.has(im.id)) continue;
    usedNow.add(im.id);
    innerUnique.push(im);
    if (innerUnique.length >= 4) break;
  }

  // se faltar alguem, completar com ranked que nao esta em uso
  const ensureUnique = (current: AnalyzedImage[] | undefined, needed: number): AnalyzedImage[] => {
    const out = [...(current || [])];
    for (const r of ranked) {
      if (out.length >= needed) break;
      if (!usedNow.has(r.id)) {
        out.push(r);
        usedNow.add(r.id);
      }
    }
    return out.slice(0, needed);
  };

  let finalCover = cover && !(cta && cover.id === cta.id) ? cover : undefined;
  if (!finalCover) {
    finalCover = ranked.find((r) => !usedNow.has(r.id)) || ranked[0];
    usedNow.add(finalCover.id);
  }

  let finalCta = cta && cta.id !== finalCover.id ? cta : undefined;
  if (!finalCta) {
    finalCta = ranked.find((r) => !usedNow.has(r.id)) || ranked[ranked.length - 1];
    usedNow.add(finalCta.id);
  }

  const finalInner = ensureUnique(innerUnique, 4);

  const allIds = new Set<number>([finalCover.id, finalCta.id, ...finalInner.map((i) => i.id)]);
  const alternatives = ranked.filter((a) => !allIds.has(a.id));

  // anexa score_composto + aderencia_tema em cada imagem (antes null no payload)
  const scoreById = new Map(withAder.map((x) => [x.img.id, { score: x.score, ader: x.ader }]));
  const attach = <T extends AnalyzedImage>(im: T): T => {
    const s = scoreById.get(im.id);
    if (!s) return im;
    return { ...im, score_composto: Number(s.score.toFixed(2)), aderencia_tema: Number((s.ader * 100).toFixed(0)) } as T;
  };

  return {
    cover: attach(finalCover),
    inner: finalInner.map(attach),
    cta: attach(finalCta),
    alternatives: alternatives.map(attach),
    rationale: picked.rationale || "fallback determinstico",
  };
}

function buildCopyFromAnalysisSchema(slideCount: number): string {
  const lastIdx = slideCount - 1;
  return `Retorne JSON: { "slides": [${slideCount} items] } sem markdown.
Ordem: [0]cover, [1..${lastIdx - 1}]plantDetail|inspiration, [${lastIdx}]cta.

cover: { type:"cover", imageIdx:0, topLabel, numeral:null, title, italicWords:[] }
plantDetail: { type:"plantDetail", imageIdx, nomePopular, nomeCientifico, title:null, subtitle:null, topLabel:null }
inspiration: { type:"inspiration", imageIdx, title, subtitle, topLabel, nomePopular:null, nomeCientifico:null }
cta: { type:"cta", imageIdx:${lastIdx}, pergunta, italicWords:[] }

# FILOSOFIA DO CARROSSEL

Carrossel eh uma TESE DESENVOLVIDA em ${slideCount} slides. NAO eh listagem.
Capa afirma uma crenca; slides internos sustentam com argumentos/observacoes
concretas; CTA final convida a contemplacao — nao pitch.

# REGRAS ESTRUTURAIS

- slides[0].type DEVE ser "cover"; slides[${lastIdx}].type DEVE ser "cta"
- numeral: SEMPRE null. NAO prometa "N especies", "N decisoes", "N motivos" — vira vazio
  porque na maioria das vezes nao existe exatamente N de qualquer coisa pra falar.
  Use numero so se for FATO concreto (ex: "8 anos" da historia da planta).
- Titulos da capa: SEM numero generico na frente. NAO "As 5 plantas que...", NAO
  "3 coisas que...". Prefira afirmacao/tese direta.
- plantDetail SO se a planta aparece VISIVELMENTE na imagem — caso contrario use
  inspiration. Preferir inspiration pra desenvolver a TESE mesmo em slides internos.
- CTA: pergunta aberta contemplativa — nao "me manda no direct", nao "em que fase"

REGRAS DE COERENCIA (CRITICAS):
- A descricao_visual de cada imagem e SUA FONTE DE VERDADE. Nao invente elementos.
- NUNCA afirme "no slide N aparece X" se X nao esta na descricao_visual do slide N.
- NUNCA crie plantDetail com especie que nao esta em plantas[] da imagem ou descricao_visual.
- Se o tema cita algo (ex: muro verde, jardim noturno, jardim seco, palmeiras) e NENHUMA imagem mostra,
  ADAPTE o copy — foque no PRINCIPIO em vez de descrever algo ausente. Nao minta.
- Se uma imagem mostra um jardim tropical e o tema pede seco, NAO chame a cena de "seco" — trate como
  exemplo complementar, contraponto ou principio universal.
- Se for criar plantDetail, escolha especies que REALMENTE aparecem na lista "plantas" ou "descricao_visual"
  da imagem aquela imageIdx. Se nao tiver planta identificada na foto, use inspiration em vez de plantDetail.

Copy deve ser sofisticado, sem clichê. Citar luz, textura, materiais quando presentes.`;
}

export async function generateCopyFromAnalysis(
  prompt: string,
  selection: SmartSelection,
  opts: { slideCount?: number; approachFocus?: string } = {},
): Promise<{ slides: SlideSpec[] }> {
  const ordered = [selection.cover, ...selection.inner, selection.cta];
  const slideCount = Math.max(6, Math.min(10, opts.slideCount ?? ordered.length));
  const schema = buildCopyFromAnalysisSchema(slideCount);

  const imgSummary = ordered
    .slice(0, slideCount)
    .map((im, i) => {
      const a = im.analise_visual;
      const plantas = (im.plantas || []).slice(0, 6).join(", ");
      const materiais = (im.elementos_form || []).slice(0, 4).join(", ");
      return `[${i}] VE: ${a.descricao_visual}
     hero: ${a.hero_element}
     plantas identificadas na foto: ${plantas || "(nao identificado)"}
     materiais/elementos: ${materiais || "(nao catalogado)"}
     mood: ${(a.mood_real || []).join(", ")}`;
    })
    .join("\n\n");

  const approachBlock = opts.approachFocus
    ? `\n\nFOCO DE ABORDAGEM: "${opts.approachFocus}" — tempera o tom dos slides de acordo.`
    : "";

  const userMsg = `Tema pedido pelo usuario: "${prompt}"${approachBlock}

Imagens disponiveis e o que cada uma MOSTRA (fonte de verdade):
${imgSummary}

Hints de curadoria: ${selection.rationale || "-"}

${schema}

Verifique: cada elemento que voce citar no copy TEM que estar na descricao/plantas/materiais da imagem correspondente. Alucinacao = falha grave.`;

  // Injeta tom real do perfil (top-20 posts) pra copy dos slides tb imitar ritmo
  const voiceRefs = await getBrandVoiceReferences();
  const systemComVoice = voiceRefs
    ? `${BRAND_VOICE}\n\n${voiceRefs}\n\nNO TEXTO DO SLIDE (diferente da legenda): sem emoji, sem hashtag. Mas o RITMO/tom/vocabulario dos exemplos acima serve como referencia.\n\n${schema}`
    : BRAND_VOICE + "\n\n" + schema;

  const r = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 2400,
    messages: [
      { role: "system", content: systemComVoice },
      { role: "user", content: userMsg },
    ],
  });
  const raw = r.choices[0]?.message?.content || "";
  let parsed: any = extractJson(raw);
  if (Array.isArray(parsed)) parsed = { slides: parsed };
  return parsed;
}

/**
 * Normaliza string pra comparacao (minuscula + sem acento).
 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Valida cada plantDetail: a planta citada DEVE estar em plantas[] da imagem
 * ou na descricao_visual. Caso contrario, converte em inspiration (evita
 * alucinacao de especie que nao aparece).
 */
export function validateSlidesAgainstImages(
  slides: SlideSpec[],
  imagesOrdered: AnalyzedImage[],
): SlideSpec[] {
  return slides.map((s, i) => {
    // FORCA imageIdx = posicao do slide. Evita duplicacao de foto entre
    // slides diferentes (ex.: IA alucinava plantDetail com imageIdx=5 e
    // o CTA tambem com imageIdx=5 — mesma foto em 2 slots).
    const fixedIdx = i;
    const img = imagesOrdered[fixedIdx];
    if (!img) return { ...s, imageIdx: fixedIdx };

    if (s.type !== "plantDetail") {
      return { ...s, imageIdx: fixedIdx };
    }

    // Valida: planta citada DEVE aparecer em plantas[] ou descricao da imagem DESSE slot.
    const plantasLista = (img.plantas || []).map(norm);
    const desc = norm(img.analise_visual?.descricao_visual || "");
    const hero = norm(img.analise_visual?.hero_element || "");
    const pool = [...plantasLista, desc, hero].join(" | ");
    const nomeSci = norm(s.nomeCientifico || "");
    const nomePop = norm(s.nomePopular || "");
    const tokens = [...nomeSci.split(/\s+/), ...nomePop.split(/[-\s]+/)].filter((t) => t.length >= 4);
    const hit = tokens.some((t) => pool.includes(t));
    if (hit) return { ...s, imageIdx: fixedIdx };

    // Fallback: converte em inspiration com titulo conceitual (nao o nome da especie alucinada)
    const heroLabel = (img.analise_visual?.hero_element || "").trim();
    const moods = (img.analise_visual?.mood_real || []).slice(0, 3).map(capFirst);
    const subtitle = moods.length
      ? moods.join(" · ")
      : (img.elementos_form || []).slice(0, 2).map(capFirst).join(" · ") || "";
    return {
      type: "inspiration",
      imageIdx: fixedIdx,
      title: heroLabel ? capFirst(heroLabel) : "Composicao vegetal",
      subtitle,
      topLabel: "COMPOSIÇÃO",
      nomePopular: null,
      nomeCientifico: null,
    } as SlideSpec;
  });
}

function capFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function searchAndSelect(
  prompt: string,
  opts: { candidateCount?: number; userBrief?: string; skipAgents?: boolean } = {},
): Promise<{
  selection: SmartSelection;
  allAnalyzed: AnalyzedImage[];
  analysis?: Awaited<ReturnType<typeof analyzePrompt>>;
}> {
  const count = opts.candidateCount ?? 24;

  // AGENTE 1: Prompt Analyst — enriquece o prompt antes da busca
  let enrichedPrompt = prompt;
  let analysis: Awaited<ReturnType<typeof analyzePrompt>> | undefined;
  if (!opts.skipAgents) {
    try {
      analysis = await analyzePrompt(prompt, opts.userBrief);
      enrichedPrompt = analysis.enrichedPrompt || prompt;
    } catch {
      /* fallback: usa prompt cru */
    }
  }

  const { imagens } = await _searchImages(enrichedPrompt, count);
  if (!imagens.length) throw new Error("Nenhuma imagem encontrada no banco pra esse tema");

  // enriquece (busca_semantica so retorna fonte/id/descricao/url/tipo_area/estilo/similarity/analise_visual)
  const enriched = await enrichFromImageBank(imagens);
  const analyzed = await analyzeAndCache(enriched);
  const selection = await rankAndSelect(prompt, analyzed);

  // Enriquece só as 6 selecionadas (cover + 4 inner + cta) com identificacao
  // profissional de plantas. RAG + Vision focado + validacao cruzada.
  // Fire-and-forget: nao bloqueia retorno, mas atualiza cache pra proximo uso.
  const toEnrich = [selection.cover, ...selection.inner, selection.cta].filter(
    (img) => img && img.id,
  );
  enrichImagesWithPlantId(toEnrich as any).catch((e) =>
    console.warn("[plant-id] enrich falhou:", e.message),
  );

  return { selection, allAnalyzed: analyzed, analysis };
}

export async function runSmartCarousel(
  prompt: string,
  opts: {
    withCaption?: boolean;
    candidateCount?: number;
    persist?: boolean;
    userBrief?: string;
    skipAgents?: boolean;
    slideCount?: number;        // 7-10 quando dinamico; default 8
    approachFocus?: string;     // per-variant: direta_emocional, contrarian_forte, etc
    presetSelection?: SmartSelection;       // reusa selecao de imagens ja analisadas
    presetAnalysis?: { persona?: string; enrichedPrompt?: string; mainDor?: string };
    presetAllAnalyzed?: AnalyzedImage[];
  } = {},
) {
  const slideCount = Math.max(6, Math.min(10, opts.slideCount ?? 8));
  let selection: SmartSelection;
  let allAnalyzed: AnalyzedImage[];
  let analysis: { persona?: string; enrichedPrompt?: string; mainDor?: string } | undefined;
  if (opts.presetSelection) {
    selection = opts.presetSelection;
    allAnalyzed = opts.presetAllAnalyzed ?? [];
    analysis = opts.presetAnalysis;
  } else {
    const searched = await searchAndSelect(prompt, {
      ...opts,
      candidateCount: opts.candidateCount ?? Math.max(16, slideCount * 3),
    });
    selection = searched.selection;
    allAnalyzed = searched.allAnalyzed;
    analysis = searched.analysis;
  }
  const { slides: rawSlides } = await generateCopyFromAnalysis(prompt, selection, {
    slideCount,
    approachFocus: opts.approachFocus,
  });
  const ordered = [selection.cover, ...selection.inner, selection.cta].slice(0, slideCount);
  let slides = validateSlidesAgainstImages(rawSlides, ordered);

  // AGENTE 2: Carousel Critic — avalia e opcionalmente regenera se score baixo
  let critique: Awaited<ReturnType<typeof critiqueCarousel>> | undefined;
  if (!opts.skipAgents) {
    try {
      critique = await critiqueCarousel({
        slides,
        prompt,
        persona: analysis?.persona,
      });
      // Se score < 65, faz 1 regen com feedback
      if (critique.score < 65 && critique.issues.length) {
        const retry = await generateCopyFromAnalysis(prompt, selection, {
          slideCount,
          approachFocus: opts.approachFocus,
        });
        slides = validateSlidesAgainstImages(retry.slides, ordered);
      }
    } catch {
      /* fallback: mantem slides originais */
    }
  }

  // Persiste no historico (anti-repeticao + learning loop)
  let carrosselId: string | undefined;
  if (opts.persist !== false) {
    const saved = await saveCarrossel({
      prompt,
      slides,
      imagens_ids: ordered.map((o) => o.id),
    });
    carrosselId = saved?.id;
  }

  return {
    id: carrosselId,
    prompt,
    selection,
    allAnalyzed,
    slides,
    imagens: ordered,
    analysis,
    critique,
  };
}
