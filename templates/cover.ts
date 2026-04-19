import { baseStyle, BRAND_HANDLE } from "./base";
import { escapeHtml } from "../lib/utils";

export type CoverData = {
  imageUrl: string;
  topLabel?: string;      // ex.: "PLANTAS QUE TODO"
  numeral?: string;       // ex.: "4"
  title: string;          // ex.: "jardim de alto padrao tem"
  italicWords?: string[]; // palavras do title pra renderizar em italico
  edition?: string;       // ex.: "GUIA BOTANICO  ED. 02"
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

export function renderCover(d: CoverData, fontsBaseUrl = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
${baseStyle(fontsBaseUrl)}
.cover-wrap {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  padding: 120px 80px 120px 80px;
  justify-content: center;
}
.micro {
  font-family: 'Playfair', serif;
  font-size: 18px;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: #fff;
  opacity: 0.92;
  margin-bottom: 12px;
  text-shadow: 0 1px 6px rgba(0,0,0,0.5);
}
.title-line {
  display: flex;
  align-items: flex-start;
  gap: 28px;
}
.numeral {
  font-family: 'Playfair', serif;
  font-weight: 400;
  font-size: 260px;
  line-height: 0.82;
  color: #fff;
  text-shadow: 0 3px 22px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.55);
}
.headline {
  font-family: 'Playfair', serif;
  font-weight: 400;
  font-size: 90px;
  line-height: 0.95;
  color: #fff;
  padding-top: 68px;
  letter-spacing: -1px;
  text-shadow: 0 2px 14px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.55);
}
.headline i { font-family: 'Cormorant', 'Playfair', serif; font-style: italic; font-weight: 400; }
.edition {
  position: absolute; bottom: 42px; left: 60px;
  font-family: 'Playfair', serif;
  font-size: 18px; letter-spacing: 4px;
  text-transform: uppercase; color: #fff; opacity: 0.9;
  text-shadow: 0 1px 6px rgba(0,0,0,0.5);
}
</style></head><body><div class="slide">
<img class="bg" src="${escapeHtml(d.imageUrl)}" crossorigin="anonymous"/>
<div class="vignette"></div>
<div class="side-shadow"></div>
<div class="cover-wrap">
  ${d.topLabel ? `<div class="micro">${escapeHtml(d.topLabel)}</div>` : ""}
  <div class="title-line">
    ${d.numeral ? `<div class="numeral">${escapeHtml(d.numeral)}</div>` : ""}
    <div class="headline">${highlightItalic(d.title, d.italicWords)}</div>
  </div>
</div>
${d.edition ? `<div class="edition">${escapeHtml(d.edition)}</div>` : ""}
<div class="handle">${escapeHtml(BRAND_HANDLE)}</div>
</div></body></html>`;
}
