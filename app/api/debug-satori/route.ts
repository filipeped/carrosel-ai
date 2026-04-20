import { NextRequest, NextResponse } from "next/server";
import { renderCover } from "@/templates/cover";
import { renderPlantDetail } from "@/templates/plantDetail";
import { renderInspiration } from "@/templates/inspiration";
import { renderCta } from "@/templates/cta";

export const runtime = "nodejs";

function cleanCssForSatori(styleBlock: string): string {
  const inner = styleBlock.replace(/<\/?style[^>]*>/gi, "");
  const noComments = inner.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: string[] = [];
  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRegex.exec(noComments)) !== null) {
    const selectorRaw = m[1].trim();
    const body = m[2].trim();
    if (!selectorRaw || !body) continue;
    const selectors = selectorRaw.split(",").map((s) => s.trim()).filter(Boolean).filter((s) => {
      if (s.startsWith(":")) return false;
      if (s === "*") return false;
      if (/^(html|body)\b/.test(s)) return false;
      return true;
    });
    if (!selectors.length) continue;
    rules.push(`${selectors.join(",")} { ${body} }`);
  }
  return `<style>${rules.join(" ")}</style>`;
}

function sanitize(html: string): string {
  const styles: string[] = [];
  html.replace(/<style[\s\S]*?<\/style>/gi, (m) => { styles.push(m); return ""; });
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let cleaned = bodyMatch ? bodyMatch[1] : html;
  cleaned = cleaned.replace(/<!doctype[^>]*>/gi, "").replace(/<\/?html[^>]*>/gi, "").replace(/<\/?body[^>]*>/gi, "").replace(/<head[\s\S]*?<\/head>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  cleaned = cleaned.replace(/>\s+</g, "><");
  const stylesCleaned = styles.map(cleanCssForSatori).join("");
  return (stylesCleaned + cleaned).trim();
}

export async function POST(req: NextRequest) {
  const { slide, imageUrl } = await req.json();
  let html: string;
  switch (slide?.type) {
    case "cover":
      html = renderCover({ imageUrl, topLabel: slide.topLabel, title: slide.title || "", italicWords: slide.italicWords || [] });
      break;
    case "plantDetail":
      html = renderPlantDetail({ imageUrl, nomePopular: slide.nomePopular || "", nomeCientifico: slide.nomeCientifico || "" });
      break;
    case "cta":
      html = renderCta({ imageUrl, pergunta: slide.pergunta || "", italicWords: slide.italicWords || [] });
      break;
    default:
      html = renderInspiration({ imageUrl, title: slide?.title || "", subtitle: slide?.subtitle || "", topLabel: slide?.topLabel || "" });
  }
  const sanitized = sanitize(html);
  return NextResponse.json({ sanitized });
}
