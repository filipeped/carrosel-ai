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
  const handleUpper = (BRAND_HANDLE || "").replace(/^@/, "");
  const idx = d.index ? String(d.index).padStart(2, "0") : "";
  const total = d.total ? String(d.total).padStart(2, "0") : "";
  const indexLabel = idx && total ? `${idx} / ${total}` : idx || "";
  const kicker = d.topLabel || "INSPIRACAO";

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
${baseStyle(fontsBaseUrl)}
.insp .content { max-width: 84%; }
.insp-title {
  font-family: var(--serif); font-weight: 400;
  font-size: 74px; line-height: 1.0;
  letter-spacing: -.02em;
  color: #fff;
  text-shadow:
    0 2px 30px rgba(0,0,0,.80),
    0 1px 3px rgba(0,0,0,.6);
}
.insp-title em { font-style: italic; font-weight: 300; color: var(--accent); }
.insp-sub {
  font-family: var(--sans);
  font-size: 18px; line-height: 1.5;
  color: rgba(255,255,255,.92);
  max-width: 42ch; margin-top: 16px;
  text-shadow: 0 2px 14px rgba(0,0,0,.80), 0 1px 3px rgba(0,0,0,.6);
}
.insp-kicker {
  display: inline-flex; align-items: center; gap: 12px;
  font-family: var(--mono);
  font-size: 13px; letter-spacing: .24em; text-transform: uppercase;
  color: rgba(255,255,255,.92);
  text-shadow: 0 1px 6px rgba(0,0,0,.6);
  margin-bottom: 18px;
}
.insp-kicker .line { width: 36px; height: 1px; background: rgba(255,255,255,.6); display: block; }
</style></head><body><div class="slide insp">
  <div class="bg"><img src="${escapeHtml(d.imageUrl)}" crossorigin="anonymous"/></div>
  <div class="veil veil-bottom"></div>
  <div class="chrome">
    <div class="meta-top">
      <span class="idx">${escapeHtml(indexLabel)}</span>
      <span class="rule"></span>
      <span>${escapeHtml(kicker)}</span>
    </div>
    <div class="content">
      <div class="insp-kicker"><span class="line"></span>${escapeHtml(kicker)}</div>
      <h1 class="insp-title">${escapeHtml(d.title || "")}</h1>
      ${d.subtitle ? `<p class="insp-sub">${escapeHtml(d.subtitle)}</p>` : ""}
    </div>
    <div class="meta-bottom">
      <span>${escapeHtml(handleUpper.toUpperCase())}</span>
      <span>PAISAGISMO AUTORAL</span>
    </div>
  </div>
</div></body></html>`;
}
