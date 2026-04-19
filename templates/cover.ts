import { baseStyle, BRAND_HANDLE, FONTS_LINK } from "./base";
import { escapeHtml } from "../lib/utils";

export type CoverData = {
  imageUrl: string;
  topLabel?: string;
  numeral?: string;
  title: string;
  italicWords?: string[];
  edition?: string;
};

function highlightItalic(title: string, italicWords: string[] = []): string {
  if (!italicWords.length) return escapeHtml(title);
  let out = escapeHtml(title);
  italicWords.forEach((w) => {
    const safe = escapeHtml(w);
    out = out.replace(
      new RegExp(`\\b${safe.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "gi"),
      `<em>${safe}</em>`,
    );
  });
  return out;
}

export function renderCover(d: CoverData, fontsBaseUrl = ""): string {
  const topLabel = d.topLabel || "GUIA BOTANICO";
  const edition = d.edition || "";
  const handleUpper = (BRAND_HANDLE || "").replace(/^@/, "");
  return `<!doctype html><html><head><meta charset="utf-8"/>${FONTS_LINK}<style>
${baseStyle(fontsBaseUrl)}
.cover .chrome { padding: 75px 68px 110px; justify-content: flex-end; }
.number-grid {
  display:grid;
  grid-template-columns: auto 1fr;
  column-gap: 32px;
  align-items: end;
  width: 100%;
}
.cover-number {
  grid-column: 1; grid-row: 1 / span 2;
  align-self: end;
  font-family: var(--serif); font-weight: 300; font-style: italic;
  font-size: 240px; line-height: .78;
  color: #fff;
  letter-spacing: -.04em;
  text-shadow: 0 4px 28px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.55);
  transform: translateY(10px);
}
.cover-sm {
  grid-column:2; grid-row:1;
  font-family: var(--mono);
  font-size: 15px; letter-spacing: .22em; text-transform: uppercase;
  color: rgba(255,255,255,.88);
  text-shadow: 0 1px 6px rgba(0,0,0,.6);
  margin-bottom: 14px;
}
.cover-head {
  grid-column:2; grid-row:2;
  font-family: var(--serif); font-weight: 400;
  font-size: 68px; line-height: 1.02;
  letter-spacing: -.015em;
  color: #fff;
  text-shadow: 0 2px 16px rgba(0,0,0,.55), 0 1px 3px rgba(0,0,0,.55);
}
.cover-head em {
  font-style: italic; color: var(--accent); font-weight: 300;
}
.swipe {
  margin-top: 28px;
  display:inline-flex; align-items:center; gap: 12px;
  font-family: var(--mono);
  font-size: 13px; letter-spacing: .24em; text-transform: uppercase;
  color: #fff;
  text-shadow: 0 1px 6px rgba(0,0,0,.5);
}
.swipe .arrow {
  width: 42px; height: 1px; background:#fff; position:relative;
}
.swipe .arrow::after {
  content:""; position:absolute; right:0; top:-4px;
  width:8px; height:8px;
  border-right:1px solid #fff; border-top:1px solid #fff;
  transform: rotate(45deg);
}
</style></head><body><div class="slide cover">
  <div class="bg"><img src="${escapeHtml(d.imageUrl)}" crossorigin="anonymous"/></div>
  <div class="color-grade"></div>
  <div class="veil veil-cover"></div>
  <div class="chrome">
    <div class="meta-top">
      <span class="idx">${escapeHtml(edition || "ED. 01")}</span>
      <span class="rule"></span>
      <span>${escapeHtml(handleUpper.toUpperCase())}</span>
    </div>
    <div class="content">
      <div class="number-grid">
        ${d.numeral ? `<div class="cover-number">${escapeHtml(d.numeral)}</div>` : ""}
        <div class="cover-sm">${escapeHtml(topLabel)}</div>
        <div class="cover-head">${highlightItalic(d.title, d.italicWords)}</div>
      </div>
      <div class="swipe">Arraste<span class="arrow"></span></div>
    </div>
  </div>
</div></body></html>`;
}
