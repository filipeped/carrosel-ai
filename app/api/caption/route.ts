import { NextRequest, NextResponse } from "next/server";
import { generateCaption } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  try {
    const { prompt, slides, imageUrls } = await req.json();
    if (!slides?.length) return NextResponse.json({ error: "slides required" }, { status: 400 });
    const r = await generateCaption(prompt || "", slides, imageUrls);
    return NextResponse.json(r);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
