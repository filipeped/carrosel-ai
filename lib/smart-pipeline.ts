// Pipeline "smart" — busca + analise visual + rank + selecao por role + copy casada.
import { getAi, MODEL, BRAND_VOICE } from "./claude";
import { searchImages as _searchImages } from "./pipeline";
import { analyzeAndCache, enrichImagesWithPlantId, AnaliseVisual } from "./image-analysis";
import { analyzePrompt } from "./agents/prompt-analyst";
import { critiqueCarousel } from "./agents/carousel-critic";
import { planSlides, type SlideOutline } from "./agents/slides-architect";
import { extractJson } from "./utils";
import { getSupabase, ImageBankRow, VegetacaoRow, isPaisagistica } from "./supabase";
import type { SlideSpec } from "./pipeline";
import type { CarouselFormat } from "./types";
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
 * Mede overlap entre `image_bank.plantas[]` e nomes_populares de plantas escolhidas.
 * Retorna 0..1 — fracao de plantas escolhidas que aparecem na imagem.
 * Usado pra boost no ranking em modo plant-first.
 */
function overlapPlantas(img: AnalyzedImage, plantasEscolhidas: VegetacaoRow[]): number {
  if (!plantasEscolhidas?.length) return 0;
  const imgPlantas = (img.plantas || []).map(norm);
  const desc = norm(img.analise_visual?.descricao_visual || "");
  const haystack = imgPlantas.join(" | ") + " | " + desc;
  let hits = 0;
  for (const p of plantasEscolhidas) {
    const nomeNorm = norm(p.nome_popular || "");
    if (!nomeNorm) continue;
    if (haystack.includes(nomeNorm)) hits++;
  }
  return hits / plantasEscolhidas.length;
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
  plantasEscolhidas?: VegetacaoRow[],
): Promise<SmartSelection> {
  if (analyzed.length < 6) {
    throw new Error(`Apenas ${analyzed.length} imagens disponiveis — minimo 6`);
  }

  // Penalidade pra imagens usadas nos ultimos 20 carrosseis (anti-repeticao)
  const recentIds = await getRecentlyUsedImageIds(20);

  // Score composto: cover_potential + composicao + qualidade + semantic + aderencia - penalidade_repeticao
  // Quando ha plantas escolhidas, soma boost por overlap em image_bank.plantas (sem filtro estrito)
  const hasPlantas = !!plantasEscolhidas?.length;
  const withAder = analyzed.map((im) => ({
    img: im,
    ader: aderenciaTema(prompt, im),
    score: 0,
    repeated: recentIds.has(im.id),
    plantBoost: hasPlantas ? overlapPlantas(im, plantasEscolhidas!) : 0,
  }));
  withAder.forEach((x) => {
    let s = composite(x.img, 1, x.ader);
    if (x.repeated) s -= 4.0; // penalidade (score base tipicamente 3-7, 2.5 e significativo)
    if (x.plantBoost > 0) s += 1.5 * x.plantBoost; // ate +1.5 quando todas plantas batem
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
cta: { type:"cta", imageIdx:${lastIdx}, fechamento, italicWords:[] }

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
- CTA: fechamento contemplativo (afirmacao forte OU pergunta retorica curta) — nao "me manda no direct", nao "em que fase"

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
  opts: {
    slideCount?: number;
    approachFocus?: string;
    plantasEscolhidas?: VegetacaoRow[];
  } = {},
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

  const plantasBlock = opts.plantasEscolhidas?.length
    ? `\n\nPLANTAS PROTAGONISTAS (escolhidas pelo usuario, fonte de verdade):
${opts.plantasEscolhidas
  .map(
    (v, i) =>
      `${i + 1}. ${v.nome_popular}${v.nome_cientifico ? ` (${v.nome_cientifico})` : ""}${v.luminosidade ? ` | luminosidade: ${v.luminosidade}` : ""}${v.altura ? ` | altura: ${v.altura}` : ""}${v.categorias ? ` | categorias: ${v.categorias}` : ""}`,
  )
  .join("\n")}

REGRAS pra plantas:
- Em plantDetail, use SOMENTE plantas dessa lista. nomePopular e nomeCientifico devem bater EXATAMENTE.
- Cite pelo menos 2 dessas plantas ao longo do carrossel (cover/inspiration podem mencionar nomes; plantDetail confirma).
- Se uma planta da lista nao esta visivel em nenhuma imagem, voce ainda pode mencionar pelo nome em inspiration (texto), mas nao crie plantDetail dela.`
    : "";

  const userMsg = `Tema pedido pelo usuario: "${prompt}"${approachBlock}${plantasBlock}

Imagens disponiveis e o que cada uma MOSTRA (fonte de verdade):
${imgSummary}

Hints de curadoria: ${selection.rationale || "-"}

${schema}

Verifique: cada elemento que voce citar no copy TEM que estar na descricao/plantas/materiais da imagem correspondente OU na lista de plantas protagonistas. Alucinacao = falha grave.`;

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
  plantasEscolhidas?: VegetacaoRow[],
): SlideSpec[] {
  // Em modo plant-first, planta da lista escolhida tambem e considerada valida
  // mesmo que nao apareca na foto (foto serve de pano de fundo).
  const validSci = new Set(
    (plantasEscolhidas || [])
      .map((p) => norm(p.nome_cientifico || ""))
      .filter(Boolean),
  );
  const validPop = new Set(
    (plantasEscolhidas || [])
      .map((p) => norm(p.nome_popular || ""))
      .filter(Boolean),
  );

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

    // Plant-first: se a planta esta na lista escolhida, valida mesmo que nao
    // apareca na foto (a foto vira pano de fundo da especie protagonista).
    if (validSci.size > 0 && (validSci.has(nomeSci) || validPop.has(nomePop))) {
      return { ...s, imageIdx: fixedIdx };
    }

    // Fallback: converte em inspiration com titulo conceitual (nao o nome da especie alucinada)
    const heroLabel = (img.analise_visual?.hero_element || "").trim();
    const moods = (img.analise_visual?.mood_real || []).slice(0, 3).map(capFirst);
    const subtitle = moods.length
      ? moods.join(" · ")
      : (img.elementos_form || []).slice(0, 2).map(capFirst).join(" · ") || "";
    return {
      type: "inspiration",
      imageIdx: fixedIdx,
      title: heroLabel ? capFirst(heroLabel) : (img.descricao ? capFirst(img.descricao.split(",")[0].trim().substring(0, 40)) : "Paisagismo integrado"),
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
  opts: {
    candidateCount?: number;
    userBrief?: string;
    skipAgents?: boolean;
    plantasEscolhidas?: VegetacaoRow[];
  } = {},
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
  const selection = await rankAndSelect(prompt, analyzed, opts.plantasEscolhidas);

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

/**
 * Busca plantas no banco `vegetacoes` aderentes ao tema do prompt.
 * Heuristica: extrai termos do prompt (luminosidade, clima, ambiente) e usa
 * ILIKE em campos chave. Usado pelo /api/sugerir-plantas (UI) e como fallback
 * quando o body nao traz plantas pre-selecionadas.
 */
export async function fetchVegetacoesForPrompt(
  prompt: string,
  count = 14,
): Promise<VegetacaoRow[]> {
  const supabase = getSupabase();
  const p = norm(prompt);

  // Sinais de luminosidade
  let lumFilter: string | null = null;
  if (/sombra|meia.?sombra|sem sol/.test(p)) lumFilter = "sombra";
  else if (/sol pleno|sol forte|cheio de sol/.test(p)) lumFilter = "sol";

  let query = supabase.from("vegetacoes").select("*").limit(count * 2);
  if (lumFilter) query = query.ilike("luminosidade", `%${lumFilter}%`);

  // Filtros extras se prompt menciona contexto.
  // Usa prefixos curtos pra casar singular E plural no banco real (ex: "Tropicais", "Suculentas").
  if (/tropical|florida|colorida/.test(p)) query = query.ilike("categorias", `%tropic%`);
  if (/seco|cactus|suculenta/.test(p)) query = query.ilike("categorias", `%suculent%`);
  if (/folhagem|verde|massa/.test(p)) query = query.ilike("categorias", `%folha%`);

  const { data } = await query;
  const rows = (data || []) as VegetacaoRow[];
  // Filtra entradas sem nome popular E exclui nao-paisagisticas
  // (horticolas, daninhas, toxicas, ervas condimentares, frutas e legumes, panc).
  return rows
    .filter((r) => r.nome_popular && r.nome_popular.trim().length > 0)
    .filter((r) => isPaisagistica(r.categorias))
    .slice(0, count);
}

/**
 * Sanitiza texto de slide:
 * - Remove "—" (travessao) e substitui por virgula
 * - Remove ":" (dois pontos) e substitui por virgula
 * - Remove emojis nao permitidos
 * - Trim whitespace
 */
const SLIDE_EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu;
const SLIDE_ARROWS = /[→↑↓←➤➡]/g;

function sanitizeSlideText(s: string | undefined | null, maxWords?: number): string {
  if (!s) return "";
  let out = String(s)
    .replace(/\s—\s|—/g, ", ")
    .replace(/\s:\s|:(?!\/\/)(?!\d)/g, ", ") // mantem : em URLs e horarios
    .replace(SLIDE_EMOJI_RE, "")
    .replace(SLIDE_ARROWS, "")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  // Trunca por contagem de palavras (mantem frase coerente)
  if (maxWords && out.split(/\s+/).length > maxWords) {
    const words = out.split(/\s+/).slice(0, maxWords);
    out = words.join(" ").replace(/[,.;:]+$/, "") + ".";
  }
  return out;
}

/**
 * Valida slides de formatos NAO-CLASSICOS:
 * - Fixa imageIdx por posicao
 * - Sanitiza textos (remove "—", ":", emojis, trunca por word count)
 * - Listicle: forca numeral "01"-"0N" em ordem nos itens
 */
export function validateFormattedSlides(
  slides: SlideSpec[],
  imagesOrdered: AnalyzedImage[],
  plantasEscolhidas?: VegetacaoRow[],
): SlideSpec[] {
  let listItemCounter = 0;
  let totalListItems = 0;
  // Conta listItems pra forcar numeral coerente
  for (const s of slides) if (s.type === "listItem") totalListItems++;

  // Set normalizado dos nomes_cientificos validos pra cross-ref anti-alucinacao
  const validSci = new Set(
    (plantasEscolhidas || [])
      .map((p) => norm(p.nome_cientifico || ""))
      .filter(Boolean),
  );

  return slides.map((s, i) => {
    const fixedIdx = i;
    const cleaned: SlideSpec = { ...s, imageIdx: fixedIdx };

    if (s.type === "cover") {
      cleaned.title = sanitizeSlideText(s.title, 12);
      // Listicle: capa precisa de numeral igual ao total de itens
      if (totalListItems > 0 && !cleaned.numeral) {
        cleaned.numeral = String(totalListItems);
      }
    } else if (s.type === "cta") {
      cleaned.fechamento = sanitizeSlideText(s.fechamento || s.pergunta, 18);
    } else if (s.type === "beforeAfter") {
      cleaned.caption = sanitizeSlideText(s.caption, 14);
      // Garante phase valido
      if (!["ANTES", "PROCESSO", "DEPOIS"].includes(cleaned.phase || "")) {
        cleaned.phase = "PROCESSO";
      }
    } else if (s.type === "mythBuster") {
      cleaned.mito = sanitizeSlideText(s.mito, 14);
      cleaned.verdade = sanitizeSlideText(s.verdade, 18);
    } else if (s.type === "listItem") {
      listItemCounter++;
      // Forca numeral coerente ("01", "02", ...)
      cleaned.numeral = String(listItemCounter).padStart(2, "0");
      cleaned.nomePopular = sanitizeSlideText(s.nomePopular, 5);
      cleaned.nomeCientifico = sanitizeSlideText(s.nomeCientifico, 5);
      cleaned.dica = sanitizeSlideText(s.dica, 16);

      // Anti-alucinacao: se ha lista escolhida e LLM citou planta fora dela,
      // tenta substituir pela do mesmo nome popular OU zera nome cientifico.
      if (validSci.size > 0) {
        const sciNorm = norm(cleaned.nomeCientifico || "");
        const popNorm = norm(cleaned.nomePopular || "");
        if (sciNorm && !validSci.has(sciNorm)) {
          // Procura match por nome popular pra reusar o cientifico correto
          const match = (plantasEscolhidas || []).find(
            (p) => norm(p.nome_popular || "") === popNorm,
          );
          cleaned.nomeCientifico = match?.nome_cientifico || "";
        }
      }
    } else if (s.type === "problemSolution") {
      cleaned.problema = sanitizeSlideText(s.problema, 14);
      cleaned.solucao = sanitizeSlideText(s.solucao, 18);
    } else if (s.type === "inspiration") {
      cleaned.title = sanitizeSlideText(s.title, 12);
      cleaned.subtitle = sanitizeSlideText(s.subtitle, 22);
    }

    return cleaned;
  });
}

/**
 * Bloco compartilhado por todos os formatos novos: regras viralidade IG 2026.
 * Baseado em BRAND_CONTEXT.md (saves > shares > comments, ancoragem concreta,
 * anti-clichê, anti-comercial-vendedor).
 */
const FORMAT_VIRAL_RULES = `## REGRAS DE VIRALIDADE IG 2026 (DURAS)

ALGORITMO 2026 prioriza nesta ordem:
1. SHARES via DM (super-sinal #1) — texto que da vontade de mandar pro arquiteto/conjugue
2. SAVES — listas praticas, dicas concretas
3. COMMENTS — afirmacoes provocativas que geram debate
4. RETENTION — slide 2 segura ou perde tudo

ANCORAGEM CONCRETA (obrigatorio):
- Sempre cite planta especifica (palmeira, frangipani, ipe) OU espaco real (deck, piscina, corredor, fachada).
- Sem ancoragem = post genérico = avg 34 eng. Com ancoragem = avg 200+ eng.

CTA AFIRMATIVO (NAO PERGUNTA):
- Posts SEM pergunta: avg 247 eng. Posts COM pergunta: avg 73 eng (3.4x menos).
- Prefira afirmacao contemplativa que fecha com conviccao.
- Ex bom: "Esse e o detalhe que muda a casa inteira."
- Ex ruim: "Voce concorda? Comenta ai!"

PROIBIDO em qualquer texto de slide:
- Caractere "—" (travessao) e ":" (dois pontos). Use virgula ou ponto.
- Cliches: "incrivel", "imperdivel", "voce nao vai acreditar", "top", "sem complicacao", "exuberante", "coeso", "certinho"
- Inspiracional vazio: "abraça", "floresce", "respira natureza", "convida o olhar", "pulsa vida", "toca o coracao"
- Comercial vendedor: "contratar paisagista", "antes de chamar", "projeto 3D", "decisoes antes", "me manda no direct"
- Emoji nao permitido: 😍 🔥 💯 🤩 ❤️ 🙌 💪 🚀 (use 0 emoji nos slides — emoji eh so de legenda)

ANTI-ALUCINACAO:
- Nao cite elemento (piscina, pergolado, deck) que nao aparece na descricao_visual da imagem do slot.
- Nao invente especie de planta que nao esta na lista do banco fornecida.

VOCABULARIO PREMIUM:
- "quintal" -> "area externa"
- "jardim bonito" -> "paisagismo integrado"
- "orcamento" -> "investimento"
- "fazer o jardim" -> "desenvolver o projeto"`;

const FORMAT_SYSTEMS: Record<Exclude<CarouselFormat, "classic" | "catalog">, string> = {
  transformation: `Voce escreve copy pra carrossel de TRANSFORMACAO (antes/depois) do @digitalpaisagismo.
ESTRUTURA: capa + 6 slides beforeAfter (2 ANTES, 2 PROCESSO, 2 DEPOIS) + cta.

POR QUE ESSE FORMATO VIRALIZA: transformacoes geram SAVES e SHARES altos. Pessoas mostram pro conjugue/arquiteto pra validar. Foque no contraste visual da mudanca, nao na tecnica.

CAPA: hook de "quebra de expectativa" (afirmacao curta que contraria intuicao). Ex bom: "Antes de plantar, planejar muda tudo." Ex ruim: "Confira essa transformacao incrivel."

Cada slide beforeAfter tem "phase" e "caption" curta (max 14 palavras).
- Slides ANTES: caption observa o que ESTAVA ali (ex: "Area sem definicao, sol direto o dia todo.")
- Slides PROCESSO: caption descreve a decisao tecnica (ex: "Plantio de ancoras de massa antes do paisagismo fino.")
- Slides DEPOIS: caption afirma o ganho (ex: "Sombra natural na piscina sem perder a vista.")

CTA: afirmacao contemplativa sobre transformacao planejada vs improvisada. NAO PERGUNTA.

${FORMAT_VIRAL_RULES}`,

  myths: `Voce escreve copy pra carrossel de MITOS do @digitalpaisagismo.
ESTRUTURA: capa + 5 slides mythBuster + cta.

POR QUE ESSE FORMATO VIRALIZA: mitos geram COMMENTS (debate) e SHARES (envia pra quem caiu no mito). O algoritmo 2026 valoriza comentario.

CAPA: hook de "revelacao" (revela padrao que so quem ve muito jardim percebe). Ex bom: "5 verdades que arquiteta nenhuma te conta antes da obra." Ex ruim: "Mitos sobre paisagismo!"

Cada slide tem:
- mito: crenca falsa comum, max 14 palavras, ANCORADA em planta/espaco real (ex: "Suculenta nao precisa de sol direto")
- verdade: correcao tecnica honesta, max 18 palavras (ex: "Suculenta de janela e sol pleno sao especies diferentes, mistura mata as duas.")

Os 5 mitos DEVEM ser DIFERENTES e cobrir aspectos variados (rega, sol, manutencao, escolha de especies, planejamento, drenagem, irrigacao). Sem repetir tema.

Tom: curador que corrige sem soberba. NAO use "voce esta errado". Use "a verdade e mais especifica".

CTA: afirmacao contemplativa. NAO PERGUNTA tipo "Qual desses voce caiu?". Prefira afirmacao tipo "Saber a diferenca eh metade do projeto."

${FORMAT_VIRAL_RULES}`,

  listicle: `Voce escreve copy pra carrossel LISTA PRATICA do @digitalpaisagismo.
ESTRUTURA: capa + 7 slides listItem + cta.

POR QUE ESSE FORMATO VIRALIZA: listas praticas sao o conteudo MAIS SALVO no Instagram. Save = sinal forte pro algoritmo. Pessoa salva pra consultar na floricultura.

RECEBE uma lista de plantas reais do banco da empresa. ESCOLHE as 7 mais aderentes ao tema e gera UMA dica curta (max 16 palavras) pra cada.

ATENCAO ANTI-ALUCINACAO:
- Use SO plantas que aparecem na lista fornecida.
- nomeCientifico DEVE ser EXATAMENTE o que esta na lista (case sensitive, sem inventar).
- Se a lista tem 5 plantas, escolha 5 (nao force 7 inventando).

CAPA: hook de "manifesto/tese" — afirma um beneficio concreto pra quem ama plantas.
- numeral OBRIGATORIO: o numero exato de itens (ex: "7", "5"). Sem numero a capa perde poder.
- title: ancorado no beneficio (ex: "Plantas que sobrevivem sem sol direto.").
- Sem clickbait ("voce nao vai acreditar"). Sem promessa vazia ("as melhores").

Cada listItem:
- numeral: "01" a "07" em ordem
- nomePopular: copia da lista
- nomeCientifico: copia EXATA da lista
- dica: max 16 palavras, frase pratica de cuidado/uso (ex: "Tolera sombra plena, mas perde cor sem 2h de luz indireta.")

CTA: afirmacao contemplativa que reforca SAVE (ex: "Esses sao os nomes que voce vai querer lembrar na floricultura."). NAO PERGUNTA.

${FORMAT_VIRAL_RULES}`,

  problemSolution: `Voce escreve copy pra carrossel PROBLEMA -> SOLUCAO do @digitalpaisagismo.
ESTRUTURA: capa + 5 slides problemSolution + cta.

POR QUE ESSE FORMATO VIRALIZA: pessoas se identificam com problema concreto e MARCAM amigos que tem o mesmo. Marcacoes = alcance organico.

CAPA: hook de "observacao de quem entende" — revela um padrao que so paisagista ve. Ex bom: "Seu jardim morre nos primeiros 6 meses por um motivo so." Ex ruim: "Veja como resolver!"

Cada slide tem:
- problema: dor concreta, max 14 palavras, ANCORADA (ex: "Folha amarela na frangipani sem sintoma de doenca.")
- solucao: resposta tecnica direta, max 18 palavras (ex: "Excesso de rega no inverno. Espacar pra cada 12 dias soluciona em 3 semanas.")

Os 5 problemas DEVEM ser DIFERENTES (rega, escolha de especies, manutencao, drenagem, integracao com a casa, planejamento).

CTA: afirmacao contemplativa sobre diagnostico cedo (ex: "Identificar o problema certo eh metade da solucao."). NAO PERGUNTA.

${FORMAT_VIRAL_RULES}`,
};

function buildFormatSchema(format: Exclude<CarouselFormat, "classic" | "catalog">, slideCount: number): string {
  const lastIdx = slideCount - 1;
  const common = `Retorne JSON: { "slides": [${slideCount} items] } sem markdown.
[0] cover: { type:"cover", imageIdx:0, topLabel, numeral${format === "listicle" ? '' : ':null'}, title, italicWords:[] }
[${lastIdx}] cta: { type:"cta", imageIdx:${lastIdx}, fechamento, italicWords:[] }`;

  if (format === "transformation") {
    return `${common}
[1..${lastIdx - 1}] beforeAfter: { type:"beforeAfter", imageIdx, phase:"ANTES"|"PROCESSO"|"DEPOIS", caption }
A sequencia deve ser: ANTES, ANTES, PROCESSO, PROCESSO, DEPOIS, DEPOIS (slides 1-6).
Caption: 1 frase curta de ate 14 palavras descrevendo o momento.`;
  }

  if (format === "myths") {
    return `${common}
[1..${lastIdx - 1}] mythBuster: { type:"mythBuster", imageIdx, mito, verdade }
Mito: max 14 palavras. Verdade: max 18 palavras. Sem "—", sem ":".`;
  }

  if (format === "listicle") {
    return `${common}
[1..${lastIdx - 1}] listItem: { type:"listItem", imageIdx, numeral:"01"|"02"|..., nomePopular, nomeCientifico, dica }
numeral: string "01" a "0${lastIdx - 1}" em ordem.
A capa pode ter numeral string numerico (ex: "7") indicando o tamanho da lista.
dica: max 16 palavras, frase de cuidado/uso pratico.`;
  }

  // problemSolution
  return `${common}
[1..${lastIdx - 1}] problemSolution: { type:"problemSolution", imageIdx, problema, solucao }
Problema: max 14 palavras. Solucao: max 18 palavras. Sem "—", sem ":".`;
}

/**
 * Quantos slides cada formato gera (sincronizado com buildFormatOutline em slides-architect).
 */
export const FORMAT_SLIDE_COUNTS: Record<Exclude<CarouselFormat, "classic">, number> = {
  transformation: 8,
  myths: 7,
  listicle: 9,
  problemSolution: 7,
  catalog: 6,
};

/**
 * Gera copy pros formatos NAO-CLASSICOS.
 * Pra listicle, busca plantas em `vegetacoes` e injeta no contexto.
 * imagesOrdered: imagens na ordem dos slots (slot 0 = capa, slot N-1 = cta).
 * Se imagesOrdered tiver menos imagens que slideCount, repete ciclicamente.
 * hookFramework: 1 dos 7 frameworks 2026 do brand-context (recomendado pro architect).
 */
export async function generateCopyForFormat(
  prompt: string,
  imagesOrdered: AnalyzedImage[],
  format: Exclude<CarouselFormat, "classic" | "catalog">,
  outline: SlideOutline[],
  hookFramework?: string,
  plantasEscolhidas?: VegetacaoRow[],
): Promise<{ slides: SlideSpec[] }> {
  const slideCount = outline.length;
  const schema = buildFormatSchema(format, slideCount);

  const imgSummary = Array.from({ length: slideCount })
    .map((_, i) => {
      const im = imagesOrdered[i % Math.max(1, imagesOrdered.length)];
      if (!im) return `[${i}] (sem imagem)`;
      const a = im.analise_visual;
      return `[${i}] ${a?.descricao_visual || im.descricao || "(sem descricao)"} | mood: ${(a?.mood_real || []).join(", ")}`;
    })
    .join("\n");

  // Plant-first: usuario escolheu plantas? injeta lista pra TODOS os formatos.
  // Senao, fallback pra heuristica do banco (mantem comportamento original do listicle).
  let plantasParaContexto: VegetacaoRow[] = plantasEscolhidas || [];
  if (!plantasParaContexto.length && format === "listicle") {
    plantasParaContexto = await fetchVegetacoesForPrompt(prompt, 14);
    if (plantasParaContexto.length === 0) {
      throw new Error("Nenhuma planta encontrada no banco vegetacoes para este tema");
    }
  }

  let extraContext = "";
  if (plantasParaContexto.length) {
    const vegList = plantasParaContexto
      .map(
        (v, i) =>
          `${i + 1}. ${v.nome_popular} (${v.nome_cientifico || "?"}) | luminosidade: ${v.luminosidade || "?"} | categorias: ${v.categorias || "?"} | altura: ${v.altura || "?"}`,
      )
      .join("\n");

    if (format === "listicle") {
      extraContext = `\n\nPLANTAS DISPONIVEIS NO BANCO (escolha as 7 mais aderentes ao tema):
${vegList}

Use SOMENTE plantas dessa lista. Nao invente especies. nomeCientifico DEVE ser o exato da lista.`;
    } else {
      // Outros formatos: plantas sao protagonistas narrativas (texto livre, nao listItem).
      extraContext = `\n\nPLANTAS PROTAGONISTAS (escolhidas pelo usuario, sao o foco narrativo):
${vegList}

REGRAS:
- Mencione pelo menos 2 dessas plantas pelo nome popular ao longo do carrossel.
- Se citar nome cientifico, use EXATAMENTE como esta na lista.
- Nao invente especie fora dessa lista.
- O texto dos slides (mito/verdade, problema/solucao, caption antes-depois) pode ancorar na planta especifica (ex: "Buxinho na cerca viva exige poda a cada 60 dias").`;
    }
  }

  const userMsg = `Tema: "${prompt}"

Imagens disponiveis (1 por slide, fonte de verdade):
${imgSummary}

Outline planejado:
${outline.map((o) => `[${o.slideIdx}] ${o.type}${o.phase ? ` (${o.phase})` : ""} — ${o.purpose}`).join("\n")}
${extraContext}

${schema}`;

  const voiceRefs = await getBrandVoiceReferences();
  const formatSystem = FORMAT_SYSTEMS[format];
  const hookBlock = hookFramework
    ? `\n\n## HOOK FRAMEWORK RECOMENDADO PRA CAPA: ${hookFramework}\nUse esse framework especifico no title da capa. Frameworks 2026 com melhor performance: sensorial (avg 282 eng), manifesto_tese (avg 155 eng).\n`
    : "";
  const fullSystem = voiceRefs
    ? `${BRAND_VOICE}\n\n${formatSystem}${hookBlock}\n\n${voiceRefs}\n\nNos textos do slide: sem emoji, sem hashtag.\n\n${schema}`
    : `${BRAND_VOICE}\n\n${formatSystem}${hookBlock}\n\n${schema}`;

  const r = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 2800,
    messages: [
      { role: "system", content: fullSystem },
      { role: "user", content: userMsg },
    ],
  });
  const raw = r.choices[0]?.message?.content || "";
  let parsed: any = extractJson(raw);
  if (Array.isArray(parsed)) parsed = { slides: parsed };
  return parsed;
}

export async function runSmartCarousel(
  prompt: string,
  opts: {
    withCaption?: boolean;
    candidateCount?: number;
    persist?: boolean;
    userBrief?: string;
    skipAgents?: boolean;
    slideCount?: number;        // 6-10 quando dinamico; default 6
    approachFocus?: string;     // per-variant: direta_emocional, contrarian_forte, etc
    format?: CarouselFormat;    // "classic" (default) ou novo formato
    presetSelection?: SmartSelection;       // reusa selecao de imagens ja analisadas
    presetAnalysis?: { persona?: string; enrichedPrompt?: string; mainDor?: string };
    presetAllAnalyzed?: AnalyzedImage[];
    plantasEscolhidas?: VegetacaoRow[];     // plant-first: protagoniza copy + ranking
  } = {},
) {
  const format: CarouselFormat = opts.format ?? "classic";
  const isClassic = format === "classic";

  // Pra formatos novos, architect retorna outline deterministico (slideCount fixo).
  // Pra classic, mantem comportamento existente (slideCount via opts).
  let outline: SlideOutline[] | undefined;
  let slideCount: number;
  let hookFramework: string | undefined;
  if (isClassic) {
    slideCount = Math.max(6, Math.min(10, opts.slideCount ?? 6));
  } else if (format === "catalog") {
    throw new Error("catalog usa fluxo proprio em /api/catalog/generate, nao runSmartCarousel");
  } else {
    const plan = await planSlides({ prompt, format, plantasEscolhidas: opts.plantasEscolhidas });
    slideCount = plan.slideCount;
    outline = plan.outline;
    hookFramework = plan.recommended_hook_framework;
  }

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
      plantasEscolhidas: opts.plantasEscolhidas,
    });
    selection = searched.selection;
    allAnalyzed = searched.allAnalyzed;
    analysis = searched.analysis;
  }

  // Pra classic: 6 imagens fixas (cover + 4 inner + cta).
  // Pra formatos novos com >6 slides: expande com alternatives (bem rankeadas tambem).
  const baseOrdered = [selection.cover, ...selection.inner, selection.cta];
  let ordered: AnalyzedImage[];
  if (isClassic) {
    ordered = baseOrdered.slice(0, slideCount);
  } else {
    // Mantém cover no slot 0, cta no ultimo, e preenche miolo com inner + alternatives.
    const inners = [...selection.inner, ...selection.alternatives];
    const middleCount = Math.max(0, slideCount - 2);
    const middle = inners.slice(0, middleCount);
    // Se ainda falta, repete inner em ciclo (fallback raro)
    while (middle.length < middleCount) middle.push(inners[middle.length % inners.length]);
    ordered = [selection.cover, ...middle, selection.cta];
  }

  let slides: SlideSpec[];

  if (isClassic) {
    const { slides: rawSlides } = await generateCopyFromAnalysis(prompt, selection, {
      slideCount,
      approachFocus: opts.approachFocus,
      plantasEscolhidas: opts.plantasEscolhidas,
    });
    slides = validateSlidesAgainstImages(rawSlides, ordered, opts.plantasEscolhidas);
  } else {
    const { slides: rawSlides } = await generateCopyForFormat(
      prompt,
      ordered,
      format as Exclude<CarouselFormat, "classic" | "catalog">,
      outline!,
      hookFramework,
      opts.plantasEscolhidas,
    );
    slides = validateFormattedSlides(rawSlides, ordered, opts.plantasEscolhidas);
  }

  // AGENTE 2: Carousel Critic — so roda em classic (critic pressupoe types antigos).
  let critique: Awaited<ReturnType<typeof critiqueCarousel>> | undefined;
  if (isClassic && !opts.skipAgents) {
    try {
      critique = await critiqueCarousel({
        slides,
        prompt,
        persona: analysis?.persona,
      });
      if (critique.score < 65 && critique.issues.length) {
        const retry = await generateCopyFromAnalysis(prompt, selection, {
          slideCount,
          approachFocus: opts.approachFocus,
          plantasEscolhidas: opts.plantasEscolhidas,
        });
        slides = validateSlidesAgainstImages(retry.slides, ordered, opts.plantasEscolhidas);
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
    format,
  };
}
