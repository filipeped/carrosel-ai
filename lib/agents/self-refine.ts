/**
 * Self-Refine Loop — gera, critica, reescreve ate convergir.
 * Iteracao cirurgica: so corrige as dimensoes com score baixo no breakdown.
 * Hard cap de iteracoes + early stop se score regride.
 */

import { getAi, getPremiumModel, MODEL } from "../claude";
import { extractJson } from "../utils";
import { brandBlockFull, viralFrameworksBlock } from "../brand-context";
import { ensembleCritique, type EnsembleResult } from "./ensemble-critic";
import type { ScoreBreakdown } from "./carousel-critic";

type SlideLike = {
  type: string;
  title?: string | null;
  subtitle?: string | null;
  topLabel?: string | null;
  pergunta?: string | null;
  fechamento?: string | null;
  nomePopular?: string | null;
  nomeCientifico?: string | null;
  imageIdx?: number;
  italicWords?: string[];
  [key: string]: unknown;
};

export type RefineOutput = {
  slides: SlideLike[];
  finalScore: number;
  iterations: number;
  history: Array<{ iteration: number; score: number; breakdown: ScoreBreakdown; controverso: boolean }>;
  converged: boolean;
  critiqueFinal: EnsembleResult;
};

type RefineOptions = {
  targetScore?: number;
  maxIterations?: number;
  persona?: string;
};

const REWRITE_SYSTEM = `${brandBlockFull()}

${viralFrameworksBlock()}

# TUA FUNCAO

Voce eh o REWRITER CIRURGICO. Recebe um carrossel + feedback do critic ensemble.
Reescreve APENAS as dimensoes com score baixo — nao toca no resto.

## REGRA CIRURGICA

- Score baixo em HOOK (< 18/25) -> reescreve slide 0 (capa) com 1 dos 7 frameworks (priorizar sensorial ou manifesto_tese)
- Score baixo em NARRATIVA (< 18/25) -> reescreve slides internos pra ter progressao
- Score baixo em PERSONA (< 14/20) -> ajusta linguagem pra em-obra ou casa-pronta especifico
- Score baixo em VOCAB (< 10/15) -> troca linguagem proibida / injeta vocab premium
- Score baixo em CTA (< 10/15) -> reescreve ultimo slide com CTA ativo

Tudo acima do limiar: MANTEM exato.

## IMPORTANTE

- Mantem mesmo numero de slides (mesmo count)
- Mantem mesmo imageIdx em cada slide (ordem das imagens nao muda)
- Mantem tipos de slide (cover/plantDetail/inspiration/cta)
- Se o slide original eh plantDetail com nomePopular/nomeCientifico especifico, MANTEM a planta
- So muda TEXTO (title, subtitle, topLabel, fechamento, italicWords)

## RETORNE JSON PURO

{
  "slides": [
    { "type": "cover", "imageIdx": 0, "topLabel": "...", "numeral": "..."|null, "title": "...", "italicWords": [...] },
    { "type": "plantDetail", "imageIdx": 1, "nomePopular": "...", "nomeCientifico": "...", "title": null, "subtitle": null, "topLabel": null },
    { "type": "inspiration", "imageIdx": 2, "title": "...", "subtitle": "...", "topLabel": "...", "nomePopular": null, "nomeCientifico": null },
    ...
    { "type": "cta", "imageIdx": N-1, "fechamento": "...", "italicWords": [...] }
  ],
  "changes_summary": string (1-2 frases: o que voce mudou e por que)
}`;

async function rewriteSlides(
  slides: SlideLike[],
  prompt: string,
  critique: EnsembleResult,
  persona?: string,
): Promise<SlideLike[]> {
  const slideDump = slides
    .map((s, i) => `[${i}] ${JSON.stringify(s)}`)
    .join("\n");

  const lowDimensions: string[] = [];
  const b = critique.breakdown_median;
  if (b.hook < 18) lowDimensions.push("hook (atual " + b.hook + "/25)");
  if (b.narrativa < 18) lowDimensions.push("narrativa (atual " + b.narrativa + "/25)");
  if (b.persona < 14) lowDimensions.push("persona (atual " + b.persona + "/20)");
  if (b.vocab < 10) lowDimensions.push("vocab (atual " + b.vocab + "/15)");
  if (b.cta < 10) lowDimensions.push("cta (atual " + b.cta + "/15)");

  const issuesBlock = critique.issues
    .slice(0, 8)
    .map((iss) => `- slide ${iss.slideIdx} [${iss.severity}]: ${iss.problem}${iss.suggestion ? ` → ${iss.suggestion}` : ""}`)
    .join("\n");

  const user = `TEMA: "${prompt}"
PERSONA: ${persona || "indefinida"}

CARROSSEL ATUAL (${slides.length} slides):
${slideDump}

SCORE ATUAL: ${critique.score}/100 (stddev ${critique.score_stddev})
DIMENSOES COM GAP: ${lowDimensions.length ? lowDimensions.join(", ") : "nenhuma — manter tudo"}

ISSUES DO CRITIC ENSEMBLE:
${issuesBlock || "(sem issues especificos)"}

Reescreve APENAS as dimensoes com gap. Mantem o resto exato. JSON puro.`;

  try {
    const resp = await getAi().chat.completions.create({
      model: getPremiumModel() || MODEL,
      max_tokens: 2400,
      temperature: 0.7,
      messages: [
        { role: "system", content: REWRITE_SYSTEM },
        { role: "user", content: user },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "";
    const parsed = extractJson(raw) as { slides?: SlideLike[] };
    if (!Array.isArray(parsed.slides) || parsed.slides.length !== slides.length) {
      console.warn("[self-refine] rewrite retornou contagem diferente, mantendo original");
      return slides;
    }
    return parsed.slides;
  } catch (err) {
    console.error("[self-refine] rewrite falhou:", (err as Error).message);
    return slides;
  }
}

export async function selfRefine(params: {
  slides: SlideLike[];
  prompt: string;
  options?: RefineOptions;
}): Promise<RefineOutput> {
  const { slides, prompt, options = {} } = params;
  const targetScore = options.targetScore ?? 88;
  const maxIterations = Math.max(1, Math.min(4, options.maxIterations ?? 3));
  const persona = options.persona;

  let current = slides;
  const history: RefineOutput["history"] = [];
  let lastCritique: EnsembleResult | null = null;

  for (let i = 1; i <= maxIterations; i++) {
    const critique = await ensembleCritique({ slides: current, prompt, persona });
    lastCritique = critique;
    history.push({
      iteration: i,
      score: critique.score,
      breakdown: critique.breakdown_median,
      controverso: critique.controverso,
    });

    // Convergiu? done
    if (critique.score >= targetScore) {
      return {
        slides: current,
        finalScore: critique.score,
        iterations: i,
        history,
        converged: true,
        critiqueFinal: critique,
      };
    }

    // Regrediu ou estagnou? early stop (mantem melhor)
    if (i > 1) {
      const prev = history[i - 2];
      if (critique.score <= prev.score) {
        return {
          slides: current,
          finalScore: critique.score,
          iterations: i,
          history,
          converged: false,
          critiqueFinal: critique,
        };
      }
    }

    // Ultima iteracao alcancada? nao reescreve mais
    if (i === maxIterations) break;

    // Reescreve
    current = await rewriteSlides(current, prompt, critique, persona);
  }

  return {
    slides: current,
    finalScore: lastCritique?.score ?? 50,
    iterations: maxIterations,
    history,
    converged: false,
    critiqueFinal:
      lastCritique ??
      (await ensembleCritique({ slides: current, prompt, persona })),
  };
}
