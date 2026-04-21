import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { buildSlideHtml } from "@/lib/slide-html";
import { renderHtmlToPng } from "@/lib/renderer";
import { getSupabase } from "@/lib/supabase";
import {
  getJob,
  markRunning,
  updateProgress,
  markDone,
  markError,
  type RenderJobResult,
} from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/render/worker
 * Body: { jobId: string }
 *
 * Worker interno — executa o render de um job em render_jobs.
 * Disparado por /api/render/submit via fetch fire-and-forget.
 *
 * Atualiza progress conforme cada slide termina. Cliente polla /status/[id].
 *
 * Max 60s no Vercel Pro — cabe ate ~10 slides em paralelo de 3.
 */

const BUCKET = "carrosseis-publicados";
const CONCURRENCY = 3;

async function optimizePng(buf: Buffer): Promise<Buffer> {
  try {
    return await sharp(buf)
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false, effort: 10 })
      .toBuffer();
  } catch {
    return buf;
  }
}

export async function POST(req: NextRequest) {
  let jobId = "";
  try {
    const body = (await req.json()) as { jobId: string };
    jobId = body.jobId;
    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }

    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "job nao encontrado" }, { status: 404 });
    }
    if (job.status === "done" || job.status === "error") {
      return NextResponse.json({ ok: true, already: job.status });
    }

    await markRunning(jobId);

    const { slides, imageUrls, batchId: inputBatchId, upload = true } = job.input;
    const batchId = inputBatchId || `job-${jobId}`;
    const total = slides.length;
    const t0 = Date.now();

    const sb = getSupabase();
    if (upload) {
      try {
        await sb.storage.createBucket(BUCKET, { public: true });
      } catch {
        // ok, ja existe
      }
    }

    const results: RenderJobResult["slides"] = new Array(total);
    let done = 0;

    async function renderOne(i: number): Promise<void> {
      const html = buildSlideHtml(slides[i], imageUrls[i]);
      const raw = await renderHtmlToPng(html, {
        width: 1080,
        height: 1350,
        deviceScaleFactor: 2,
      });
      const png = await optimizePng(raw);
      let url: string;
      if (upload) {
        const path = `${batchId}/slide-${String(i + 1).padStart(2, "0")}.png`;
        const { error } = await sb.storage.from(BUCKET).upload(path, png, {
          contentType: "image/png",
          upsert: true,
          cacheControl: "3600",
        });
        if (error) throw new Error(error.message);
        const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
        url = data.publicUrl;
      } else {
        url = `data:image/png;base64,${png.toString("base64")}`;
      }
      results[i] = { index: i, url, bytes: png.byteLength, width: 2160, height: 2700 };
      done++;
      updateProgress(jobId, done, total).catch(() => {});
    }

    // Pool paralelo (concurrency 3)
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= total) return;
        await renderOne(i);
      }
    });
    await Promise.all(workers);

    const elapsed = Date.now() - t0;
    await markDone(jobId, { slides: results, elapsed_ms: elapsed });
    console.log(`[worker] job ${jobId} done: ${total} slides em ${elapsed}ms`);

    return NextResponse.json({ ok: true, jobId, elapsed_ms: elapsed });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error(`[worker] job ${jobId} falhou:`, msg);
    if (jobId) {
      await markError(jobId, msg).catch(() => {});
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
