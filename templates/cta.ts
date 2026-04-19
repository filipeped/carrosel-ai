import { baseStyle, BRAND_HANDLE } from "./base";
import { escapeHtml } from "../lib/utils";

export type CtaData = {
  imageUrl: string;
  pergunta: string;        // ex.: "Qual delas entra na sua casa?"
  italicWords?: string[];
};

function highlightItalic(title: string, italicWords: string[] = []): string {
  if (!italicWords.length) return escapeHtml(title);
  let out = escapeHtml(title);
  italicWords.forEach((w) => {
    const safe = escapeHtml(w);
    out = out.replace(
      new RegExp(`\\b${safe.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "gi"),
      `<i>${safe}</i>`,
    );
  });
  return out;
}

export function renderCta(d: CtaData, fontsBaseUrl = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
${baseStyle(fontsBaseUrl)}
.text-wrap {
  position: absolute; left: 60px; top: 460px; right: 60px;
}
.pergunta {
  font-family: 'Playfair', serif;
  font-weight: 400;
  font-size: 96px;
  line-height: 0.98;
  color: #fff;
  letter-spacing: -1px;
}
.pergunta i { font-family: 'Cormorant', 'Playfair', serif; font-style: italic; font-weight: 400; }
.side-shadow-strong {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.2) 55%, rgba(0,0,0,0) 75%);
}
</style></head><body><div class="slide">
<img class="bg" src="${escapeHtml(d.imageUrl)}" crossorigin="anonymous"/>
<div class="side-shadow-strong"></div>
<div class="text-wrap">
  <div class="pergunta">${highlightItalic(d.pergunta, d.italicWords)}</div>
</div>
<div class="handle">${escapeHtml(BRAND_HANDLE)}</div>
</div></body></html>`;
}
