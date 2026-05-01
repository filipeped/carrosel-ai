import { NextRequest, NextResponse } from "next/server";
import { fetchVegetacoesForPrompt } from "@/lib/smart-pipeline";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt: string = (body?.prompt || "").trim();
    const count: number = Math.max(4, Math.min(20, Number(body?.count) || 10));
    if (!prompt) return NextResponse.json({ plantas: [] });

    const plantas = await fetchVegetacoesForPrompt(prompt, count);
    return NextResponse.json({ plantas });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
