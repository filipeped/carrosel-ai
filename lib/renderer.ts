// Renderer com fallback inteligente:
//   - Em dev local (ou USE_PUPPETEER=1): usa puppeteer full — rápido, fidelidade total.
//   - Em prod Vercel: usa Satori + Resvg (puro JS, sem chromium).

import satori from "satori";
import { html as htmlToReact } from "satori-html";
import { Resvg } from "@resvg/resvg-js";
import juice from "juice";

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
  // Em Vercel serverless: puppeteer-core + @sparticuz/chromium
  // Em dev local: puppeteer full
  const isServerless = !!process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isServerless) {
    const [{ default: chromium }, { default: puppeteerCore }] = await Promise.all([
      import("@sparticuz/chromium"),
      import("puppeteer-core"),
    ]);
    return puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: { width: 1080, height: 1350 },
      executablePath: await chromium.executablePath(),
      headless: true,
      protocolTimeout: 60000,
    });
  }
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
/**
 * Satori aceita <style> mas engasga em coisas tipo :root, *, html/body, e
 * comentarios. Preserva o resto (inclusive seletor composto .foo .bar).
 */
function cleanCssForSatori(styleBlock: string): string {
  const inner = styleBlock.replace(/<\/?style[^>]*>/gi, "");
  // remove comentarios /* ... */
  const noComments = inner.replace(/\/\*[\s\S]*?\*\//g, "");
  // quebra em regras { ... } e filtra as indesejaveis
  const rules: string[] = [];
  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRegex.exec(noComments)) !== null) {
    const selectorRaw = m[1].trim();
    const body = m[2].trim();
    if (!selectorRaw || !body) continue;
    // remove pseudo, :root, *, html/body do seletor
    const selectors = selectorRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => {
        if (s.startsWith(":")) return false; // :root, :hover, etc
        if (s === "*") return false;
        if (/^(html|body)\b/.test(s)) return false;
        return true;
      });
    if (!selectors.length) continue;
    rules.push(`${selectors.join(",")} { ${body} }`);
  }
  return `<style>${rules.join(" ")}</style>`;
}

function sanitizeForSatori(html: string): string {
  // 1. Inline TODOS os estilos via juice — Satori nao suporta <style> com
  //    seletores descendentes (.foo .bar) nem pseudo-classes. Inlining resolve.
  //    juice fazer o matching CSS nativo, suporta descendentes, e coloca em style="".
  let inlined: string;
  try {
    inlined = juice(html, {
      removeStyleTags: true,
      preserveMediaQueries: false,
      preserveFontFaces: false,
      preservePseudos: false,
    });
  } catch {
    inlined = html;
  }

  // 2. Pega conteudo do <body>
  const bodyMatch = inlined.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let cleaned = bodyMatch ? bodyMatch[1] : inlined;

  // 3. Remove wrappers residuais
  cleaned = cleaned.replace(/<!doctype[^>]*>/gi, "");
  cleaned = cleaned.replace(/<\/?html[^>]*>/gi, "");
  cleaned = cleaned.replace(/<\/?body[^>]*>/gi, "");
  cleaned = cleaned.replace(/<head[\s\S]*?<\/head>/gi, "");
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");
  cleaned = cleaned.replace(/<link[^>]*>/gi, "");

  // 4. Collapse whitespace entre tags (evita null children em satori-html)
  cleaned = cleaned.replace(/>\s+</g, "><");

  // 5. Elementos vazios recebem &nbsp; (satori-html vira children null senao)
  cleaned = cleaned.replace(/<(span|div)([^>]*)><\/(?:span|div)>/g, "<$1$2>&nbsp;</$1>");

  // 6. Force self-close em <img> (satori-html parse melhor com />)
  cleaned = cleaned.replace(/<img([^>]*?)(?<!\/)>/g, "<img$1/>");

  // 7. Colapsa \n e espacos multiplos dentro de style="" (satori confuso com quebras)
  cleaned = cleaned.replace(/style="([^"]*)"/g, (_, s: string) => {
    const compact = s.replace(/\s+/g, " ").trim();
    return `style="${compact}"`;
  });

  return cleaned.trim();
}

async function renderViaSatori(html: string): Promise<Buffer> {
  const fonts = await loadFonts();
  const htmlWithInlinedImages = await inlineRemoteImages(html);
  const sanitized = sanitizeForSatori(htmlWithInlinedImages);
  const markup = htmlToReact(sanitized);
  if (!markup) throw new Error("satori-html retornou markup vazio");
  let svg: string;
  try {
    svg = await satori(markup as any, {
      width: 1080,
      height: 1350,
      fonts: fonts as any,
      embedFont: true,
    });
  } catch (e: any) {
    console.error("[satori] crash:", e.message);
    console.error("[satori] sanitized full:", sanitized);
    throw new Error(`satori: ${e.message} | full_html: ${sanitized}`);
  }
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
  // Prod Vercel: libnss3 missing no AL2023 — Satori eh mais confiavel
  return process.env.NODE_ENV !== "production";
}

export async function renderHtmlToPng(html: string): Promise<Buffer> {
  const usePuppet = shouldUsePuppeteer();
  try {
    return usePuppet ? await renderViaPuppeteer(html) : await renderViaSatori(html);
  } catch (e: any) {
    console.warn(`[renderer] ${usePuppet ? "puppeteer" : "satori"} falhou:`, e.message);
    if (usePuppet) {
      // expõe erro do Puppeteer no stack pra debug — se quebrar, nao mascarar com Satori
      throw new Error(`puppeteer: ${e.message}`);
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
