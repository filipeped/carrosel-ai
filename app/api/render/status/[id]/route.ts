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

const PENDING_TIMEOUT_MS = 8_000;
const STALE_RUNNING_MS = 70_000;  // se running sem update ha > 70s, retoma

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

    // Auto-retry worker em 2 casos:
    // 1. Job pending ha > 8s (fire-and-forget do submit pode ter falhado)
    // 2. Job running mas sem update ha > 70s (chunk morreu, retoma)
    let shouldRetrigger = false;
    let startFrom = 0;
    if (job.status === "pending") {
      const age = Date.now() - new Date(job.created_at).getTime();
      if (age > PENDING_TIMEOUT_MS) shouldRetrigger = true;
    } else if (job.status === "running") {
      const updatedAt = new Date(job.updated_at || job.created_at).getTime();
      const sinceUpdate = Date.now() - updatedAt;
      if (sinceUpdate > STALE_RUNNING_MS) {
        shouldRetrigger = true;
        // Retoma a partir de onde parou (quantos slides ja renderizaram)
        const doneResults = (job.result as { slides?: Array<{ index: number }> })?.slides || [];
        const maxIdx = doneResults.length
          ? Math.max(...doneResults.map((s) => s.index)) + 1
          : 0;
        startFrom = maxIdx;
      }
    }
    if (shouldRetrigger) {
      const workerUrl = `${getSelfUrl(_req.headers)}/api/render/worker`;
      fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: id, startFrom }),
        keepalive: true,
      }).catch(() => {});
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
