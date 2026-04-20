import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Rascunhos (is_draft=true em carrosseis_gerados).
 *
 * GET  /api/drafts           → lista rascunhos nao publicados
 * POST /api/drafts           → marca carrossel atual como draft { id, caption?, scheduled_for? }
 * PATCH /api/drafts          → atualiza caption/agenda { id, caption?, scheduled_for? }
 * DELETE /api/drafts?id=...  → remove rascunho
 */

export async function GET() {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("carrosseis_gerados")
      .select(
        "id, prompt, tema, slides, imagens_ids, draft_caption, scheduled_for, thumb_url, created_at, updated_at",
      )
      .eq("is_draft", true)
      .is("instagram_post_id", null)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(60);
    if (error) throw new Error(error.message);

    // Resolve thumb_url pelo primeiro imagens_id quando nao tem gravado
    const rows = (data || []) as Array<{
      id: string;
      slides?: Array<Record<string, unknown>>;
      imagens_ids?: number[];
      thumb_url?: string | null;
      [k: string]: unknown;
    }>;
    const missingIds = Array.from(
      new Set(
        rows
          .filter((r) => !r.thumb_url && r.imagens_ids?.length)
          .map((r) => r.imagens_ids![0])
          .filter(Boolean),
      ),
    );
    if (missingIds.length) {
      const { data: imgs } = await sb
        .from("image_bank")
        .select("id, url")
        .in("id", missingIds);
      const byId = new Map((imgs || []).map((i) => [i.id, i.url]));
      for (const r of rows) {
        if (!r.thumb_url && r.imagens_ids?.length) {
          r.thumb_url = byId.get(r.imagens_ids[0]) || null;
        }
      }
    }

    // Adiciona "display_title" com o titulo da capa atual (slides[0].title)
    const enriched = rows.map((r) => ({
      ...r,
      display_title:
        (r.slides?.[0]?.title as string | undefined) ||
        (r.tema as string | undefined) ||
        (r.prompt as string | undefined) ||
        "",
    }));

    return NextResponse.json({ data: enriched });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { id, caption, scheduled_for, slides, imagens_ids } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const sb = getSupabase();
    const update: Record<string, unknown> = {
      is_draft: true,
    };
    if (caption !== undefined) update.draft_caption = caption;
    if (scheduled_for !== undefined) update.scheduled_for = scheduled_for;
    if (Array.isArray(slides)) update.slides = slides;
    if (Array.isArray(imagens_ids)) update.imagens_ids = imagens_ids;
    const { error } = await sb.from("carrosseis_gerados").update(update).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, caption, scheduled_for, is_draft } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const sb = getSupabase();
    const update: Record<string, unknown> = {};
    if (caption !== undefined) update.draft_caption = caption;
    if (scheduled_for !== undefined) update.scheduled_for = scheduled_for;
    if (is_draft !== undefined) update.is_draft = is_draft;
    if (!Object.keys(update).length) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }
    const { error } = await sb.from("carrosseis_gerados").update(update).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const sb = getSupabase();
    const { error } = await sb.from("carrosseis_gerados").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
