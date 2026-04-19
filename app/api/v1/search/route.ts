import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { searchImages } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const err = requireAuth(req);
  if (err) return err;
  try {
    const { prompt, count = 24 } = await req.json();
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });
    return NextResponse.json(await searchImages(prompt, count));
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
