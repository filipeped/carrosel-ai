import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Otimiza PNG LOSSLESS via sharp. Zero perda de qualidade.
 * - compressionLevel 9 (max): 20-40% menor, mesma qualidade visual
 * - adaptiveFiltering: escolhe o melhor filtro por scanline
 * - palette: false (mantem 24/32-bit, nao converte pra paleta)
 */
async function optimizePng(buf: Buffer): Promise<Buffer> {
  try {
    return await sharp(buf)
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: false,
        effort: 10,
      })
      .toBuffer();
  } catch (err) {
    console.warn("[upload-slide] sharp optimize falhou, enviando original:", (err as Error).message);
    return buf;
  }
}

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

// Vercel limita body a 4.5MB. Com base64 (+33%) + JSON overhead, o PNG raw
// precisa estar em ~3MB pra garantir que o body final fique abaixo.
// Se passar disso, base64 estoura e Vercel rejeita com 413 ANTES de chegar aqui.
const MAX_BYTES = 3 * 1024 * 1024;
// 1080 eh o tamanho NATIVO do Instagram (4:5). Abaixo disso eh captura quebrada.
// Supersampling 2x (2160) ou 2.5x (2700) eh bonus pra telas retina.
const EXPECTED_NATIVE_WIDTH = 1080;

export async function POST(req: NextRequest) {
  try {
    const { png, batchId, index } = await req.json();
    if (!png || !batchId || typeof index !== "number") {
      return NextResponse.json({ error: "png, batchId, index required" }, { status: 400 });
    }
    const rawBuf = Buffer.from(png, "base64");

    // FIX B.1 — validacao de tamanho (no raw, antes de otimizar)
    if (rawBuf.byteLength > MAX_BYTES) {
      const mb = (rawBuf.byteLength / 1024 / 1024).toFixed(2);
      console.warn(`[upload-slide] slide-${index + 1}: ${mb}MB estoura limite ${MAX_BYTES / 1024 / 1024}MB`);
      return NextResponse.json(
        { error: `Slide muito grande: ${mb}MB (max 4MB)`, bytes: rawBuf.byteLength },
        { status: 413 },
      );
    }

    // FIX B.2 — log de qualidade: bytes + dimensao real
    const dims = readPngDimensions(rawBuf);
    const dimStr = dims ? `${dims.width}x${dims.height}` : "?";

    // Otimiza PNG LOSSLESS (sharp — sem perda, 20-40% menor)
    const buf = await optimizePng(rawBuf);
    const savedKb = ((rawBuf.byteLength - buf.byteLength) / 1024).toFixed(0);
    const finalKb = (buf.byteLength / 1024).toFixed(0);
    const origKb = (rawBuf.byteLength / 1024).toFixed(0);
    console.log(
      `[upload-slide] slide-${index + 1}: ${dimStr} ${origKb}KB -> ${finalKb}KB (economia ${savedKb}KB)`,
    );

    // Warn so se dimensao < target IG (1080) — algo REAL quebrou.
    // Entre 1080 e 2700+ eh tudo valido (nativo ou supersampled).
    if (dims && dims.width < EXPECTED_NATIVE_WIDTH) {
      console.warn(
        `[upload-slide] slide-${index + 1}: dimensao ${dimStr} < ${EXPECTED_NATIVE_WIDTH}px (target IG). Captura quebrada.`,
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
