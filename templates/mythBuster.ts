import { baseStyle, BRAND_HANDLE } from "./base";
import { escapeHtml } from "../lib/utils";

export type MythBusterData = {
  imageUrl: string;
  mito: string;
  verdade: string;
  index?: number;
  total?: number;
};

export function renderMythBuster(d: MythBusterData, fontsBaseUrl = ""): string {
  const handleUpper = (BRAND_HANDLE || "").replace(/^@/, "").toUpperCase();
  const idx = d.index ? String(d.index).padStart(2, "0") : "";
  const total = d.total ? String(d.total).padStart(2, "0") : "";
  const indexLabel = idx && total ? `${idx} / ${total}` : idx || "";

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
${baseStyle(fontsBaseUrl)}
.mb-stack {
  display: flex; flex-direction: column; gap: 24px;
  width: 100%;
}
.mb-card {
  display: flex; flex-direction: column;
  padding: 30px 32px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.18);
}
.mb-card.mito {
  background: rgba(60, 22, 22, 0.88);
}
.mb-card.verdade {
  background: rgba(214, 231, 196, 0.94);
  color: #0a0d0b;
}
.mb-tag {
  display: flex; align-items: center; gap: 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px; letter-spacing: 5px; text-transform: uppercase;
  margin-bottom: 14px;
}
.mb-card.mito .mb-tag { color: rgba(255,255,255,0.85); }
.mb-card.verdade .mb-tag { color: rgba(10,13,11,0.85); }
.mb-icon {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 50%;
  font-family: 'Archivo', sans-serif; font-weight: 700;
  font-size: 16px; line-height: 1;
}
.mb-card.mito .mb-icon {
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.6);
  color: #fff;
}
.mb-card.verdade .mb-icon {
  background: rgba(10,13,11,0.15);
  border: 1px solid rgba(10,13,11,0.6);
  color: #0a0d0b;
}
.mb-text {
  display: block;
  font-family: 'Fraunces', serif; font-weight: 400;
  font-size: 34px; line-height: 1.18; letter-spacing: -0.4px;
}
.mb-card.mito .mb-text { color: #fff; }
.mb-card.verdade .mb-text { color: #0a0d0b; }
</style></head><body><div class="slide">
  <div class="bg"><img src="${escapeHtml(d.imageUrl)}" width="1080" height="1350"/></div>
  <div class="veil veil-cover"></div>
  <div class="chrome">
    <div class="meta-top">
      <span>${escapeHtml(indexLabel || "")}</span>
      <span class="rule"></span>
      <span>MITO E VERDADE</span>
    </div>
    <div class="content">
      <div class="mb-stack">
        <div class="mb-card mito">
          <div class="mb-tag">
            <span class="mb-icon">x</span>
            <span>MITO</span>
          </div>
          <div class="mb-text">${escapeHtml(d.mito || "")}</div>
        </div>
        <div class="mb-card verdade">
          <div class="mb-tag">
            <span class="mb-icon">v</span>
            <span>VERDADE</span>
          </div>
          <div class="mb-text">${escapeHtml(d.verdade || "")}</div>
        </div>
      </div>
    </div>
    <div class="meta-bottom">
      <span>${escapeHtml(handleUpper)}</span>
      <span>PAISAGISMO REAL</span>
    </div>
  </div>
</div></body></html>`;
}
