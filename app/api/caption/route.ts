import { NextRequest, NextResponse } from "next/server";
import { generateCaption } from "@/lib/pipeline";
import { optimizeCaption } from "@/lib/agents/caption-optimizer";
import { viralMaster } from "@/lib/agents/viral-master";
import { rankCaptionVariants } from "@/lib/agents/variant-ranker";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { prompt, slides, imageUrls, skipAgents } = await req.json();
    if (!slides?.length) return NextResponse.json({ error: "slides required" }, { status: 400 });

    // 1. Gera as 3 opcoes baseline
    const r = await generateCaption(prompt || "", slides, imageUrls);
    const options = r.options || [];

    // skipAgents=true → retorna baseline pra comparacao (usado em /api/test-batch)
    if (skipAgents || !options.length) {
      return NextResponse.json(r);
    }

    // 2. Optimizer (brand polish) — paralelo em todas as variantes
    const optimized = await Promise.all(
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
    );

    // 3. Viral Master (hook 2026) — paralelo apos optimizer
    const viralized = await Promise.all(
      options.map((o, i) => {
        const opt = optimized[i];
        const legenda = opt?.legenda || o.legenda;
        const hashtags = opt?.hashtags?.length ? opt.hashtags : o.hashtags;
        return viralMaster({
          legenda,
          hashtags,
          slides,
          prompt,
          approach: o.abordagem,
        }).catch((e) => {
          console.error("[caption] viral-master falhou:", (e as Error).message);
          return null;
        });
      }),
    );

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

    // 4. Ranker — ordena por engajamento estimado
    let ranked: typeof finalOptions = finalOptions;
    try {
      const rank = await rankCaptionVariants(finalOptions);
      ranked = rank
        .map((rk) => ({
          ...finalOptions[rk.idx],
          _rank: rk.estimatedScore,
          _rankReason: rk.reason,
        }))
        .filter(Boolean) as typeof finalOptions;
    } catch (e) {
      console.error("[caption] ranker falhou:", (e as Error).message);
    }

    return NextResponse.json({ options: ranked });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message || String(e) }, { status: 500 });
  }
}
