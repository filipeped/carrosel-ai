"use client";
import type { SlideData, ImageRow } from "./types";

/**
 * Client-side: submete jobs de render server-side + faz polling.
 *
 * FLUXO RESILIENTE A MINIMIZACAO / BLOQUEIO DE TELA:
 * 1. submitRenderJob() → recebe jobId em ~200ms, o server continua renderizando
 * 2. pollRenderJob(jobId, onProgress) → espera ate status='done'
 * 3. Se o user fecha o navegador, jobId fica em localStorage — ao voltar, retoma poll
 *
 * Server renderiza via Chromium headless (1080x1350 @ 2x = 2160x2700 PNG nativo).
 * Cliente nao depende mais de iframe + html-to-image (gambiarra antiga).
 */

export type RenderedSlide = {
  index: number;
  url: string;
  bytes: number;
  width: number;
  height: number;
};

export type RenderBatchResult = {
  jobId: string;
  slides: RenderedSlide[];
  elapsed_ms: number;
};

export type ProgressUpdate = {
  progress: number;      // 0-100
  status: "pending" | "running" | "done" | "error";
  slidesReady: number;
  totalSlides: number;
};

type PollOptions = {
  onProgress?: (u: ProgressUpdate) => void;
  intervalMs?: number;
  maxWaitMs?: number;
  signal?: AbortSignal;
};

const ACTIVE_JOB_KEY = "carrosel:activeRenderJob:v1";

function saveActiveJob(jobId: string, slideCount: number): void {
  try {
    localStorage.setItem(
      ACTIVE_JOB_KEY,
      JSON.stringify({ jobId, slideCount, at: Date.now() }),
    );
  } catch {}
}

function clearActiveJob(): void {
  try {
    localStorage.removeItem(ACTIVE_JOB_KEY);
  } catch {}
}

/**
 * Se existe um job ativo no localStorage (de sessao anterior), retorna ele.
 * Util pra retomar polling quando o user volta pro app depois de fechar.
 */
export function clearActiveRenderJob(): void {
  clearActiveJob();
}

export function getActiveJob(): { jobId: string; slideCount: number; at: number } | null {
  try {
    const raw = localStorage.getItem(ACTIVE_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { jobId: string; slideCount: number; at: number };
    // Ignora jobs de mais de 1 hora
    if (Date.now() - parsed.at > 60 * 60 * 1000) {
      clearActiveJob();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Submete um job e retorna jobId em ~200ms. Server continua processando
 * mesmo que o client desconecte ou minimize.
 */
export async function submitRenderJob(
  slides: SlideData[],
  orderedImages: (ImageRow | undefined)[],
): Promise<string> {
  const imageUrls = orderedImages.map((im) => im?.url || "");
  if (imageUrls.some((u) => !u)) {
    throw new Error("alguma imagem sem URL (selecao incompleta?)");
  }
  const r = await fetch("/api/render/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slides, imageUrls }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    throw new Error(err.error || "submit falhou");
  }
  const { jobId } = await r.json();
  saveActiveJob(jobId, slides.length);
  return jobId;
}

/**
 * Polla /api/render/status/[id] ate status='done' ou 'error'.
 * Intervalo 1.5s, backoff leve se responder lento.
 * Abort via AbortSignal opcional.
 */
export async function pollRenderJob(
  jobId: string,
  opts: PollOptions = {},
): Promise<RenderBatchResult> {
  const { onProgress, intervalMs = 1500, maxWaitMs = 5 * 60_000, signal } = opts;
  const start = Date.now();

  while (true) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (Date.now() - start > maxWaitMs) {
      throw new Error(`timeout (${Math.round(maxWaitMs / 1000)}s) esperando render`);
    }

    const r = await fetch(`/api/render/status/${jobId}`, { cache: "no-store" });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      throw new Error(err.error || "poll falhou");
    }
    const data = await r.json();
    const slidesReady = Math.round(((data.progress || 0) / 100) * (data.total_slides || 1));
    onProgress?.({
      progress: data.progress || 0,
      status: data.status,
      slidesReady,
      totalSlides: data.total_slides || 0,
    });

    if (data.status === "done") {
      clearActiveJob();
      return {
        jobId,
        slides: data.result.slides,
        elapsed_ms: data.result.elapsed_ms,
      };
    }
    if (data.status === "error") {
      clearActiveJob();
      throw new Error(data.error || "render falhou no servidor");
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Conveniencia: renderiza slides e retorna URLs publicas.
 *
 * Fluxo UNIFICADO com jobs — VPS ou serverless, sempre via submit+poll.
 * Garante que o render continua mesmo se o user fechar o app / bloquear tela.
 *
 * Backend:
 * - Se RENDER_VPS_URL configurado: submit dispara VPS fire-and-forget,
 *   VPS renderiza (15-30s) e atualiza render_jobs no Supabase direto.
 * - Senao: worker serverless chunked (2-3min).
 *
 * User pode:
 * - Fechar o navegador → volta depois, localStorage lembra o jobId, retoma
 * - Minimizar o app no mobile → render continua na VPS, poll retoma ao voltar
 * - Desligar a internet → job continua no servidor, cliente retoma online
 */
export async function renderBatch(
  slides: SlideData[],
  orderedImages: (ImageRow | undefined)[],
  onProgress?: (u: ProgressUpdate) => void,
): Promise<RenderBatchResult> {
  const jobId = await submitRenderJob(slides, orderedImages);
  return pollRenderJob(jobId, { onProgress });
}

/**
 * Baixa UM arquivo via fetch + blob + <a download>.
 * Funciona em desktop e Android. Em iOS Safari, prefira shareSlides().
 */
export async function downloadUrl(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`download ${filename}: HTTP ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
}

/**
 * Web Share API com arquivos (iOS 16.4+, Chrome Android). Desktop quase nunca.
 */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!("share" in navigator) || !("canShare" in navigator)) return false;
  try {
    const probe = new File([new Blob()], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function shareSlides(urls: string[]): Promise<void> {
  if (!canShareFiles()) throw new Error("Web Share API nao disponivel");
  const files: File[] = [];
  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i], { cache: "no-store" });
    const blob = await res.blob();
    files.push(
      new File([blob], `slide-${String(i + 1).padStart(2, "0")}.png`, {
        type: "image/png",
      }),
    );
  }
  await navigator.share({ files, title: "Carrossel Digital Paisagismo" });
}
