import { baseStyle, BRAND_HANDLE } from "./base";
import { escapeHtml } from "../lib/utils";

export type ListItemData = {
  imageUrl: string;
  numeral: string;
  nomePopular: string;
  nomeCientifico?: string;
  dica?: string;
  index?: number;
  total?: number;
};

export function renderListItem(d: ListItemData, fontsBaseUrl = ""): string {
  const handleUpper = (BRAND_HANDLE || "").replace(/^@/, "").toUpperCase();
  const idx = d.index ? String(d.index).padStart(2, "0") : "";
  const total = d.total ? String(d.total).padStart(2, "0") : "";
  const indexLabel = idx && total ? `${idx} / ${total}` : idx || "";
  const safeNumeral = String(d.numeral || "").trim().slice(0, 3);

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
${baseStyle(fontsBaseUrl)}
.li-row {
  display: flex; align-items: flex-end; gap: 32px;
  width: 100%;
}
.li-numeral {
  display: flex;
  font-family: 'Fraunces', serif; font-weight: 300; font-style: italic;
  font-size: 220px; line-height: 0.85; letter-spacing: -6px;
  color: #d6e7c4;
  margin-bottom: -12px;
}
.li-text {
  display: flex; flex-direction: column;
  flex: 1;
}
.li-popular {
  display: block;
  font-family: 'Fraunces', serif; font-weight: 400;
  font-size: 64px; line-height: 1.02; letter-spacing: -1.4px;
  color: #fff;
}
.li-sci {
  display: block;
  font-family: 'Fraunces', serif; font-style: italic; font-weight: 300;
  font-size: 22px; line-height: 1.2;
  color: rgba(255,255,255,0.92);
  margin-top: 8px;
}
.li-tip {
  display: block;
  font-family: 'Archivo', sans-serif;
  font-size: 18px; line-height: 1.5;
  color: rgba(255,255,255,0.92);
  max-width: 720px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid rgba(255,255,255,0.25);
}
</style></head><body><div class="slide">
  <div class="bg"><img src="${escapeHtml(d.imageUrl)}" width="1080" height="1350"/></div>
  <div class="veil veil-bottom"></div>
  <div class="chrome">
    <div class="meta-top">
      <span>${escapeHtml(indexLabel || "")}</span>
      <span class="rule"></span>
      <span>LISTA PRATICA</span>
    </div>
    <div class="content">
      <div class="li-row">
        ${safeNumeral ? `<div class="li-numeral">${escapeHtml(safeNumeral)}</div>` : ""}
        <div class="li-text">
          <div class="li-popular">${escapeHtml(d.nomePopular || "")}</div>
          ${d.nomeCientifico ? `<div class="li-sci">${escapeHtml(d.nomeCientifico)}</div>` : ""}
        </div>
      </div>
      ${d.dica ? `<div class="li-tip">${escapeHtml(d.dica)}</div>` : ""}
    </div>
    <div class="meta-bottom">
      <span>${escapeHtml(handleUpper)}</span>
      <span>SALVE PARA CONSULTAR</span>
    </div>
  </div>
</div></body></html>`;
}
