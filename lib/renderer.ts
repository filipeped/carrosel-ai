import type { Browser } from "puppeteer-core";

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.connected) return _browser;

  const isDev = process.env.NODE_ENV !== "production" || process.env.PUPPETEER_LOCAL === "1";

  if (isDev) {
    // dev local: puppeteer full (tem chromium bundled)
    const puppeteer = await import("puppeteer");
    _browser = (await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })) as unknown as Browser;
  } else {
    // prod (Vercel): puppeteer-core + sparticuz chromium
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    _browser = await puppeteer.default.launch({
      args: chromium.args,
      defaultViewport: { width: 1080, height: 1350, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  return _browser!;
}

export async function renderHtmlToPng(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 20000 });
    const buf = (await page.screenshot({ type: "png", fullPage: false, clip: { x: 0, y: 0, width: 1080, height: 1350 } })) as Buffer;
    return buf;
  } finally {
    await page.close();
  }
}

export async function renderMany(htmls: string[]): Promise<Buffer[]> {
  return Promise.all(htmls.map((h) => renderHtmlToPng(h)));
}

export async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}
