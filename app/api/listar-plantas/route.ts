import { NextRequest, NextResponse } from "next/server";
import { listVegetacoesPaginated } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
    const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit")) || 30));
    const q = searchParams.get("q") || undefined;
    const r = await listVegetacoesPaginated(offset, limit, q);
    return NextResponse.json(r);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
