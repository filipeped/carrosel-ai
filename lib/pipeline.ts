// Pipeline completo de geracao de carrossel.
// Reutilizado pela UI (endpoints granulares) e pela API v1 (oneshot).
import { getAi, MODEL, BRAND_VOICE } from "./claude";
import { embed } from "./embeddings";
import { searchImagesSemantic } from "./plant-matcher";
import type { ImageBankRow } from "./supabase";
import { extractJson } from "./utils";
import { getBrandVoiceReferences } from "./brand-voice";

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

const CAPTION_SYSTEM = `Voce e o copywriter do @digitalpaisagismo (perfil real, paisagismo alto padrao brasileiro, ja produzindo conteudo). Sua tarefa: escrever legendas pra POST do Instagram, imitando o TOM REAL do perfil que vou colar abaixo.

VOCE RECEBE ATE 6 IMAGENS REAIS DO CARROSSEL. Antes de escrever:
1. Observe cada imagem — luz (dourada/rasante/difusa), hora do dia, estacao
2. Identifique especies visiveis, texturas, materiais (pedra/madeira/agua/corten)
3. Capture atmosfera — refugio, drama, minimalismo, urbanidade, tropicalidade
4. Escreva citando DETALHES VISUAIS REAIS, nao genericos

Na legenda, cite pelo menos 1 detalhe visual concreto que so quem olhou a foto saberia (ex: "o caminho em pedra que desvia entre os maciços", "o reflexo da palmeira na agua parada", "o travertino que pega luz no final da tarde").

REGRA DURA DE HONESTIDADE VISUAL:
- Tema nao bate com foto? Use tema como conceito, nao descricao literal.
- Fotos difusas/nubladas NAO tem "luz dourada" nem "luz rasante". Nao minta sobre luz.
- Nunca cite especie por nome cientifico se voce nao ve claramente. Prefira nome popular ou descricao ("folhagem tropical densa").
- Nunca afirme "no slide 3 aparece X" se voce nao ve X no slide 3.

3 ABORDAGENS DIFERENTES (alinhadas ao tom real do @digitalpaisagismo):
- **direta_emocional** — afirmacao factual curta que conecta emocionalmente ("Chegar em casa e sentir a natureza em cada detalhe"). Parte de um insight concreto do resultado, nao de tecnica.
- **contraste_verdade** — provocacao honesta que quebra crenca comum ("A maioria dos jardins de alto padrao usa as mesmas 5 plantas. Nao e coincidencia."). Ativa ego do publico AA.
- **tecnico_relacional** — explica o porque tecnico sem jargao, sempre conectando ao USO do espaco ("Um bom paisagismo nao e so sobre plantas. E sobre criar espacos que fazem sentido com a sua rotina.").

REGRAS DURAS:
- TAMANHO: 120-260 palavras por legenda. Nao exceda.
- HASHTAGS: 12-16 por legenda. TODAS minusculas, SEM acento, SEM camelCase, SEM char especial. Ex correto: #paisagismoaltopadrao. Errado: #paisagismoAltoPadrao.
- EMOJI: permitido moderadamente (maximo 3 por legenda) APENAS os que o perfil ja usa: 🌿 ✨ 🌴 📐 👇 📍. PROIBIDO: 😍 🔥 💯 🤩 ❤️ 🙌 💪 🚀 (cringe, fora do tom).
- Proibido: arrow-chars (→↓↑), "ola pessoal", "confira", "top", "incrivel", "imperdivel", "voce nao vai acreditar", clickbait vazio.
- Quando citar nome cientifico, pode em italico via *asteriscos* OU sem italico (ambos ok).
- IMITE O RITMO dos posts reais que vou colar abaixo — quebras de linha, comecos, CTAs, repertorio.

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

  // Carrega exemplos reais de tom do perfil (top 20 posts por engajamento)
  const brandVoiceRefs = await getBrandVoiceReferences();
  const systemWithVoice = brandVoiceRefs
    ? `${CAPTION_SYSTEM}\n\n================\n${brandVoiceRefs}\n================\n\nAgora gere as 3 legendas imitando o TOM dos exemplos acima.`
    : CAPTION_SYSTEM;

  const r = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [
      { role: "system", content: systemWithVoice },
      { role: "user", content: userContent as any },
    ],
  });
  const raw = r.choices[0]?.message?.content || "";
  let parsed: any = extractJson(raw);
  if (Array.isArray(parsed)) parsed = { options: parsed };

  // Saneamento pos-IA: permite emoji do repertorio do perfil, bane os cringe.
  if (parsed?.options && Array.isArray(parsed.options)) {
    const ALLOWED_EMOJI = new Set(["🌿", "✨", "🌴", "📐", "👇", "📍", "🌱", "🍃"]);
    const EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu;
    const ARROWS = /[→↑↓←➤➡]/g;
    const cleanString = (s: string) =>
      s
        .replace(EMOJI_RE, (m) => (ALLOWED_EMOJI.has(m) ? m : ""))
        .replace(ARROWS, "")
        .trim();
    parsed.options = parsed.options.map((o: any) => ({
      ...o,
      hook: cleanString(String(o.hook || "")),
      legenda: cleanString(String(o.legenda || "")),
      hashtags: Array.isArray(o.hashtags)
        ? o.hashtags
            .map((t: any) => String(t).trim())
            .filter(Boolean)
            .map((t: string) => {
              let s = t.startsWith("#") ? t.slice(1) : t;
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
