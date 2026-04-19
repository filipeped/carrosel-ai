// Pipeline "smart" — busca + analise visual + rank + selecao por role + copy casada.
import { getAi, MODEL, BRAND_VOICE } from "./claude";
import { searchImages as _searchImages } from "./pipeline";
import { analyzeAndCache, AnaliseVisual } from "./image-analysis";
import { extractJson } from "./utils";
import { getSupabase, ImageBankRow } from "./supabase";
import type { SlideSpec } from "./pipeline";

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

export type AnalyzedImage = ImageBankRow & { analise_visual: AnaliseVisual };

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

  // Score composto agora inclui aderencia ao tema (30%)
  const withAder = analyzed.map((im) => ({
    img: im,
    ader: aderenciaTema(prompt, im),
    score: 0,
  }));
  withAder.forEach((x) => (x.score = composite(x.img, 1, x.ader)));
  withAder.sort((a, b) => b.score - a.score);
  const ranked = withAder.map((x) => x.img);
  const top12 = withAder.slice(0, 12);

  const summary = top12
    .map(
      ({ img, ader }) =>
        `id=${img.id} | cover=${img.analise_visual.cover_potential.toFixed(1)} comp=${img.analise_visual.composicao.toFixed(1)} ader=${(ader * 100).toFixed(0)}% | ${img.analise_visual.descricao_visual} | hero: ${img.analise_visual.hero_element}`,
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

  return {
    cover: finalCover,
    inner: finalInner,
    cta: finalCta,
    alternatives,
    rationale: picked.rationale || "fallback determinstico",
  };
}

const COPY_FROM_ANALYSIS_SCHEMA = `Retorne JSON: { "slides": [6 items] } sem markdown.
Ordem: [0]cover, [1..4]plantDetail|inspiration, [5]cta.

cover: { type:"cover", imageIdx:0, topLabel, numeral|null, title, italicWords:[] }
plantDetail: { type:"plantDetail", imageIdx, nomePopular, nomeCientifico, title:null, subtitle:null, topLabel:null }
inspiration: { type:"inspiration", imageIdx, title, subtitle, topLabel, nomePopular:null, nomeCientifico:null }
cta: { type:"cta", imageIdx:5, pergunta, italicWords:[] }

REGRAS ESTRUTURAIS:
- slides[0].type DEVE ser "cover"; slides[5].type DEVE ser "cta"
- numeral: 1-2 digitos numericos puros ou null
- Numeros em titulos: 3, 4 ou 5 apenas (nunca 6+)

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

export async function generateCopyFromAnalysis(
  prompt: string,
  selection: SmartSelection,
): Promise<{ slides: SlideSpec[] }> {
  const ordered = [selection.cover, ...selection.inner, selection.cta];
  const imgSummary = ordered
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

  const userMsg = `Tema pedido pelo usuario: "${prompt}"

Imagens disponiveis e o que cada uma MOSTRA (fonte de verdade):
${imgSummary}

Hints de curadoria: ${selection.rationale || "-"}

${COPY_FROM_ANALYSIS_SCHEMA}

Verifique: cada elemento que voce citar no copy TEM que estar na descricao/plantas/materiais da imagem correspondente. Alucinacao = falha grave.`;

  const r = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 1800,
    messages: [
      { role: "system", content: BRAND_VOICE + "\n\n" + COPY_FROM_ANALYSIS_SCHEMA },
      { role: "user", content: userMsg },
    ],
  });
  const raw = r.choices[0]?.message?.content || "";
  let parsed: any = extractJson(raw);
  if (Array.isArray(parsed)) parsed = { slides: parsed };
  return parsed;
}

export async function searchAndSelect(
  prompt: string,
  opts: { candidateCount?: number } = {},
): Promise<{
  selection: SmartSelection;
  allAnalyzed: AnalyzedImage[];
}> {
  const count = opts.candidateCount ?? 24;
  const { imagens } = await _searchImages(prompt, count);
  if (!imagens.length) throw new Error("Nenhuma imagem encontrada no banco pra esse tema");

  // enriquece (busca_semantica so retorna fonte/id/descricao/url/tipo_area/estilo/similarity/analise_visual)
  const enriched = await enrichFromImageBank(imagens);
  const analyzed = await analyzeAndCache(enriched);
  const selection = await rankAndSelect(prompt, analyzed);
  return { selection, allAnalyzed: analyzed };
}

export async function runSmartCarousel(
  prompt: string,
  opts: { withCaption?: boolean; candidateCount?: number } = {},
) {
  const { selection, allAnalyzed } = await searchAndSelect(prompt, opts);
  const { slides } = await generateCopyFromAnalysis(prompt, selection);
  const ordered = [selection.cover, ...selection.inner, selection.cta];
  return {
    prompt,
    selection,
    allAnalyzed,
    slides,
    imagens: ordered, // indices 0..5 alinhados aos slides
  };
}
