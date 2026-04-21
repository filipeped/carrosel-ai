import { NextRequest, NextResponse } from "next/server";
import { getJob, getSelfUrl } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 10;

/**
 * GET /api/render/status/[id]
 *
 * Retorna status atual do job.
 * Cliente polla a cada 1-2s ate status='done' ou 'error'.
 *
 * BONUS: se job esta 'pending' ha mais de 30s, retenta o worker
 * (resiliencia se o fire-and-forget do submit falhou).
 */

const PENDING_TIMEOUT_MS = 30_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _req = req;
  try {
    const { id } = await params;
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "job nao encontrado" }, { status: 404 });
    }

    // Auto-retry worker se o job esta pending ha muito tempo
    if (job.status === "pending") {
      const age = Date.now() - new Date(job.created_at).getTime();
      if (age > PENDING_TIMEOUT_MS) {
        const workerUrl = `${getSelfUrl(_req.headers)}/api/render/worker`;
        fetch(workerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: id }),
          keepalive: true,
        }).catch(() => {});
      }
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      total_slides: job.total_slides,
      result: job.status === "done" ? job.result : undefined,
      error: job.status === "error" ? job.error : undefined,
      created_at: job.created_at,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
