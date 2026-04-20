import { baseStyle, BRAND_HANDLE } from "./base";
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
      `<span style="font-style:italic;font-weight:300;color:#d6e7c4">${safe}</span>`,
    );
  });
  return `<span style="display:contents">${out}</span>`;
}

export function renderCover(d: CoverData, fontsBaseUrl = ""): string {
  const topLabel = d.topLabel || "GUIA BOTANICO";
  const edition = d.edition || "ED. 01";
  const handleUpper = (BRAND_HANDLE || "").replace(/^@/, "").toUpperCase();
  const safeNumeral =
    d.numeral && /^\d{1,2}$/.test(String(d.numeral).trim()) ? String(d.numeral).trim() : "";

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
${baseStyle(fontsBaseUrl)}
.num-row {
  display: flex;
  align-items: flex-end;
  gap: 36px;
  width: 100%;
}
.cover-number {
  display: flex;
  font-family: 'Fraunces', serif; font-weight: 300; font-style: italic;
  font-size: 240px; line-height: 0.85;
  color: #fff; letter-spacing: -6px;
}
.text-col {
  display: flex; flex-direction: column; justify-content: flex-end;
  flex: 1;
}
.cover-sm {
  display: flex;
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px; letter-spacing: 4px; text-transform: uppercase;
  color: rgba(255,255,255,0.9);
  margin-bottom: 16px;
}
.cover-head {
  display: flex; flex-wrap: wrap;
  
  font-family: 'Fraunces', serif; font-weight: 400;
  font-size: 68px; line-height: 1.04; letter-spacing: -1px;
  color: #fff;
}
.swipe {
  display: flex; align-items: center; gap: 14px;
  margin-top: 32px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px; letter-spacing: 4px; text-transform: uppercase;
  color: #fff;
}
.swipe .arrow-line {
  display: flex; width: 44px; height: 1px; background: #fff;
}
</style></head><body><div class="slide">
  <div class="bg"><img src="${escapeHtml(d.imageUrl)}" width="1080" height="1350"/></div>
  <div class="veil veil-cover"></div>
  <div class="chrome">
    <div class="meta-top">
      <span>${escapeHtml(edition)}</span>
      <span class="rule"></span>
      <span>${escapeHtml(handleUpper)}</span>
    </div>
    <div class="content">
      <div class="num-row">
        ${safeNumeral ? `<div class="cover-number">${escapeHtml(safeNumeral)}</div>` : ""}
        <div class="text-col">
          <div class="cover-sm">${escapeHtml(topLabel)}</div>
          <div class="cover-head">${highlightItalic(d.title, d.italicWords)}</div>
        </div>
      </div>
      <div class="swipe">
        <span>Arraste</span>
        <span class="arrow-line"></span>
      </div>
    </div>
  </div>
</div></body></html>`;
}
