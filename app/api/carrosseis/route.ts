import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { saveCarrossel, listRecent } from "@/lib/history";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET  /api/carrosseis?onlyPosted=1 → lista ultimos carrosseis (postados ou nao)
 * POST /api/carrosseis              → cria linha em carrosseis_gerados, retorna { id }
 */

export async function GET(req: NextRequest) {
  try {
    const onlyPosted = req.nextUrl.searchParams.get("onlyPosted") === "1";
    const limit = Number(req.nextUrl.searchParams.get("limit") || 30);
    if (onlyPosted) {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("carrosseis_gerados")
        .select(
          "id, prompt, tema, slides, thumb_url, instagram_post_id, instagram_permalink, instagram_posted_at, caption_options",
        )
        .not("instagram_post_id", "is", null)
        .order("instagram_posted_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return NextResponse.json({ data: data || [] });
    }
    const rows = await listRecent(limit);
    return NextResponse.json({ data: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, slides, imagens_ids } = await req.json();
    if (!prompt || !Array.isArray(slides) || !Array.isArray(imagens_ids)) {
      return NextResponse.json(
        { error: "prompt + slides + imagens_ids required" },
        { status: 400 },
      );
    }
    const saved = await saveCarrossel({ prompt, slides, imagens_ids });
    if (!saved) return NextResponse.json({ error: "save falhou" }, { status: 500 });
    return NextResponse.json({ id: saved.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
