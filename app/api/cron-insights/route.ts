/**
 * Cron de insights — roda diariamente (via Vercel Cron).
 * Busca metricas IG dos posts publicados que:
 *   - tem instagram_post_id nao-null
 *   - nao foram atualizados nas ultimas 24h (ou nunca)
 * Grava em caption_performance + agrega em caption_formula_stats.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getPostInsights } from "@/lib/instagram";

export const runtime = "nodejs";
export const maxDuration = 60;

type IgInsightValue = { name: string; values?: Array<{ value: number }> };

function extractMetric(data: IgInsightValue[], name: string): number {
  const m = data.find((x) => x.name === name);
  return m?.values?.[0]?.value ?? 0;
}

async function processPost(sb: ReturnType<typeof getSupabase>, post: { id: string; instagram_post_id: string; prompt: string | null }) {
  try {
    const insights = await getPostInsights(post.instagram_post_id);
    const data = Array.isArray(insights?.data) ? (insights.data as IgInsightValue[]) : [];
    const likes = extractMetric(data, "likes");
    const comments = extractMetric(data, "comments");
    const saves = extractMetric(data, "saved");
    const shares = extractMetric(data, "shares");
    const reach = extractMetric(data, "reach");
    const engagement = extractMetric(data, "engagement");

    // engagement_rate = (likes+comments+saves+shares) / reach
    const interactions = likes + comments + saves + shares;
    const engagement_rate = reach > 0 ? interactions / reach : 0;

    // Upsert em caption_performance
    await sb.from("caption_performance").upsert(
      {
        carrossel_id: post.id,
        likes,
        comments,
        saves,
        shares,
        reach,
        engagement,
        engagement_rate,
        insights_fetched_at: new Date().toISOString(),
      },
      { onConflict: "carrossel_id" },
    );

    return {
      ok: true,
      post_id: post.instagram_post_id,
      likes, comments, saves, shares, reach, engagement_rate: Math.round(engagement_rate * 10000) / 10000,
    };
  } catch (e) {
    console.error(`[cron-insights] erro no post ${post.instagram_post_id}:`, (e as Error).message);
    return { ok: false, post_id: post.instagram_post_id, error: (e as Error).message };
  }
}

export async function GET(req: NextRequest) {
  // Proteção basica: se tem CRON_SECRET env, exige como ?secret=
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = new URL(req.url).searchParams.get("secret") || req.headers.get("x-vercel-cron-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const sb = getSupabase();
    // Lista posts publicados nao-atualizados nas ultimas 24h
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: posts, error } = await sb
      .from("carrosseis_gerados")
      .select("id, instagram_post_id, prompt, caption_performance!left(insights_fetched_at)")
      .not("instagram_post_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);

    const toProcess = (posts || []).filter((p) => {
      if (!p.instagram_post_id) return false;
      const perf = (p as { caption_performance?: Array<{ insights_fetched_at: string }> }).caption_performance;
      const last = Array.isArray(perf) && perf[0]?.insights_fetched_at;
      return !last || new Date(last).toISOString() < dayAgo;
    });

    if (!toProcess.length) {
      return NextResponse.json({ ok: true, message: "nothing to process", total: posts?.length || 0 });
    }

    // Processa em paralelo (max 5 por vez pra nao estourar rate limit IG)
    const results: Array<Awaited<ReturnType<typeof processPost>>> = [];
    for (let i = 0; i < toProcess.length; i += 5) {
      const chunk = toProcess.slice(i, i + 5);
      const chunkResults = await Promise.all(chunk.map((p) => processPost(sb, p as never)));
      results.push(...chunkResults);
    }

    // Agregacao em caption_formula_stats — best-effort
    try {
      await sb.rpc("refresh_caption_formula_stats");
    } catch {
      // RPC nao existe ainda — ok, skip
    }

    const ok = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    return NextResponse.json({
      ok: true,
      processed: results.length,
      succeeded: ok,
      failed,
      results: results.slice(0, 20), // ampostra
    });
  } catch (e) {
    console.error("[cron-insights] falhou:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Health check — retorna ultimo run, total processado.
 */
export async function POST(req: NextRequest) {
  // Health endpoint: mesma proteccao
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const body = await req.json().catch(() => ({}));
    if (body?.secret !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("caption_performance")
      .select("id, insights_fetched_at")
      .order("insights_fetched_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    return NextResponse.json({
      ok: true,
      last_fetched: data?.[0]?.insights_fetched_at || null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
