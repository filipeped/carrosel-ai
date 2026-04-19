import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET  /api/admin/curadoria-imagens   → preview: quantas seriam removidas (dry-run)
 * POST /api/admin/curadoria-imagens   → executa: marca excluir=true nas abaixo do padrao
 *
 * Regra de corte (ajustavel via query params):
 *   - cover_potential < 5 AND composicao < 5 AND qualidade < 6
 * Imagens fora de padrao sao marcadas excluir=true, saindo automaticamente
 * do pipeline de busca (searchImagesSemantic filtra excluir=false).
 */

type AnaliseVisual = {
  qualidade: number;
  composicao: number;
  luz: number;
  cover_potential: number;
  descricao_visual?: string;
  hero_element?: string;
};

async function loadAnalyzed() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("image_bank")
    .select("id, arquivo, url, analise_visual, excluir")
    .not("analise_visual", "is", null)
    .eq("excluir", false)
    .limit(5000);
  if (error) throw error;
  return data || [];
}

function compositeScore(a: AnaliseVisual): number {
  // 50% cover_potential + 30% composicao + 20% qualidade
  return a.cover_potential * 0.5 + a.composicao * 0.3 + a.qualidade * 0.2;
}

function shouldExclude(
  a: AnaliseVisual,
  limits: { threshold: number; minCover: number },
) {
  if (!a || typeof a.cover_potential !== "number") return false;
  // 2 motivos pra excluir:
  // (1) score composto abaixo do threshold
  // (2) cover_potential muito baixo (foto chapada que nunca vira capa)
  if (compositeScore(a) < limits.threshold) return true;
  if (a.cover_potential < limits.minCover) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limits = {
    threshold: Number(url.searchParams.get("threshold") || 5.8),
    minCover: Number(url.searchParams.get("minCover") || 5),
  };

  try {
    const rows = await loadAnalyzed();
    const remover: any[] = [];
    const manter: any[] = [];
    const scoresDist: Record<string, number> = {};
    for (const r of rows) {
      const a = (r.analise_visual || {}) as AnaliseVisual;
      const score = compositeScore(a);
      const bucket = `${Math.floor(score)}.${Math.floor((score * 10) % 10) < 5 ? "0" : "5"}`;
      scoresDist[bucket] = (scoresDist[bucket] || 0) + 1;
      if (shouldExclude(a, limits)) {
        remover.push({ id: r.id, arquivo: r.arquivo, score, ...a });
      } else manter.push({ id: r.id });
    }
    remover.sort((a, b) => a.score - b.score);

    return NextResponse.json({
      total_analisadas: rows.length,
      seriam_removidas: remover.length,
      mantidas: manter.length,
      limites: limits,
      distribuicao_scores: scoresDist,
      preview: remover.slice(0, 30).map((p) => ({
        id: p.id,
        arquivo: p.arquivo,
        score: p.score.toFixed(2),
        cover: p.cover_potential,
        comp: p.composicao,
        qual: p.qualidade,
        desc: (p.descricao_visual || "").slice(0, 120),
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const limits = {
    threshold: Number(url.searchParams.get("threshold") || 5.8),
    minCover: Number(url.searchParams.get("minCover") || 5),
  };
  const dryRun = url.searchParams.get("dryrun") === "1";

  try {
    const rows = await loadAnalyzed();
    const toExclude: number[] = [];
    for (const r of rows) {
      const a = (r.analise_visual || {}) as AnaliseVisual;
      if (shouldExclude(a, limits)) toExclude.push(r.id);
    }

    if (dryRun) {
      return NextResponse.json({ dry_run: true, seriam_removidas: toExclude.length, ids: toExclude.slice(0, 50) });
    }

    // batch updates
    const sb = getSupabase();
    const chunk = 100;
    let updated = 0;
    for (let i = 0; i < toExclude.length; i += chunk) {
      const ids = toExclude.slice(i, i + chunk);
      const { error } = await sb.from("image_bank").update({ excluir: true }).in("id", ids);
      if (error) throw error;
      updated += ids.length;
    }
    return NextResponse.json({ ok: true, marcadas_excluidas: updated, limites: limits });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
