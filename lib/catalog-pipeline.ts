// Pipeline para o formato "catalog" — cada slide e uma planta do banco
// vegetacoes (foto + dado), nao usa image_bank.
// Estrutura: cover (planta 1) + 4 listItem (plantas 2-5) + cta (planta 6).
import { getAi, MODEL } from "./claude";
import { extractJson } from "./utils";
import { brandBlockFull, viralFrameworksBlock, type HookFrameworkKey } from "./brand-context";
import { getBrandVoiceReferences } from "./brand-voice";
import { hookTournament } from "./agents/hook-tournament";
import { ensembleCritique } from "./agents/ensemble-critic";
import type { VegetacaoRow } from "./supabase";
import type { SlideSpec } from "./pipeline";
import type { ImageRow, Selection } from "./types";
import type { CatalogAngle } from "./catalog-angles";

const CATALOG_SYSTEM_BASE = `Voce escreve copy pra carrossel CATALOGO de plantas do @digitalpaisagismo.
Cada slide eh uma planta protagonista com foto isolada (foto do banco).

ESTRUTURA: 6 slides
- Slide 0: capa (foto da planta 1) com hook curto (3-8 palavras) + topLabel uppercase
- Slides 1-4: nome popular + nome cientifico + dica curta (max 16 palavras) por planta
- Slide 5: CTA (foto da planta 6) com fechamento contemplativo (max 16 palavras)

REGRAS DURAS DE QUALIDADE:
- Use SOMENTE plantas da lista. nomeCientifico DEVE ser EXATO.
- DICA: pratica, especifica, ancorada em DADO REAL do banco (luminosidade, altura, clima, manejo).
  - BOM: "Aceita 4h de sol direto e perde cor sem irrigacao espacada"
  - RUIM: "Linda planta para qualquer jardim" (generico, vazio)
- CTA: afirmacao contemplativa (NAO pergunta), conecta com SAVE pro WhatsApp.
  - BOM: "Esses sao os nomes que voce vai querer lembrar."
  - RUIM: "Salva pra depois?" (passivo)
- Sem emoji. Sem "—" e ":". Sem cliches ("incrivel", "imperdivel", "exuberante", "coeso", "certinho").
- Sem inspiracional vazio ("abraca", "floresce", "respira natureza", "convida o olhar").
- Sem comercial vendedor ("contratar", "antes de chamar", "projeto 3D", "me manda no direct").
- Vocabulario: "area externa" (nao quintal), "investimento" (nao orcamento).
- Nao mencione preco.

SAIDA: JSON puro, sem markdown.
{
  "cover_title": "string (3-8 palavras, ancorado no problema/observacao concreta)",
  "cover_topLabel": "string uppercase curto (2-3 palavras, ex: PLANTAS DE SOMBRA)",
  "dicas": [
    { "dica": "max 16 palavras, especifica e tecnica" },
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
  score?: number;
  rationale?: string;
};

/**
 * Gera carrossel catalog a partir de 6 plantas escolhidas.
 * Cada planta vira 1 slide com sua imagem_principal.
 *
 * Pipeline:
 * 1. Hook-tournament gera 12 candidatos pra capa, top 1 vira cover_title
 * 2. LLM gera 4 dicas + cta_fechamento + cover_topLabel
 * 3. Ensemble-critic avalia; se score < 65, retry com instrucoes
 * 4. Constroi Selection fake (ImageRows apontando pra imagem_principal)
 */
export async function runCatalogCarousel(
  prompt: string,
  plantasEscolhidas: VegetacaoRow[],
  angle?: CatalogAngle,
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

  const hookFramework: HookFrameworkKey = angle?.framework || "manifesto_tese";

  // ETAPA 1: Hook-tournament pra capa (12 candidatos -> top 1)
  let coverTitle = "";
  let coverTopLabel = "";
  try {
    const hooks = await hookTournament({
      prompt: angle?.titulo || prompt,
      options: { count: 12 },
    });
    const top = hooks[0];
    if (top) {
      coverTitle = top.texto;
      coverTopLabel = top.topLabel || "";
    }
  } catch (err) {
    console.warn("[catalog] hook-tournament falhou, usando LLM single-shot:", (err as Error).message);
  }

  // ETAPA 2: LLM gera dicas + cta + (capa se hook-tournament falhou)
  const vegList = plantas6
    .map(
      (v, i) =>
        `${i + 1}. ${v.nome_popular} (${v.nome_cientifico || "?"}) | luminosidade: ${v.luminosidade || "?"} | clima: ${v.clima || "?"} | altura: ${v.altura || "?"}`,
    )
    .join("\n");

  const angleBlock = angle
    ? `\nANGULO VIRAL: "${angle.titulo}"\nFRAMEWORK: ${angle.framework} (${angle.hint})\nO carrossel inteiro DEVE protagonizar esse problema/observacao. Cada dica deve reforcar o angulo.\n`
    : "";

  const coverHintBlock = coverTitle
    ? `\nCAPA JA ESCOLHIDA (hook-tournament): "${coverTitle}" / topLabel: "${coverTopLabel}"\nNAO REGENERE a capa — ela ja esta otima. So preencha cover_title e cover_topLabel com esses valores no JSON.\n`
    : "";

  const userMsg = `Tema: "${prompt || "(sem tema explicito)"}"${angleBlock}${coverHintBlock}

Plantas escolhidas (na ordem dos slides):
${vegList}

Slide 0: cover com foto da planta 1.
Slides 1-4: dica curta especifica (uma por planta — plantas 2 a 5). Foque em manejo real, dado tecnico do banco.
Slide 5: CTA contemplativo (foto da planta 6).

Retorne JSON puro com cover_title, cover_topLabel, dicas (4), cta_fechamento.`;

  // System prompt completo: brand-context + frameworks + base + brand-voice (top posts)
  const voiceRefs = await getBrandVoiceReferences();
  const systemFull = `${brandBlockFull()}

${viralFrameworksBlock()}

${CATALOG_SYSTEM_BASE}

${voiceRefs ? `\n${voiceRefs}\n\nIMITE o ritmo e o tom dos posts acima. Nao copie literalmente — aplica o ritmo.\n` : ""}`;

  const resp = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 1600,
    temperature: 0.7,
    messages: [
      { role: "system", content: systemFull },
      { role: "user", content: userMsg },
    ],
  });
  const raw = resp.choices[0]?.message?.content || "";
  const parsed = extractJson<CatalogLlmResponse>(raw);

  const dicas = Array.isArray(parsed.dicas) ? parsed.dicas : [];

  // ETAPA 3: monta SlideSpec[]
  let slides: SlideSpec[] = buildSlides(plantas6, {
    coverTitle: coverTitle || parsed.cover_title || plantas6[0].nome_popular,
    coverTopLabel: coverTopLabel || parsed.cover_topLabel || "CATALOGO DE PLANTAS",
    dicas: dicas.map((d) => d?.dica || ""),
    ctaFechamento: parsed.cta_fechamento || "Plantas certas mudam o jardim inteiro.",
  });

  // ETAPA 4: Ensemble-critic. Se score < 65, retry com instrucao.
  let score: number | undefined;
  try {
    const critique = await ensembleCritique({
      slides: slides as any,
      prompt: angle?.titulo || prompt,
    });
    score = critique.score;

    if (critique.score < 65 && critique.issues.length) {
      const issuesBlock = critique.issues
        .slice(0, 6)
        .map((iss) => `- slide ${iss.slideIdx} [${iss.severity}]: ${iss.problem}${iss.suggestion ? ` → ${iss.suggestion}` : ""}`)
        .join("\n");

      const retryMsg = `${userMsg}

CRITIC ENSEMBLE deu score ${critique.score}/100. Issues encontrados:
${issuesBlock}

REESCREVE corrigindo esses problemas. Mantem mesma estrutura JSON.`;

      const retry = await getAi().chat.completions.create({
        model: MODEL,
        max_tokens: 1600,
        temperature: 0.65,
        messages: [
          { role: "system", content: systemFull },
          { role: "user", content: retryMsg },
        ],
      });
      const retryRaw = retry.choices[0]?.message?.content || "";
      const retryParsed = extractJson<CatalogLlmResponse>(retryRaw);
      const retryDicas = Array.isArray(retryParsed.dicas) ? retryParsed.dicas : [];

      slides = buildSlides(plantas6, {
        coverTitle: coverTitle || retryParsed.cover_title || plantas6[0].nome_popular,
        coverTopLabel: coverTopLabel || retryParsed.cover_topLabel || "CATALOGO DE PLANTAS",
        dicas: retryDicas.map((d) => d?.dica || ""),
        ctaFechamento: retryParsed.cta_fechamento || "Plantas certas mudam o jardim inteiro.",
      });

      // Re-avalia (fire-and-forget pra metric)
      try {
        const recritique = await ensembleCritique({ slides: slides as any, prompt: angle?.titulo || prompt });
        score = recritique.score;
      } catch {
        /* mantem score do retry */
      }
    }
  } catch (err) {
    console.warn("[catalog] ensemble-critic falhou (mantendo slides):", (err as Error).message);
  }

  // ETAPA 5: monta Selection com ImageRows fake
  const imagens: ImageRow[] = plantas6.map((v, i) => vegToImageRow(v, i));
  const selection: Selection = {
    cover: imagens[0],
    inner: imagens.slice(1, 5),
    cta: imagens[5],
    alternatives: [],
    rationale: angle?.titulo
      ? `catalog: ${angle.titulo} (${hookFramework})`
      : "catalog: foto direta das plantas escolhidas",
  };

  return { slides, selection, format: "catalog", imagens, score, rationale: selection.rationale };
}

type SlidesInput = {
  coverTitle: string;
  coverTopLabel: string;
  dicas: string[]; // 4 dicas
  ctaFechamento: string;
};

function buildSlides(plantas6: VegetacaoRow[], input: SlidesInput): SlideSpec[] {
  return [
    {
      type: "cover",
      imageIdx: 0,
      topLabel: clean(input.coverTopLabel, 4) || "CATALOGO DE PLANTAS",
      numeral: null,
      title: clean(input.coverTitle, 12) || plantas6[0].nome_popular,
      italicWords: [],
    },
    ...plantas6.slice(1, 5).map<SlideSpec>((v, i) => ({
      type: "listItem",
      imageIdx: i + 1,
      numeral: String(i + 1).padStart(2, "0"),
      nomePopular: v.nome_popular,
      nomeCientifico: v.nome_cientifico || "",
      dica: clean(input.dicas[i] || "", 16),
    })),
    {
      type: "cta",
      imageIdx: 5,
      fechamento: clean(input.ctaFechamento, 16) || "Plantas certas mudam o jardim inteiro.",
      italicWords: [],
    },
  ];
}
