import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { visualCurator } from "@/lib/agents/visual-curator";
import { observationalCopy } from "@/lib/agents/observational-copy";
import type { AnalyzedImage, SmartSelection } from "@/lib/smart-pipeline";
import { saveCarrossel } from "@/lib/history";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * POST /api/curadoria
 * Body: { slideCount?: 8-10, filter?: { tipo_area?, mood? }, persist?: boolean }
 *
 * Modo IMAGE-FIRST: sem tema. IA busca 30 fotos do arquivo com vision cacheada,
 * agrupa 8-10 que fazem serie coerente, escreve copy observacional.
 *
 * Retorna: { selection, slides, tese_detectada, rationale, carrosselId? }
 */

const CANDIDATE_POOL_SIZE = 30;
const MIN_ACCEPTABLE = 12;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      slideCount?: number;
      filter?: { tipo_area?: string; mood?: string };
      persist?: boolean;
    };
    const slideCount = Math.max(6, Math.min(10, body.slideCount ?? 8));
    const persist = body.persist !== false;

    const sb = getSupabase();

    // 1. Busca pool de 30 fotos aleatorias com analise_visual preenchida
    let query = sb
      .from("image_bank")
      .select("*")
      .not("analise_visual", "is", null);

    if (body.filter?.tipo_area) {
      query = query.eq("tipo_area", body.filter.tipo_area);
    }
    // Supabase nao tem RANDOM() direto; pegamos 5x o pool e shuffle no cliente
    const { data, error } = await query.limit(CANDIDATE_POOL_SIZE * 3);
    if (error) throw new Error(error.message);

    const all = (data || []) as AnalyzedImage[];
    if (all.length < MIN_ACCEPTABLE) {
      return NextResponse.json(
        {
          error: `Poucas fotos com analise visual (${all.length}). Rode mais buscas pra cachear mais fotos primeiro.`,
          total_with_vision: all.length,
        },
        { status: 400 },
      );
    }

    // Shuffle Fisher-Yates
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    const candidates = all.slice(0, CANDIDATE_POOL_SIZE);

    // 2. Visual Curator agrupa
    const curated = await visualCurator({ candidates, slideCount });

    if (curated.grupo.length < 6) {
      return NextResponse.json(
        { error: `Curador retornou so ${curated.grupo.length} fotos (minimo 6)` },
        { status: 500 },
      );
    }

    // 3. Monta SmartSelection manualmente (cover=primeira, cta=ultima, inner=resto)
    const grupo = curated.grupo;
    const selection: SmartSelection = {
      cover: grupo[0],
      inner: grupo.slice(1, -1),
      cta: grupo[grupo.length - 1],
      alternatives: curated.alternatives,
      rationale: curated.tese_detectada,
    };

    // 4. Copy observacional
    const { slides } = await observationalCopy({
      grupo,
      tese_detectada: curated.tese_detectada,
      slideCount: grupo.length,
    });

    // 5. Persiste no historico (prompt = tese_detectada — zero tema externo)
    let carrosselId: string | undefined;
    if (persist) {
      const saved = await saveCarrossel({
        prompt: `[observacional] ${curated.tese_detectada}`,
        tema: curated.tese_detectada,
        slides,
        imagens_ids: grupo.map((g) => g.id),
      });
      carrosselId = saved?.id;
    }

    return NextResponse.json({
      selection,
      slides,
      tese_detectada: curated.tese_detectada,
      rationale: curated.rationale,
      carrosselId,
      pool_size: candidates.length,
    });
  } catch (e) {
    console.error("[curadoria] falhou:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
