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

/**
 * Filter que exclui o <link rel=stylesheet> das fontes Google do snapshot.
 * As fontes JA estao renderizadas no iframe (carregadas via link no HTML inicial),
 * nao precisam ser re-embedadas. Pular o <link> elimina o SecurityError cssRules
 * que polui o console sem bloquear captura.
 */
function captureFilter(node: HTMLElement): boolean {
  // Exclui link stylesheet apontando pra fonts.googleapis ou fonts.gstatic
  if (node.tagName === "LINK") {
    const href = (node as HTMLLinkElement).href || "";
    if (href.includes("fonts.googleapis") || href.includes("fonts.gstatic")) {
      return false;
    }
  }
  return true;
}

const BASE_OPTS = {
  width: 1080,
  height: 1350,
  cacheBust: true,
  skipFonts: false,       // embed fontes reais (antes true = fallback generico)
  backgroundColor: "#0a0d0b",
  type: "image/png" as const,
  quality: 1,
  imagePlaceholder: undefined,
  filter: captureFilter,  // silencia SecurityError cssRules das fontes Google
} as const;

// 4MB = limite pratico (Vercel 4.5MB). Server tem sharp pra otimizar -20~40%,
// mas aqui no cliente preferimos tentar ratio maior se couber.
const MAX_CLIENT_BYTES = 4 * 1024 * 1024;

/** Estima bytes do PNG sem criar blob (rapido: len do base64 * 0.75). */
function estimateBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.round((base64.length * 3) / 4);
}

/**
 * Memoiza o ratio que funcionou na ultima captura.
 * Se slide 1 caiu em 1.5x porque imagem de fundo era pesada, muito provavel
 * que slide 2 tambem caia no mesmo — comeca direto dai em vez de testar
 * 2.5x e 2x que sempre vao estourar no mesmo carrossel.
 */
let lastSuccessfulRatio: number | null = null;

/**
 * Reseta o ratio memoizado. Chamar antes de iniciar um novo batch de captura
 * (ex: novo preview, novo carrossel) pra que a 1a tentativa seja em 2.5x.
 */
export function resetCaptureRatio(): void {
  lastSuccessfulRatio = null;
}

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

/**
 * Captura em pixelRatio adaptativo: tenta 2.5 primeiro (2700x3375, maxima nitidez),
 * se estourar 4MB cai pra 2 → 1.5 → 1. Ultima tentativa sempre aceita o resultado
 * mesmo que passe do limite (melhor entregar algo degradado que falhar).
 */
async function captureDataUrl(inner: HTMLElement, attempt = 1): Promise<string | null> {
  const allRatios = [2.5, 2, 1.5, 1];
  // Se o slide anterior caiu em R, comeca direto de R no atual — evita desperdicar
  // tempo testando 2.5x e 2x num carrossel onde imagens de fundo sao pesadas
  const startFrom = lastSuccessfulRatio
    ? allRatios.findIndex((r) => r <= lastSuccessfulRatio!)
    : 0;
  const ratios = startFrom >= 0 ? allRatios.slice(startFrom) : allRatios;
  let lastDataUrl: string | null = null;
  let lastBytes = 0;
  let lastRatio = 0;
  for (let idx = 0; idx < ratios.length; idx++) {
    const ratio = ratios[idx];
    try {
      const dataUrl = await toPng(inner, { ...BASE_OPTS, pixelRatio: ratio });
      const bytes = estimateBytes(dataUrl);
      lastDataUrl = dataUrl;
      lastBytes = bytes;
      lastRatio = ratio;
      if (bytes <= MAX_CLIENT_BYTES) {
        lastSuccessfulRatio = ratio;
        if (ratio !== 2.5) {
          console.log(`[capture] ratio ${ratio}x OK (${(bytes / 1024).toFixed(0)}KB)`);
        }
        return dataUrl;
      }
      // SMART SKIP: se excedeu o dobro do limite, pula direto pra 1x.
      // Nao faz sentido testar 2x e 1.5x quando 2.5x deu 13MB (todos vao estourar).
      // Ratio 1x ~= 16% dos bytes de 2.5x (area), entao 13MB -> ~2MB em 1x.
      const hugelyOver = bytes > MAX_CLIENT_BYTES * 2;
      if (hugelyOver && idx < ratios.length - 1) {
        console.warn(
          `[capture] ratio ${ratio}x gerou ${(bytes / 1024 / 1024).toFixed(2)}MB (>2x limit), pulando direto pra 1x`,
        );
        // Salta pra ultimo indice (1x)
        idx = ratios.length - 2;  // -2 porque o for vai incrementar
        continue;
      }
      console.warn(
        `[capture] ratio ${ratio}x gerou ${(bytes / 1024 / 1024).toFixed(2)}MB > limit, tentando menor...`,
      );
    } catch (err) {
      if (attempt < 2 && ratio === 2.5) {
        await new Promise((r) => setTimeout(r, 250));
        return captureDataUrl(inner, attempt + 1);
      }
      console.warn(`[capture] toPng ratio ${ratio} falhou:`, (err as Error).message);
      // cai pro proximo ratio
    }
  }
  // Se mesmo em 1x passou de 4MB: entrega assim mesmo (melhor postar degradado
  // que falhar). Server tem sharp pra otimizar — provavelmente cabe no 4.5MB Vercel.
  if (lastDataUrl) {
    console.warn(
      `[capture] mesmo em ${lastRatio}x passou do limit (${(lastBytes / 1024 / 1024).toFixed(2)}MB) — ` +
        `entregando assim mesmo, sharp no server deve otimizar.`,
    );
    return lastDataUrl;
  }
  console.error("[capture] falha em todos os ratios");
  return null;
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
