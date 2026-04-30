import { NextRequest, NextResponse } from "next/server";
import { searchAndSelect, FORMAT_SLIDE_COUNTS } from "@/lib/smart-pipeline";
import type { CarouselFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, candidateCount } = body;
    const format: CarouselFormat = body.format || "classic";
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    // Formatos novos com >6 slides precisam de mais candidatas (cover + miolo + cta + buffer)
    const expectedSlides = format === "classic" ? 6 : FORMAT_SLIDE_COUNTS[format];
    const finalCandidateCount = candidateCount ?? Math.max(24, expectedSlides * 3);

    const r = await searchAndSelect(prompt, { candidateCount: finalCandidateCount });
    return NextResponse.json({ ...r, format, expectedSlides });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
