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
/**
 * Le dimensoes de um PNG lendo o IHDR chunk (bytes 16-24).
 * PNG signature: 8 bytes + chunk length (4) + "IHDR" (4) + width (4 BE) + height (4 BE).
 */
function readPngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  // Signature check
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

// 4.5MB limite Vercel — 4MB pra ter folga
const MAX_BYTES = 4 * 1024 * 1024;
// Minimo garantido: capturado em 2x (2160x2700). Alerta se <1800 (algo quebrou).
const MIN_WIDTH_WARN = 1800;

export async function POST(req: NextRequest) {
  try {
    const { png, batchId, index } = await req.json();
    if (!png || !batchId || typeof index !== "number") {
      return NextResponse.json({ error: "png, batchId, index required" }, { status: 400 });
    }
    const buf = Buffer.from(png, "base64");

    // FIX B.1 — validacao de tamanho
    if (buf.byteLength > MAX_BYTES) {
      const mb = (buf.byteLength / 1024 / 1024).toFixed(2);
      console.warn(`[upload-slide] slide-${index + 1}: ${mb}MB estoura limite ${MAX_BYTES / 1024 / 1024}MB`);
      return NextResponse.json(
        { error: `Slide muito grande: ${mb}MB (max 4MB)`, bytes: buf.byteLength },
        { status: 413 },
      );
    }

    // FIX B.2 — log de qualidade: bytes + dimensao real
    const dims = readPngDimensions(buf);
    const kb = (buf.byteLength / 1024).toFixed(0);
    const dimStr = dims ? `${dims.width}x${dims.height}` : "?";
    console.log(`[upload-slide] slide-${index + 1}: ${kb}KB ${dimStr}`);

    // FIX B.3 — warn se dimensao < esperado (captura quebrada em 1x?)
    if (dims && dims.width < MIN_WIDTH_WARN) {
      console.warn(
        `[upload-slide] slide-${index + 1}: dimensao ${dimStr} < esperada (2160x2700). ` +
          `Captura pode estar rodando em 1x ao inves de 2x.`,
      );
    }

    const sb = getSupabase();
    const bucket = "carrosseis-publicados";
    try {
      await sb.storage.createBucket(bucket, { public: true });
    } catch {}
    const path = `${batchId}/slide-${String(index + 1).padStart(2, "0")}.png`;
    const { error } = await sb.storage.from(bucket).upload(path, buf, {
      contentType: "image/png",
      upsert: true,
      cacheControl: "3600",
    });
    if (error) throw new Error(error.message);
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({
      url: data.publicUrl,
      bytes: buf.byteLength,
      width: dims?.width,
      height: dims?.height,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
