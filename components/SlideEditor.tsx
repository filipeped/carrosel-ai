"use client";
import { useState } from "react";
import type { ImageRow, SlideData, SlideKind } from "@/lib/types";
import { renderBatch, downloadUrl, canShareFiles, shareSlides } from "@/lib/capture";
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
  prompt,
  allSlides,
  userBrief,
}: {
  index: number;
  slide: SlideData;
  images: ImageRow[];
  onChange: (patch: Partial<SlideData>) => void;
  prompt?: string;
  allSlides?: SlideData[];
  userBrief?: string;
}) {
  const img = images[slide.imageIdx] || images[0];
  const imgUrl = img?.url || "";
  const [busy, setBusy] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  async function handleDownload() {
    if (!img) return;
    setBusy(true);
    try {
      const { slides: rendered } = await renderBatch([slide], [img]);
      const url = rendered[0]?.url;
      if (!url) throw new Error("render retornou vazio");
      const filename = `slide-${String(index + 1).padStart(2, "0")}.png`;
      if (canShareFiles()) {
        try {
          await shareSlides([url]);
          return;
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
        }
      }
      await downloadUrl(url, filename);
    } catch (e) {
      alert(`Erro ao baixar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function regenerateThisSlide() {
    if (!img) return;
    setRegenBusy(true);
    try {
      const r = await fetch("/api/copy-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt || "",
          slideIndex: index,
          slideType: slide.type,
          image: img,
          allSlides,
          userBrief,
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (!d.slide) throw new Error("retorno vazio");
      // Aplica só os campos do slide gerado, preserva imageIdx
      const { type, ...rest } = d.slide;
      onChange({ ...rest });
    } catch (e) {
      alert(`Erro: ${(e as Error).message}`);
    } finally {
      setRegenBusy(false);
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
        <div className="flex items-center gap-2">
          <button
            disabled={regenBusy}
            onClick={regenerateThisSlide}
            className="text-xs tracking-wider uppercase border border-white/20 px-3 py-1.5 rounded hover:bg-white/5 disabled:opacity-40"
            title="Regenera so esse slide, mantendo os outros"
          >
            {regenBusy ? "..." : "↻"}
          </button>
          <button
            disabled={busy}
            onClick={handleDownload}
            className="text-xs tracking-wider uppercase bg-white text-black px-3 py-1.5 rounded hover:bg-white/90 disabled:opacity-40"
          >
            {busy ? "..." : "Baixar PNG"}
          </button>
        </div>
      </div>

      <div id={`slide-preview-${index}`} className="relative">
        <SlidePreview slide={slide} imageUrl={imgUrl} />
        {regenBusy && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 text-center px-4">
            <div className="w-8 h-8 border-2 border-white/30 border-t-[#d6e7c4] rounded-full animate-spin"></div>
            <div className="text-xs tracking-widest uppercase opacity-90">
              Regenerando slide {index + 1}
            </div>
            <div className="text-[10px] opacity-60">~8 segundos</div>
          </div>
        )}
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
            <Field label="Fechamento" value={slide.fechamento || slide.pergunta} onChange={(v) => onChange({ fechamento: v })} big />
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
