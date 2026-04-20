import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { runSmartCarousel } from "@/lib/smart-pipeline";
import { generateCaption } from "@/lib/pipeline";
import { optimizeCaption } from "@/lib/agents/caption-optimizer";
import { rankCaptionVariants } from "@/lib/agents/variant-ranker";
import { critiqueCarousel } from "@/lib/agents/carousel-critic";
import { getAi, MODEL, BRAND_VOICE } from "@/lib/claude";
import { extractJson } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

type Variant = {
  label: string;
  approach: string;
  hookStrategy: string;
  useAgents: boolean;
};

/**
 * POST /api/test-batch
 * Body: { prompt, userBrief?, variants?: number }
 *
 * Gera N variantes em paralelo (default 10), variando abordagens + com/sem agentes.
 * Salva em test_generations. Retorna batch_id pra ver em /tests/[id].
 */

const HOOK_INSTRUCTIONS: Record<string, string> = {
  pergunta: "Use um HOOK em forma de PERGUNTA curta pra capa. Ex: 'Sua fachada fala alto, ou passa despercebida?'",
  contraste: "Use um HOOK de CONTRASTE na capa — quebra expectativa. Ex: 'Piscina não é destaque. É o que está ao redor dela.'",
  promessa: "Use um HOOK de PROMESSA CONCRETA na capa. Ex: '3 decisões que valem mais que escolher as plantas.'",
  auto: "Hook livre — escolha o que mais se encaixa.",
};

async function regenerateCover(
  prompt: string,
  userBrief: string | undefined,
  hookStrategy: string,
  image: { url?: string; descricao?: string; analise_visual?: unknown; plantas?: string[] } | undefined,
  allSlides: Array<{ type: string; title?: string; [k: string]: unknown }>,
): Promise<{ topLabel?: string; title?: string; italicWords?: string[]; numeral?: string | null } | null> {
  try {
    if (!image) return null;
    const av = (image.analise_visual as { descricao_visual?: string; hero_element?: string }) || {};
    const visual = av.descricao_visual ? `VISIVEL="${String(av.descricao_visual).slice(0, 250)}"` : "";
    const hookInstr = HOOK_INSTRUCTIONS[hookStrategy] || HOOK_INSTRUCTIONS.auto;
    const briefBlock = userBrief?.trim() ? `\nBRIEFING EXTRA: ${userBrief.slice(0, 400)}` : "";

    const user = `Tema: "${prompt}"${briefBlock}

${hookInstr}

Imagem da capa:
${visual}

Outros slides do carrossel (pra manter coerencia):
${allSlides.slice(1).map((s, i) => `  [${i + 1}] ${s.type}: ${s.title || ""}`).join("\n")}

Retorne APENAS o JSON da capa:
{ "topLabel": "UPPERCASE 2-3 palavras", "title": "3-8 palavras impactantes", "italicWords": ["2 palavras do title pra italico"], "numeral": null }`;

    const resp = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 300,
      messages: [
        { role: "system", content: BRAND_VOICE },
        { role: "user", content: user },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "";
    const parsed = extractJson(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as ReturnType<typeof regenerateCover> extends Promise<infer R> ? R : never;
    }
    return null;
  } catch {
    return null;
  }
}

const VARIANTS_10: Variant[] = [
  // 3 abordagens x 3 estratégias de hook + 1 baseline
  { label: "direta_pergunta", approach: "direta_emocional", hookStrategy: "pergunta", useAgents: true },
  { label: "direta_contraste", approach: "direta_emocional", hookStrategy: "contraste", useAgents: true },
  { label: "direta_promessa", approach: "direta_emocional", hookStrategy: "promessa", useAgents: true },
  { label: "contraste_pergunta", approach: "contraste_verdade", hookStrategy: "pergunta", useAgents: true },
  { label: "contraste_contraste", approach: "contraste_verdade", hookStrategy: "contraste", useAgents: true },
  { label: "contraste_promessa", approach: "contraste_verdade", hookStrategy: "promessa", useAgents: true },
  { label: "tecnico_pergunta", approach: "tecnico_relacional", hookStrategy: "pergunta", useAgents: true },
  { label: "tecnico_contraste", approach: "tecnico_relacional", hookStrategy: "contraste", useAgents: true },
  { label: "tecnico_promessa", approach: "tecnico_relacional", hookStrategy: "promessa", useAgents: true },
  { label: "baseline_no_agents", approach: "mix", hookStrategy: "auto", useAgents: false },
];

export async function POST(req: NextRequest) {
  try {
    const { prompt, userBrief, variants = 10 } = await req.json();
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });
    const sb = getSupabase();

    // Cria batch
    const { data: batch, error: batchErr } = await sb
      .from("test_batches")
      .insert({ prompt, user_brief: userBrief, variants_count: variants })
      .select("id")
      .single();
    if (batchErr) throw new Error(batchErr.message);

    const selected = VARIANTS_10.slice(0, variants);

    // Gera UM carrossel base e reusa as imagens pras variantes (economiza custo)
    const baseRun = await runSmartCarousel(prompt, {
      persist: false,
      userBrief,
      skipAgents: false,
    });

    const imageUrls = baseRun.imagens.map((i) => i.url).filter(Boolean).slice(0, 6);

    // Gera variantes em paralelo — cada uma com CAPA propria + legenda propria + critic propria
    const results = await Promise.all(
      selected.map(async (v) => {
        try {
          // 1. Regenera CAPA com hookStrategy especifica
          const coverSlide = await regenerateCover(
            prompt,
            userBrief,
            v.hookStrategy,
            baseRun.imagens[0],
            baseRun.slides,
          );
          const slidesForVariant = [...baseRun.slides];
          if (coverSlide) slidesForVariant[0] = { ...slidesForVariant[0], ...coverSlide };

          // 2. Gera legenda, filtra approach alvo
          const r = await generateCaption(prompt, slidesForVariant, imageUrls);
          let options = r.options || [];
          if (v.approach !== "mix") {
            const matched = options.find((o) => o.abordagem === v.approach);
            if (matched) options = [matched];
          }
          const chosen = options[0];
          if (!chosen) throw new Error("sem opcao gerada");

          // 3. Optimizer (se useAgents)
          let finalCaption = chosen;
          if (v.useAgents) {
            const opt = await optimizeCaption({
              legenda: chosen.legenda,
              hashtags: chosen.hashtags,
              approach: chosen.abordagem,
            }).catch(() => null);
            if (opt) {
              finalCaption = {
                ...chosen,
                legenda: opt.legenda,
                hashtags: opt.hashtags,
              };
            }
          }

          // 4. Critic avalia os slides DESSA variante (com capa nova)
          let variantCriticScore: number | null = null;
          if (v.useAgents) {
            try {
              const crit = await critiqueCarousel({
                slides: slidesForVariant,
                prompt,
                persona: baseRun.analysis?.persona,
              });
              variantCriticScore = crit.score;
            } catch {}
          }

          return {
            variant_label: v.label,
            approach: v.approach,
            hook_strategy: v.hookStrategy,
            slides: slidesForVariant,
            caption_options: [finalCaption],
            agents_used: v.useAgents ? ["prompt-analyst", "critic", "optimizer"] : [],
            critic_score: variantCriticScore,
          };
        } catch (e) {
          return {
            variant_label: v.label,
            error: (e as Error).message,
          };
        }
      }),
    );

    // Salva todas no DB
    const rows = results
      .filter((r) => !("error" in r))
      .map((r) => ({ ...r, batch_id: batch.id }));
    if (rows.length) {
      await sb.from("test_generations").insert(rows);
    }

    // Ranker global — ordena todas as variantes
    try {
      const allCaptions = results
        .filter((r) => !("error" in r))
        .map((r) => r.caption_options?.[0])
        .filter((c): c is NonNullable<typeof c> => !!c);
      const rank = await rankCaptionVariants(allCaptions);
      // Marca winner
      if (rank[0]) {
        const winnerLabel = results.filter((r) => !("error" in r))[rank[0].idx]?.variant_label;
        if (winnerLabel) {
          await sb
            .from("test_generations")
            .update({ is_winner: true })
            .eq("batch_id", batch.id)
            .eq("variant_label", winnerLabel);
        }
      }
    } catch {
      /* ranker opcional */
    }

    await sb.from("test_batches").update({ completed_at: new Date().toISOString() }).eq("id", batch.id);

    return NextResponse.json({
      batch_id: batch.id,
      total: results.length,
      errors: results.filter((r) => "error" in r).length,
      url: `/tests/${batch.id}`,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from("test_batches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    return NextResponse.json({ data: data || [] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
