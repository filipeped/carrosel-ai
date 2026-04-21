import { NextRequest, NextResponse } from "next/server";
import { createJob, getSelfUrl, type RenderJobInput } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * POST /api/render/submit
 * Body: { slides, imageUrls, batchId?, upload? }
 *
 * 1. Cria row em render_jobs (status=pending)
 * 2. Dispara render em background via fetch fire-and-forget
 *    - Se RENDER_VPS_URL set: dispara pra VPS (JOB EM BACKGROUND TOTAL — user
 *      pode fechar browser, desligar celular, qualquer coisa. VPS continua
 *      renderizando e atualiza render_jobs no Supabase.)
 *    - Senao: dispara pro worker serverless chunked (fallback)
 * 3. Retorna { jobId } em ~200ms
 *
 * Cliente faz poll em /api/render/status/[id] ate status=done.
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

    const vpsUrl = process.env.RENDER_VPS_URL;
    const vpsToken = process.env.RENDER_VPS_TOKEN;

    if (vpsUrl && vpsToken) {
      // VPS modo async: chama fire-and-forget com jobId → VPS atualiza render_jobs
      // direto no Supabase. User pode fechar o app que VPS continua trabalhando.
      fetch(`${vpsUrl.replace(/\/$/, "")}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${vpsToken}`,
        },
        body: JSON.stringify({
          jobId,
          slides: body.slides,
          imageUrls: body.imageUrls,
          batchId: body.batchId,
          upload: body.upload !== false,
        }),
        keepalive: true,
        // Timeout curto — so pra garantir que a request saiu. VPS responde em 50ms
        // com {accepted:true} e continua em bg.
        signal: AbortSignal.timeout(5000),
      }).catch((e) => {
        console.warn("[submit] falha ao disparar VPS:", e.message);
      });
    } else {
      // Fallback serverless — worker chunked no proprio Vercel
      const workerUrl = `${getSelfUrl(req.headers)}/api/render/worker`;
      fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
        keepalive: true,
      }).catch((e) => {
        console.warn("[submit] falha ao disparar worker serverless:", e.message);
      });
    }

    return NextResponse.json({ jobId, backend: vpsUrl ? "vps" : "serverless" });
  } catch (e) {
    console.error("[render/submit] falhou:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
