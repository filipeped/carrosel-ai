// Renderer com fallback inteligente:
//   - Em dev local (ou USE_PUPPETEER=1): usa puppeteer full — rápido, fidelidade total.
//   - Em prod Vercel: usa Satori + Resvg (puro JS, sem chromium).

import satori from "satori";
import { html as htmlToReact } from "satori-html";
import { Resvg } from "@resvg/resvg-js";

type FontWeight = 300 | 400 | 500 | 600 | 700;
type SatoriFont = {
  name: string;
  data: ArrayBuffer;
  weight?: FontWeight;
  style?: "normal" | "italic";
};

// ============================================================
// Modo 1: Puppeteer (dev local)
// ============================================================
let _browser: any = null;
let _launching: Promise<any> | null = null;

async function getBrowser() {
  if (_browser) return _browser;
  if (_launching) return _launching;
  _launching = (async () => {
    const puppeteer = await import("puppeteer");
    _browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      protocolTimeout: 60000,
    });
    _launching = null;
    return _browser;
  })();
  return _launching;
}

async function renderViaPuppeteer(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load", timeout: 15000 });
    await new Promise((r) => setTimeout(r, 400));
    const buf = (await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 1080, height: 1350 },
    })) as Buffer;
    return buf;
  } finally {
    try { await page.close(); } catch {}
  }
}

// ============================================================
// Modo 2: Satori (prod)
// ============================================================
let _fontsPromise: Promise<SatoriFont[]> | null = null;

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`font fetch failed ${r.status} ${url}`);
  return await r.arrayBuffer();
}

async function loadFonts(): Promise<SatoriFont[]> {
  if (_fontsPromise) return _fontsPromise;
  _fontsPromise = (async () => {
    const base = "https://cdn.jsdelivr.net/fontsource/fonts";
    const [frauncesReg, frauncesIta, frauncesLight, frauncesLightIta, archivoReg, archivoMed, jbmReg] = await Promise.all([
      fetchFont(`${base}/fraunces@latest/latin-400-normal.ttf`),
      fetchFont(`${base}/fraunces@latest/latin-400-italic.ttf`),
      fetchFont(`${base}/fraunces@latest/latin-300-normal.ttf`),
      fetchFont(`${base}/fraunces@latest/latin-300-italic.ttf`),
      fetchFont(`${base}/archivo@latest/latin-400-normal.ttf`),
      fetchFont(`${base}/archivo@latest/latin-500-normal.ttf`),
      fetchFont(`${base}/jetbrains-mono@latest/latin-400-normal.ttf`),
    ]);
    return [
      { name: "Fraunces", data: frauncesReg, weight: 400, style: "normal" },
      { name: "Fraunces", data: frauncesIta, weight: 400, style: "italic" },
      { name: "Fraunces", data: frauncesLight, weight: 300, style: "normal" },
      { name: "Fraunces", data: frauncesLightIta, weight: 300, style: "italic" },
      { name: "Archivo", data: archivoReg, weight: 400, style: "normal" },
      { name: "Archivo", data: archivoMed, weight: 500, style: "normal" },
      { name: "JetBrains Mono", data: jbmReg, weight: 400, style: "normal" },
    ];
  })();
  return _fontsPromise;
}

async function inlineRemoteImages(html: string): Promise<string> {
  const imgRegex = /src="(https?:\/\/[^"]+)"/g;
  const matches = [...html.matchAll(imgRegex)];
  if (!matches.length) return html;
  const uniqueUrls = [...new Set(matches.map((m) => m[1]))];
  const urlToDataUri = new Map<string, string>();
  await Promise.all(
    uniqueUrls.map(async (url) => {
      try {
        const r = await fetch(url);
        if (!r.ok) return;
        const contentType = r.headers.get("content-type") || "image/jpeg";
        const buf = Buffer.from(await r.arrayBuffer());
        urlToDataUri.set(url, `data:${contentType};base64,${buf.toString("base64")}`);
      } catch {}
    }),
  );
  let result = html;
  for (const [url, dataUri] of urlToDataUri) {
    result = result.replaceAll(`src="${url}"`, `src="${dataUri}"`);
  }
  return result;
}

/**
 * Sanitize HTML for satori-html: strip everything outside <body>, remove
 * <style>/<script>/<head> blocks, and collapse inter-tag whitespace so
 * satori-html doesn't create null text-node children that crash Satori.
 */
function sanitizeForSatori(html: string): string {
  // satori-html converts whitespace between HTML tags into null children,
  // which crashes Satori with "object null is not iterable".
  // Fix: collapse whitespace between tags, but preserve <style> content.

  // 1. Extract and preserve <style> blocks
  const styles: string[] = [];
  let cleaned = html.replace(/<style[\s\S]*?<\/style>/gi, (m) => {
    styles.push(m);
    return "__STYLE_" + (styles.length - 1) + "__";
  });

  // 2. Remove doctype/html/head wrappers (keep body content)
  const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) cleaned = bodyMatch[1];
  cleaned = cleaned.replace(/<!doctype[^>]*>/gi, "");
  cleaned = cleaned.replace(/<\/?html[^>]*>/gi, "");
  cleaned = cleaned.replace(/<\/?body[^>]*>/gi, "");
  cleaned = cleaned.replace(/<head[\s\S]*?<\/head>/gi, "");

  // 3. Collapse whitespace between tags
  cleaned = cleaned.replace(/>\s+</g, "><");

  // 4. Restore <style> blocks (minified)
  styles.forEach((s, i) => {
    cleaned = cleaned.replace("__STYLE_" + i + "__", s.replace(/\n\s*/g, " "));
  });

  return cleaned.trim();
}

async function renderViaSatori(html: string): Promise<Buffer> {
  const fonts = await loadFonts();
  const htmlWithInlinedImages = await inlineRemoteImages(html);
  const sanitized = sanitizeForSatori(htmlWithInlinedImages);
  const markup = htmlToReact(sanitized);
  if (!markup) throw new Error("satori-html retornou markup vazio");
  const svg = await satori(markup as any, {
    width: 1080,
    height: 1350,
    fonts: fonts as any,
    embedFont: true,
  });
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
    font: { loadSystemFonts: false },
  });
  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}

// ============================================================
// API publica: decide qual usar
// ============================================================
function shouldUsePuppeteer(): boolean {
  if (process.env.USE_PUPPETEER === "1") return true;
  if (process.env.USE_SATORI === "1") return false;
  return process.env.NODE_ENV !== "production";
}

export async function renderHtmlToPng(html: string): Promise<Buffer> {
  const usePuppet = shouldUsePuppeteer();
  try {
    return usePuppet ? await renderViaPuppeteer(html) : await renderViaSatori(html);
  } catch (e: any) {
    console.warn(`[renderer] ${usePuppet ? "puppeteer" : "satori"} falhou:`, e.message);
    if (usePuppet) {
      console.warn("[renderer] tentando satori como fallback");
      return renderViaSatori(html);
    }
    throw e;
  }
}

export async function renderMany(htmls: string[]): Promise<Buffer[]> {
  return Promise.all(htmls.map((h) => renderHtmlToPng(h)));
}

export async function closeBrowser() {
  if (_browser) {
    try { await _browser.close(); } catch {}
    _browser = null;
  }
}
