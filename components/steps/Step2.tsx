"use client";
import { useState } from "react";
import type { Selection } from "@/lib/types";

export function Step2({
  selection,
  loading,
  onBack,
  onConfirm,
  onSwap,
}: {
  selection: Selection;
  loading: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onSwap: (role: "cover" | "cta" | "inner", altIdx: number, innerPos?: number) => void;
}) {
  const [showAlts, setShowAlts] = useState(false);
  const [swapTarget, setSwapTarget] = useState<{ role: "cover" | "cta" | "inner"; pos?: number } | null>(null);

  const selected = [
    { role: "cover" as const, img: selection.cover, label: "CAPA" },
    { role: "inner" as const, img: selection.inner[0], label: "SLIDE 2", pos: 0 },
    { role: "inner" as const, img: selection.inner[1], label: "SLIDE 3", pos: 1 },
    { role: "inner" as const, img: selection.inner[2], label: "SLIDE 4", pos: 2 },
    { role: "inner" as const, img: selection.inner[3], label: "SLIDE 5", pos: 3 },
    { role: "cta" as const, img: selection.cta, label: "CTA" },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <div className="text-sm opacity-80 leading-relaxed">
          IA escolheu as 6 melhores. Capa = foto com maior impacto visual.{" "}
          <b>Quer trocar alguma?</b>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onBack}
            className="flex-1 sm:flex-none px-4 py-2 min-h-[44px] text-xs tracking-wider uppercase opacity-70 hover:opacity-100"
          >
            ← Voltar
          </button>
          <button
            disabled={loading}
            onClick={onConfirm}
            className="flex-1 sm:flex-none bg-white text-black px-5 py-2.5 min-h-[44px] rounded tracking-wider uppercase text-xs disabled:opacity-40"
          >
            {loading ? "Processando..." : "Gerar copy →"}
          </button>
        </div>
      </div>

      {selection.rationale && (
        <div className="mb-4 text-xs opacity-60 italic">Curadoria: {selection.rationale}</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-6">
        {selected.map((s, i) => (
          <div key={i} className="relative">
            <div
              className={`aspect-[4/5] rounded overflow-hidden border-2 ${
                s.role === "cover" ? "border-white" : "border-white/20"
              }`}
            >
              <img src={s.img.url} className="w-full h-full object-cover" alt="" />
            </div>
            <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded tracking-wider">
              {s.label}
            </div>
            <button
              onClick={() => {
                setShowAlts(true);
                setSwapTarget({ role: s.role, pos: s.pos });
              }}
              className="absolute bottom-2 right-2 bg-white/90 text-black text-[10px] px-2 py-1 rounded uppercase tracking-wider hover:bg-white"
            >
              Trocar
            </button>
            {s.img.analise_visual && (
              <div className="mt-1 text-[10px] opacity-70 leading-tight">
                cover {s.img.analise_visual.cover_potential.toFixed(1)} · comp {s.img.analise_visual.composicao.toFixed(1)}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => setShowAlts((v) => !v)}
        className="text-xs tracking-wider uppercase underline opacity-80 hover:opacity-100"
      >
        {showAlts ? "Esconder alternativas" : `Ver alternativas (${selection.alternatives.length})`}
      </button>

      {showAlts && (
        <div className="mt-4">
          {swapTarget && (
            <div className="mb-3 text-xs opacity-80">
              Clica numa alternativa pra trocar{" "}
              <b>
                {swapTarget.role === "cover"
                  ? "CAPA"
                  : swapTarget.role === "cta"
                  ? "CTA"
                  : `slide ${(swapTarget.pos ?? 0) + 2}`}
              </b>
            </div>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
            {selection.alternatives.map((alt, i) => (
              <button
                key={alt.id}
                onClick={() => {
                  if (swapTarget) {
                    onSwap(swapTarget.role, i, swapTarget.pos);
                    setSwapTarget(null);
                    setShowAlts(false);
                  }
                }}
                className="relative aspect-[4/5] rounded overflow-hidden border-2 border-white/0 hover:border-white/60 transition-all"
              >
                <img src={alt.url} className="w-full h-full object-cover" alt="" />
                {alt.analise_visual && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-[10px]">
                    c{alt.analise_visual.cover_potential.toFixed(0)} · q{alt.analise_visual.qualidade.toFixed(0)}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
