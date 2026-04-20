"use client";
import { toPng } from "html-to-image";

/**
 * Captura o iframe do slide (id=slide-preview-{index}) como Blob PNG.
 *
 * QUALIDADE MAXIMA 2026:
 * - pixelRatio: 2 → captura supersampled 2160x2700, IG downscale p/ 1080x1350
 *   com Lanczos/bicubic → resultado final MAIS nitido que render direto em 1x
 * - skipFonts: false → fontes Fraunces/Archivo/JetBrains Mono embedam no snapshot
 * - document.fonts.ready → espera fontes carregarem antes de capturar (anti-FOUT)
 * - PNG lossless (text-heavy carousels sao superior em PNG vs JPEG)
 *
 * IG specs 2026: 1080x1350 alvo (4:5 feed). Max 30MB/slide. Supersampling > direto.
 */

const CAPTURE_OPTS = {
  width: 1080,
  height: 1350,
  pixelRatio: 2,          // 2x supersampling (antes 1)
  cacheBust: true,
  skipFonts: false,       // embed fontes reais (antes true = fallback generico)
  backgroundColor: "#0a0d0b",
  type: "image/png" as const,
  quality: 1,
  imagePlaceholder: undefined,
} as const;

/**
 * Aguarda fontes do iframe carregarem antes de capturar. Evita flash of
 * unstyled text (FOUT) no snapshot final.
 */
async function waitForFonts(iframe: HTMLIFrameElement): Promise<void> {
  const doc = iframe.contentDocument;
  if (!doc) return;
  try {
    if (doc.fonts && typeof doc.fonts.ready?.then === "function") {
      await doc.fonts.ready;
    }
  } catch {
    // ignora — falha em fonts.ready nao bloqueia captura
  }
  // Mais 1 frame pra garantir layout estavel
  await new Promise((r) => requestAnimationFrame(() => r(null)));
}

async function captureDataUrl(inner: HTMLElement, attempt = 1): Promise<string | null> {
  try {
    return await toPng(inner, CAPTURE_OPTS);
  } catch (err) {
    if (attempt < 2) {
      // Retry 1x — normalmente resolve quando eh um race com imagem externa
      console.warn(`[capture] toPng falhou (attempt ${attempt}), retry...`, (err as Error).message);
      await new Promise((r) => setTimeout(r, 250));
      return captureDataUrl(inner, attempt + 1);
    }
    console.error(`[capture] toPng falhou definitivamente:`, (err as Error).message);
    return null;
  }
}

/**
 * Captura o slide [index] como Blob PNG em 2160x2700 (2x supersampled).
 */
export async function captureSlideAsBlob(index: number): Promise<Blob | null> {
  const wrap = document.getElementById(`slide-preview-${index}`);
  if (!wrap) return null;
  const iframe = wrap.querySelector("iframe") as HTMLIFrameElement | null;
  if (!iframe || !iframe.contentDocument) return null;
  await waitForFonts(iframe);
  const inner = iframe.contentDocument.body;
  const dataUrl = await captureDataUrl(inner);
  if (!dataUrl) return null;
  try {
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch (err) {
    console.error(`[capture] fetch dataUrl falhou:`, (err as Error).message);
    return null;
  }
}

/**
 * Baixa o slide [index] como PNG 2160x2700 (2x supersampled).
 */
export async function downloadSlideFromDom(index: number): Promise<void> {
  const wrap = document.getElementById(`slide-preview-${index}`);
  if (!wrap) return;
  const iframe = wrap.querySelector("iframe") as HTMLIFrameElement | null;
  if (!iframe || !iframe.contentDocument) return;
  await waitForFonts(iframe);
  const inner = iframe.contentDocument.body;
  const dataUrl = await captureDataUrl(inner);
  if (!dataUrl) {
    alert(`Falha no slide ${index + 1}: captura retornou null`);
    return;
  }
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `slide-${String(index + 1).padStart(2, "0")}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
