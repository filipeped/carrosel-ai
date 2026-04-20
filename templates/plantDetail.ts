import { baseStyle, BRAND_HANDLE } from "./base";
import { escapeHtml } from "../lib/utils";

export type PlantDetailData = {
  imageUrl: string;
  nomePopular: string;
  nomeCientifico: string;
  index?: number;
  total?: number;
  careTips?: string[];
  caption?: string;
};

export function renderPlantDetail(d: PlantDetailData, fontsBaseUrl = ""): string {
  const handleUpper = (BRAND_HANDLE || "").replace(/^@/, "").toUpperCase();
  const idx = d.index ? String(d.index).padStart(2, "0") : "";
  const total = d.total ? String(d.total).padStart(2, "0") : "";
  const indexLabel = idx && total ? `${idx} / ${total}` : idx || "";

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
${baseStyle(fontsBaseUrl)}
.plant-num {
  display: flex;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px; letter-spacing: 4px; text-transform: uppercase;
  color: rgba(255,255,255,0.85);
  margin-bottom: 18px;
}
.plant-name {
  display: flex; flex-wrap: wrap;
  
  font-family: 'Fraunces', serif; font-weight: 400;
  font-size: 86px; line-height: 1; letter-spacing: -2px;
  color: #fff;
}
.plant-sci {
  display: flex;
  font-family: 'Fraunces', serif; font-style: italic; font-weight: 300;
  font-size: 28px;
  color: rgba(255,255,255,0.92);
  margin-top: 14px;
}
.plant-caption {
  display: flex;
  font-family: 'Archivo', sans-serif;
  font-size: 18px; line-height: 1.5;
  color: #fff;
  max-width: 560px;
  margin-top: 18px;
}
</style></head><body><div class="slide">
  <div class="bg"><img src="${escapeHtml(d.imageUrl)}" width="1080" height="1350"/></div>
  <div class="veil veil-side"></div>
  <div class="chrome">
    <div class="meta-top">
      <span>${escapeHtml(indexLabel || "")}</span>
      <span class="rule"></span>
      <span>BOTANICA</span>
    </div>
    <div class="content">
      ${indexLabel ? `<div class="plant-num">PLANTA ${escapeHtml(indexLabel.split(" ")[0] || "")}</div>` : ""}
      <div class="plant-name">${escapeHtml(d.nomePopular || "")}</div>
      <div class="plant-sci">${escapeHtml(d.nomeCientifico || "")}</div>
      ${d.caption ? `<div class="plant-caption">${escapeHtml(d.caption)}</div>` : ""}
      ${
        d.careTips && d.careTips.length
          ? `<div class="care">${d.careTips.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>`
          : ""
      }
    </div>
    <div class="meta-bottom">
      <span>${escapeHtml(handleUpper)}</span>
      <span>ESTUDO BOTANICO</span>
    </div>
  </div>
</div></body></html>`;
}
