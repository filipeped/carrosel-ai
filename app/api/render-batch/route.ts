import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import type { SlideData } from "@/lib/types";
import { buildSlideHtml } from "@/lib/slide-html";
import { renderHtmlToPng } from "@/lib/renderer";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/render-batch
 * Body: {
 *   slides: SlideData[],
 *   imageUrls: string[],   // 1:1 com slides (mesmo length e ordem)
 *   batchId?: string,
 *   upload?: boolean       // default true — se false, retorna PNGs base64 (debug)
 * }
 *
 * Renderiza todos os slides server-side via Chromium em paralelo,
 * otimiza cada PNG com sharp, faz upload pro Supabase Storage.
 * Retorna URLs publicas (nunca data URLs, nunca depende do device do user).
 *
 * Qualidade garantida: sempre 2160x2700 @ 2x deviceScaleFactor.
 * Fontes embutidas base64 (zero CORS), imagens carregam via networkidle0.
 *
 * Uso: client chama 1x, recebe imageUrls[], usa direto pra:
 *   - Download (fetch + download attr, funciona em qualquer mobile)
 *   - Instagram publish (manda as URLs direto, IG baixa do Supabase)
 *   - Preview modal (img src = URL publica)
 */

const BUCKET = "carrosseis-publicados";
const CONCURRENCY = 3;  // max 3 renders em paralelo — cabe na RAM do Lambda

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
  } catch {
    return buf;
  }
}

type RenderResult = {
  index: number;
  url: string;
  bytes: number;
  width: number;
  height: number;
};

async function renderOne(
  slide: SlideData,
  imageUrl: string,
  batchId: string,
  index: number,
  upload: boolean,
): Promise<RenderResult | { index: number; error: string }> {
  try {
    const html = buildSlideHtml(slide, imageUrl);
    const raw = await renderHtmlToPng(html, {
      width: 1080,
      height: 1350,
      deviceScaleFactor: 2,
    });
    const png = await optimizePng(raw);
    const path = `${batchId}/slide-${String(index + 1).padStart(2, "0")}.png`;

    if (!upload) {
      return {
        index,
        url: `data:image/png;base64,${png.toString("base64")}`,
        bytes: png.byteLength,
        width: 2160,
        height: 2700,
      };
    }

    const sb = getSupabase();
    try {
      await sb.storage.createBucket(BUCKET, { public: true });
    } catch {
      // ok, ja existe
    }
    const { error } = await sb.storage.from(BUCKET).upload(path, png, {
      contentType: "image/png",
      upsert: true,
      cacheControl: "3600",
    });
    if (error) throw new Error(error.message);
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);

    return {
      index,
      url: data.publicUrl,
      bytes: png.byteLength,
      width: 2160,
      height: 2700,
    };
  } catch (e) {
    return { index, error: (e as Error).message || String(e) };
  }
}

async function pMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body = await req.json();
    const slides: SlideData[] = body.slides;
    const imageUrls: string[] = body.imageUrls;
    const batchId: string = body.batchId || String(Date.now());
    const upload: boolean = body.upload !== false;

    if (!Array.isArray(slides) || !slides.length) {
      return NextResponse.json({ error: "slides[] required" }, { status: 400 });
    }
    if (!Array.isArray(imageUrls) || imageUrls.length !== slides.length) {
      return NextResponse.json(
        { error: "imageUrls[] required, must match slides[] length" },
        { status: 400 },
      );
    }

    const results = await pMap(slides, CONCURRENCY, (slide, i) =>
      renderOne(slide, imageUrls[i], batchId, i, upload),
    );

    const failed = results.filter((r) => "error" in r);
    if (failed.length) {
      return NextResponse.json(
        {
          error: `${failed.length}/${slides.length} slides falharam`,
          failed,
          partial: results.filter((r) => "url" in r),
        },
        { status: 500 },
      );
    }

    const ms = Date.now() - t0;
    console.log(
      `[render-batch] ${slides.length} slides em ${ms}ms (${Math.round(ms / slides.length)}ms/slide)`,
    );

    return NextResponse.json({
      ok: true,
      batchId,
      slides: (results as RenderResult[]).sort((a, b) => a.index - b.index),
      elapsed_ms: ms,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
