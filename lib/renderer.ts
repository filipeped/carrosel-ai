import type { Browser } from "puppeteer-core";

/**
 * Render server-side de slides via Chromium headless.
 *
 * - Vercel / Lambda: puppeteer-core + @sparticuz/chromium (binario ~50MB cabe serverless)
 * - Local / Docker: puppeteer full (baixa Chromium propria)
 *
 * Seleciona auto: se VERCEL ou AWS_LAMBDA_FUNCTION_NAME presente, usa sparticuz.
 *
 * 1 browser instance reutilizado entre requests dentro do mesmo lambda.
 * Fecha so quando o process morre.
 */

let _browserPromise: Promise<Browser> | null = null;

const IS_SERVERLESS =
  !!process.env.VERCEL ||
  !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
  !!process.env.LAMBDA_TASK_ROOT;

async function launchBrowser(): Promise<Browser> {
  if (IS_SERVERLESS) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    return (await puppeteer.launch({
      args: [
        ...chromium.args,
        "--disable-dev-shm-usage",
        "--hide-scrollbars",
        "--disable-web-security",
      ],
      defaultViewport: { width: 1080, height: 1350 },
      executablePath: await chromium.executablePath(),
      headless: true,
    })) as unknown as Browser;
  }
  // Local: usa puppeteer full (baixa Chromium automaticamente na 1a rodada)
  const puppeteer = await import("puppeteer");
  return (await puppeteer.launch({
    headless: true,
    args: ["--hide-scrollbars", "--disable-web-security"],
  })) as unknown as Browser;
}

export async function getBrowser(): Promise<Browser> {
  if (_browserPromise) {
    try {
      const b = await _browserPromise;
      // Se fechou entre requests, relanca
      if (b.connected) return b;
    } catch {
      // cai pro relaunch abaixo
    }
  }
  _browserPromise = launchBrowser();
  return _browserPromise;
}

export type RenderOptions = {
  width?: number;
  height?: number;
  deviceScaleFactor?: number;  // 2 = supersampling, PNG final 2160x2700
  timeout?: number;
};

/**
 * Renderiza HTML como PNG usando o browser singleton.
 * Retorna Buffer do PNG (nativo, nao data URL).
 */
export async function renderHtmlToPng(
  html: string,
  opts: RenderOptions = {},
): Promise<Buffer> {
  const width = opts.width ?? 1080;
  const height = opts.height ?? 1350;
  const deviceScaleFactor = opts.deviceScaleFactor ?? 2;
  const timeout = opts.timeout ?? 30000;

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor });
    // setContent espera fontes/imagens com networkidle0 — garante load completo
    await page.setContent(html, { waitUntil: "networkidle0", timeout });
    // Extra: espera document.fonts.ready (fontes custom via @font-face base64)
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          if ((document as any).fonts?.ready) {
            (document as any).fonts.ready.then(() => resolve()).catch(() => resolve());
          } else {
            resolve();
          }
        }),
    );
    const buf = await page.screenshot({
      type: "png",
      omitBackground: false,
      clip: { x: 0, y: 0, width, height },
    });
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  } finally {
    await page.close().catch(() => {});
  }
}
