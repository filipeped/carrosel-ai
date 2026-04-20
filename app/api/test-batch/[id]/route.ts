import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET  /api/test-batch/:id → retorna batch + variantes
 * PATCH /api/test-batch/:id → atualiza user_manual_score de uma variante
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sb = getSupabase();
    const { data: batch } = await sb.from("test_batches").select("*").eq("id", id).single();
    const { data: variants } = await sb
      .from("test_generations")
      .select("*")
      .eq("batch_id", id)
      .order("id");
    return NextResponse.json({ batch, variants: variants || [] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { variantId, user_manual_score, notes } = await req.json();
    if (!variantId) return NextResponse.json({ error: "variantId required" }, { status: 400 });
    const sb = getSupabase();
    const update: Record<string, unknown> = {};
    if (typeof user_manual_score === "number") update.user_manual_score = user_manual_score;
    if (notes !== undefined) update.notes = notes;
    await sb.from("test_generations").update(update).eq("id", variantId).eq("batch_id", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
