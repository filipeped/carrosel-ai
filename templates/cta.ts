import { baseStyle, BRAND_HANDLE, FONTS_LINK } from "./base";
import { escapeHtml } from "../lib/utils";

export type CtaData = {
  imageUrl: string;
  pergunta: string;
  italicWords?: string[];
  chips?: string[]; // ex.: ["SALVAR", "COMPARTILHAR"]
};

function highlightItalic(title: string, italicWords: string[] = []): string {
  if (!italicWords.length) return escapeHtml(title);
  let out = escapeHtml(title);
  italicWords.forEach((w) => {
    const safe = escapeHtml(w);
    out = out.replace(
      new RegExp(`\\b${safe.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "gi"),
      `<em>${safe}</em>`,
    );
  });
  return out;
}

export function renderCta(d: CtaData, fontsBaseUrl = ""): string {
  const handleUpper = BRAND_HANDLE || "";
  const chips = d.chips && d.chips.length ? d.chips : ["SALVAR", "COMPARTILHAR"];
  return `<!doctype html><html><head><meta charset="utf-8"/>${FONTS_LINK}<style>
${baseStyle(fontsBaseUrl)}
.cta .content { margin-top:auto; }
.cta-big {
  font-family: var(--serif); font-weight: 300;
  font-size: 72px; line-height: 1.02;
  letter-spacing: -.02em;
  color: #fff; margin: 0;
  text-shadow: 0 2px 24px rgba(0,0,0,.55), 0 1px 3px rgba(0,0,0,.55);
}
.cta-big em { font-style: italic; font-weight: 300; color: var(--accent); }
.cta-row {
  display:flex; gap:10px; margin-top:26px; flex-wrap:wrap;
}
.cta-chip {
  font-family: var(--mono);
  font-size: 12px; letter-spacing: .2em; text-transform: uppercase;
  padding: 12px 18px;
  border: 1px solid rgba(255,255,255,.6);
  color: #fff; border-radius: 999px;
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  background: rgba(0,0,0,.25);
}
.cta-chip.solid {
  background: #fff; color: #111; border-color: #fff;
}
.cta-handle {
  font-family: var(--mono);
  font-size: 13px; letter-spacing: .22em; text-transform: uppercase;
  color: rgba(255,255,255,.92);
  margin-top: 22px;
  text-shadow: 0 1px 6px rgba(0,0,0,.5);
}
</style></head><body><div class="slide cta">
  <div class="bg"><img src="${escapeHtml(d.imageUrl)}" crossorigin="anonymous"/></div>
  <div class="color-grade"></div>
  <div class="veil veil-cta"></div>
  <div class="chrome">
    <div class="meta-top">
      <span class="idx">FIM</span>
      <span class="rule"></span>
      <span>${escapeHtml(handleUpper.replace(/^@/, "").toUpperCase())}</span>
    </div>
    <div class="content">
      <h1 class="cta-big">${highlightItalic(d.pergunta || "", d.italicWords)}</h1>
      <div class="cta-row">
        ${chips.map((c, i) => `<span class="cta-chip ${i === 0 ? "solid" : ""}">${escapeHtml(c)}</span>`).join("")}
      </div>
      <div class="cta-handle">${escapeHtml(handleUpper)}</div>
    </div>
  </div>
</div></body></html>`;
}
