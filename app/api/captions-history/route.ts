import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Persistencia de legendas geradas em Supabase.
 * Tabela: captions_history { id, prompt, options (jsonb), picked_idx, created_at }
 *
 * GET  /api/captions-history?prompt=... -> ultimo registro desse prompt
 * POST /api/captions-history             -> salva novo, retorna { id }
 * PATCH /api/captions-history            -> atualiza picked_idx
 */

export async function GET(req: NextRequest) {
  try {
    const prompt = req.nextUrl.searchParams.get("prompt") || "";
    if (!prompt.trim()) return NextResponse.json({ data: null });
    const sb = getSupabase();
    const { data, error } = await sb
      .from("captions_history")
      .select("id, prompt, options, picked_idx, created_at")
      .eq("prompt", prompt)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, options } = await req.json();
    if (!prompt || !Array.isArray(options)) {
      return NextResponse.json({ error: "prompt + options required" }, { status: 400 });
    }
    const sb = getSupabase();
    const { data, error } = await sb
      .from("captions_history")
      .insert({ prompt, options })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, picked_idx } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const sb = getSupabase();
    const { error } = await sb
      .from("captions_history")
      .update({ picked_idx })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
