import { NextRequest, NextResponse } from "next/server";
import type { SlideData } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/render/proxy
 * Body: { slides, imageUrls, batchId?, upload? }
 *
 * Proxy SINCRONO pro servico de render na VPS.
 * VPS roda Puppeteer full (sem cold start), renderiza 6-10 slides em ~15-30s.
 *
 * Cliente: chama direto e aguarda (cabe no maxDuration 60s).
 * Vantagem sobre /api/render/submit (jobs chunked): 5-10x mais rapido,
 * zero complexidade de retry/chunking.
 *
 * Envs necessarios:
 *   RENDER_VPS_URL      ex: https://render.digitalpaisagismo.online
 *   RENDER_VPS_TOKEN    bearer token compartilhado com a VPS
 *
 * Se envs nao configurados, retorna 503 e o cliente faz fallback pro fluxo de jobs.
 */

export async function POST(req: NextRequest) {
  const vpsUrl = process.env.RENDER_VPS_URL;
  const vpsToken = process.env.RENDER_VPS_TOKEN;

  if (!vpsUrl || !vpsToken) {
    return NextResponse.json(
      { error: "VPS render nao configurado", fallback: true },
      { status: 503 },
    );
  }

  try {
    const body = (await req.json()) as {
      slides: SlideData[];
      imageUrls: string[];
      batchId?: string;
      upload?: boolean;
    };
    if (!Array.isArray(body.slides) || !body.slides.length) {
      return NextResponse.json({ error: "slides[] required" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55_000);

    try {
      const r = await fetch(`${vpsUrl.replace(/\/$/, "")}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${vpsToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await r.text();
      if (!r.ok) {
        return NextResponse.json(
          { error: `VPS render falhou: ${r.status} ${text.slice(0, 200)}`, fallback: true },
          { status: r.status },
        );
      }
      return new NextResponse(text, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (e) {
    const err = e as Error;
    const isTimeout = err.name === "AbortError";
    return NextResponse.json(
      {
        error: isTimeout ? "VPS render timeout (55s)" : err.message || String(err),
        fallback: true,
      },
      { status: 504 },
    );
  }
}
