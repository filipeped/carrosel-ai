import { NextRequest, NextResponse } from "next/server";
import { searchAndSelect } from "@/lib/smart-pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { prompt, candidateCount = 24 } = await req.json();
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });
    const r = await searchAndSelect(prompt, { candidateCount });
    return NextResponse.json(r);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
