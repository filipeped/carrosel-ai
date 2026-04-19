import { NextRequest, NextResponse } from "next/server";
import { publishCarousel } from "@/lib/instagram";
import { updateInstagramPost } from "@/lib/history";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/publish
 * Body: { imageUrls: string[] (2-10), caption: string, carrosselId?: string }
 * Publica carrossel no Instagram via Graph API. Se carrosselId for passado,
 * atualiza historico com instagram_post_id.
 *
 * Opcao alternativa — uploadPngs: pngs base64 viram URLs publicas via upload
 * temporario no bucket 'carrosseis-publicados' do Supabase antes de enviar
 * ao Instagram (que so aceita URL, nao base64).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { imageUrls, caption, carrosselId, pngs } = body;

    // Se vieram PNGs em base64, faz upload pro Supabase Storage e gera URLs publicas
    if (pngs && Array.isArray(pngs) && pngs.length && !imageUrls?.length) {
      const sb = getSupabase();
      const bucket = "carrosseis-publicados";
      // tenta criar bucket (ignora erro se ja existir)
      try {
        await sb.storage.createBucket(bucket, { public: true });
      } catch {}
      const timestamp = Date.now();
      imageUrls = [];
      for (let i = 0; i < pngs.length; i++) {
        const b64 = pngs[i];
        const buf = Buffer.from(b64, "base64");
        const path = `${timestamp}/slide-${String(i + 1).padStart(2, "0")}.png`;
        const { error } = await sb.storage.from(bucket).upload(path, buf, {
          contentType: "image/png",
          upsert: true,
        });
        if (error) throw new Error(`upload slide ${i + 1}: ${error.message}`);
        const { data } = sb.storage.from(bucket).getPublicUrl(path);
        imageUrls.push(data.publicUrl);
      }
    }

    if (!imageUrls?.length || imageUrls.length < 2) {
      return NextResponse.json({ error: "imageUrls (>=2) ou pngs required" }, { status: 400 });
    }
    if (!caption) {
      return NextResponse.json({ error: "caption required" }, { status: 400 });
    }

    const res = await publishCarousel({ imageUrls, caption });
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }

    if (carrosselId && res.post_id) {
      await updateInstagramPost(carrosselId, {
        instagram_post_id: res.post_id,
      });
    }

    return NextResponse.json({
      ok: true,
      post_id: res.post_id,
      permalink: res.permalink,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
