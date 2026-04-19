import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateCaption } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const err = requireAuth(req);
  if (err) return err;
  try {
    const { prompt, slides } = await req.json();
    if (!slides?.length) return NextResponse.json({ error: "slides required" }, { status: 400 });
    return NextResponse.json(await generateCaption(prompt || "", slides));
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
