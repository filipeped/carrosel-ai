// Pipeline para o formato "catalog" — cada slide e uma planta do banco
// vegetacoes (foto + dado), nao usa image_bank.
// Estrutura: cover (planta 1) + 4 listItem (plantas 2-5) + cta (planta 6).
import { getAi, MODEL, BRAND_VOICE } from "./claude";
import { extractJson } from "./utils";
import type { VegetacaoRow } from "./supabase";
import type { SlideSpec } from "./pipeline";
import type { ImageRow, Selection } from "./types";

const CATALOG_SYSTEM = `${BRAND_VOICE}

Voce escreve copy pra carrossel CATALOGO de plantas do @digitalpaisagismo.
Cada slide eh uma planta protagonista com foto isolada.

ESTRUTURA: 6 slides
- Slide 0: capa com hook curto (3-8 palavras), topLabel uppercase, ancorado na primeira planta
- Slides 1-4: nome popular + nome cientifico + dica curta (max 16 palavras) por planta
- Slide 5: CTA fechamento contemplativo (max 16 palavras)

REGRAS:
- Use SOMENTE plantas da lista. nomeCientifico DEVE ser EXATO.
- title da capa: 3-8 palavras, ancorado em beneficio/observacao concreta. NAO clickbait.
- Dica de cada planta: pratica, util na floricultura/projeto. Cita luminosidade ou clima ou porte real do banco.
- CTA: afirmacao contemplativa que encerra (NAO pergunta), conecta com o ato de salvar/lembrar.
- Sem emoji. Sem "—" (travessao) e ":" (dois pontos). Sem cliches ("incrivel", "imperdivel").
- Vocabulario: "area externa" (nao quintal), "investimento" (nao orcamento), "espaco" (nao lugar).
- Nao mencione preco.

SAIDA: JSON puro, sem markdown.
{
  "cover_title": "string (3-8 palavras)",
  "cover_topLabel": "string uppercase curto (ex: PLANTAS DE SOMBRA)",
  "dicas": [
    { "dica": "max 16 palavras pratica" },
    { "dica": "..." },
    { "dica": "..." },
    { "dica": "..." }
  ],
  "cta_fechamento": "afirmacao contemplativa max 16 palavras"
}`;

type CatalogLlmResponse = {
  cover_title: string;
  cover_topLabel: string;
  dicas: { dica: string }[];
  cta_fechamento: string;
};

/**
 * Constroi um ImageRow "fake" a partir de uma planta — usado pelos templates
 * que esperam ImageRow no Selection. id usa offset negativo pra nao colidir
 * com image_bank reais.
 */
function vegToImageRow(v: VegetacaoRow, slotIdx: number): ImageRow {
  return {
    id: -1_000_000 - slotIdx, // offset negativo, unico por slot
    arquivo: "",
    url: v.imagem_principal,
    estilo: [],
    plantas: [v.nome_popular],
    mood: [],
    tipo_area: "",
    descricao: `${v.nome_popular}${v.nome_cientifico ? ` (${v.nome_cientifico})` : ""}`,
    analise_visual: {
      qualidade: 7,
      composicao: 6,
      luz: 6,
      cover_potential: 7,
      descricao_visual: `${v.nome_popular} em foto isolada de catalogo`,
      hero_element: v.nome_popular,
      mood_real: ["catalogo"],
      palavras_chave: [v.nome_popular.toLowerCase(), v.familia || ""].filter(Boolean),
    },
  };
}

/**
 * Sanitiza string preservando regras do projeto (sem ":", "—", emoji).
 */
const SLIDE_EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu;
const SLIDE_ARROWS = /[→↑↓←➤➡]/g;

function clean(s: string | undefined | null, maxWords = 30): string {
  if (!s) return "";
  let out = String(s)
    .replace(/\s—\s|—/g, ", ")
    .replace(/\s:\s|:(?!\/\/)(?!\d)/g, ", ")
    .replace(SLIDE_EMOJI_RE, "")
    .replace(SLIDE_ARROWS, "")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  if (out.split(/\s+/).length > maxWords) {
    out = out.split(/\s+/).slice(0, maxWords).join(" ").replace(/[,.;:]+$/, "") + ".";
  }
  return out;
}

export type CatalogResult = {
  slides: SlideSpec[];
  selection: Selection;
  format: "catalog";
  imagens: ImageRow[];
};

/**
 * Gera carrossel catalog a partir de 6 plantas escolhidas.
 * Cada planta vira 1 slide com sua imagem_principal.
 */
export async function runCatalogCarousel(
  prompt: string,
  plantasEscolhidas: VegetacaoRow[],
): Promise<CatalogResult> {
  // Filtra so plantas com imagem_principal valida
  const validas = plantasEscolhidas.filter(
    (p) => p.imagem_principal && p.imagem_principal.startsWith("http"),
  );
  if (validas.length < 6) {
    throw new Error(
      `Catalog precisa de 6 plantas com imagem; voce tem ${validas.length} validas.`,
    );
  }
  const plantas6 = validas.slice(0, 6);

  // 1. LLM gera todos os textos numa chamada so
  const vegList = plantas6
    .map(
      (v, i) =>
        `${i + 1}. ${v.nome_popular} (${v.nome_cientifico || "?"}) | luminosidade: ${v.luminosidade || "?"} | clima: ${v.clima || "?"} | altura: ${v.altura || "?"}`,
    )
    .join("\n");

  const userMsg = `Tema: "${prompt || "(sem tema explicito — desenvolva com base nas plantas)"}"

Plantas escolhidas (na ordem dos slides):
${vegList}

Slide 0: cover com foto da planta 1.
Slides 1-4: nome popular + cientifico + dica (uma planta cada — plantas 2 a 5).
Slide 5: CTA com foto da planta 6.

Retorne JSON puro com cover_title, cover_topLabel, dicas (4), cta_fechamento.`;

  const resp = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 1200,
    temperature: 0.55,
    messages: [
      { role: "system", content: CATALOG_SYSTEM },
      { role: "user", content: userMsg },
    ],
  });
  const raw = resp.choices[0]?.message?.content || "";
  const parsed = extractJson<CatalogLlmResponse>(raw);

  const dicas = Array.isArray(parsed.dicas) ? parsed.dicas : [];

  // 2. Monta SlideSpec[]
  const slides: SlideSpec[] = [
    {
      type: "cover",
      imageIdx: 0,
      topLabel: clean(parsed.cover_topLabel, 4) || "CATALOGO DE PLANTAS",
      numeral: null,
      title: clean(parsed.cover_title, 12) || plantas6[0].nome_popular,
      italicWords: [],
    },
    ...plantas6.slice(1, 5).map<SlideSpec>((v, i) => ({
      type: "listItem",
      imageIdx: i + 1,
      numeral: String(i + 1).padStart(2, "0"),
      nomePopular: v.nome_popular,
      nomeCientifico: v.nome_cientifico || "",
      dica: clean(dicas[i]?.dica, 16),
    })),
    {
      type: "cta",
      imageIdx: 5,
      fechamento: clean(parsed.cta_fechamento, 16) || "Plantas certas mudam o jardim inteiro.",
      italicWords: [],
    },
  ];

  // 3. Monta Selection com ImageRows fake (1 por slot)
  const imagens: ImageRow[] = plantas6.map((v, i) => vegToImageRow(v, i));
  const selection: Selection = {
    cover: imagens[0],
    inner: imagens.slice(1, 5),
    cta: imagens[5],
    alternatives: [],
    rationale: "catalog: foto direta das plantas escolhidas",
  };

  return { slides, selection, format: "catalog", imagens };
}
