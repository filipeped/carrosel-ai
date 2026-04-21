// Carrosel AI — Render Service (VPS)
// Roda Puppeteer FULL (sem @sparticuz/chromium), sem cold start, sem timeout de 60s.
// Express recebe POST /render, valida bearer token, renderiza slides em paralelo
// e sobe PNG otimizado pro Supabase Storage. Retorna URLs publicas.

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

if (!AUTH_TOKEN) { console.error("RENDER_AUTH_TOKEN obrigatorio"); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error("Supabase env vars obrigatorias"); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- Fontes em base64 (inline no HTML, zero CORS) ----------
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

// ---------- Browser singleton (reutiliza entre requests) ----------
let _browserPromise = null;
async function getBrowser() {
  if (_browserPromise) {
    try {
      const b = await _browserPromise;
      if (b.connected) return b;
    } catch {
      // cai pro relaunch
    }
  }
  _browserPromise = puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--disable-web-security",
      "--font-render-hinting=none",
    ],
  });
  return _browserPromise;
}

// ---------- Render ----------
async function renderHtmlToPng(html, { width = 1080, height = 1350, scale = 2 } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          if (document.fonts?.ready) {
            document.fonts.ready.then(() => resolve()).catch(() => resolve());
          } else {
            resolve();
          }
        }),
    );
    const buf = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width, height },
    });
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  } finally {
    await page.close().catch(() => {});
  }
}

async function optimizePng(buf) {
  try {
    return await sharp(buf)
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false, effort: 6 })
      .toBuffer();
  } catch {
    return buf;
  }
}

// ---------- Templates (inline — sem dependencia do build Next) ----------
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

function buildSlideHtml(slide, imageUrl) {
  const data = { ...slide, imageUrl };
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
  res.json({ ok: true, uptime: process.uptime() });
});

app.post("/render", async (req, res) => {
  const t0 = Date.now();
  try {
    // Auth
    const auth = req.headers.authorization || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (token !== AUTH_TOKEN) {
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
      try {
        await sb.storage.createBucket(BUCKET, { public: true });
      } catch {
        // ja existe
      }
    }

    // Concorrencia: VPS aguenta mais que serverless. 4 em paralelo cabe bem em 16GB/4vCPU.
    const CONCURRENCY = 4;
    const results = new Array(total);
    let cursor = 0;

    async function renderOne(i) {
      const html = buildSlideHtml(slides[i], imageUrls[i]);
      const raw = await renderHtmlToPng(html, { width: 1080, height: 1350, scale: 2 });
      const png = await optimizePng(raw);
      let url;
      if (upload) {
        const filePath = `${bid}/slide-${String(i + 1).padStart(2, "0")}.png`;
        const { error } = await sb.storage.from(BUCKET).upload(filePath, png, {
          contentType: "image/png",
          upsert: true,
          cacheControl: "3600",
        });
        if (error) throw new Error(error.message);
        const { data } = sb.storage.from(BUCKET).getPublicUrl(filePath);
        url = data.publicUrl;
      } else {
        url = `data:image/png;base64,${png.toString("base64")}`;
      }
      results[i] = { index: i, url, bytes: png.byteLength, width: 2160, height: 2700 };
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= total) return;
        await renderOne(i);
      }
    });
    await Promise.all(workers);

    const elapsed = Date.now() - t0;
    console.log(`[render] ${total} slides em ${elapsed}ms`);
    res.json({
      ok: true,
      batchId: bid,
      slides: results,
      elapsed_ms: elapsed,
    });
  } catch (e) {
    console.error("[render] falhou:", e.message);
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[render-service] ouvindo em 127.0.0.1:${PORT}`);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM — fechando browser");
  if (_browserPromise) {
    try {
      (await _browserPromise).close();
    } catch {}
  }
  process.exit(0);
});
