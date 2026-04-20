"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Variant = {
  id: number;
  variant_label: string;
  approach: string;
  hook_strategy: string;
  slides: Array<Record<string, unknown>>;
  caption_options: Array<{
    legenda: string;
    hashtags: string[];
    abordagem: string;
    hook?: string;
    _gatilho_viral?: string;
    _score_viralidade?: number;
    _viral_rationale?: string;
  }>;
  agents_used: string[];
  critic_score?: number;
  critic_breakdown?: Record<string, number>;
  critic_controverso?: boolean;
  user_manual_score?: number;
  is_winner?: boolean;
  notes?: string;
};

const GATILHO_LABELS: Record<string, string> = {
  pattern_interrupt: "Pattern Interrupt",
  information_gap: "Information Gap",
  contrarian: "Contrarian",
  specific_number: "Numero",
  status_prize_frame: "Prize Frame",
  timing: "Timing",
  outro: "Outro",
};

const GATILHO_COLORS: Record<string, string> = {
  pattern_interrupt: "bg-purple-500/20 text-purple-200 border-purple-400/30",
  information_gap: "bg-amber-500/20 text-amber-200 border-amber-400/30",
  contrarian: "bg-red-500/20 text-red-200 border-red-400/30",
  specific_number: "bg-blue-500/20 text-blue-200 border-blue-400/30",
  status_prize_frame: "bg-pink-500/20 text-pink-200 border-pink-400/30",
  timing: "bg-green-500/20 text-green-200 border-green-400/30",
  outro: "bg-white/10 text-white/60 border-white/20",
};

type Batch = {
  id: number;
  prompt: string;
  user_brief?: string;
  created_at: string;
};

export default function TestBatchPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [batch, setBatch] = useState<Batch | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const r = await fetch(`/api/test-batch/${id}`, { cache: "no-store" });
      const d = await r.json();
      setBatch(d.batch);
      setVariants(d.variants || []);
    })();
  }, [id]);

  async function score(variantId: number, newScore: number) {
    const optimistic = variants.map((v) =>
      v.id === variantId ? { ...v, user_manual_score: newScore } : v,
    );
    setVariants(optimistic);
    await fetch(`/api/test-batch/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId, user_manual_score: newScore }),
    });
  }

  if (!batch) {
    return (
      <main className="min-h-screen px-4 py-8 max-w-6xl mx-auto">
        <div className="opacity-50 text-sm">Carregando...</div>
      </main>
    );
  }

  const avgScore =
    variants.filter((v) => typeof v.user_manual_score === "number").reduce((s, v) => s + (v.user_manual_score || 0), 0) /
    Math.max(1, variants.filter((v) => typeof v.user_manual_score === "number").length);

  return (
    <main className="min-h-screen px-4 sm:px-6 py-6 max-w-6xl mx-auto">
      <header className="mb-6 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/tests"
            className="text-[10px] tracking-widest uppercase opacity-60 hover:opacity-100"
          >
            ← Todos os testes
          </Link>
          <h1 className="text-xl sm:text-2xl mt-2 leading-snug" style={{ fontFamily: "Georgia, serif" }}>
            Batch #{id}
          </h1>
          <div className="text-sm opacity-80 mt-1">{batch.prompt}</div>
          {batch.user_brief && (
            <div className="text-xs opacity-60 mt-1 italic">briefing: {batch.user_brief}</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] tracking-widest uppercase opacity-60">Score médio</div>
          <div className="text-2xl font-semibold">
            {isNaN(avgScore) ? "—" : avgScore.toFixed(1)}
            <span className="text-xs opacity-50"> / 5</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {variants.map((v) => {
          const cap = v.caption_options?.[0];
          const slide0 = v.slides?.[0] as { title?: string; topLabel?: string } | undefined;
          return (
            <div
              key={v.id}
              className={`border rounded-lg p-4 ${
                v.is_winner
                  ? "border-[#d6e7c4] bg-[#d6e7c4]/5"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] tracking-widest uppercase opacity-70">
                  {v.variant_label}
                </div>
                {v.is_winner && (
                  <div className="text-[10px] tracking-widest uppercase bg-[#d6e7c4] text-black px-2 py-0.5 rounded-full font-bold">
                    Winner IA
                  </div>
                )}
              </div>
              {v.critic_score !== null && v.critic_score !== undefined && (
                <div className="mb-2">
                  <div className="flex items-center gap-2 text-[10px] opacity-80">
                    <span className="font-semibold">crítico ensemble: {v.critic_score}/100</span>
                    {v.critic_controverso && (
                      <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-200 border border-yellow-400/30">
                        controverso
                      </span>
                    )}
                  </div>
                  {v.critic_breakdown && (
                    <div className="flex gap-2 text-[9px] opacity-60 mt-1 flex-wrap">
                      <span>hook:{v.critic_breakdown.hook}/25</span>
                      <span>narr:{v.critic_breakdown.narrativa}/25</span>
                      <span>pers:{v.critic_breakdown.persona}/20</span>
                      <span>voc:{v.critic_breakdown.vocab}/15</span>
                      <span>cta:{v.critic_breakdown.cta}/15</span>
                      {typeof v.critic_breakdown.viral_score === "number" && (
                        <>
                          <span className="border-l border-white/10 pl-2">V:{v.critic_breakdown.viral_score}</span>
                          <span>B:{v.critic_breakdown.brand_score}</span>
                          <span>T:{v.critic_breakdown.technical_score}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              {cap?._gatilho_viral && (
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[9px] tracking-widest uppercase px-2 py-0.5 rounded border ${
                      GATILHO_COLORS[cap._gatilho_viral] || GATILHO_COLORS.outro
                    }`}
                  >
                    {GATILHO_LABELS[cap._gatilho_viral] || cap._gatilho_viral}
                  </span>
                  {typeof cap._score_viralidade === "number" && (
                    <span className="text-[9px] opacity-60">
                      viral {cap._score_viralidade}/10
                    </span>
                  )}
                </div>
              )}
              {slide0 && (
                <div className="border border-white/10 rounded p-3 mb-3 bg-black/30">
                  <div className="text-[10px] tracking-widest uppercase opacity-60 mb-1">
                    {slide0.topLabel || "CAPA"}
                  </div>
                  <div className="text-sm font-serif leading-snug">{slide0.title || "—"}</div>
                </div>
              )}
              {cap && (
                <div className="text-xs leading-relaxed opacity-90 whitespace-pre-wrap mb-3 line-clamp-6">
                  {cap.legenda}
                </div>
              )}
              {cap?.hashtags && (
                <div className="text-[10px] opacity-50 mb-3 break-words">
                  {(cap.hashtags || []).join(" ")}
                </div>
              )}
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => score(v.id, n)}
                    className={`flex-1 min-h-[36px] text-xs rounded border ${
                      v.user_manual_score === n
                        ? "bg-[#d6e7c4] text-black border-[#d6e7c4]"
                        : "border-white/15 hover:bg-white/5"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
