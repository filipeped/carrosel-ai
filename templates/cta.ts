import { baseStyle, BRAND_HANDLE } from "./base";
import { escapeHtml } from "../lib/utils";

export type CtaData = {
  imageUrl: string;
  pergunta: string;
  italicWords?: string[];
  chips?: string[];
};

function highlightItalic(title: string, italicWords: string[] = []): string {
  if (!italicWords || !italicWords.length) return escapeHtml(title);
  let out = escapeHtml(title);
  italicWords.forEach((w) => {
    const safe = escapeHtml(w);
    out = out.replace(
      new RegExp(`\\b${safe.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "gi"),
      `<span style="font-style:italic;color:#d6e7c4">${safe}</span>`,
    );
  });
  // Envolve em display:contents — evita que Satori trate text+span+text
  // como "div multi-child sem display". Wrap some no layout.
  return `<span style="display:contents">${out}</span>`;
}

export function renderCta(d: CtaData, fontsBaseUrl = ""): string {
  const handleUpper = (BRAND_HANDLE || "").replace(/^@/, "").toUpperCase();
  const chips = (d.chips && d.chips.length) ? d.chips : ["SALVAR", "COMPARTILHAR"];
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
${baseStyle(fontsBaseUrl)}
.cta-big {
  display: flex;
  flex-wrap: wrap;
  font-family: 'Fraunces', serif; font-weight: 300;
  font-size: 68px; line-height: 1.04; letter-spacing: -1.4px;
  color: #fff;
}
.cta-row {
  display: flex; gap: 10px; margin-top: 28px; flex-wrap: wrap;
}
.cta-chip {
  display: flex;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px; letter-spacing: 3px; text-transform: uppercase;
  padding: 12px 20px; border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.6);
  color: #fff;
  background: rgba(0,0,0,0.35);
}
.cta-chip.solid { background: #fff; color: #111; border-color: #fff; }
.cta-handle {
  display: flex;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px; letter-spacing: 3px; text-transform: uppercase;
  color: rgba(255,255,255,0.92);
  margin-top: 22px;
}
</style></head><body><div class="slide">
  <div class="bg"><img src="${escapeHtml(d.imageUrl)}" width="1080" height="1350"/></div>
  <div class="veil veil-cta"></div>
  <div class="chrome">
    <div class="meta-top">
      <span>FIM</span>
      <span class="rule"></span>
      <span>${escapeHtml(handleUpper)}</span>
    </div>
    <div class="content">
      <div class="cta-big">${highlightItalic(d.pergunta || "", d.italicWords)}</div>
      <div class="cta-row">
        ${chips.map((c, i) => `<span class="cta-chip${i === 0 ? " solid" : ""}">${escapeHtml(c)}</span>`).join("")}
      </div>
      <div class="cta-handle">${escapeHtml(handleUpper)}</div>
    </div>
  </div>
</div></body></html>`;
}
