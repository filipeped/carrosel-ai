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

async function launchBrowser() {
  const puppeteer = await import("puppeteer");
  return puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    protocolTimeout: 60000,
  });
}

async function getBrowser() {
  if (_browser) {
    try {
      if (!_browser.isConnected || !_browser.isConnected()) {
        _browser = null;
      }
    } catch {
      _browser = null;
    }
  }
  if (_browser) return _browser;
  if (_launching) return _launching;
  _launching = (async () => {
    _browser = await launchBrowser();
    _launching = null;
    return _browser;
  })();
  return _launching;
}

async function resetBrowser() {
  const old = _browser;
  _browser = null;
  _launching = null;
  if (old) {
    try { await old.close(); } catch {}
  }
}

// Semaforo: max 2 renders Puppeteer simultaneos (browser trava com >3 pages)
const MAX_CONCURRENT = 2;
let _active = 0;
const _queue: Array<() => void> = [];

async function acquireSlot(): Promise<() => void> {
  if (_active < MAX_CONCURRENT) {
    _active++;
    return () => {
      _active--;
      const next = _queue.shift();
      if (next) next();
    };
  }
  await new Promise<void>((resolve) => _queue.push(resolve));
  _active++;
  return () => {
    _active--;
    const next = _queue.shift();
    if (next) next();
  };
}

async function renderViaPuppeteer(html: string): Promise<Buffer> {
  const release = await acquireSlot();
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      // Pre-inlina imagens em data:URI — setContent fica instantaneo, sem fetch de rede
      const inlinedHtml = await inlineRemoteImages(html);
      await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
      await page.setContent(inlinedHtml, { waitUntil: "domcontentloaded", timeout: 10000 });
      // Espera as fontes aplicarem em vez de delay fixo
      await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});
      const buf = (await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: 1080, height: 1350 },
      })) as Buffer;
      return buf;
    } finally {
      try { await page.close(); } catch {}
    }
  } catch (e) {
    // se deu timeout ou erro de protocolo, recria browser pra proxima requisicao
    await resetBrowser();
    throw e;
  } finally {
    release();
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
  // 1. Extrai <style> blocks do HTML inteiro (head ou body) pra preservar o CSS
  const styles: string[] = [];
  html.replace(/<style[\s\S]*?<\/style>/gi, (m) => {
    styles.push(m);
    return "";
  });

  // 2. Pega conteudo do <body>
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let cleaned = bodyMatch ? bodyMatch[1] : html;

  // 3. Remove wrappers residuais e <style> que sobraram dentro do body
  cleaned = cleaned.replace(/<!doctype[^>]*>/gi, "");
  cleaned = cleaned.replace(/<\/?html[^>]*>/gi, "");
  cleaned = cleaned.replace(/<\/?body[^>]*>/gi, "");
  cleaned = cleaned.replace(/<head[\s\S]*?<\/head>/gi, "");
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");

  // 4. Collapse whitespace entre tags
  cleaned = cleaned.replace(/>\s+</g, "><");

  // 5. PREPENDA os <style> extraidos — assim Satori tem acesso ao CSS
  //    (divs ja renderizam com display:flex das classes)
  const stylesMinified = styles.map((s) => s.replace(/\n\s*/g, " ")).join("");

  return (stylesMinified + cleaned).trim();
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
