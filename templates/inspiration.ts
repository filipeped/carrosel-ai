import { baseStyle, BRAND_HANDLE } from "./base";
import { escapeHtml } from "../lib/utils";

export type InspirationData = {
  imageUrl: string;
  title: string;
  subtitle?: string;
  topLabel?: string;
  index?: number;
  total?: number;
};

export function renderInspiration(d: InspirationData, fontsBaseUrl = ""): string {
  const handleUpper = (BRAND_HANDLE || "").replace(/^@/, "").toUpperCase();
  const idx = d.index ? String(d.index).padStart(2, "0") : "";
  const total = d.total ? String(d.total).padStart(2, "0") : "";
  const indexLabel = idx && total ? `${idx} / ${total}` : idx || "";
  const kicker = d.topLabel || "INSPIRACAO";

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
${baseStyle(fontsBaseUrl)}
.insp-kicker {
  display: flex; align-items: center; gap: 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px; letter-spacing: 4px; text-transform: uppercase;
  color: rgba(255,255,255,0.92);
  margin-bottom: 18px;
}
.insp-kicker .line {
  display: flex; width: 38px; height: 1px; background: rgba(255,255,255,0.6);
}
.insp-title {
  display: flex;
  font-family: 'Fraunces', serif; font-weight: 400;
  font-size: 74px; line-height: 1.0; letter-spacing: -1.4px;
  color: #fff;
}
.insp-title em { font-style: italic; font-weight: 300; color: #d6e7c4; }
.insp-sub {
  display: flex;
  font-family: 'Archivo', sans-serif;
  font-size: 18px; line-height: 1.5;
  color: rgba(255,255,255,0.92);
  max-width: 620px;
  margin-top: 16px;
}
</style></head><body><div class="slide">
  <div class="bg"><img src="${escapeHtml(d.imageUrl)}" width="1080" height="1350"/></div>
  <div class="veil veil-bottom"></div>
  <div class="chrome">
    <div class="meta-top">
      <span>${escapeHtml(indexLabel || "")}</span>
      <span class="rule"></span>
      <span>${escapeHtml(kicker)}</span>
    </div>
    <div class="content">
      <div class="insp-kicker">
        <span class="line"></span>
        <span>${escapeHtml(kicker)}</span>
      </div>
      <div class="insp-title">${escapeHtml(d.title || "")}</div>
      ${d.subtitle ? `<div class="insp-sub">${escapeHtml(d.subtitle)}</div>` : ""}
    </div>
    <div class="meta-bottom">
      <span>${escapeHtml(handleUpper)}</span>
      <span>PAISAGISMO AUTORAL</span>
    </div>
  </div>
</div></body></html>`;
}
