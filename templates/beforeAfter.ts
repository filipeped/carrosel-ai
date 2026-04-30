import { baseStyle, BRAND_HANDLE } from "./base";
import { escapeHtml } from "../lib/utils";

export type BeforeAfterPhase = "ANTES" | "DEPOIS" | "PROCESSO";

export type BeforeAfterData = {
  imageUrl: string;
  phase: BeforeAfterPhase;
  caption?: string;
  index?: number;
  total?: number;
};

const PHASE_PALETTE: Record<BeforeAfterPhase, { bg: string; ink: string; border: string }> = {
  ANTES: { bg: "rgba(76, 50, 30, 0.92)", ink: "#f1ede3", border: "rgba(241, 237, 227, 0.5)" },
  PROCESSO: { bg: "rgba(20, 32, 24, 0.88)", ink: "#f1ede3", border: "rgba(241, 237, 227, 0.45)" },
  DEPOIS: { bg: "rgba(214, 231, 196, 0.95)", ink: "#0a0d0b", border: "rgba(10, 13, 11, 0.5)" },
};

export function renderBeforeAfter(d: BeforeAfterData, fontsBaseUrl = ""): string {
  const handleUpper = (BRAND_HANDLE || "").replace(/^@/, "").toUpperCase();
  const idx = d.index ? String(d.index).padStart(2, "0") : "";
  const total = d.total ? String(d.total).padStart(2, "0") : "";
  const indexLabel = idx && total ? `${idx} / ${total}` : idx || "";
  const palette = PHASE_PALETTE[d.phase] || PHASE_PALETTE.PROCESSO;

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
${baseStyle(fontsBaseUrl)}
.phase-badge {
  display: flex; align-items: center; gap: 12px;
  align-self: flex-start;
  padding: 14px 22px;
  border-radius: 4px;
  background: ${palette.bg};
  border: 1px solid ${palette.border};
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px; letter-spacing: 6px; text-transform: uppercase;
  color: ${palette.ink};
  margin-bottom: 24px;
}
.phase-badge .dot {
  display: flex; width: 10px; height: 10px; border-radius: 50%;
  background: ${palette.ink};
}
.ba-caption {
  display: block;
  font-family: 'Fraunces', serif; font-weight: 400;
  font-size: 56px; line-height: 1.06; letter-spacing: -1px;
  color: #fff;
  max-width: 720px;
}
</style></head><body><div class="slide">
  <div class="bg"><img src="${escapeHtml(d.imageUrl)}" width="1080" height="1350"/></div>
  <div class="veil veil-bottom"></div>
  <div class="chrome">
    <div class="meta-top">
      <span>${escapeHtml(indexLabel || "")}</span>
      <span class="rule"></span>
      <span>TRANSFORMACAO</span>
    </div>
    <div class="content">
      <div class="phase-badge">
        <span class="dot"></span>
        <span>${escapeHtml(d.phase)}</span>
      </div>
      ${d.caption ? `<div class="ba-caption">${escapeHtml(d.caption)}</div>` : ""}
    </div>
    <div class="meta-bottom">
      <span>${escapeHtml(handleUpper)}</span>
      <span>PROJETO 3D</span>
    </div>
  </div>
</div></body></html>`;
}
