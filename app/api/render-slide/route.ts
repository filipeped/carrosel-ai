import { NextRequest, NextResponse } from "next/server";
import { renderHtmlToPng } from "@/lib/renderer";
import { renderCover } from "@/templates/cover";
import { renderPlantDetail } from "@/templates/plantDetail";
import { renderInspiration } from "@/templates/inspiration";
import { renderCta } from "@/templates/cta";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { slide, imageUrl, edition } = await req.json();
    const origin = req.nextUrl.origin;

    if (!slide?.type || !imageUrl) {
      return NextResponse.json({ error: "slide.type and imageUrl required" }, { status: 400 });
    }

    let html: string;
    switch (slide.type) {
      case "cover":
        html = renderCover(
          {
            imageUrl,
            topLabel: slide.topLabel,
            numeral: slide.numeral ?? undefined,
            title: slide.title || "",
            italicWords: slide.italicWords || [],
            edition: edition || process.env.BRAND_EDITION,
          },
          origin,
        );
        break;
      case "plantDetail":
        html = renderPlantDetail(
          {
            imageUrl,
            nomePopular: slide.nomePopular || slide.title || "",
            nomeCientifico: slide.nomeCientifico || slide.subtitle || "",
          },
          origin,
        );
        break;
      case "cta":
        html = renderCta(
          {
            imageUrl,
            pergunta: slide.pergunta || slide.title || "Qual delas entra na sua casa?",
            italicWords: slide.italicWords || [],
          },
          origin,
        );
        break;
      case "inspiration":
      default:
        html = renderInspiration(
          {
            imageUrl,
            title: slide.title || "",
            subtitle: slide.subtitle || "",
            topLabel: slide.topLabel || "",
          },
          origin,
        );
    }

    const png = await renderHtmlToPng(html);
    return NextResponse.json({ png: png.toString("base64") });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
