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
  caption_options: Array<{ legenda: string; hashtags: string[]; abordagem: string; hook?: string }>;
  agents_used: string[];
  critic_score?: number;
  user_manual_score?: number;
  is_winner?: boolean;
  notes?: string;
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
                <div className="text-[10px] opacity-60 mb-2">
                  crítico: {v.critic_score}/100
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
