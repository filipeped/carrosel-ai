// Pipeline completo de geracao de carrossel.
// Reutilizado pela UI (endpoints granulares) e pela API v1 (oneshot).
import { getAi, MODEL, BRAND_VOICE } from "./claude";
import { embed } from "./embeddings";
import { searchImagesSemantic } from "./plant-matcher";
import type { ImageBankRow } from "./supabase";
import { extractJson } from "./utils";

export type SlideSpec = {
  type: "cover" | "inspiration" | "plantDetail" | "cta";
  imageIdx: number;
  topLabel?: string;
  numeral?: string | null;
  title?: string;
  subtitle?: string;
  italicWords?: string[];
  nomePopular?: string | null;
  nomeCientifico?: string | null;
  pergunta?: string;
};

export type ExtractedFilters = {
  estilo: "Moderno" | "Tropical" | "Classico" | null;
  tipo_area: "pequeno" | "medio" | "grande" | null;
  query_expandida: string;
};

const EXTRACT_SYSTEM = `Voce extrai filtros de busca de paisagismo de um prompt em portugues.
Responda JSON valido: { "estilo": "Moderno"|"Tropical"|"Classico"|null, "tipo_area": "pequeno"|"medio"|"grande"|null, "query_expandida": string }`;

export async function extractFilters(prompt: string): Promise<ExtractedFilters> {
  const r = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 300,
    messages: [
      { role: "system", content: EXTRACT_SYSTEM },
      { role: "user", content: prompt },
    ],
  });
  const raw = r.choices[0]?.message?.content || "{}";
  try {
    return extractJson<ExtractedFilters>(raw);
  } catch {
    return { estilo: null, tipo_area: null, query_expandida: prompt };
  }
}

export async function searchImages(prompt: string, count = 24): Promise<{ filters: ExtractedFilters; imagens: ImageBankRow[] }> {
  const filters = await extractFilters(prompt);
  const qEmb = await embed(filters.query_expandida || prompt);
  const imagens = await searchImagesSemantic(qEmb, { estilo: filters.estilo || undefined, tipo_area: filters.tipo_area || undefined }, count);
  return { filters, imagens };
}

const COPY_SCHEMA = `Retorne OBJETO JSON { "slides": [ ...6 items... ] } sem markdown.
[0] cover: { type:"cover", imageIdx:0, topLabel, numeral|null, title, italicWords:[] }
[1..4] plantDetail OU inspiration
[5] cta: { type:"cta", imageIdx:5, pergunta, italicWords:[] }`;

export async function generateCopy(prompt: string, images: ImageBankRow[]): Promise<{ slides: SlideSpec[] }> {
  const imgDescs = images
    .map((im, i) => `  [${i}] plantas=[${(im.plantas || []).slice(0, 4).join(", ")}], estilo=${im.estilo?.join(",")}, area=${im.tipo_area}, desc="${(im.descricao || "").slice(0, 180)}"`)
    .join("\n");
  const userMsg = `Tema: "${prompt}"
Imagens:
${imgDescs}
${COPY_SCHEMA}`;
  const r = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 1800,
    messages: [
      { role: "system", content: BRAND_VOICE + "\n\n" + COPY_SCHEMA },
      { role: "user", content: userMsg },
    ],
  });
  const raw = r.choices[0]?.message?.content || "";
  let parsed: any = extractJson(raw);
  if (Array.isArray(parsed)) parsed = { slides: parsed };
  return parsed;
}

export type CaptionOption = { abordagem: string; hook: string; legenda: string; hashtags: string[] };

const CAPTION_SYSTEM = `Voce e copywriter senior de Instagram pra paisagismo de alto padrao (@digitalpaisagismo). Gere 3 legendas em abordagens diferentes (storytelling editorial, autoridade tecnica, pergunta). Retorne JSON: { "options": [{ "abordagem", "hook", "legenda", "hashtags": [] }] }`;

export async function generateCaption(prompt: string, slides: SlideSpec[]): Promise<{ options: CaptionOption[] }> {
  const summary = slides
    .map((s, i) => `  [${i + 1}] ${s.type}: ${s.title || s.nomePopular || s.pergunta || ""}`)
    .join("\n");
  const r = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 2200,
    messages: [
      { role: "system", content: CAPTION_SYSTEM },
      { role: "user", content: `Tema: "${prompt}"\nSlides:\n${summary}\nRetorne JSON puro.` },
    ],
  });
  const raw = r.choices[0]?.message?.content || "";
  let parsed: any = extractJson(raw);
  if (Array.isArray(parsed)) parsed = { options: parsed };
  return parsed;
}

export async function runFullCarousel(prompt: string, opts: { imageCount?: number; withCaption?: boolean } = {}) {
  const count = opts.imageCount ?? 12;
  const { filters, imagens } = await searchImages(prompt, count);
  if (!imagens.length) throw new Error("Nenhuma imagem encontrada no banco pra esse tema.");
  const chosen = imagens.slice(0, Math.min(8, imagens.length));
  const { slides } = await generateCopy(prompt, chosen);
  let caption: { options: CaptionOption[] } | undefined;
  if (opts.withCaption) caption = await generateCaption(prompt, slides);
  return { prompt, filters, slides, imagens: chosen, caption };
}
