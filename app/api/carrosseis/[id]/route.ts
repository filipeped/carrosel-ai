import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/carrosseis/:id → retorna carrossel + imagens resolvidas pra recarregar no editor.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const sb = getSupabase();
    const { data: row, error } = await sb
      .from("carrosseis_gerados")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Busca imagens pelos ids
    const imgIds: number[] = Array.isArray(row.imagens_ids) ? row.imagens_ids : [];
    let images: unknown[] = [];
    if (imgIds.length) {
      const { data: imgs } = await sb
        .from("image_bank")
        .select("*")
        .in("id", imgIds);
      // Reordena pra manter a ordem original de imagens_ids
      const byId = new Map((imgs || []).map((i) => [i.id, i]));
      images = imgIds.map((id) => byId.get(id)).filter(Boolean);
    }

    return NextResponse.json({ data: { ...row, images } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
