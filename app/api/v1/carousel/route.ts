import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { runFullCarousel } from "@/lib/pipeline";
import { renderHtmlToPng } from "@/lib/renderer";
import { renderCover } from "@/templates/cover";
import { renderPlantDetail } from "@/templates/plantDetail";
import { renderInspiration } from "@/templates/inspiration";
import { renderCta } from "@/templates/cta";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/v1/carousel
 * Headers: Authorization: Bearer <token>
 * Body: { prompt: string, withCaption?: boolean, withPng?: boolean }
 * Resp: { prompt, filters, slides, imagens, caption?, pngs? }
 */
export async function POST(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const prompt: string = body.prompt;
    if (!prompt || prompt.length < 3) {
      return NextResponse.json({ error: "prompt (string, >=3 chars) required" }, { status: 400 });
    }

    const result = await runFullCarousel(prompt, {
      imageCount: body.imageCount ?? 12,
      withCaption: body.withCaption ?? true,
    });

    let pngs: string[] | undefined;
    if (body.withPng) {
      const origin = req.nextUrl.origin;
      const htmls = result.slides.map((s) => {
        const imgUrl = result.imagens[s.imageIdx]?.url || result.imagens[0].url;
        if (s.type === "cover") return renderCover({ imageUrl: imgUrl, topLabel: s.topLabel, numeral: s.numeral ?? undefined, title: s.title || "", italicWords: s.italicWords || [] }, origin);
        if (s.type === "plantDetail") return renderPlantDetail({ imageUrl: imgUrl, nomePopular: s.nomePopular || "", nomeCientifico: s.nomeCientifico || "" }, origin);
        if (s.type === "cta") return renderCta({ imageUrl: imgUrl, pergunta: s.pergunta || "", italicWords: s.italicWords || [] }, origin);
        return renderInspiration({ imageUrl: imgUrl, title: s.title || "", subtitle: s.subtitle || "", topLabel: s.topLabel || "" }, origin);
      });
      const buffers = await Promise.all(htmls.map((h) => renderHtmlToPng(h)));
      pngs = buffers.map((b) => b.toString("base64"));
    }

    return NextResponse.json({ ...result, pngs });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
