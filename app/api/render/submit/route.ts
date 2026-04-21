import { NextRequest, NextResponse } from "next/server";
import { createJob, getSelfUrl, type RenderJobInput } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * POST /api/render/submit
 * Body: { slides, imageUrls, batchId?, upload? }
 *
 * 1. Cria row em render_jobs (status=pending)
 * 2. Dispara worker em background via fetch fire-and-forget
 * 3. Retorna { jobId } em ~200ms
 *
 * Cliente faz poll em /api/render/status/[id] ate status=done.
 * Pode fechar o navegador — o Vercel continua processando.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RenderJobInput;
    if (!Array.isArray(body.slides) || !body.slides.length) {
      return NextResponse.json({ error: "slides[] required" }, { status: 400 });
    }
    if (!Array.isArray(body.imageUrls) || body.imageUrls.length !== body.slides.length) {
      return NextResponse.json(
        { error: "imageUrls[] must match slides[]" },
        { status: 400 },
      );
    }

    const jobId = await createJob({
      slides: body.slides,
      imageUrls: body.imageUrls,
      batchId: body.batchId,
      upload: body.upload !== false,
    });

    // Dispara worker — fire and forget. Nao awaita, nao cancela se o body for small.
    // keepalive:true permite que o fetch sobreviva se o handler atual terminar.
    const workerUrl = `${getSelfUrl(req.headers)}/api/render/worker`;
    fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
      keepalive: true,
    }).catch((err) => {
      // Log apenas — nao aborta o response pro cliente
      console.warn("[submit] falha ao disparar worker (tentara de novo em poll):", err.message);
    });

    return NextResponse.json({ jobId });
  } catch (e) {
    console.error("[render/submit] falhou:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
