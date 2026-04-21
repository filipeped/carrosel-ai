import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { embed } from "@/lib/embeddings";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/search-more
 * Body: { prompt: string, excludeIds: number[], limit?: number }
 * Busca mais imagens relacionadas ao tema, excluindo as que ja estao em uso.
 * Usa busca semantica via embedding do prompt.
 */
export async function POST(req: NextRequest) {
  try {
    const { prompt, excludeIds = [], limit = 18 } = await req.json();
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });
    const sb = getSupabase();
    const emb = await embed(prompt);
    const { data, error } = await sb.rpc("busca_semantica", {
      query_embedding: emb as unknown as string,
      match_threshold: 0.2,
      match_count: limit + excludeIds.length,
      filtro_estilo: null,
      filtro_tipo_area: null,
      tabelas: ["image_bank"],
    });
    if (error) throw new Error(error.message);
    const excluded = new Set(excludeIds);
    const filtered = (data || []).filter((i: { id: number }) => !excluded.has(i.id)).slice(0, limit);
    return NextResponse.json({ images: filtered });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
