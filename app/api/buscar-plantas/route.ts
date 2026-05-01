import { NextRequest, NextResponse } from "next/server";
import { searchVegetacoesByQuery } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.max(1, Math.min(20, Number(searchParams.get("limit")) || 10));
    if (!q) return NextResponse.json({ plantas: [] });

    const plantas = await searchVegetacoesByQuery(q, limit);
    return NextResponse.json({ plantas });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
