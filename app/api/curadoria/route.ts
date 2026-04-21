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
 * Body: {
 *   slideCount?: 8-10,
 *   filter?: { tipo_area?, mood? },
 *   persist?: boolean,
 *   excludeTeses?: string[],        // teses recentes pra nao repetir
 *   excludeImageIds?: number[],     // fotos ja usadas recentemente
 *   seed?: number                   // pra variar shuffle entre clicks proximos
 * }
 *
 * Modo IMAGE-FIRST: sem tema. IA busca fotos do arquivo com vision cacheada,
 * agrupa 8-10 que fazem serie coerente, escreve copy observacional.
 */

const CANDIDATE_POOL_SIZE = 30;
const MIN_ACCEPTABLE = 12;

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      slideCount?: number;
      filter?: { tipo_area?: string; mood?: string };
      persist?: boolean;
      excludeTeses?: string[];
      excludeImageIds?: number[];
      seed?: number;
    };
    const slideCount = Math.max(6, Math.min(10, body.slideCount ?? 8));
    const persist = body.persist !== false;
    const excludeTeses = Array.isArray(body.excludeTeses)
      ? body.excludeTeses.slice(0, 12)
      : [];
    const excludeIds = new Set(
      Array.isArray(body.excludeImageIds) ? body.excludeImageIds : [],
    );
    const seed = body.seed && Number.isFinite(body.seed) ? body.seed : Date.now();
    const rng = seededRandom(seed);

    const sb = getSupabase();

    // 1. Pega TODOS os ids com vision (query leve — apenas id). Sorteia no client.
    // Isso garante randomizacao REAL sobre o arquivo inteiro (nao so as primeiras 90).
    let idsQuery = sb
      .from("image_bank")
      .select("id")
      .not("analise_visual", "is", null);
    if (body.filter?.tipo_area) {
      idsQuery = idsQuery.eq("tipo_area", body.filter.tipo_area);
    }
    const { data: idRows, error: idErr } = await idsQuery;
    if (idErr) throw new Error(idErr.message);

    const allIds: number[] = (idRows || [])
      .map((r: { id: number }) => r.id)
      .filter((id) => !excludeIds.has(id));

    if (allIds.length < MIN_ACCEPTABLE) {
      return NextResponse.json(
        {
          error: `Poucas fotos com analise visual (${allIds.length}). Rode mais buscas pra cachear mais fotos primeiro.`,
          total_with_vision: allIds.length,
        },
        { status: 400 },
      );
    }

    // Fisher-Yates com RNG seedada — embaralha TODA a lista
    const shuffled = [...allIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Pega 30 primeiros IDs aleatorios, busca dados completos so desses
    const pickIds = shuffled.slice(0, CANDIDATE_POOL_SIZE);
    const { data: poolData, error: poolErr } = await sb
      .from("image_bank")
      .select("*")
      .in("id", pickIds);
    if (poolErr) throw new Error(poolErr.message);

    const candidates = (poolData || []) as AnalyzedImage[];
    if (candidates.length < MIN_ACCEPTABLE) {
      return NextResponse.json(
        { error: `pool final ficou com ${candidates.length} fotos (minimo ${MIN_ACCEPTABLE})` },
        { status: 500 },
      );
    }

    // Re-shuffle porque .in() nao garante ordem + diversidade de hero
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    // 2. Visual Curator agrupa — recebe teses a evitar
    const curated = await visualCurator({
      candidates,
      slideCount,
      avoidTeses: excludeTeses,
    });

    if (curated.grupo.length < 6) {
      return NextResponse.json(
        { error: `Curador retornou so ${curated.grupo.length} fotos (minimo 6)` },
        { status: 500 },
      );
    }

    const grupo = curated.grupo;
    const selection: SmartSelection = {
      cover: grupo[0],
      inner: grupo.slice(1, -1),
      cta: grupo[grupo.length - 1],
      alternatives: curated.alternatives,
      rationale: curated.tese_detectada,
    };

    // 3. Copy observacional
    const { slides } = await observationalCopy({
      grupo,
      tese_detectada: curated.tese_detectada,
      slideCount: grupo.length,
    });

    // 4. Persiste no historico
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
      total_available: allIds.length,
    });
  } catch (e) {
    console.error("[curadoria] falhou:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
