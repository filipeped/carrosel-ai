import type { Browser } from "puppeteer-core";

let _browser: Browser | null = null;
let _initPromise: Promise<Browser> | null = null;
let _execPath: string | null = null;

async function getChromiumExecPath(): Promise<string> {
  if (_execPath) return _execPath;
  const chromium = (await import("@sparticuz/chromium")).default;
  // pre-set modes antes de pedir path (extrai o binario)
  try {
    // @ts-ignore — api depende da versao
    if (chromium.setGraphicsMode !== undefined) chromium.setGraphicsMode = false;
  } catch {}
  _execPath = await chromium.executablePath();
  return _execPath;
}

async function launchBrowser(): Promise<Browser> {
  const isDev = process.env.NODE_ENV !== "production" || process.env.PUPPETEER_LOCAL === "1";

  if (isDev) {
    const puppeteer = await import("puppeteer");
    return (await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })) as unknown as Browser;
  }

  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");
  const execPath = await getChromiumExecPath();
  return await puppeteer.default.launch({
    args: [...chromium.args, "--font-render-hinting=none"],
    defaultViewport: { width: 1080, height: 1350, deviceScaleFactor: 1 },
    executablePath: execPath,
    headless: true,
  });
}

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.connected) return _browser;
  // se ja ha init em curso, espera a mesma promise — evita ETXTBSY
  // por duas invocacoes do mesmo processo tentando iniciar chromium em paralelo.
  if (_initPromise) return _initPromise;

  _initPromise = launchBrowser()
    .then((b) => {
      _browser = b;
      return b;
    })
    .catch((err) => {
      _initPromise = null;
      throw err;
    });

  try {
    return await _initPromise;
  } finally {
    // libera o slot de init, mas _browser permanece cacheado
    _initPromise = null;
  }
}

export async function renderHtmlToPng(html: string): Promise<Buffer> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < 2) {
    attempt++;
    try {
      const browser = await getBrowser();
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
        await page.setContent(html, { waitUntil: "networkidle0", timeout: 25000 });
        const buf = (await page.screenshot({
          type: "png",
          fullPage: false,
          clip: { x: 0, y: 0, width: 1080, height: 1350 },
        })) as Buffer;
        return buf;
      } finally {
        try {
          await page.close();
        } catch {}
      }
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);
      // ETXTBSY ou binario ocupado — descarta browser e tenta de novo
      if (msg.includes("ETXTBSY") || msg.includes("spawn") || msg.includes("Browser disconnected")) {
        try {
          await _browser?.close();
        } catch {}
        _browser = null;
        _initPromise = null;
        // pequeno delay pra binario liberar
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function renderMany(htmls: string[]): Promise<Buffer[]> {
  // Sequencial evita pressao no chromium em serverless (ETXTBSY).
  const out: Buffer[] = [];
  for (const h of htmls) {
    out.push(await renderHtmlToPng(h));
  }
  return out;
}

export async function closeBrowser() {
  if (_browser) {
    try {
      await _browser.close();
    } catch {}
    _browser = null;
  }
}
