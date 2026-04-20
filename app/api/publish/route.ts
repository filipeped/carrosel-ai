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
    const { imageUrls, caption, carrosselId, slides, imagens_ids } = body;

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
      // Titulo pra listagem: usa primeira linha da legenda (cortada) ou
      // title do slide 0 se tiver
      const firstSlideTitle =
        Array.isArray(slides) && slides[0]?.title ? String(slides[0].title).slice(0, 80) : null;
      const firstCaptionLine = caption.split("\n")[0].slice(0, 80);
      const display_title = firstSlideTitle || firstCaptionLine;

      await updateInstagramPost(carrosselId, {
        instagram_post_id: res.post_id,
        instagram_permalink: res.permalink,
        thumb_url: imageUrls[0],
        slides: Array.isArray(slides) ? slides : undefined,
        caption_options: [{ legenda: caption }],
        imagens_ids: Array.isArray(imagens_ids) ? imagens_ids : undefined,
        display_title,
      });
    } else if (!carrosselId) {
      // Log pra investigar: postou mas nao tinha carrosselId
      console.warn("[publish] sucesso sem carrosselId — nao vai aparecer em /posts", {
        post_id: res.post_id,
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
