import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { runSmartCarousel } from "@/lib/smart-pipeline";
import { generateCaption } from "@/lib/pipeline";
import { optimizeCaption } from "@/lib/agents/caption-optimizer";
import { viralMaster } from "@/lib/agents/viral-master";
import { rankCaptionVariants } from "@/lib/agents/variant-ranker";
import { critiqueCarousel } from "@/lib/agents/carousel-critic";
import { ensembleCritique } from "@/lib/agents/ensemble-critic";
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
  // 5 abordagens (3 classicas + 2 novas virais) x hooks rotativos = 10 variantes
  { label: "direta_pergunta", approach: "direta_emocional", hookStrategy: "pergunta", useAgents: true },
  { label: "direta_promessa", approach: "direta_emocional", hookStrategy: "promessa", useAgents: true },
  { label: "contraste_contraste", approach: "contraste_verdade", hookStrategy: "contraste", useAgents: true },
  { label: "contraste_promessa", approach: "contraste_verdade", hookStrategy: "promessa", useAgents: true },
  { label: "tecnico_pergunta", approach: "tecnico_relacional", hookStrategy: "pergunta", useAgents: true },
  { label: "tecnico_promessa", approach: "tecnico_relacional", hookStrategy: "promessa", useAgents: true },
  { label: "contrarian_contraste", approach: "contrarian_forte", hookStrategy: "contraste", useAgents: true },
  { label: "contrarian_promessa", approach: "contrarian_forte", hookStrategy: "promessa", useAgents: true },
  { label: "infogap_pergunta", approach: "information_gap", hookStrategy: "pergunta", useAgents: true },
  { label: "infogap_contraste", approach: "information_gap", hookStrategy: "contraste", useAgents: true },
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

    // 1. Gera UM carrossel base — serve pra popular imagens analisadas + seleccao inicial.
    //    Cada variante vai REUSAR selection/analysis mas gerar SLIDES PROPRIOS.
    const baseRun = await runSmartCarousel(prompt, {
      persist: false,
      userBrief,
      skipAgents: true,   // skip critic no base — cada variante tem o seu
    });

    const imageUrls = baseRun.imagens.map((i) => i.url).filter(Boolean).slice(0, 10);

    // 2. Gera variantes em paralelo — cada uma roda runSmartCarousel PROPRIO
    //    com approachFocus diferente, resultando em SLIDES internos diferentes.
    const results = await Promise.all(
      selected.map(async (v) => {
        try {
          // Gera carrossel COMPLETO proprio dessa variante (slides + capa diferentes)
          const variantRun = await runSmartCarousel(prompt, {
            persist: false,
            userBrief,
            skipAgents: true,  // critic roda depois (ensemble)
            approachFocus: v.approach,
            presetSelection: baseRun.selection,
            presetAnalysis: baseRun.analysis,
            presetAllAnalyzed: baseRun.allAnalyzed,
          });
          const slidesForVariant = [...variantRun.slides];

          // Regenera CAPA com hookStrategy especifica (em cima dos slides proprios)
          const coverSlide = await regenerateCover(
            prompt,
            userBrief,
            v.hookStrategy,
            variantRun.imagens[0],
            slidesForVariant,
          );
          if (coverSlide) slidesForVariant[0] = { ...slidesForVariant[0], ...coverSlide };

          // Gera legenda, filtra approach alvo
          const r = await generateCaption(prompt, slidesForVariant, imageUrls);
          let options = r.options || [];
          if (v.approach !== "mix") {
            const matched = options.find((o) => o.abordagem === v.approach);
            // Fallback: se nao achou approach exato, usa primeira option disponivel
            // (evita erro silencioso quando LLM nomeia abordagem diferente)
            if (matched) options = [matched];
            else if (options.length > 0) {
              console.warn(`[test-batch] variante ${v.label}: approach "${v.approach}" nao encontrado, usando "${options[0].abordagem}"`);
            }
          }
          const chosen = options[0];
          if (!chosen) throw new Error(`sem opcao gerada pro approach "${v.approach}" (recebeu ${r.options?.length || 0} options)`);

          // 3. Optimizer (brand polish) + Viral Master (hook 2026) se useAgents
          let finalCaption: typeof chosen & {
            _gatilho_viral?: string;
            _score_viralidade?: number;
            _viral_rationale?: string;
          } = chosen;
          if (v.useAgents) {
            const opt = await optimizeCaption({
              legenda: chosen.legenda,
              hashtags: chosen.hashtags,
              approach: chosen.abordagem,
            }).catch((e) => {
              console.error(`[test-batch] optimizer falhou na variante ${v.label}:`, (e as Error).message);
              return null;
            });
            const afterOptimizer = opt
              ? { ...chosen, legenda: opt.legenda, hashtags: opt.hashtags }
              : chosen;

            // Viral Master — mata inspiracional + garante hook 2026
            const vm = await viralMaster({
              legenda: afterOptimizer.legenda,
              hashtags: afterOptimizer.hashtags,
              slides: slidesForVariant,
              prompt,
              approach: afterOptimizer.abordagem,
              persona: baseRun.analysis?.persona,
            }).catch((e) => {
              console.error(`[test-batch] viral-master falhou na variante ${v.label}:`, (e as Error).message);
              return null;
            });

            finalCaption = vm
              ? {
                  ...afterOptimizer,
                  legenda: vm.legenda_viral,
                  hashtags: vm.hashtags.length ? vm.hashtags : afterOptimizer.hashtags,
                  _gatilho_viral: vm.gatilho_usado,
                  _score_viralidade: vm.score_viralidade,
                  _viral_rationale: vm.rationale,
                }
              : afterOptimizer;
          }

          // 4. Ensemble Critic — 3 critics independentes paralelos (viral/brand/tech)
          let variantCriticScore: number | null = null;
          let variantCriticBreakdown: Record<string, number> | null = null;
          let variantCriticControverso: boolean | null = null;
          if (v.useAgents) {
            try {
              const crit = await ensembleCritique({
                slides: slidesForVariant,
                prompt,
                persona: baseRun.analysis?.persona,
              });
              variantCriticScore = crit.score;
              variantCriticBreakdown = {
                hook: crit.breakdown_median.hook,
                narrativa: crit.breakdown_median.narrativa,
                persona: crit.breakdown_median.persona,
                vocab: crit.breakdown_median.vocab,
                cta: crit.breakdown_median.cta,
                viral_score: crit.critics.viral.score,
                brand_score: crit.critics.brand.score,
                technical_score: crit.critics.technical.score,
              };
              variantCriticControverso = crit.controverso;
            } catch (e) {
              console.error(`[test-batch] ensemble critic falhou na variante ${v.label}:`, (e as Error).message);
              // Fallback pro critic padrao
              try {
                const fallback = await critiqueCarousel({
                  slides: slidesForVariant,
                  prompt,
                  persona: baseRun.analysis?.persona,
                });
                variantCriticScore = fallback.score;
              } catch {}
            }
          }

          return {
            variant_label: v.label,
            approach: v.approach,
            hook_strategy: v.hookStrategy,
            slides: slidesForVariant,
            caption_options: [finalCaption],
            agents_used: v.useAgents ? ["prompt-analyst", "ensemble-critic", "optimizer", "viral-master"] : [],
            critic_score: variantCriticScore,
            critic_breakdown: variantCriticBreakdown,
            critic_controverso: variantCriticControverso,
          };
        } catch (e) {
          const err = e as Error;
          console.error(`[test-batch] variante ${v.label} falhou:`, err.message, err.stack?.split("\n")[1]?.trim());
          return {
            variant_label: v.label,
            error: err.message,
          };
        }
      }),
    );

    // Dedup de capas: se 2+ variantes geraram o MESMO title na capa,
    // regenera as duplicatas com tweak no hookStrategy pra diversificar.
    const seenTitles = new Map<string, number>();
    for (const r of results) {
      if ("error" in r) continue;
      const slide0 = (r as { slides?: Array<{ title?: string }> }).slides?.[0];
      const title = (slide0?.title || "").trim().toLowerCase();
      if (!title) continue;
      seenTitles.set(title, (seenTitles.get(title) || 0) + 1);
    }
    const dupTitles = new Set(
      [...seenTitles.entries()].filter(([, n]) => n > 1).map(([t]) => t),
    );
    if (dupTitles.size > 0) {
      console.log(`[test-batch] ${dupTitles.size} capa(s) duplicada(s), diferenciando...`);
      let dupCount = 0;
      for (const r of results) {
        if ("error" in r) continue;
        const slides = (r as { slides?: Array<{ type: string; title?: string; [k: string]: unknown }> }).slides;
        if (!slides?.[0]) continue;
        const title = (slides[0].title || "").toString().trim().toLowerCase();
        if (!dupTitles.has(title)) continue;
        dupCount++;
        if (dupCount === 1) continue; // mantem a primeira ocorrencia
        // regenera com hook alternativo
        const altHooks = ["pergunta", "contraste", "promessa"];
        const currentHook = (r as { hook_strategy?: string }).hook_strategy || "auto";
        const nextHook = altHooks.find((h) => h !== currentHook) || "contraste";
        const fresh = await regenerateCover(
          prompt,
          userBrief,
          nextHook,
          baseRun.imagens[0],
          slides,
        );
        if (fresh) slides[0] = { ...slides[0], ...fresh };
      }
    }

    // Salva todas no DB
    const rows = results
      .filter((r) => !("error" in r))
      .map((r) => {
        // Separa campos que vao pro schema vs meta JSONB
        // (critic_breakdown, critic_controverso, caption_options._gatilho_viral etc ficam em 'meta')
        const { critic_breakdown, critic_controverso, ...base } = r as Record<string, unknown>;
        return {
          ...base,
          batch_id: batch.id,
          meta: { critic_breakdown, critic_controverso },
        };
      });
    if (rows.length) {
      const { error: insErr } = await sb.from("test_generations").insert(rows);
      if (insErr) {
        console.error("[test-batch] insert falhou:", insErr.message);
        // Tenta novamente sem meta (caso a coluna nao exista)
        const fallback = rows.map((r) => {
          const { meta, ...rest } = r as Record<string, unknown>;
          void meta;
          return rest;
        });
        const { error: retryErr } = await sb.from("test_generations").insert(fallback);
        if (retryErr) console.error("[test-batch] fallback insert falhou:", retryErr.message);
      }
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
