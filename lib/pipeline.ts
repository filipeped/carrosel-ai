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
[5] cta: { type:"cta", imageIdx:5, pergunta, italicWords:[] }

REGRA DURA pro "numeral" da capa:
- Deve ser APENAS 1 ou 2 digitos numericos puros (ex.: "5", "4", "12") — ou null.
- PROIBIDO: "420m2", "120%", "3x", letras, unidades, porcentagem, superscript.
- Se o tema nao pede contagem de itens, use null.`;

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

const CAPTION_SYSTEM = `Voce e copywriter senior de Instagram pra paisagismo alto padrao (@digitalpaisagismo).

VOCE RECEBE ATE 6 IMAGENS REAIS DO CARROSSEL. Antes de escrever:
1. Observe cada imagem individualmente — luz (dourada/rasante/difusa), hora do dia, clima, estacao;
2. Identifique especies visiveis — folhagens dominantes, texturas, contrastes cromaticos;
3. Note estrutura/materialidade — pedras, madeira, espelho d'agua, corten, pergolados;
4. Capture atmosfera — refugio, drama, minimalismo, urbanidade, tropicalidade;
5. So depois escreva a legenda usando DETALHES VISUAIS REAIS da imagem, nao genericos.

Na legenda, cite pelo menos 1 detalhe visual concreto que so quem olhou a foto saberia (ex: "a sombra filtrada pelo licuala", "o travertino bege contrastando com a folha brilhante do monstera", "a agua espelhando a copa das palmeiras"). ISSO e o que diferencia legenda certeira de legenda generica.

REGRA DURA DE HONESTIDADE VISUAL:
- Se o tema pede muro verde e as fotos mostram jardins tropicais, NAO finja que ha muro verde nas fotos. Fale do principio geral do tema usando as fotos como referencia tangencial, e seja honesto.
- Se o tema pede noturno e as fotos sao diurnas, NAO chame de noturno. NAO escreva "luz quente", "luz dourada", "luz direcional", "contraluz", "penumbra" se as fotos sao DIFUSAS DIURNAS. Cite a luz difusa real que voce ve.
- Se o tema pede jardim seco mas aparece jardim tropical, NAO cite "agave" ou "pata-de-elefante" se voce nao ve. Cite o que ha.
- NUNCA afirme "no slide 3 aparece X" se voce nao ve X no slide 3. Isso e alucinacao grave.
- NUNCA cite uma especie por nome cientifico se voce nao a ve claramente. Prefira nome popular ou "folhagem tropical densa" generico.
- Se ha dissonancia entre tema e imagens, reconheca e use o tema como conceito orientador, nao como descricao literal do que esta visivel.
- Atributos de LUZ sao faceis de testar: fotos difusas/nubladas NAO tem "luz dourada" ou "luz rasante". NAO minta sobre luz.

Gere 3 legendas em abordagens diferentes:
- Storytelling editorial
- Autoridade tecnica botanica
- Pergunta provocativa

REGRAS DURAS:
- TAMANHO: cada legenda entre 120 e 260 PALAVRAS. Nao exceda 260.
- HASHTAGS: 12-16 por legenda, TODAS em minusculas, SEM caracteres especiais, SEM acentos, SEM camelCase. Ex: #paisagismoaltopadrao (certo), #paisagismoAltopAdrao (ERRADO), #paisagismodeautor (certo). Se tiver duvida, so minuscula plana.
- EMOJI: ABSOLUTAMENTE PROIBIDO em qualquer legenda ou hook. Zero emoji. Nem arrow pra baixo, nem emoji ornamental, nada.
- Nao uso arrow-chars (→, ↓, ↑). Se precisar de lista, use bullets com "—" no comeco da linha OU simplesmente quebra de linha.
- Tom sofisticado, nunca casual ("ola pessoal", "confira", "top", "incrivel", "imperdivel" = proibidos).
- Nomes cientificos entre *asteriscos* (italico).

Retorne JSON puro (sem markdown):
{ "options": [{ "abordagem", "hook", "legenda", "hashtags": [] }] }`;

async function _runCaption(
  prompt: string,
  slides: SlideSpec[],
  imageUrls?: string[],
): Promise<{ options: CaptionOption[] }> {
  const summary = slides
    .map((s, i) => `  [${i + 1}] ${s.type}: ${s.title || s.nomePopular || s.pergunta || ""}`)
    .join("\n");

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text: `Tema do carrossel: "${prompt}"\n\nSlides:\n${summary}\n\n${
        imageUrls?.length ? `Segue ${imageUrls.length} imagens do carrossel. Leia cada uma antes de gerar as 3 legendas.` : "Gere as 3 legendas com base nos slides acima."
      } JSON puro.`,
    },
  ];
  if (imageUrls && imageUrls.length) {
    for (const url of imageUrls.slice(0, 6)) {
      userContent.push({ type: "image_url", image_url: { url } });
    }
  }

  const r = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [
      { role: "system", content: CAPTION_SYSTEM },
      { role: "user", content: userContent as any },
    ],
  });
  const raw = r.choices[0]?.message?.content || "";
  let parsed: any = extractJson(raw);
  if (Array.isArray(parsed)) parsed = { options: parsed };

  // Saneamento pos-IA: garante minusculas nas hashtags, remove emoji e
  // tira setas unicode que escapam mesmo com o prompt proibir.
  if (parsed?.options && Array.isArray(parsed.options)) {
    const EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu;
    const ARROWS = /[→↑↓←➤➡]/g;
    parsed.options = parsed.options.map((o: any) => ({
      ...o,
      hook: String(o.hook || "").replace(EMOJI_RE, "").replace(ARROWS, "").trim(),
      legenda: String(o.legenda || "").replace(EMOJI_RE, "").replace(ARROWS, "").trim(),
      hashtags: Array.isArray(o.hashtags)
        ? o.hashtags
            .map((t: any) => String(t).trim())
            .filter(Boolean)
            .map((t: string) => {
              let s = t.startsWith("#") ? t.slice(1) : t;
              // normaliza acentos
              s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              s = s.toLowerCase().replace(/[^a-z0-9]/g, "");
              return s ? "#" + s : "";
            })
            .filter(Boolean)
        : [],
    }));
  }
  return parsed;
}

export async function generateCaption(
  prompt: string,
  slides: SlideSpec[],
  imageUrls?: string[],
): Promise<{ options: CaptionOption[] }> {
  try {
    return await _runCaption(prompt, slides, imageUrls);
  } catch (err: any) {
    const msg = String(err?.message || err);
    const visionFailed =
      imageUrls &&
      imageUrls.length > 0 &&
      (msg.includes("no JSON") ||
        msg.includes("anexada") ||
        msg.includes("anexar") ||
        msg.includes("nao recebi") ||
        msg.includes("não recebi") ||
        msg.includes("image"));
    if (visionFailed) {
      console.warn("[caption] vision falhou, retry sem imagens:", msg.slice(0, 120));
      return await _runCaption(prompt, slides, undefined);
    }
    throw err;
  }
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
