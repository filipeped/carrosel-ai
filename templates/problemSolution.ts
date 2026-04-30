import { baseStyle, BRAND_HANDLE } from "./base";
import { escapeHtml } from "../lib/utils";

export type ProblemSolutionData = {
  imageUrl: string;
  problema: string;
  solucao: string;
  index?: number;
  total?: number;
};

export function renderProblemSolution(d: ProblemSolutionData, fontsBaseUrl = ""): string {
  const handleUpper = (BRAND_HANDLE || "").replace(/^@/, "").toUpperCase();
  const idx = d.index ? String(d.index).padStart(2, "0") : "";
  const total = d.total ? String(d.total).padStart(2, "0") : "";
  const indexLabel = idx && total ? `${idx} / ${total}` : idx || "";

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
${baseStyle(fontsBaseUrl)}
.ps-stack {
  display: flex; flex-direction: column; gap: 22px;
  width: 100%;
}
.ps-card {
  display: flex; flex-direction: column;
  padding: 30px 32px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.18);
}
.ps-card.problema {
  background: rgba(54, 18, 18, 0.9);
}
.ps-card.solucao {
  background: rgba(214, 231, 196, 0.95);
  color: #0a0d0b;
}
.ps-tag {
  display: flex; align-items: center; gap: 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px; letter-spacing: 5px; text-transform: uppercase;
  margin-bottom: 14px;
}
.ps-card.problema .ps-tag { color: rgba(255,255,255,0.88); }
.ps-card.solucao .ps-tag { color: rgba(10,13,11,0.85); }
.ps-icon {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%;
  font-family: 'Archivo', sans-serif; font-weight: 700;
  font-size: 14px; line-height: 1;
}
.ps-card.problema .ps-icon {
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.55);
  color: #fff;
}
.ps-card.solucao .ps-icon {
  background: rgba(10,13,11,0.12);
  border: 1px solid rgba(10,13,11,0.55);
  color: #0a0d0b;
}
.ps-text {
  display: block;
  font-family: 'Fraunces', serif; font-weight: 400;
  font-size: 32px; line-height: 1.18; letter-spacing: -0.4px;
}
.ps-card.problema .ps-text { color: #fff; }
.ps-card.solucao .ps-text { color: #0a0d0b; }
</style></head><body><div class="slide">
  <div class="bg"><img src="${escapeHtml(d.imageUrl)}" width="1080" height="1350"/></div>
  <div class="veil veil-cover"></div>
  <div class="chrome">
    <div class="meta-top">
      <span>${escapeHtml(indexLabel || "")}</span>
      <span class="rule"></span>
      <span>DIAGNOSTICO</span>
    </div>
    <div class="content">
      <div class="ps-stack">
        <div class="ps-card problema">
          <div class="ps-tag">
            <span class="ps-icon">x</span>
            <span>PROBLEMA</span>
          </div>
          <div class="ps-text">${escapeHtml(d.problema || "")}</div>
        </div>
        <div class="ps-card solucao">
          <div class="ps-tag">
            <span class="ps-icon">v</span>
            <span>SOLUCAO</span>
          </div>
          <div class="ps-text">${escapeHtml(d.solucao || "")}</div>
        </div>
      </div>
    </div>
    <div class="meta-bottom">
      <span>${escapeHtml(handleUpper)}</span>
      <span>PAISAGISMO INTEGRADO</span>
    </div>
  </div>
</div></body></html>`;
}
