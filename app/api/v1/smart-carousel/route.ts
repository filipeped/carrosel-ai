import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { runSmartCarousel } from "@/lib/smart-pipeline";
import { generateCaption } from "@/lib/pipeline";
import { renderHtmlToPng } from "@/lib/renderer";
import { renderCover } from "@/templates/cover";
import { renderPlantDetail } from "@/templates/plantDetail";
import { renderInspiration } from "@/templates/inspiration";
import { renderCta } from "@/templates/cta";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const err = requireAuth(req);
  if (err) return err;
  try {
    const body = await req.json();
    const prompt: string = body.prompt;
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    const r = await runSmartCarousel(prompt, {
      withCaption: body.withCaption ?? true,
      candidateCount: body.candidateCount ?? 24,
    });

    // legenda opcional com Vision
    let caption: any = undefined;
    if (body.withCaption) {
      try {
        const imageUrls = r.imagens.map((im) => im.url);
        caption = await generateCaption(prompt, r.slides, imageUrls);
      } catch (e) {
        console.error("caption error", e);
      }
    }

    let pngs: string[] | undefined;
    if (body.withPng) {
      const origin = req.nextUrl.origin;
      const htmls = r.slides.map((s) => {
        const imgUrl = r.imagens[s.imageIdx]?.url || r.imagens[0].url;
        if (s.type === "cover") return renderCover({ imageUrl: imgUrl, topLabel: s.topLabel, numeral: s.numeral ?? undefined, title: s.title || "", italicWords: s.italicWords || [] }, origin);
        if (s.type === "plantDetail") return renderPlantDetail({ imageUrl: imgUrl, nomePopular: s.nomePopular || "", nomeCientifico: s.nomeCientifico || "" }, origin);
        if (s.type === "cta") return renderCta({ imageUrl: imgUrl, pergunta: s.pergunta || "", italicWords: s.italicWords || [] }, origin);
        return renderInspiration({ imageUrl: imgUrl, title: s.title || "", subtitle: s.subtitle || "", topLabel: s.topLabel || "" }, origin);
      });
      const buffers = await Promise.all(htmls.map((h) => renderHtmlToPng(h)));
      pngs = buffers.map((b) => b.toString("base64"));
    }

    return NextResponse.json({ ...r, caption, pngs });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
