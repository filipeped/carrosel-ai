import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { renderHtmlToPng } from "@/lib/renderer";
import { renderCover } from "@/templates/cover";
import { renderPlantDetail } from "@/templates/plantDetail";
import { renderInspiration } from "@/templates/inspiration";
import { renderCta } from "@/templates/cta";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Renderiza 1 slide em PNG 1080x1350.
 * Request: { slide: SlideSpec, imageUrl: string, format?: "png"|"base64" }
 * Default format = "png" (retorna binario image/png).
 * format="base64" retorna { png: "<base64>" } pra sistemas que preferem JSON.
 */
export async function POST(req: NextRequest) {
  const err = requireAuth(req);
  if (err) return err;
  try {
    const { slide, imageUrl, format = "png" } = await req.json();
    if (!slide?.type || !imageUrl) {
      return NextResponse.json({ error: "slide.type and imageUrl required" }, { status: 400 });
    }
    const origin = req.nextUrl.origin;

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
            edition: slide.edition || process.env.BRAND_EDITION,
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
    if (format === "base64") {
      return NextResponse.json({ png: png.toString("base64") });
    }
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(png.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
