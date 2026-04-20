"use client";
import { useState } from "react";
import type { ImageRow, SlideData, SlideKind } from "@/lib/types";
import { downloadSlideFromDom } from "@/lib/capture";
import { SlidePreview } from "./SlidePreview";

function Field({
  label,
  value,
  onChange,
  big,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  big?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs opacity-60 mb-1">{label}</label>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-black/30 border border-white/15 rounded px-3 py-2 text-sm ${big ? "text-base" : ""}`}
      />
    </div>
  );
}

export function SlideEditor({
  index,
  slide,
  images,
  onChange,
}: {
  index: number;
  slide: SlideData;
  images: ImageRow[];
  onChange: (patch: Partial<SlideData>) => void;
}) {
  const img = images[slide.imageIdx] || images[0];
  const imgUrl = img?.url || "";
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    setBusy(true);
    try {
      await downloadSlideFromDom(index);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-white/10 rounded-lg bg-white/[0.02] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-white/[0.03]">
        <div className="flex items-center gap-3">
          <span className="text-xs tracking-widest uppercase opacity-60">Slide {index + 1}</span>
          <select
            value={slide.type}
            onChange={(e) => onChange({ type: e.target.value as SlideKind })}
            className="bg-black/40 border border-white/15 rounded px-2 py-1 text-xs"
          >
            <option value="cover">Capa</option>
            <option value="plantDetail">Planta</option>
            <option value="inspiration">Inspiracao</option>
            <option value="cta">CTA</option>
          </select>
        </div>
        <button
          disabled={busy}
          onClick={handleDownload}
          className="text-xs tracking-wider uppercase bg-white text-black px-3 py-1.5 rounded hover:bg-white/90 disabled:opacity-40"
        >
          {busy ? "..." : "Baixar PNG"}
        </button>
      </div>

      <div id={`slide-preview-${index}`}>
        <SlidePreview slide={slide} imageUrl={imgUrl} />
      </div>

      <div className="p-4 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs opacity-60 tracking-wider uppercase">
              Trocar imagem
            </label>
            <span className="text-[10px] opacity-50 tracking-wider">
              {images.length} disponíveis
            </span>
          </div>
          <div className="thumb-strip relative">
            <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth scrollbar-thin">
              {images.map((im, idx) => {
                const active = slide.imageIdx === idx;
                return (
                  <button
                    key={im.id}
                    onClick={() => onChange({ imageIdx: idx })}
                    className={`group relative shrink-0 snap-start w-20 h-24 rounded-md overflow-hidden transition-all duration-150 ${
                      active
                        ? "ring-2 ring-[#d6e7c4] shadow-[0_6px_20px_rgba(214,231,196,0.25)] scale-[0.98]"
                        : "ring-1 ring-white/10 opacity-55 hover:opacity-100 hover:ring-white/30"
                    }`}
                    title={im.arquivo}
                  >
                    <img
                      src={im.url}
                      className="w-full h-full object-cover"
                      alt=""
                      loading="lazy"
                    />
                    {active && (
                      <div className="absolute inset-0 bg-[#d6e7c4]/10 pointer-events-none" />
                    )}
                    {active && (
                      <div className="absolute top-1 right-1 bg-[#d6e7c4] text-black text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        ✓
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-0.5 text-[9px] text-white/80 text-center tracking-wide">
                      #{idx + 1}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-[#0a0d0b] to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-[#0a0d0b] to-transparent" />
          </div>
        </div>

        {slide.type === "cover" && (
          <>
            <Field label="Top label" value={slide.topLabel} onChange={(v) => onChange({ topLabel: v })} />
            <Field label="Numeral (1-2 digitos)" value={slide.numeral ?? ""} onChange={(v) => onChange({ numeral: v || null })} />
            <Field label="Titulo" value={slide.title} onChange={(v) => onChange({ title: v })} big />
            <Field
              label="Palavras em italico"
              value={(slide.italicWords || []).join(", ")}
              onChange={(v) => onChange({ italicWords: v.split(",").map((x) => x.trim()).filter(Boolean) })}
            />
          </>
        )}

        {slide.type === "plantDetail" && (
          <>
            <Field label="Nome popular" value={slide.nomePopular ?? ""} onChange={(v) => onChange({ nomePopular: v })} big />
            <Field label="Nome cientifico" value={slide.nomeCientifico ?? ""} onChange={(v) => onChange({ nomeCientifico: v })} />
          </>
        )}

        {slide.type === "inspiration" && (
          <>
            <Field label="Top label" value={slide.topLabel ?? ""} onChange={(v) => onChange({ topLabel: v })} />
            <Field label="Titulo" value={slide.title} onChange={(v) => onChange({ title: v })} big />
            <Field label="Subtitulo" value={slide.subtitle} onChange={(v) => onChange({ subtitle: v })} />
          </>
        )}

        {slide.type === "cta" && (
          <>
            <Field label="Pergunta" value={slide.pergunta} onChange={(v) => onChange({ pergunta: v })} big />
            <Field
              label="Palavras em italico"
              value={(slide.italicWords || []).join(", ")}
              onChange={(v) => onChange({ italicWords: v.split(",").map((x) => x.trim()).filter(Boolean) })}
            />
          </>
        )}
      </div>
    </div>
  );
}
