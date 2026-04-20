/**
 * Agente 2: Critica de carrossel (POS-copy).
 * Revisa os slides contra o brand context e retorna score por dimensao.
 * Rubrica: hook(0-25) + narrativa(0-25) + persona(0-20) + vocab(0-15) + CTA(0-15) = 100.
 * Usa temperature baixa + benchmarks explicitos pra estabilidade.
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

export type ScoreBreakdown = {
  hook: number;          // 0-25
  narrativa: number;     // 0-25
  persona: number;       // 0-20
  vocab: number;         // 0-15
  cta: number;           // 0-15
};

export type CarouselCritique = {
  score: number;                   // 0-100 (soma do breakdown)
  breakdown: ScoreBreakdown;
  issues: CarouselIssue[];
  strengths: string[];
  persona_detected: string;
  big_domino_presente: boolean;
  vocab_premium_score: number;     // 0-10 (legado, mantido pra compat)
  anti_cringe_score: number;       // 0-10 (legado, mantido pra compat)
  rationale?: string;              // por que esse score
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
 * Pre-checagem deterministica (sem LLM) — detecta linguagem proibida
 * antes de mandar pro Claude, serve de dica no prompt.
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
    for (const [old, novo] of Object.entries(VOCABULARIO_PREMIUM)) {
      if (text.includes(old.toLowerCase())) {
        found.push({ slideIdx: idx, word: `"${old}" deveria ser "${novo}"` });
      }
    }
  });
  return found;
}

/**
 * Benchmarks concretos pro modelo ancorar o score.
 * Cada nivel tem um exemplo fictifcio com breakdown explicito.
 */
const BENCHMARKS = `## BENCHMARKS DE CALIBRACAO (use pra ancorar teu score)

### Score 95 (excelente — referencia)
Capa: "O erro de R$30 mil que aparece 1 ano depois da obra"
Narrativa: 4 slides tecnicos + 1 CTA, progressao clara, usa "area externa", "investimento", Big Domino presente ("decidir antes de executar")
CTA: "Me manda PROJETO no direct e te mando os 3 criterios completos"
Breakdown: hook=23 narrativa=24 persona=20 vocab=14 cta=14 = 95

### Score 80 (bom, mas 1-2 dimensoes com gap)
Capa: "3 decisoes que valem mais que escolher plantas"
Narrativa: 4 slides relevantes mas 1 generico. Vocab premium presente.
CTA: "Salva pra nao esquecer" (passivo, nao DM)
Breakdown: hook=21 narrativa=20 persona=17 vocab=13 cta=9 = 80

### Score 65 (mediano — regenerar 1-2 slides)
Capa: "Seu jardim merece um projeto bem feito"
Narrativa: promessa vaga, 2 slides genericos, um bom.
Vocab mediano: usa "quintal" em 1 slide.
CTA: "Conheca nosso trabalho"
Breakdown: hook=14 narrativa=15 persona=14 vocab=10 cta=12 = 65

### Score 40 (ruim — regenerar copy inteira)
Capa: "Transforme seu ambiente com natureza"
Narrativa: inspiracional vazio, zero info gap, 3 slides dizendo a mesma coisa.
Vocab: usa "orcamento", "dor de cabeca".
CTA: "Entre em contato"
Breakdown: hook=8 narrativa=9 persona=9 vocab=6 cta=8 = 40

### Score 20 (fora da marca — recusar)
Capa: "7 dicas incriveis de paisagismo"
Narrativa: generica, aplicavel a qualquer perfil, sem persona.
Vocab: linguagem proibida em peso.
Breakdown: hook=4 narrativa=5 persona=4 vocab=3 cta=4 = 20`;

const SYSTEM = `${brandBlockFull()}

${BENCHMARKS}

# TUA FUNCAO

Voce eh o Critico de Carrossel. Recebe slides gerados + prompt do usuario.
Avalia rigorosamente e atribui score por DIMENSAO (soma vira o total 0-100).

## RUBRICA (preencha cada bucket SEPARADAMENTE — nao chute o total)

### HOOK da capa (0-25)
- 25: capa obriga swipe (information gap, contrarian, numero especifico, status)
- 20: hook forte mas generico (sem numero ou gap)
- 15: hook correto mas previsivel
- 10: hook fraco, inspiracional vazio
- 5: sem hook real
- 0: hook off-brand ou ilegivel

### NARRATIVA (0-25) — slides internos
- 25: progressao clara, cada slide fecha um loop aberto, payoff na penultima, cresce tensao
- 20: boa progressao, 1 slide fraco
- 15: slides relevantes mas sem progressao forte
- 10: slides isolados, sem arco
- 5: slides repetitivos
- 0: narrativa incoerente

### PERSONA alinhada (0-20)
- 20: fala direto pra em-obra ou casa-pronta com dor especifica, respeitando 70/30
- 15: alinha mas poderia ser mais especifico da persona
- 10: persona mista ou indefinida
- 5: fala pra paisagista, nao pro dono
- 0: totalmente off-persona

### VOCABULARIO premium (0-15)
- 15: usa "area externa", "investimento", "especies selecionadas", "paisagismo integrado"; zero termo proibido
- 12: usa 2-3 termos premium, nenhum proibido
- 8: usa 1 termo premium ou ainda tem 1 termo simples
- 4: usa "quintal", "orcamento" ou tem 1 palavra banida ("incrivel", "exuberante")
- 0: multiplas violacoes

### CTA ativo (0-15)
- 15: CTA concreto de DM ("me manda X no direct") ou pergunta forte que gera comment
- 12: CTA direto mas passivo ("salve pra nao esquecer")
- 8: CTA generico ("comente o que achou")
- 4: CTA fraco ("curta se gostou")
- 0: sem CTA

## INSTRUCAO CRITICA

USE A ESCALA INTEIRA — variacao real de 30 a 98 eh esperada. Dois carrosseis nao deveriam ter o mesmo score a menos que sejam identicos. Score repetido eh FALHA tua.

## ANTI-DEGRAU FIXO

Se voce sentir que quase todos os seus scores caem em 75-80, para, releia os benchmarks e force discriminacao. Pequenos detalhes (uma palavra proibida, um CTA sem DM) custam 5-10 pontos reais.

## RETORNE JSON PURO

{
  "breakdown": {
    "hook": int (0-25),
    "narrativa": int (0-25),
    "persona": int (0-20),
    "vocab": int (0-15),
    "cta": int (0-15)
  },
  "score": int (soma do breakdown, 0-100),
  "issues": [{"slideIdx": int, "problem": string, "severity": "low"|"medium"|"high", "suggestion": string}],
  "strengths": string[] (2-3),
  "persona_detected": "emObra"|"casaPronta"|"indefinido",
  "big_domino_presente": boolean,
  "vocab_premium_score": int (0-10),
  "anti_cringe_score": int (0-10),
  "rationale": string (1-2 frases justificando o score, referenciando 1 benchmark)
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

SLIDES GERADOS (${slides.length} total):
${slideDump}${preIssuesBlock}

Avalia rigorosamente. Preenche cada bucket do breakdown separadamente. USE A ESCALA INTEIRA. JSON puro.`;

  try {
    const resp = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 1800,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "";
    const parsed = extractJson(raw) as Partial<CarouselCritique> & { breakdown?: Partial<ScoreBreakdown> };

    // Normaliza breakdown
    const b: Partial<ScoreBreakdown> = parsed.breakdown || {};
    const breakdown: ScoreBreakdown = {
      hook: typeof b.hook === "number" ? Math.max(0, Math.min(25, b.hook)) : 12,
      narrativa: typeof b.narrativa === "number" ? Math.max(0, Math.min(25, b.narrativa)) : 12,
      persona: typeof b.persona === "number" ? Math.max(0, Math.min(20, b.persona)) : 10,
      vocab: typeof b.vocab === "number" ? Math.max(0, Math.min(15, b.vocab)) : 8,
      cta: typeof b.cta === "number" ? Math.max(0, Math.min(15, b.cta)) : 8,
    };
    // Se o score nao bater com a soma do breakdown, usa a soma (autoridade do breakdown)
    const computedScore = breakdown.hook + breakdown.narrativa + breakdown.persona + breakdown.vocab + breakdown.cta;
    const score = typeof parsed.score === "number" && Math.abs(parsed.score - computedScore) <= 3 ? parsed.score : computedScore;

    return {
      score,
      breakdown,
      issues: Array.isArray(parsed.issues) ? (parsed.issues as CarouselIssue[]) : [],
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      persona_detected: parsed.persona_detected || "indefinido",
      big_domino_presente: Boolean(parsed.big_domino_presente),
      vocab_premium_score:
        typeof parsed.vocab_premium_score === "number" ? parsed.vocab_premium_score : 5,
      anti_cringe_score:
        typeof parsed.anti_cringe_score === "number" ? parsed.anti_cringe_score : 5,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : undefined,
    };
  } catch (err) {
    console.error("[carousel-critic] falha:", (err as Error)?.message || err);
    return {
      score: 50,
      breakdown: { hook: 12, narrativa: 12, persona: 10, vocab: 8, cta: 8 },
      issues: [],
      strengths: [],
      persona_detected: "indefinido",
      big_domino_presente: false,
      vocab_premium_score: 5,
      anti_cringe_score: 5,
    };
  }
}
