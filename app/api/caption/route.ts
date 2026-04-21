import { NextRequest, NextResponse } from "next/server";
import { generateCaption } from "@/lib/pipeline";
import { optimizeCaption } from "@/lib/agents/caption-optimizer";
import { viralMaster } from "@/lib/agents/viral-master";
import { rankCaptionVariants } from "@/lib/agents/variant-ranker";

export const runtime = "nodejs";
export const maxDuration = 60;

// Orcamento total: se passar disso, para e retorna o que tem.
// Vercel Hobby/Fluid limite = 60s. Buffer = 8s pra upload/ranker.
const BUDGET_MS = 50_000;

/**
 * Executa uma Promise com timeout. Retorna fallback se estourar.
 * Usa pra garantir que nenhum agent trave o pipeline inteiro.
 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const { prompt, slides, imageUrls, skipAgents } = await req.json();
    if (!slides?.length) return NextResponse.json({ error: "slides required" }, { status: 400 });

    // 1. Gera as 3 opcoes baseline
    const r = await generateCaption(prompt || "", slides, imageUrls);
    const options = r.options || [];

    // skipAgents=true → retorna baseline pra comparacao (ou fallback client)
    if (skipAgents || !options.length) {
      return NextResponse.json(r);
    }

    // Ja gastou muito tempo no baseline? Retorna direto.
    if (Date.now() - t0 > BUDGET_MS * 0.7) {
      console.warn(`[caption] baseline consumiu ${Date.now() - t0}ms, pulando agents`);
      return NextResponse.json({ ...r, _skipped_agents: "budget_exceeded_at_baseline" });
    }

    const remaining = BUDGET_MS - (Date.now() - t0);
    const parallelBudget = Math.floor(remaining * 0.85);  // deixa 15% pro ranker

    // 2 + 3. Optimizer E ViralMaster EM PARALELO — ambos partem do baseline original.
    // Antes era sequencial (optimize depois viral), custava 2x mais tempo.
    // Como viral nao depende de optimize, paraleliza.
    const [optimized, viralized] = await Promise.all([
      withTimeout(
        Promise.all(
          options.map((o) =>
            optimizeCaption({
              legenda: o.legenda,
              hashtags: o.hashtags,
              approach: o.abordagem,
            }).catch((e) => {
              console.error("[caption] optimizer falhou:", (e as Error).message);
              return null;
            }),
          ),
        ),
        parallelBudget,
        options.map(() => null),
      ),
      withTimeout(
        Promise.all(
          options.map((o) =>
            viralMaster({
              legenda: o.legenda,
              hashtags: o.hashtags,
              slides,
              prompt,
              approach: o.abordagem,
            }).catch((e) => {
              console.error("[caption] viral-master falhou:", (e as Error).message);
              return null;
            }),
          ),
        ),
        parallelBudget,
        options.map(() => null),
      ),
    ]);

    // Merge: opt > viral > original, preservando metadata de ambos
    const finalOptions = options.map((o, i) => {
      const opt = optimized[i];
      const vm = viralized[i];
      const legendaBase = opt?.legenda || o.legenda;
      const legendaFinal = vm?.legenda_viral || legendaBase;
      const hashtagsFinal = vm?.hashtags?.length
        ? vm.hashtags
        : opt?.hashtags?.length
        ? opt.hashtags
        : o.hashtags;
      return {
        ...o,
        legenda: legendaFinal,
        hashtags: hashtagsFinal,
        _changes: [...(opt?.changes || []), ...(vm?.changes || [])],
        _big_domino_adicionado: opt?.big_domino_adicionado,
        _word_count: legendaFinal.trim().split(/\s+/).length,
        _gatilho_viral: vm?.gatilho_usado,
        _score_viralidade: vm?.score_viralidade,
        _viral_rationale: vm?.rationale,
      };
    });

    // 4. Ranker — timeout agressivo: se nao responder em 8s, usa ordem natural
    let ranked: typeof finalOptions = finalOptions;
    const rankerBudget = Math.max(3_000, BUDGET_MS - (Date.now() - t0));
    try {
      const rank = await withTimeout(rankCaptionVariants(finalOptions), rankerBudget, []);
      if (rank.length) {
        ranked = rank
          .map((rk) => ({
            ...finalOptions[rk.idx],
            _rank: rk.estimatedScore,
            _rankReason: rk.reason,
          }))
          .filter(Boolean) as typeof finalOptions;
      }
    } catch (e) {
      console.error("[caption] ranker falhou:", (e as Error).message);
    }

    const elapsed = Date.now() - t0;
    console.log(`[caption] completo em ${elapsed}ms`);
    return NextResponse.json({ options: ranked, _elapsed_ms: elapsed });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message || String(e) }, { status: 500 });
  }
}
