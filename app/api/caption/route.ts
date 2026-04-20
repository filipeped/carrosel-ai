import { NextRequest, NextResponse } from "next/server";
import { generateCaption } from "@/lib/pipeline";
import { optimizeCaption } from "@/lib/agents/caption-optimizer";
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

    // 2. Optimizer — paralelo em todas as 3 variantes
    const optimized = await Promise.all(
      options.map((o) =>
        optimizeCaption({
          legenda: o.legenda,
          hashtags: o.hashtags,
          approach: o.abordagem,
        }).catch(() => null),
      ),
    );

    // Merge: se optimizer falhou pra uma, mantem a original
    const finalOptions = options.map((o, i) => {
      const opt = optimized[i];
      if (!opt) return o;
      return {
        ...o,
        legenda: opt.legenda,
        hashtags: opt.hashtags.length ? opt.hashtags : o.hashtags,
        _changes: opt.changes,
        _big_domino_adicionado: opt.big_domino_adicionado,
        _word_count: opt.word_count,
      };
    });

    // 3. Ranker — ordena por engajamento estimado
    let ranked: typeof finalOptions = finalOptions;
    try {
      const rank = await rankCaptionVariants(finalOptions);
      // Reordena mantendo referencias originais (com metadata do rank)
      ranked = rank
        .map((rk) => ({
          ...finalOptions[rk.idx],
          _rank: rk.estimatedScore,
          _rankReason: rk.reason,
        }))
        .filter(Boolean) as typeof finalOptions;
    } catch {
      /* fallback: mantem ordem original */
    }

    return NextResponse.json({ options: ranked });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message || String(e) }, { status: 500 });
  }
}
