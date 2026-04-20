import { NextRequest, NextResponse } from "next/server";
import { renderCover } from "@/templates/cover";
import { renderPlantDetail } from "@/templates/plantDetail";
import { renderInspiration } from "@/templates/inspiration";
import { renderCta } from "@/templates/cta";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { slide, imageUrl, edition } = await req.json();
  const origin = req.nextUrl.origin;
  
  let html: string;
  switch (slide?.type) {
    case "cover":
      html = renderCover({ imageUrl, topLabel: slide.topLabel, title: slide.title || "", italicWords: slide.italicWords || [], edition: edition || process.env.BRAND_EDITION }, origin);
      break;
    case "plantDetail":
      html = renderPlantDetail({ imageUrl, nomePopular: slide.nomePopular || "", nomeCientifico: slide.nomeCientifico || "" }, origin);
      break;
    case "cta":
      html = renderCta({ imageUrl, pergunta: slide.pergunta || "", italicWords: slide.italicWords || [] }, origin);
      break;
    default:
      html = renderInspiration({ imageUrl, title: slide?.title || "", subtitle: slide?.subtitle || "", topLabel: slide?.topLabel || "" }, origin);
  }
  
  const minified = html.replace(/>\s+</g, "><").trim();
  
  return NextResponse.json({
    htmlLength: html.length,
    minifiedLength: minified.length,
    wsRemoved: (html.match(/>\s+</g) || []).length,
    htmlSnippet: html.slice(0, 3000),
  });
}
