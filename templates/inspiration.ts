import { baseStyle, BRAND_HANDLE } from "./base";
import { escapeHtml } from "../lib/utils";

export type InspirationData = {
  imageUrl: string;
  title: string;            // ex.: "Sombra que aconchega"
  subtitle?: string;        // ex.: "Jardim pequeno, efeito de refugio"
  topLabel?: string;        // ex.: "INSPIRACAO  03"
};

export function renderInspiration(d: InspirationData, fontsBaseUrl = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
${baseStyle(fontsBaseUrl)}
.text-wrap {
  position: absolute; left: 60px; bottom: 120px; right: 60px;
}
.title {
  font-family: 'Playfair', serif;
  font-weight: 400;
  font-size: 86px;
  line-height: 0.95;
  color: #fff;
  letter-spacing: -1px;
}
.subtitle {
  font-family: 'Cormorant', 'Playfair', serif;
  font-style: italic;
  font-weight: 400;
  font-size: 32px;
  color: #fff; opacity: 0.9;
  margin-top: 16px;
}
.bottom-shadow {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.2) 45%, rgba(0,0,0,0.75) 100%);
}
</style></head><body><div class="slide">
<img class="bg" src="${escapeHtml(d.imageUrl)}" crossorigin="anonymous"/>
<div class="bottom-shadow"></div>
${d.topLabel ? `<div class="top-label">${escapeHtml(d.topLabel)}</div>` : ""}
<div class="text-wrap">
  <div class="title">${escapeHtml(d.title)}</div>
  ${d.subtitle ? `<div class="subtitle">${escapeHtml(d.subtitle)}</div>` : ""}
</div>
<div class="handle">${escapeHtml(BRAND_HANDLE)}</div>
</div></body></html>`;
}
