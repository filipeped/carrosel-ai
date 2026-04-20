/**
 * Caption Tournament — gera N legendas por approach (total 4x) e escolhe as top K.
 * Usa generateCaption N vezes em paralelo com tweaks de temperature/seed,
 * depois passa todas pelo rankCaptionVariants e pega as melhores.
 *
 * Explora maior espaco do que a geracao padrao (3 approaches x 1 legenda).
 */

import { generateCaption, type CaptionOption } from "../pipeline";
import { optimizeCaption } from "./caption-optimizer";
import { viralMaster } from "./viral-master";
import { rankCaptionVariants } from "./variant-ranker";

type Slide = {
  type: string;
  title?: string | null;
  subtitle?: string | null;
  topLabel?: string | null;
  pergunta?: string | null;
  nomePopular?: string | null;
  nomeCientifico?: string | null;
  imageIdx?: number;
  italicWords?: string[];
  [key: string]: unknown;
};

export type TournamentCaption = CaptionOption & {
  _gatilho_viral?: string;
  _score_viralidade?: number;
  _viral_rationale?: string;
  _rank_score?: number;
  _rank_reason?: string;
  _tournament_round?: number;
};

/**
 * Roda N rodadas de generateCaption em paralelo, aplica optimizer+viral em cada option,
 * depois rankeia e retorna top K.
 *
 * Exemplo: rounds=4, topK=3 -> gera 4 batches (normalmente 5 approaches cada = 20),
 * passa todas pelo optimizer+viral, rankeia, retorna 3 melhores.
 */
export async function captionTournament(params: {
  prompt: string;
  slides: Slide[];
  imageUrls?: string[];
  persona?: string;
  rounds?: number;
  topK?: number;
}): Promise<TournamentCaption[]> {
  const { prompt, slides, imageUrls, persona, rounds = 4, topK = 3 } = params;

  // ETAPA 1: gera N rodadas em paralelo (variacao natural do LLM)
  const batches = await Promise.all(
    Array.from({ length: rounds }).map((_, roundIdx) =>
      generateCaption(prompt, slides as never, imageUrls)
        .then((r) =>
          (r.options || []).map((o) => ({
            ...o,
            _tournament_round: roundIdx + 1,
          })),
        )
        .catch((e) => {
          console.error(`[caption-tournament] round ${roundIdx + 1} falhou:`, (e as Error).message);
          return [] as Array<CaptionOption & { _tournament_round?: number }>;
        }),
    ),
  );

  const allOptions = batches.flat();
  if (allOptions.length === 0) return [];

  // ETAPA 2: optimizer + viral em paralelo (em tudo)
  const enriched = await Promise.all(
    allOptions.map(async (o) => {
      const opt = await optimizeCaption({
        legenda: o.legenda,
        hashtags: o.hashtags,
        approach: o.abordagem,
      }).catch((e) => {
        console.error("[caption-tournament] optimizer:", (e as Error).message);
        return null;
      });
      const legendaAfter = opt?.legenda || o.legenda;
      const hashtagsAfter = opt?.hashtags?.length ? opt.hashtags : o.hashtags;

      const vm = await viralMaster({
        legenda: legendaAfter,
        hashtags: hashtagsAfter,
        slides: slides as never,
        prompt,
        approach: o.abordagem,
        persona,
      }).catch((e) => {
        console.error("[caption-tournament] viral-master:", (e as Error).message);
        return null;
      });

      const final: TournamentCaption = {
        ...o,
        legenda: vm?.legenda_viral || legendaAfter,
        hashtags: vm?.hashtags?.length ? vm.hashtags : hashtagsAfter,
        _gatilho_viral: vm?.gatilho_usado,
        _score_viralidade: vm?.score_viralidade,
        _viral_rationale: vm?.rationale,
      };
      return final;
    }),
  );

  // ETAPA 3: deduplicar por legenda similar (primeira 80 chars)
  const seen = new Set<string>();
  const unique: TournamentCaption[] = [];
  for (const c of enriched) {
    const key = c.legenda.slice(0, 80).toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  // ETAPA 4: rankeia (usa o ranker existente)
  try {
    const rank = await rankCaptionVariants(unique);
    const ranked: TournamentCaption[] = [];
    for (const rk of rank) {
      const c = unique[rk.idx];
      if (!c) continue;
      ranked.push({ ...c, _rank_score: rk.estimatedScore, _rank_reason: rk.reason });
    }
    return ranked.slice(0, topK);
  } catch (e) {
    console.error("[caption-tournament] ranker:", (e as Error).message);
    // Fallback: ordena por score_viralidade
    return unique
      .sort((a, b) => (b._score_viralidade || 5) - (a._score_viralidade || 5))
      .slice(0, topK);
  }
}
