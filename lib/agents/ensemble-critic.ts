/**
 * Ensemble Critic — 3 avaliadores independentes rodando em paralelo.
 * Cada um tem perspectiva diferente (viral / marca / tecnico).
 * Score final = MEDIANA dos 3. Issues = UNIAO deduplicada.
 * Evita score espurio de 1 modelo mais generoso ou mais rigido.
 */

import { getAi, getPremiumModel, MODEL } from "../claude";
import { extractJson } from "../utils";
import { brandBlockFull } from "../brand-context";
import { critiqueCarousel, type CarouselCritique, type CarouselIssue, type ScoreBreakdown } from "./carousel-critic";

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

export type EnsembleResult = {
  score: number;                      // mediana
  score_mean: number;                 // media (secundaria)
  score_stddev: number;               // desvio padrao (flag "controverso")
  breakdown_median: ScoreBreakdown;
  critics: {
    viral: CarouselCritique;
    brand: CarouselCritique;
    technical: CarouselCritique;
  };
  issues: CarouselIssue[];            // uniao deduplicada
  strengths: string[];                // uniao deduplicada
  persona_detected: string;           // moda
  big_domino_presente: boolean;       // majority
  controverso: boolean;               // stddev > 10
};

function flattenSlideText(s: SlideLike): string {
  return [s.topLabel, s.title, s.subtitle, s.pergunta, s.nomePopular, s.nomeCientifico]
    .filter(Boolean)
    .join(" | ");
}

/**
 * Critic B: foco MARCA. Reusa critiqueCarousel padrao (ja tem brand-context + rubrica).
 * Critic A (viral) e Critic C (tecnico) sao especializados abaixo.
 */

const CRITIC_VIRAL_SYSTEM = `${brandBlockFull()}

# TUA FUNCAO
Voce eh o CRITIC DE VIRALIDADE. Recebe um carrossel pronto.
Avalia APENAS quao viral ele vai ser — save rate, share rate, completion rate esperados.

NAO avalia brand fit (outro critic faz isso). Foco 100% em potencial viral.

## RUBRICA (0-100)
- Hook da capa (0-35): quanto obriga swipe? sensorial / manifesto / revelacao = alto (dados reais). Inspiracional vazio = zero.
- Narrativa progressiva (0-25): cada slide fecha um loop e abre outro? mantem tensao?
- Share-ability (0-20): a 2a frase da legenda funciona copiada num WhatsApp?
- Completion incentive (0-10): carrossel incentiva ler ate o ultimo slide?
- CTA de DM (0-10): ultima frase pede DM (melhor que save passivo em 2026)?

## BENCHMARKS
- 95: hook forte + payoff claro + CTA DM + zero inspiracional = pode viralizar 500+ saves
- 80: hook ok + narrativa linear + CTA passivo = 150-300 saves tipico
- 60: hook generico + slides repetitivos = 50-100 saves
- 40: inspiracional vazio disfarcado = <30 saves
- 20: off-format, zero hook = engagement ruim

RETORNE JSON PURO:
{
  "breakdown": { "hook": int (0-35), "narrativa": int (0-25), "share_ability": int (0-20), "completion": int (0-10), "cta_dm": int (0-10) },
  "score": int (soma, 0-100),
  "issues": [{"slideIdx": int, "problem": string, "severity": "low"|"medium"|"high", "suggestion": string}],
  "strengths": string[] (2-3),
  "persona_detected": "emObra"|"casaPronta"|"indefinido",
  "big_domino_presente": boolean,
  "rationale": string (1 frase)
}`;

const CRITIC_TECHNICAL_SYSTEM = `${brandBlockFull()}

# TUA FUNCAO
Voce eh o CRITIC TECNICO. Avalia LEGIBILIDADE, ESTRUTURA, FLUIDEZ do carrossel.

NAO avalia brand fit nem viralidade — so QUALIDADE TECNICA do texto.

## RUBRICA (0-100)
- Estrutura (0-25): slides bem ordenados (capa -> progressao -> CTA), zero slide fora de lugar
- Legibilidade (0-25): frases curtas, sem jargao confuso, texto fluido
- Correcao (0-20): sem erro de portugues, sem repeticao desnecessaria
- Limite de tamanho (0-15): primeira linha <=120 chars, legenda <=50 palavras, 3-5 hashtags
- Coerencia visual/texto (0-15): texto bate com imagem, zero alucinacao de planta que nao ta na foto

RETORNE JSON PURO:
{
  "breakdown": { "estrutura": int (0-25), "legibilidade": int (0-25), "correcao": int (0-20), "tamanho": int (0-15), "coerencia": int (0-15) },
  "score": int (soma, 0-100),
  "issues": [{"slideIdx": int, "problem": string, "severity": "low"|"medium"|"high", "suggestion": string}],
  "strengths": string[] (2-3),
  "persona_detected": "emObra"|"casaPronta"|"indefinido",
  "big_domino_presente": boolean,
  "rationale": string (1 frase)
}`;

async function runCritic(
  systemPrompt: string,
  slides: SlideLike[],
  prompt: string,
  persona?: string,
  usePremium = false,
): Promise<CarouselCritique> {
  const slideDump = slides.map((s, i) => `[${i}] type=${s.type} | ${flattenSlideText(s)}`).join("\n");
  const user = `PROMPT: "${prompt}"
PERSONA esperada: ${persona || "indefinida"}

SLIDES GERADOS (${slides.length} total):
${slideDump}

Avalia rigorosamente na tua perspectiva. JSON puro.`;

  try {
    const model = usePremium ? getPremiumModel() || MODEL : MODEL;
    const resp = await getAi().chat.completions.create({
      model,
      max_tokens: 1600,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: user },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "";
    const parsed = extractJson(raw) as Partial<CarouselCritique> & { breakdown?: Record<string, number> };

    // Normaliza (breakdown dimensoes variam por critic — somamos)
    const breakdownObj: Record<string, number> = parsed.breakdown || {};
    const computed: number = Object.values(breakdownObj).reduce(
      (sum: number, v) => sum + (typeof v === "number" ? v : 0),
      0,
    );
    const score: number =
      typeof parsed.score === "number" && Math.abs(parsed.score - computed) <= 5
        ? parsed.score
        : computed;

    return {
      score,
      breakdown: {
        hook: breakdownObj.hook || 12,
        narrativa: breakdownObj.narrativa || breakdownObj.estrutura || 12,
        persona: breakdownObj.share_ability || breakdownObj.correcao || 10,
        vocab: breakdownObj.completion || breakdownObj.tamanho || 8,
        cta: breakdownObj.cta_dm || breakdownObj.coerencia || 8,
      },
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      persona_detected: parsed.persona_detected || "indefinido",
      big_domino_presente: Boolean(parsed.big_domino_presente),
      vocab_premium_score: 5,
      anti_cringe_score: 5,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : undefined,
    };
  } catch (err) {
    console.error("[ensemble-critic] falhou um critic:", (err as Error).message);
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

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stddev(nums: number[]): number {
  const m = mean(nums);
  return Math.sqrt(mean(nums.map((n) => (n - m) ** 2)));
}

function modeString(arr: string[]): string {
  const counts: Record<string, number> = {};
  for (const s of arr) counts[s] = (counts[s] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || arr[0] || "indefinido";
}

function dedupIssues(issues: CarouselIssue[]): CarouselIssue[] {
  const seen = new Set<string>();
  const out: CarouselIssue[] = [];
  for (const iss of issues) {
    const key = `${iss.slideIdx}|${iss.problem.slice(0, 60).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(iss);
  }
  return out;
}

function dedupStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const key = s.slice(0, 50).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export async function ensembleCritique(params: {
  slides: SlideLike[];
  prompt: string;
  persona?: string;
}): Promise<EnsembleResult> {
  const { slides, prompt, persona } = params;

  // 3 critics em paralelo
  const [viral, brand, technical] = await Promise.all([
    runCritic(CRITIC_VIRAL_SYSTEM, slides, prompt, persona, true), // viral usa premium
    critiqueCarousel({ slides, prompt, persona }),                 // brand usa o padrao
    runCritic(CRITIC_TECHNICAL_SYSTEM, slides, prompt, persona),   // tecnico padrao
  ]);

  const scores = [viral.score, brand.score, technical.score];
  const med = median(scores);
  const mn = mean(scores);
  const sd = stddev(scores);

  // Breakdown mediano por dimensao (dimensoes do brand critic — estruturais)
  const breakdown_median: ScoreBreakdown = {
    hook: median([viral.breakdown.hook, brand.breakdown.hook, technical.breakdown.hook]),
    narrativa: median([viral.breakdown.narrativa, brand.breakdown.narrativa, technical.breakdown.narrativa]),
    persona: median([viral.breakdown.persona, brand.breakdown.persona, technical.breakdown.persona]),
    vocab: median([viral.breakdown.vocab, brand.breakdown.vocab, technical.breakdown.vocab]),
    cta: median([viral.breakdown.cta, brand.breakdown.cta, technical.breakdown.cta]),
  };

  const allIssues = [...viral.issues, ...brand.issues, ...technical.issues];
  const allStrengths = [...viral.strengths, ...brand.strengths, ...technical.strengths];
  const allPersonas = [viral.persona_detected, brand.persona_detected, technical.persona_detected];
  const bigDominoVotes = [viral.big_domino_presente, brand.big_domino_presente, technical.big_domino_presente];

  return {
    score: Math.round(med),
    score_mean: Math.round(mn * 10) / 10,
    score_stddev: Math.round(sd * 10) / 10,
    breakdown_median,
    critics: { viral, brand, technical },
    issues: dedupIssues(allIssues),
    strengths: dedupStrings(allStrengths).slice(0, 5),
    persona_detected: modeString(allPersonas),
    big_domino_presente: bigDominoVotes.filter(Boolean).length >= 2,
    controverso: sd > 10,
  };
}
