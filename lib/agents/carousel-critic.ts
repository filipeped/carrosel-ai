/**
 * Agente 2: Crítica de carrossel (PÓS-copy).
 * Revisa os 6 slides contra o brand context e retorna score + issues.
 * Se score < 75, pipeline pode regenerar.
 */

import { getAi, MODEL } from "../claude";
import { extractJson } from "../utils";
import { brandBlockFull, LINGUAGEM_PROIBIDA, VOCABULARIO_PREMIUM } from "../brand-context";

export type CarouselIssue = {
  slideIdx: number;
  problem: string;
  severity: "low" | "medium" | "high";
  suggestion?: string;
};

export type CarouselCritique = {
  score: number; // 0-100
  issues: CarouselIssue[];
  strengths: string[];
  persona_detected: string;
  big_domino_presente: boolean;
  vocab_premium_score: number; // 0-10
  anti_cringe_score: number; // 0-10 (quanto evitou linguagem proibida)
};

type SlideLike = {
  type: string;
  title?: string | null;
  subtitle?: string | null;
  topLabel?: string | null;
  pergunta?: string | null;
  nomePopular?: string | null;
  nomeCientifico?: string | null;
  [key: string]: unknown;
};

function flattenSlideText(s: SlideLike): string {
  return [s.topLabel, s.title, s.subtitle, s.pergunta, s.nomePopular, s.nomeCientifico]
    .filter(Boolean)
    .join(" | ");
}

/**
 * Pré-checagem determinística (local, sem LLM) pra detectar linguagem proibida
 * antes de mandar pro Claude. Dá dica no prompt do crítico.
 */
function preCheck(slides: SlideLike[]) {
  const found: Array<{ slideIdx: number; word: string }> = [];
  slides.forEach((s, idx) => {
    const text = flattenSlideText(s).toLowerCase();
    for (const bad of LINGUAGEM_PROIBIDA) {
      if (text.includes(bad.toLowerCase())) {
        found.push({ slideIdx: idx, word: bad });
      }
    }
    // detecta vocab antigo
    for (const [old, novo] of Object.entries(VOCABULARIO_PREMIUM)) {
      if (text.includes(old.toLowerCase())) {
        found.push({ slideIdx: idx, word: `"${old}" deveria ser "${novo}"` });
      }
    }
  });
  return found;
}

const SYSTEM = `${brandBlockFull()}

Voce eh o Critico de Carrossel. Recebe 6 slides ja gerados + prompt do usuario.
Avalia rigorosamente contra o brand context.

Criterios de score (0-100):
- 100: perfeito — persona clara, big domino aparece, vocab premium, zero cringe, narrativa forte, CTA ativo
- 85: bom — 1-2 micro ajustes
- 70: mediano — precisa revisar 2-3 slides
- 50: ruim — regenerar copy inteira
- 30: fora da marca — problema grave de tom

Issues: listar cada problema com slideIdx, problem, severity, suggestion curta.
Strengths: o que funcionou (2-3 pontos).
Persona_detected: "emObra", "casaPronta", ou "indefinido" (o que voce entende do copy).
Big_domino_presente: se o conceito de "clareza antes de investir / 3D / certeza" aparece em algum slide.
Vocab_premium_score: 0-10 — quanto usa "área externa", "investimento", "espécies selecionadas".
Anti_cringe_score: 0-10 — quanto EVITA exagero, clichê, emoji proibido, travessão.

Retorne JSON puro:
{
  "score": int,
  "issues": [{"slideIdx": int, "problem": string, "severity": "low"|"medium"|"high", "suggestion": string}],
  "strengths": string[],
  "persona_detected": string,
  "big_domino_presente": boolean,
  "vocab_premium_score": int,
  "anti_cringe_score": int
}`;

export async function critiqueCarousel(params: {
  slides: SlideLike[];
  prompt: string;
  persona?: string;
}): Promise<CarouselCritique> {
  const { slides, prompt, persona } = params;
  const preIssues = preCheck(slides);

  const slideDump = slides
    .map((s, i) => `[${i}] type=${s.type} | ${flattenSlideText(s)}`)
    .join("\n");

  const preIssuesBlock = preIssues.length
    ? `\n\nPRE-CHECK DETERMINISTICO (pistas obvias ja detectadas):\n${preIssues
        .map((p) => `- slide ${p.slideIdx}: ${p.word}`)
        .join("\n")}`
    : "";

  const user = `PROMPT: "${prompt}"
PERSONA esperada: ${persona || "indefinida"}

SLIDES GERADOS:
${slideDump}${preIssuesBlock}

Avalia rigorosamente. JSON puro.`;

  const resp = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 1200,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });
  const raw = resp.choices[0]?.message?.content || "";
  try {
    const parsed = extractJson(raw) as Partial<CarouselCritique>;
    return {
      score: typeof parsed.score === "number" ? parsed.score : 50,
      issues: Array.isArray(parsed.issues) ? (parsed.issues as CarouselIssue[]) : [],
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      persona_detected: parsed.persona_detected || "indefinido",
      big_domino_presente: Boolean(parsed.big_domino_presente),
      vocab_premium_score:
        typeof parsed.vocab_premium_score === "number" ? parsed.vocab_premium_score : 5,
      anti_cringe_score:
        typeof parsed.anti_cringe_score === "number" ? parsed.anti_cringe_score : 5,
    };
  } catch {
    return {
      score: 50,
      issues: [],
      strengths: [],
      persona_detected: "indefinido",
      big_domino_presente: false,
      vocab_premium_score: 5,
      anti_cringe_score: 5,
    };
  }
}
