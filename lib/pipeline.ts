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

function buildCopySchema(slideCount: number): string {
  const lastIdx = slideCount - 1;
  return `Retorne OBJETO JSON { "slides": [ ...${slideCount} items... ] } sem markdown.
[0] cover: { type:"cover", imageIdx:0, topLabel, numeral:null, title, italicWords:[] }
[1..${lastIdx - 1}] plantDetail OU inspiration (prefira inspiration pra desenvolver tese)
[${lastIdx}] cta: { type:"cta", imageIdx:${lastIdx}, pergunta, italicWords:[] }

FILOSOFIA: carrossel eh TESE defendida em ${slideCount} slides, nao lista numerada.
Capa afirma crenca; slides sustentam com observacoes concretas; CTA contempla.

REGRA DURA pro "numeral" da capa:
- SEMPRE null. NAO prometa "N especies", "N decisoes", "N coisas".
- Numero dificilmente cobre exatamente N itens — fica vazio e perde credibilidade.
- Use numero no title SOMENTE se for fato concreto (tempo, medida real).`;
}

export async function generateCopy(
  prompt: string,
  images: ImageBankRow[],
  opts: { slideCount?: number } = {},
): Promise<{ slides: SlideSpec[] }> {
  const slideCount = Math.max(6, Math.min(10, opts.slideCount ?? images.length));
  const schema = buildCopySchema(slideCount);
  const imgDescs = images
    .map((im, i) => `  [${i}] plantas=[${(im.plantas || []).slice(0, 4).join(", ")}], estilo=${im.estilo?.join(",")}, area=${im.tipo_area}, desc="${(im.descricao || "").slice(0, 180)}"`)
    .join("\n");
  const userMsg = `Tema: "${prompt}"
Imagens:
${imgDescs}
${schema}`;
  const r = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 2400,
    messages: [
      { role: "system", content: BRAND_VOICE + "\n\n" + schema },
      { role: "user", content: userMsg },
    ],
  });
  const raw = r.choices[0]?.message?.content || "";
  let parsed: any = extractJson(raw);
  if (Array.isArray(parsed)) parsed = { slides: parsed };
  return parsed;
}

export type CaptionOption = { abordagem: string; hook: string; legenda: string; hashtags: string[] };

import { brandBlockFull } from "./brand-context";

const CAPTION_SYSTEM = `${brandBlockFull()}

---

Voce e o copywriter do @digitalpaisagismo. Sua tarefa: escrever legendas pra POST do Instagram, imitando o TOM REAL do perfil.

VOCE RECEBE ATE 6 IMAGENS REAIS DO CARROSSEL. Antes de escrever:
1. Observe cada imagem — luz (dourada/rasante/difusa), hora do dia, estacao
2. Identifique especies visiveis, texturas, materiais (pedra/madeira/agua/corten)
3. Capture atmosfera — refugio, drama, minimalismo, urbanidade, tropicalidade
4. Escreva citando DETALHES VISUAIS REAIS, nao genericos

Na legenda, cite pelo menos 1 detalhe visual concreto que so quem olhou a foto saberia (ex: "o caminho em pedra que desvia entre os maciços", "o reflexo da palmeira na agua parada", "o travertino que pega luz no final da tarde").

REGRA DE COMPLEMENTARIDADE (critica):
- A legenda NAO EH repeticao do texto dos slides. Eh complementar.
- Se o slide da capa ja diz "A tomada de area externa eh o detalhe que...", a legenda NAO comeca repetindo "A tomada...". Abre outra entrada: uma observacao, uma historia, um detalhe lateral que enriquece.
- Pensa nisso como jornal: manchete (slide) vs lead da materia (legenda). Manchete chama, lead aprofunda DE OUTRO ANGULO.
- Palavras-chave do slide NAO podem ser as mesmas da primeira linha da legenda.
- Se detectar redundancia, reescreva a abertura.

REGRA DURA DE HONESTIDADE VISUAL:
- Tema nao bate com foto? Use tema como conceito, nao descricao literal.
- Fotos difusas/nubladas NAO tem "luz dourada" nem "luz rasante". Nao minta sobre luz.
- Nunca cite especie por nome cientifico se voce nao ve claramente. Prefira nome popular ou descricao ("folhagem tropical densa").
- Nunca afirme "no slide 3 aparece X" se voce nao ve X no slide 3.

5 ABORDAGENS (todas de CURADOR, nao de vendedor):
- **direta_emocional** — afirmacao factual curta que conecta emocionalmente, sem pitch ("Chegar em casa e sentir a natureza em cada detalhe"). Foco em experiencia, nao em contratar.
- **contraste_verdade** — revela padrao que o leigo nao nota ("A maioria dos jardins bonitos usa as mesmas 5 plantas. Nao eh coincidencia."). Sem vender nada. Sem elitismo.
- **tecnico_relacional** — explica o PORQUE sem jargao, conectando ao USO do espaco ("Um bom paisagismo nao eh so sobre plantas. Eh sobre criar espacos que fazem sentido com a sua rotina."). Sem "contrate" no fim.
- **sensorial_curador** — convida a sentir: som, luz, textura, tempo ("O barulho da agua na pedra basalto muda o som da casa inteira"). Zero tom comercial.
- **historia_da_planta** — conta o tempo de uma especie, comportamento, transformacao ("Essa arvore leva 8 anos pra ficar assim. Mas o primeiro ano decide tudo."). Storytelling natural, sem pitch.

REGRA DURA: NUNCA transforme legenda em anuncio. Frases proibidas:
"contratar", "antes de chamar", "3 decisoes antes", "projeto 3D", "retrabalho", "o erro de R$",
"custa 3x", "me manda no direct", "em que fase da obra", "antes do gesso", "a pergunta que voce devia".
Se a copy cair nesse tom, reescreve como curador apaixonado.

REGRAS DURAS:
- TAMANHO: MAXIMO 50 PALAVRAS. Nao eh sugestao, eh limite duro — contar cada palavra. Ideal 30-45.
  Instagram corta em ~125 caracteres no feed — as 2 primeiras frases fazem tudo.
  Estrutura OBRIGATORIA: (1) hook de 1 linha + (2) 1-2 frases curtas + (3) pergunta/fecho de 1 linha. 3 paragrafos MAXIMO, separados por linha em branco (\\n\\n).
  Nao enumerar, nao explicar tecnica em detalhe, nao fazer 4 paragrafos, nao usar "—" pra listar. Cortar ate doer. Se tiver 60 palavras, CORTA.
  EXEMPLO do tamanho certo (47 palavras):
  "Jardim que envelhece bem nao eh sorte.

  Eh projeto pensado antes da primeira muda — densidade, ritmo e plantas-ancora que seguram volume nos 2 primeiros anos.

  Sem isso, qualquer jardim vira mato em 6 meses. E onde seu jardim comeca a falhar?"
- HASHTAGS: 3-5 por legenda (nao 10-14 — algoritmo 2026 pune excesso). TODAS minusculas, SEM acento, SEM camelCase, SEM char especial. Nicho especifico. Ex correto: #paisagismoaltopadrao. Errado: #paisagismoAltoPadrao.
- PRIMEIRA LINHA: max 120 caracteres (IG corta em 125 no feed)
- SHARE-ABILITY: a 2a frase deve funcionar sozinha se copiada num WhatsApp. Ou seja, deve fazer sentido fora do contexto do post.
- CTA: pergunta aberta contemplativa que convida pausa e resposta organica ("qual essa estacao pro teu jardim?", "qual planta marcou tua infancia?"). NAO use "me manda no direct", "em que fase", "qual projeto" — isso eh tom comercial, algoritmo rebaixa.
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
    // Algoritmo 2026: IG corta a primeira linha em ~125 chars no feed mobile.
    // Se a primeira quebra ficar >120, reinsere um \n no limite natural mais proximo.
    const enforceFirstLine = (s: string): string => {
      if (!s) return s;
      const firstBreak = s.indexOf("\n");
      const firstLine = firstBreak === -1 ? s : s.slice(0, firstBreak);
      if (firstLine.length <= 120) return s;
      const cut = firstLine.slice(0, 120);
      const breakIdx = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", "), cut.lastIndexOf(" — "), cut.lastIndexOf(" "));
      const splitAt = breakIdx > 60 ? breakIdx + 1 : 118;
      return s.slice(0, splitAt).trim() + "\n\n" + s.slice(splitAt).trim();
    };
    parsed.options = parsed.options.map((o: any) => ({
      ...o,
      hook: cleanString(String(o.hook || "")),
      legenda: enforceFirstLine(cleanString(String(o.legenda || ""))),
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
