import { NextRequest, NextResponse } from "next/server";
import { publishCarousel } from "@/lib/instagram";
import { updateInstagramPost } from "@/lib/history";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/publish
 * Body: { imageUrls: string[] (2-10), caption: string, carrosselId?: number | string }
 * Publica carrossel no Instagram via Graph API. Se carrosselId for passado:
 *   - Se ja tem instagram_post_id, retorna { already_posted: true }
 *   - Apos publicar, grava post_id, permalink e thumb_url no historico
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrls, caption, carrosselId } = body;

    if (!imageUrls?.length || imageUrls.length < 2) {
      return NextResponse.json({ error: "imageUrls (>=2) required" }, { status: 400 });
    }
    if (!caption) {
      return NextResponse.json({ error: "caption required" }, { status: 400 });
    }

    // Dedup: se esse carrossel ja foi postado, retorna o link existente
    if (carrosselId) {
      try {
        const sb = getSupabase();
        const { data } = await sb
          .from("carrosseis_gerados")
          .select("instagram_post_id, instagram_permalink")
          .eq("id", carrosselId)
          .single();
        if (data?.instagram_post_id) {
          return NextResponse.json({
            ok: true,
            already_posted: true,
            post_id: data.instagram_post_id,
            permalink: data.instagram_permalink,
          });
        }
      } catch {}
    }

    const res = await publishCarousel({ imageUrls, caption });
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }

    if (carrosselId && res.post_id) {
      await updateInstagramPost(carrosselId, {
        instagram_post_id: res.post_id,
        instagram_permalink: res.permalink,
        thumb_url: imageUrls[0],
      });
    }

    return NextResponse.json({
      ok: true,
      post_id: res.post_id,
      permalink: res.permalink,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
