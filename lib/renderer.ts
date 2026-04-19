// Renderer 100% serverless — Satori (HTML+CSS -> SVG) + Resvg (SVG -> PNG).
// Sem Chromium, sem binarios nativos, zero ETXTBSY / libnss3.
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

let _fontsPromise: Promise<SatoriFont[]> | null = null;

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`font fetch failed ${r.status} ${url}`);
  return await r.arrayBuffer();
}

async function loadFonts(): Promise<SatoriFont[]> {
  if (_fontsPromise) return _fontsPromise;
  _fontsPromise = (async () => {
    // Fontes em .ttf (o formato que Satori aceita). Usa CDN jsdelivr fontsource.
    const base = "https://cdn.jsdelivr.net/fontsource/fonts";
    const [
      frauncesReg,
      frauncesIta,
      frauncesLight,
      frauncesLightIta,
      archivoReg,
      archivoMed,
      jbmReg,
    ] = await Promise.all([
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

export async function renderHtmlToPng(html: string): Promise<Buffer> {
  const fonts = await loadFonts();
  // satori-html converte string HTML em VNode React-like
  const markup = htmlToReact(html);
  const svg = await satori(markup as any, {
    width: 1080,
    height: 1350,
    fonts: fonts as any,
    embedFont: true,
  });
  // Resvg converte SVG em PNG
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
    font: { loadSystemFonts: false },
  });
  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}

export async function renderMany(htmls: string[]): Promise<Buffer[]> {
  // Pode ser paralelo — Satori e puro JS, sem pressao de recursos.
  return Promise.all(htmls.map((h) => renderHtmlToPng(h)));
}

export async function closeBrowser() {
  // no-op — nao ha browser mais.
}
