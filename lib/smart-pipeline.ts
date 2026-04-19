// Pipeline "smart" — busca + analise visual + rank + selecao por role + copy casada.
import { getAi, MODEL, BRAND_VOICE } from "./claude";
import { searchImages as _searchImages } from "./pipeline";
import { analyzeAndCache, AnaliseVisual } from "./image-analysis";
import { extractJson } from "./utils";
import type { ImageBankRow } from "./supabase";
import type { SlideSpec } from "./pipeline";

export type AnalyzedImage = ImageBankRow & { analise_visual: AnaliseVisual };

export type SmartSelection = {
  cover: AnalyzedImage;
  inner: AnalyzedImage[];   // 4 slides
  cta: AnalyzedImage;
  alternatives: AnalyzedImage[];
  rationale?: string;
};

function composite(img: AnalyzedImage, semanticScore = 1): number {
  const a = img.analise_visual;
  return 0.5 * a.cover_potential + 0.2 * a.composicao + 0.15 * a.qualidade + 0.15 * semanticScore * 10;
}

const SELECT_SYSTEM = `Voce e curador de carrossel de Instagram pra @digitalpaisagismo. Dado um TEMA e uma lista de imagens analisadas (cada uma com descricao_visual, hero_element, scores), escolha as 6 melhores em roles especificos.

Roles:
- COVER (1): maior impacto visual, aderente ao tema, com respiro pro texto da capa
- INNER (4): narrativa progressiva, diversidade de enquadramento (nao repetir cena similar)
- CTA (1): foto que convide contemplacao/fechamento

Regras:
- NAO escolha imagens com cover_potential < 6 pra cover
- Varie contexto entre inner (nao 4 fotos do mesmo tipo de cena)
- Priorize imagens com descricao_visual alinhada ao tema

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

  // Top-12 por score composto pra IA escolher
  const ranked = [...analyzed].sort((a, b) => composite(b) - composite(a));
  const top12 = ranked.slice(0, 12);

  const summary = top12
    .map(
      (im) =>
        `id=${im.id} | cover=${im.analise_visual.cover_potential.toFixed(1)} comp=${im.analise_visual.composicao.toFixed(1)} | ${im.analise_visual.descricao_visual} | hero: ${im.analise_visual.hero_element}`,
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
  const inner = (picked.inner_ids || [])
    .map((id) => byId.get(id))
    .filter((x): x is AnalyzedImage => !!x)
    .slice(0, 4);

  if (!cover || !cta || inner.length < 4) {
    // Fallback: top ranked
    return {
      cover: ranked[0],
      inner: ranked.slice(1, 5),
      cta: ranked[5],
      alternatives: ranked.slice(6),
      rationale: "fallback (IA retornou selecao invalida)",
    };
  }

  const usedIds = new Set<number>([cover.id, cta.id, ...inner.map((i) => i.id)]);
  const alternatives = ranked.filter((a) => !usedIds.has(a.id));
  return { cover, inner, cta, alternatives, rationale: picked.rationale };
}

const COPY_FROM_ANALYSIS_SCHEMA = `Retorne JSON: { "slides": [6 items] } sem markdown.
Ordem: [0]cover, [1..4]plantDetail|inspiration, [5]cta.

cover: { type:"cover", imageIdx:0, topLabel, numeral|null, title, italicWords:[] }
plantDetail: { type:"plantDetail", imageIdx, nomePopular, nomeCientifico, title:null, subtitle:null, topLabel:null }
inspiration: { type:"inspiration", imageIdx, title, subtitle, topLabel, nomePopular:null, nomeCientifico:null }
cta: { type:"cta", imageIdx:5, pergunta, italicWords:[] }

REGRAS:
- slides[0].type DEVE ser "cover"; slides[5].type DEVE ser "cta"
- numeral: 1-2 digitos numericos puros ou null
- USE detalhes visuais das fotos (descricao_visual, hero_element) nos textos. Cite luz, textura, especies visiveis.
- Numeros em titulos: 3, 4 ou 5 apenas (nunca 6+).`;

export async function generateCopyFromAnalysis(
  prompt: string,
  selection: SmartSelection,
): Promise<{ slides: SlideSpec[] }> {
  const ordered = [selection.cover, ...selection.inner, selection.cta];
  const imgSummary = ordered
    .map((im, i) => {
      const a = im.analise_visual;
      const plantas = (im.plantas || []).slice(0, 4).join(", ");
      return `[${i}] ${a.descricao_visual} | hero: ${a.hero_element} | mood: ${(a.mood_real || []).join(", ")} | plantas conhecidas: ${plantas}`;
    })
    .join("\n");

  const userMsg = `Tema: "${prompt}"
Imagens ja selecionadas e ordenadas (indice 0=capa, 1-4=miolo, 5=cta):
${imgSummary}

Hints de curadoria: ${selection.rationale || "-"}

${COPY_FROM_ANALYSIS_SCHEMA}`;

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

  const analyzed = await analyzeAndCache(imagens);
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
