"use client";
import type { SlideData, ImageRow } from "./types";

/**
 * Client-side: dispara render server-side e baixa PNGs resultantes.
 *
 * ZERO html-to-image. ZERO iframe capture. ZERO canvas tainting.
 * Server renderiza via Chromium headless (1080x1350 @ 2x = 2160x2700 PNG nativo),
 * sobe pro Supabase Storage, retorna URLs publicas. Client baixa via fetch+blob.
 *
 * Funciona igual em iPhone, Android, Desktop. Se rolar navigator.share(), usa menu
 * nativo do sistema (salvar galeria / IG / WhatsApp).
 */

export type RenderedSlide = {
  index: number;
  url: string;
  bytes: number;
  width: number;
  height: number;
};

export type RenderBatchResult = {
  ok: true;
  batchId: string;
  slides: RenderedSlide[];
  elapsed_ms: number;
};

/**
 * Pede ao server pra renderizar todos os slides. Retorna URLs publicas.
 * Mantem-se sem cache — toda chamada gera novo batch (se slides foram editados).
 */
export async function renderBatch(
  slides: SlideData[],
  orderedImages: (ImageRow | undefined)[],
): Promise<RenderBatchResult> {
  const imageUrls = orderedImages.map((im) => im?.url || "");
  if (imageUrls.some((u) => !u)) {
    throw new Error("alguma imagem sem URL (selecao incompleta?)");
  }
  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const r = await fetch("/api/render-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slides, imageUrls, batchId, upload: true }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    throw new Error(err.error || `render-batch falhou: ${r.status}`);
  }
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "render-batch falhou");
  return data as RenderBatchResult;
}

/**
 * Baixa UM PNG via fetch + blob + <a download>.
 * Funciona em desktop e Android. Em iOS Safari sempre abre em nova aba (limitacao
 * do sistema) — a funcao de fallback abre o navigator.share quando disponivel.
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
  // Libera memoria apos 5s (tempo pro browser iniciar o download)
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
}

/**
 * Detecta se o device suporta Web Share API com arquivos.
 * Safari iOS e Chrome Android modernos suportam. Desktop geralmente nao.
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

/**
 * Compartilha TODOS os PNGs via menu nativo do sistema operacional.
 * Usuario escolhe: Salvar Fotos / Instagram / WhatsApp / etc.
 *
 * Uso no mobile onde <a download> nao funciona (iOS Safari).
 */
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
  await navigator.share({
    files,
    title: "Carrossel Digital Paisagismo",
  });
}
