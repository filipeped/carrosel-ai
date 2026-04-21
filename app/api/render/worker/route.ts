import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { buildSlideHtml } from "@/lib/slide-html";
import { renderHtmlToPng } from "@/lib/renderer";
import { getSupabase } from "@/lib/supabase";
import {
  getJob,
  markRunning,
  markDone,
  markError,
  getSelfUrl,
  type RenderJobResult,
} from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/render/worker
 * Body: { jobId: string, startFrom?: number }
 *
 * CHUNKED WORKER — resolve o timeout de 60s do Vercel Hobby:
 *
 * 1. Recebe jobId e offset opcional (startFrom=0 na 1a chamada)
 * 2. Renderiza slides SEQUENCIAIS ate `BUDGET_MS` (deixa ~15s de buffer)
 * 3. Salva progresso parcial em `result.slides[]` + `progress`
 * 4. Se ainda tem slides pendentes, invoca proximo worker (fire-and-forget)
 * 5. Ultimo worker marca status='done'
 *
 * Cada chunk cabe bem em 60s:
 *   - Cold start Chromium: ~5-8s (so na 1a invocacao)
 *   - Cada slide: ~4-8s em paralelo
 *   - Com budget 45s, da pra 4-6 slides no 1o chunk, 6-8 nos demais
 */

const BUCKET = "carrosseis-publicados";
const BUDGET_MS = 45_000;   // processa ate 45s, deixa 15s buffer
const CONCURRENCY = 2;

async function optimizePng(buf: Buffer): Promise<Buffer> {
  try {
    return await sharp(buf)
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false, effort: 6 })
      .toBuffer();
  } catch {
    return buf;
  }
}

export async function POST(req: NextRequest) {
  let jobId = "";
  try {
    const body = (await req.json()) as { jobId: string; startFrom?: number };
    jobId = body.jobId;
    const startFrom = Math.max(0, body.startFrom || 0);
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

    if (startFrom === 0) {
      await markRunning(jobId);
    }

    const { slides, imageUrls, batchId: inputBatchId, upload = true } = job.input;
    const batchId = inputBatchId || `job-${jobId}`;
    const total = slides.length;

    // Inicia results a partir do que ja estava no DB (chunks anteriores)
    const prevResults = (job.result?.slides || []) as RenderJobResult["slides"];
    const results: RenderJobResult["slides"] = new Array(total);
    for (const r of prevResults) results[r.index] = r;

    const sb = getSupabase();
    if (upload && startFrom === 0) {
      try {
        await sb.storage.createBucket(BUCKET, { public: true });
      } catch {
        // ja existe
      }
    }

    const t0 = Date.now();
    let nextToProcess = startFrom;

    async function renderOne(i: number): Promise<void> {
      const html = buildSlideHtml(slides[i], imageUrls[i]);
      const raw = await renderHtmlToPng(html, {
        width: 1080,
        height: 1350,
        deviceScaleFactor: 2,
        timeout: 20_000,
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
    }

    // Processa de `startFrom` em diante, com concorrencia controlada,
    // ate estourar o orcamento OU terminar todos.
    let stopped = false;
    while (nextToProcess < total && !stopped) {
      const batchIds: number[] = [];
      for (let k = 0; k < CONCURRENCY && nextToProcess < total; k++) {
        batchIds.push(nextToProcess++);
      }
      await Promise.all(batchIds.map(renderOne));

      // Atualiza progresso no DB apos cada sub-batch
      const doneCount = results.filter((r) => r).length;
      const progress = Math.round((doneCount / total) * 100);
      await sb
        .from("render_jobs")
        .update({
          progress,
          result: { slides: results.filter((r) => r) },
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      // Verifica orcamento — se sobra pouco, pula pro chunking
      if (Date.now() - t0 > BUDGET_MS && nextToProcess < total) {
        stopped = true;
      }
    }

    if (nextToProcess >= total) {
      // Terminou tudo — marca done
      const elapsed = Date.now() - t0;
      await markDone(jobId, {
        slides: results.filter((r) => r).sort((a, b) => a.index - b.index),
        elapsed_ms: elapsed,
      });
      console.log(`[worker] job ${jobId} CONCLUIDO: ${total} slides`);
      return NextResponse.json({ ok: true, jobId, done: true });
    }

    // Ainda tem slides — dispara proximo chunk
    console.log(
      `[worker] job ${jobId} chunk parou em ${nextToProcess}/${total}, disparando continuacao`,
    );
    const workerUrl = `${getSelfUrl(req.headers)}/api/render/worker`;
    // await curto pra maximizar chance de pegar sucessor rodando na mesma Lambda
    try {
      await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, startFrom: nextToProcess }),
        keepalive: true,
        // Nao espera response — o handler proximo roda independente
        signal: AbortSignal.timeout(1500),
      });
    } catch {
      // timeout de 1.5s eh esperado, o worker ja foi disparado
    }

    return NextResponse.json({
      ok: true,
      jobId,
      chunked: true,
      processed_until: nextToProcess,
      total,
    });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error(`[worker] job ${jobId} falhou:`, msg);
    if (jobId) {
      await markError(jobId, msg).catch(() => {});
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
