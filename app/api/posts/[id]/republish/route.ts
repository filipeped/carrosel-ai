import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * POST /api/posts/:id/republish
 * Limpa metadados do post do Instagram e marca como rascunho pra repostar.
 * Uso: quando o user deletou o post no IG mas quer re-publicar.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const sb = getSupabase();
    const { error } = await sb
      .from("carrosseis_gerados")
      .update({
        instagram_post_id: null,
        instagram_permalink: null,
        instagram_posted_at: null,
        is_draft: true,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
