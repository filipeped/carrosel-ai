import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/upload-slide
 * Body: { png: base64, batchId: string, index: number }
 * Upload de UM slide por vez (evita estourar body limit do Vercel de 4.5MB).
 * Retorna { url } com URL publica no Supabase Storage.
 */
export async function POST(req: NextRequest) {
  try {
    const { png, batchId, index } = await req.json();
    if (!png || !batchId || typeof index !== "number") {
      return NextResponse.json({ error: "png, batchId, index required" }, { status: 400 });
    }
    const sb = getSupabase();
    const bucket = "carrosseis-publicados";
    try {
      await sb.storage.createBucket(bucket, { public: true });
    } catch {}
    const buf = Buffer.from(png, "base64");
    const path = `${batchId}/slide-${String(index + 1).padStart(2, "0")}.png`;
    const { error } = await sb.storage.from(bucket).upload(path, buf, {
      contentType: "image/png",
      upsert: true,
    });
    if (error) throw new Error(error.message);
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
