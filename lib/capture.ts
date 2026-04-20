"use client";
import { toPng } from "html-to-image";

/**
 * Captura o iframe do slide (id=slide-preview-{index}) como Blob PNG 1080x1350.
 * Usado pelo preview do Instagram e pelo upload pro post.
 */
export async function captureSlideAsBlob(index: number): Promise<Blob | null> {
  const wrap = document.getElementById(`slide-preview-${index}`);
  if (!wrap) return null;
  const iframe = wrap.querySelector("iframe") as HTMLIFrameElement | null;
  if (!iframe || !iframe.contentDocument) return null;
  const inner = iframe.contentDocument.body;
  try {
    const dataUrl = await toPng(inner, {
      width: 1080,
      height: 1350,
      pixelRatio: 1,
      cacheBust: true,
      skipFonts: true,
    });
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}

/**
 * Baixa o slide como arquivo PNG.
 */
export async function downloadSlideFromDom(index: number): Promise<void> {
  const wrap = document.getElementById(`slide-preview-${index}`);
  if (!wrap) return;
  const iframe = wrap.querySelector("iframe") as HTMLIFrameElement | null;
  if (!iframe || !iframe.contentDocument) return;
  const inner = iframe.contentDocument.body;
  try {
    const dataUrl = await toPng(inner, {
      width: 1080,
      height: 1350,
      pixelRatio: 1,
      cacheBust: true,
      skipFonts: true,
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `slide-${String(index + 1).padStart(2, "0")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (e) {
    alert(`Falha no slide ${index + 1}: ${(e as Error).message || e}`);
  }
}
