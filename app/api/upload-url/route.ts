import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 10;

/**
 * POST /api/upload-url
 * Body: { batchId: string, index: number }
 *
 * Retorna signed URL pra upload DIRETO do browser pro Supabase Storage.
 * Isso elimina o limite de 4.5MB do Vercel — bytes vao direto pro Storage
 * sem passar pela nossa API, nao tem 413.
 *
 * Cliente entao faz:
 *   fetch(signedUrl, { method: 'PUT', body: blob, headers: {...} })
 *
 * E pronto — slide no Storage, URL publica disponivel.
 */

const BUCKET = "carrosseis-publicados";

export async function POST(req: NextRequest) {
  try {
    const { batchId, index } = await req.json();
    if (!batchId || typeof index !== "number") {
      return NextResponse.json({ error: "batchId, index required" }, { status: 400 });
    }

    const sb = getSupabase();

    // Garante bucket existe (best-effort — nao falha se ja existe)
    try {
      await sb.storage.createBucket(BUCKET, { public: true });
    } catch {
      // ok, provavelmente ja existe
    }

    const path = `${batchId}/slide-${String(index + 1).padStart(2, "0")}.png`;

    const { data, error } = await sb.storage
      .from(BUCKET)
      .createSignedUploadUrl(path, { upsert: true });

    if (error) throw new Error(error.message);

    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path,
      publicUrl: pub.publicUrl,
    });
  } catch (e) {
    console.error("[upload-url] falhou:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
