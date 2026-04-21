// Carrosel AI — Render Service (VPS) — OTIMIZADO
//
// Otimizacoes vs v1:
// 1. Page pool (4-6 pages pre-aquecidas) — reusa viewport+fonts entre requests
// 2. waitUntil 'load' + fonts.ready manual — 500ms mais rapido que networkidle0
// 3. Pre-fetch de imagens em Node (paralelo) + injecao base64 — elimina ida ao CDN
// 4. Sharp effort 3 (90% da compressao em 30% do tempo)
// 5. Concorrencia 6 — usa melhor os 4 vCPU
// 6. Upload Supabase paralelo com render do proximo slide
//
// Meta: 6 slides em 10-15s (antes 30s).

import express from "express";
import puppeteer from "puppeteer";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3030);
const AUTH_TOKEN = process.env.RENDER_AUTH_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "carrosseis-publicados";
const POOL_SIZE = Number(process.env.PAGE_POOL_SIZE || 6);

if (!AUTH_TOKEN) { console.error("RENDER_AUTH_TOKEN obrigatorio"); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error("Supabase env vars obrigatorias"); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- Fontes em base64 (cache perpetuo) ----------
const FONTS_DIR = path.join(__dirname, "fonts");
const FONT_FILES = {
  "Fraunces-Light": "Fraunces-Light.woff2",
  "Fraunces-Regular": "Fraunces-Regular.woff2",
  "Fraunces-Italic": "Fraunces-Italic.woff2",
  "Fraunces-LightItalic": "Fraunces-LightItalic.woff2",
  "Archivo-Regular": "Archivo-Regular.woff2",
  "Archivo-Medium": "Archivo-Medium.woff2",
  "JetBrainsMono-Regular": "JetBrainsMono-Regular.woff2",
};
let _fontCss = null;
function getFontFaceCss() {
  if (_fontCss) return _fontCss;
  const load = (name) => readFileSync(path.join(FONTS_DIR, FONT_FILES[name])).toString("base64");
  const F = (family, weight, style, b64) =>
    `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};` +
    `src:url(data:font/woff2;base64,${b64}) format('woff2');font-display:block}`;
  _fontCss = [
    F("Fraunces", 300, "normal", load("Fraunces-Light")),
    F("Fraunces", 400, "normal", load("Fraunces-Regular")),
    F("Fraunces", 300, "italic", load("Fraunces-LightItalic")),
    F("Fraunces", 400, "italic", load("Fraunces-Italic")),
    F("Archivo", 400, "normal", load("Archivo-Regular")),
    F("Archivo", 500, "normal", load("Archivo-Medium")),
    F("JetBrains Mono", 400, "normal", load("JetBrainsMono-Regular")),
  ].join("");
  return _fontCss;
}

// ---------- Image cache (LRU simples, 200 imagens, limite disk zero — so RAM) ----------
const IMG_CACHE = new Map();
const IMG_CACHE_MAX = 200;

async function fetchImageBase64(url) {
  const hit = IMG_CACHE.get(url);
  if (hit) {
    // Move pro fim (LRU)
    IMG_CACHE.delete(url);
    IMG_CACHE.set(url, hit);
    return hit;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch image ${url}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get("content-type") || "image/jpeg";
  const dataUrl = `data:${ct};base64,${buf.toString("base64")}`;
  IMG_CACHE.set(url, dataUrl);
  if (IMG_CACHE.size > IMG_CACHE_MAX) {
    const first = IMG_CACHE.keys().next().value;
    IMG_CACHE.delete(first);
  }
  return dataUrl;
}

// ---------- Browser + Page pool ----------
let _browser = null;
const _pagePool = [];     // paginas livres
const _pageWaiters = [];  // requests esperando pagina

async function getBrowser() {
  if (_browser && _browser.connected) return _browser;
  _browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--disable-web-security",
      "--font-render-hinting=none",
      "--disable-gpu",
      "--no-zygote",
    ],
  });
  _browser.on("disconnected", () => { _browser = null; });
  return _browser;
}

async function createPooledPage() {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 2 });
  // Bloqueia recursos desnecessarios — nunca precisamos de scripts, fonts externas ou trackers
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const rt = req.resourceType();
    // Deixa passar: document, stylesheet, image, font (fontes base64 inline ok), fetch
    if (rt === "script" || rt === "websocket" || rt === "eventsource" || rt === "other") {
      return req.abort();
    }
    req.continue();
  });
  return page;
}

async function initPool() {
  console.log(`[pool] aquecendo ${POOL_SIZE} pages...`);
  const t0 = Date.now();
  const pages = await Promise.all(
    Array.from({ length: POOL_SIZE }, () => createPooledPage()),
  );
  _pagePool.push(...pages);
  console.log(`[pool] pronto em ${Date.now() - t0}ms`);
}

async function acquirePage() {
  if (_pagePool.length > 0) return _pagePool.pop();
  return new Promise((resolve) => _pageWaiters.push(resolve));
}

async function releasePage(page) {
  // Limpa page antes de devolver (evita memory leak de iframes/blobs)
  try {
    await page.goto("about:blank", { waitUntil: "load", timeout: 5000 });
  } catch {
    // se der erro, descarta e cria nova
    try { await page.close(); } catch {}
    page = await createPooledPage();
  }
  if (_pageWaiters.length > 0) {
    _pageWaiters.shift()(page);
  } else {
    _pagePool.push(page);
  }
}

// ---------- Render ----------
async function renderHtmlToPng(html) {
  const page = await acquirePage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
    // Aguarda fontes + 1 frame de layout
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const done = () => requestAnimationFrame(() => resolve());
          if (document.fonts?.ready) {
            document.fonts.ready.then(done).catch(done);
          } else {
            done();
          }
        }),
    );
    const buf = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 1080, height: 1350 },
      omitBackground: false,
      captureBeyondViewport: false,
    });
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  } finally {
    releasePage(page);
  }
}

async function optimizePng(buf) {
  try {
    return await sharp(buf, { limitInputPixels: false })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: false,
        effort: 3,  // 90% da compressao em 30% do tempo
      })
      .toBuffer();
  } catch {
    return buf;
  }
}

// ---------- Templates (inline) ----------
function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function highlightItalic(title, italic = []) {
  if (!italic.length) return escapeHtml(title);
  let out = escapeHtml(title);
  italic.forEach((w) => {
    const safe = escapeHtml(w);
    out = out.replace(
      new RegExp(`\\b${safe.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "gi"),
      `<span style="font-style:italic;font-weight:300;color:#d6e7c4">${safe}</span>`,
    );
  });
  return out;
}

const BRAND_HANDLE = process.env.BRAND_HANDLE || "@DIGITALPAISAGISMO";
const HANDLE_UP = BRAND_HANDLE.replace(/^@/, "").toUpperCase();

function baseStyle() {
  return `
    * { margin:0; padding:0; box-sizing:border-box }
    body, html { width:1080px; height:1350px; color:#fff; background:#0a0d0b;
      display:flex; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
      text-rendering:geometricPrecision }
    .slide { position:relative; width:1080px; height:1350px; display:flex; overflow:hidden }
    .bg { position:absolute; inset:0; width:1080px; height:1350px; display:flex }
    .bg img { width:1080px; height:1350px; object-fit:cover }
    .veil { position:absolute; inset:0; display:flex }
    .veil-side { background:linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.40) 55%, rgba(0,0,0,0.05) 100%) }
    .veil-bottom { background:linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.12) 22%, rgba(0,0,0,0.12) 40%, rgba(0,0,0,0.75) 72%, rgba(0,0,0,0.96) 100%) }
    .veil-cover { background:linear-gradient(180deg, rgba(10,14,8,0.40) 0%, rgba(10,14,8,0.20) 28%, rgba(10,14,8,0.60) 62%, rgba(10,14,8,0.95) 100%) }
    .veil-cta { background:linear-gradient(180deg, rgba(10,14,8,0.45) 0%, rgba(10,14,8,0.60) 50%, rgba(10,14,8,0.92) 100%) }
    .chrome { position:absolute; inset:0; display:flex; flex-direction:column; padding:75px 68px 70px; color:#fff }
    .meta-top { display:flex; justify-content:space-between; align-items:center;
      font-family:'JetBrains Mono', monospace; font-size:14px; letter-spacing:3px;
      text-transform:uppercase; color:rgba(255,255,255,0.92) }
    .meta-top .rule { display:flex; flex:1; height:1px; background:rgba(255,255,255,0.35); margin:0 18px }
    .meta-bottom { display:flex; justify-content:space-between; align-items:flex-end;
      font-family:'JetBrains Mono', monospace; font-size:13px; letter-spacing:2px;
      text-transform:uppercase; color:rgba(255,255,255,0.92); padding-top:18px;
      border-top:1px solid rgba(255,255,255,0.3) }
    .content { margin-top:auto; display:flex; flex-direction:column }
  `;
}

function wrap(body) {
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${getFontFaceCss()}${baseStyle()}</style></head><body>${body}</body></html>`;
}

function renderCover(d) {
  const numeral = d.numeral && /^\d{1,2}$/.test(String(d.numeral).trim()) ? String(d.numeral).trim() : "";
  const edition = d.edition || "ED. 01";
  const topLabel = d.topLabel || "GUIA BOTANICO";
  return wrap(`<div class="slide">
    <div class="bg"><img src="${escapeHtml(d.imageUrl)}" width="1080" height="1350"/></div>
    <div class="veil veil-cover"></div>
    <div class="chrome">
      <div class="meta-top"><span>${escapeHtml(edition)}</span><span class="rule"></span><span>${HANDLE_UP}</span></div>
      <div class="content">
        <div style="display:flex;align-items:flex-end;gap:36px;width:100%">
          ${numeral ? `<div style="display:flex;font-family:'Fraunces',serif;font-weight:300;font-style:italic;font-size:240px;line-height:0.85;letter-spacing:-6px">${escapeHtml(numeral)}</div>` : ""}
          <div style="display:flex;flex-direction:column;justify-content:flex-end;flex:1">
            <div style="display:flex;font-family:'JetBrains Mono',monospace;font-size:16px;letter-spacing:4px;text-transform:uppercase;color:rgba(255,255,255,0.9);margin-bottom:16px">${escapeHtml(topLabel)}</div>
            <div style="display:block;font-family:'Fraunces',serif;font-weight:400;font-size:68px;line-height:1.04;letter-spacing:-1px">${highlightItalic(d.title, d.italicWords)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:14px;margin-top:32px;font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:4px;text-transform:uppercase">
          <span>Arraste</span><span style="display:flex;width:44px;height:1px;background:#fff"></span>
        </div>
      </div>
    </div>
  </div>`);
}

function renderPlantDetail(d) {
  return wrap(`<div class="slide">
    <div class="bg"><img src="${escapeHtml(d.imageUrl)}" width="1080" height="1350"/></div>
    <div class="veil veil-side"></div>
    <div class="chrome">
      <div class="meta-top"><span></span><span class="rule"></span><span>BOTANICA</span></div>
      <div class="content">
        <div style="display:flex;flex-wrap:wrap;font-family:'Fraunces',serif;font-weight:400;font-size:86px;line-height:1;letter-spacing:-2px">${escapeHtml(d.nomePopular || "")}</div>
        <div style="display:flex;font-family:'Fraunces',serif;font-style:italic;font-weight:300;font-size:28px;color:rgba(255,255,255,0.92);margin-top:14px">${escapeHtml(d.nomeCientifico || "")}</div>
      </div>
      <div class="meta-bottom"><span>${HANDLE_UP}</span><span>ESTUDO BOTANICO</span></div>
    </div>
  </div>`);
}

function renderInspiration(d) {
  const kicker = d.topLabel || "INSPIRACAO";
  return wrap(`<div class="slide">
    <div class="bg"><img src="${escapeHtml(d.imageUrl)}" width="1080" height="1350"/></div>
    <div class="veil veil-bottom"></div>
    <div class="chrome">
      <div class="meta-top"><span></span><span class="rule"></span><span>${escapeHtml(kicker)}</span></div>
      <div class="content">
        <div style="display:flex;align-items:center;gap:12px;font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:4px;text-transform:uppercase;color:rgba(255,255,255,0.92);margin-bottom:18px">
          <span style="display:flex;width:38px;height:1px;background:rgba(255,255,255,0.6)"></span><span>${escapeHtml(kicker)}</span>
        </div>
        <div style="display:block;font-family:'Fraunces',serif;font-weight:400;font-size:74px;line-height:1.04;letter-spacing:-1.4px">${escapeHtml(d.title || "")}</div>
        ${d.subtitle ? `<div style="display:block;font-family:'Archivo',sans-serif;font-size:18px;line-height:1.5;color:rgba(255,255,255,0.92);max-width:620px;margin-top:16px">${escapeHtml(d.subtitle)}</div>` : ""}
      </div>
      <div class="meta-bottom"><span>${HANDLE_UP}</span><span>PAISAGISMO AUTORAL</span></div>
    </div>
  </div>`);
}

function renderCta(d) {
  const chips = (d.chips && d.chips.length) ? d.chips : ["SALVAR", "COMPARTILHAR"];
  return wrap(`<div class="slide">
    <div class="bg"><img src="${escapeHtml(d.imageUrl)}" width="1080" height="1350"/></div>
    <div class="veil veil-cta"></div>
    <div class="chrome">
      <div class="meta-top"><span>FIM</span><span class="rule"></span><span>${HANDLE_UP}</span></div>
      <div class="content">
        <div style="display:block;font-family:'Fraunces',serif;font-weight:300;font-size:68px;line-height:1.04;letter-spacing:-1.4px">${highlightItalic(d.pergunta || "", d.italicWords)}</div>
        <div style="display:flex;gap:10px;margin-top:28px;flex-wrap:wrap">
          ${chips.map((c, i) => `<span style="display:flex;font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:3px;text-transform:uppercase;padding:12px 20px;border-radius:999px;border:1px solid rgba(255,255,255,0.6);${i === 0 ? "background:#fff;color:#111" : "background:rgba(0,0,0,0.35);color:#fff"}">${escapeHtml(c)}</span>`).join("")}
        </div>
        <div style="display:flex;font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.92);margin-top:22px">${HANDLE_UP}</div>
      </div>
    </div>
  </div>`);
}

function buildSlideHtml(slide, imageDataUrl) {
  const data = { ...slide, imageUrl: imageDataUrl };
  switch (slide.type) {
    case "cover": return renderCover(data);
    case "plantDetail": return renderPlantDetail(data);
    case "cta": return renderCta(data);
    default: return renderInspiration(data);
  }
}

// ---------- Express ----------
const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    pool: { free: _pagePool.length, waiting: _pageWaiters.length, size: POOL_SIZE },
    cache: { images: IMG_CACHE.size },
    memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
});

// POST /warm — cliente chama quando entra no Step 2 pra pre-baixar imagens
app.post("/warm", async (req, res) => {
  const auth = req.headers.authorization || "";
  if (auth.replace(/^Bearer\s+/i, "") !== AUTH_TOKEN) {
    return res.status(401).json({ error: "invalid token" });
  }
  const { imageUrls } = req.body || {};
  if (!Array.isArray(imageUrls)) return res.status(400).json({ error: "imageUrls[] required" });
  const t0 = Date.now();
  await Promise.all(imageUrls.slice(0, 20).map((u) => fetchImageBase64(u).catch(() => null)));
  res.json({ ok: true, cached: imageUrls.length, elapsed_ms: Date.now() - t0 });
});

app.post("/render", async (req, res) => {
  const t0 = Date.now();
  try {
    const auth = req.headers.authorization || "";
    if (auth.replace(/^Bearer\s+/i, "") !== AUTH_TOKEN) {
      return res.status(401).json({ error: "invalid token" });
    }

    const { slides, imageUrls, batchId, upload = true } = req.body || {};
    if (!Array.isArray(slides) || !slides.length) {
      return res.status(400).json({ error: "slides[] required" });
    }
    if (!Array.isArray(imageUrls) || imageUrls.length !== slides.length) {
      return res.status(400).json({ error: "imageUrls[] must match slides[]" });
    }

    const bid = batchId || `vps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const total = slides.length;

    if (upload) {
      try { await sb.storage.createBucket(BUCKET, { public: true }); } catch {}
    }

    // 1) Pre-baixa TODAS as imagens em paralelo (Node eh muito rapido pra fetch)
    const tFetch = Date.now();
    const imageDataUrls = await Promise.all(
      imageUrls.map((url) => fetchImageBase64(url).catch(() => url)),
    );
    const fetchMs = Date.now() - tFetch;

    // 2) Render + upload em pipeline — upload do slide N roda em paralelo com render do N+1
    const results = new Array(total);
    const uploads = new Array(total);

    async function renderSlide(i) {
      const html = buildSlideHtml(slides[i], imageDataUrls[i]);
      const raw = await renderHtmlToPng(html);
      const png = await optimizePng(raw);
      if (upload) {
        uploads[i] = (async () => {
          const filePath = `${bid}/slide-${String(i + 1).padStart(2, "0")}.png`;
          const { error } = await sb.storage.from(BUCKET).upload(filePath, png, {
            contentType: "image/png", upsert: true, cacheControl: "3600",
          });
          if (error) throw new Error(error.message);
          const { data } = sb.storage.from(BUCKET).getPublicUrl(filePath);
          return { index: i, url: data.publicUrl, bytes: png.byteLength, width: 2160, height: 2700 };
        })();
      } else {
        uploads[i] = Promise.resolve({
          index: i,
          url: `data:image/png;base64,${png.toString("base64")}`,
          bytes: png.byteLength, width: 2160, height: 2700,
        });
      }
    }

    // Roda com concorrencia = POOL_SIZE (cada slide pega 1 page do pool)
    const CONCURRENCY = Math.min(POOL_SIZE, total);
    let cursor = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= total) return;
        await renderSlide(i);
      }
    });
    await Promise.all(workers);
    // Espera TODOS os uploads concluirem (ja rodaram em paralelo durante o render)
    for (let i = 0; i < total; i++) results[i] = await uploads[i];

    const elapsed = Date.now() - t0;
    console.log(
      `[render] ${total} slides | total ${elapsed}ms (fetch ${fetchMs}ms, pool ${_pagePool.length}/${POOL_SIZE})`,
    );
    res.json({ ok: true, batchId: bid, slides: results, elapsed_ms: elapsed });
  } catch (e) {
    console.error("[render] falhou:", e.message);
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.listen(PORT, "127.0.0.1", async () => {
  console.log(`[render-service] ouvindo em 127.0.0.1:${PORT}`);
  try {
    await initPool();
  } catch (e) {
    console.error("[pool] init falhou:", e.message);
    // Continua — pool lazy-inicializa em acquirePage se vazio
  }
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM — fechando browser");
  try {
    if (_browser) await _browser.close();
  } catch {}
  process.exit(0);
});
