import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Carrega fontes self-hosted (/public/fonts/*.woff2) como data URLs base64
 * pra embed direto no <style> do HTML renderizado pelo Puppeteer.
 *
 * Zero dependencia de CORS, zero fetch de rede, funciona igual em qualquer
 * ambiente (local, Vercel serverless, container).
 */

const FONT_FILES = {
  "Fraunces-Light": "Fraunces-Light.woff2",
  "Fraunces-Regular": "Fraunces-Regular.woff2",
  "Fraunces-Italic": "Fraunces-Italic.woff2",
  "Fraunces-LightItalic": "Fraunces-LightItalic.woff2",
  "Archivo-Regular": "Archivo-Regular.woff2",
  "Archivo-Medium": "Archivo-Medium.woff2",
  "JetBrainsMono-Regular": "JetBrainsMono-Regular.woff2",
} as const;

let _cached: string | null = null;

/**
 * @font-face block com todas as fontes embutidas em base64.
 * Memoizado — so le do disco uma vez por process.
 */
export function getFontFaceCss(): string {
  if (_cached) return _cached;
  const dir = path.join(process.cwd(), "public", "fonts");
  const load = (name: keyof typeof FONT_FILES) => {
    const buf = readFileSync(path.join(dir, FONT_FILES[name]));
    return buf.toString("base64");
  };
  const F = (family: string, weight: number, style: string, b64: string) =>
    `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};` +
    `src:url(data:font/woff2;base64,${b64}) format('woff2');font-display:block}`;
  _cached = [
    F("Fraunces", 300, "normal", load("Fraunces-Light")),
    F("Fraunces", 400, "normal", load("Fraunces-Regular")),
    F("Fraunces", 300, "italic", load("Fraunces-LightItalic")),
    F("Fraunces", 400, "italic", load("Fraunces-Italic")),
    F("Archivo", 400, "normal", load("Archivo-Regular")),
    F("Archivo", 500, "normal", load("Archivo-Medium")),
    F("JetBrains Mono", 400, "normal", load("JetBrainsMono-Regular")),
  ].join("");
  return _cached;
}
