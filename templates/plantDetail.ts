import { baseStyle, BRAND_HANDLE } from "./base";
import { escapeHtml } from "../lib/utils";

export type PlantDetailData = {
  imageUrl: string;
  nomePopular: string;   // ex.: "Paco\u00e1-gigante"
  nomeCientifico: string; // ex.: "Philodendron martianum"
};

export function renderPlantDetail(d: PlantDetailData, fontsBaseUrl = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
${baseStyle(fontsBaseUrl)}
.text-wrap {
  position: absolute; left: 60px; top: 520px; right: 60px;
}
.nome {
  font-family: 'Playfair', serif;
  font-weight: 400;
  font-size: 110px;
  line-height: 0.92;
  color: #fff;
  letter-spacing: -1.5px;
  text-shadow: 0 2px 16px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.55);
}
.cientifico {
  font-family: 'Cormorant', 'Playfair', serif;
  font-style: italic;
  font-weight: 400;
  font-size: 34px;
  color: #fff;
  opacity: 0.95;
  margin-top: 14px;
  text-shadow: 0 1px 8px rgba(0,0,0,0.5);
}
.left-shadow {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0) 75%);
}
</style></head><body><div class="slide">
<img class="bg" src="${escapeHtml(d.imageUrl)}" crossorigin="anonymous"/>
<div class="left-shadow"></div>
<div class="text-wrap">
  <div class="nome">${escapeHtml(d.nomePopular)}</div>
  <div class="cientifico">${escapeHtml(d.nomeCientifico)}</div>
</div>
<div class="handle">${escapeHtml(BRAND_HANDLE)}</div>
</div></body></html>`;
}
