import { baseStyle, BRAND_HANDLE } from "./base";
import { escapeHtml } from "../lib/utils";

export type PlantDetailData = {
  imageUrl: string;
  nomePopular: string;
  nomeCientifico: string;
  index?: number;
  total?: number;
  careTips?: string[];    // ex.: ["MEIA-SOMBRA", "REGA 2x/SEMANA", "50-80 CM"]
  caption?: string;       // descricao curta opcional
};

function withAccent(name: string): string {
  // 1a palavra normal, resto em italico accent (tipo "Pacova-gigante" -> "Pacova-<em>gigante</em>")
  const clean = escapeHtml(name);
  const parts = clean.split("-");
  if (parts.length >= 2) {
    return `${parts[0]}-<em>${parts.slice(1).join("-")}</em>`;
  }
  return clean;
}

export function renderPlantDetail(d: PlantDetailData, fontsBaseUrl = ""): string {
  const handleUpper = (BRAND_HANDLE || "").replace(/^@/, "");
  const idx = d.index ? String(d.index).padStart(2, "0") : "";
  const total = d.total ? String(d.total).padStart(2, "0") : "";
  const indexLabel = idx && total ? `${idx} / ${total}` : idx || "";

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
${baseStyle(fontsBaseUrl)}
.plant .chrome { padding-top: 48px; justify-content: flex-start; }
.plant .content { max-width: 82%; }
.plant-num {
  font-family: var(--mono);
  font-size: 14px; letter-spacing: .3em; text-transform: uppercase;
  color: rgba(255,255,255,.85);
  text-shadow: 0 2px 12px rgba(0,0,0,.75);
  margin-bottom: 18px;
}
.plant-name {
  font-family: var(--serif); font-weight: 400;
  font-size: 86px; line-height: .98;
  letter-spacing: -.025em;
  color: #fff; margin: 0;
  text-shadow:
    0 2px 40px rgba(0,0,0,.85),
    0 4px 18px rgba(0,0,0,.75),
    0 1px 3px rgba(0,0,0,.6);
}
.plant-name em {
  font-style: italic; font-weight: 300; color: var(--accent);
}
.plant-sci {
  font-family: var(--serif); font-style: italic; font-weight: 300;
  font-size: 28px; color: rgba(255,255,255,.92);
  margin-top: 14px;
  text-shadow: 0 2px 16px rgba(0,0,0,.85), 0 1px 4px rgba(0,0,0,.7);
}
.plant-caption {
  font-family: var(--sans);
  font-size: 18px; line-height: 1.5;
  color: #fff; max-width: 38ch; margin-top: 18px;
  text-shadow: 0 2px 18px rgba(0,0,0,.9), 0 1px 4px rgba(0,0,0,.75);
}
</style></head><body><div class="slide plant">
  <div class="bg"><img src="${escapeHtml(d.imageUrl)}" crossorigin="anonymous"/></div>
  <div class="veil veil-side"></div>
  <div class="chrome">
    <div class="meta-top">
      <span class="idx">${escapeHtml(indexLabel)}</span>
      <span class="rule"></span>
      <span>BOTANICA</span>
    </div>
    <div class="content">
      ${indexLabel ? `<div class="plant-num">Planta ${escapeHtml(indexLabel.split(" ")[0] || "")}</div>` : ""}
      <h1 class="plant-name">${withAccent(d.nomePopular || "")}</h1>
      <div class="plant-sci">${escapeHtml(d.nomeCientifico || "")}</div>
      ${d.caption ? `<p class="plant-caption">${escapeHtml(d.caption)}</p>` : ""}
      ${
        d.careTips && d.careTips.length
          ? `<div class="care">${d.careTips.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>`
          : ""
      }
    </div>
    <div class="meta-bottom">
      <span>${escapeHtml(handleUpper.toUpperCase())}</span>
      <span>ESTUDO BOTANICO</span>
    </div>
  </div>
</div></body></html>`;
}
