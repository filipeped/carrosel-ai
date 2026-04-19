import { NextRequest, NextResponse } from "next/server";
import { analyzeOne } from "@/lib/image-analysis";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Endpoint interno pra warm-cache (dev only).
 * Roda lib/image-analysis (que usa o SDK OpenAI apontando pro gateway, com retries).
 * POST { id: number, url: string } -> { ok, analise?, error? }
 */
export async function POST(req: NextRequest) {
  try {
    const { id, url } = await req.json();
    if (!id || !url) return NextResponse.json({ error: "id, url required" }, { status: 400 });
    const analise = await analyzeOne(url);
    await getSupabase().from("image_bank").update({ analise_visual: analise as any }).eq("id", id);
    return NextResponse.json({ ok: true, analise });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 });
  }
}
