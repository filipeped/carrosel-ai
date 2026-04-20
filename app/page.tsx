"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ImageRow, Selection, SlideData } from "@/lib/types";
import { useProgressSim } from "@/lib/hooks";
import { ProgressBar } from "@/components/ProgressBar";
import { Steps } from "@/components/Steps";
import { Step1 } from "@/components/steps/Step1";
import { Step2 } from "@/components/steps/Step2";
import { Step3 } from "@/components/steps/Step3";

const STORAGE_KEY = "carrosel:state:v1";

function loadStoredState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function Home() {
  // Lazy init — lê localStorage ANTES do primeiro render (evita flash pra step 1)
  const stored = typeof window !== "undefined" ? loadStoredState() : null;

  const [step, setStep] = useState<1 | 2 | 3>(() =>
    stored?.step === 2 || stored?.step === 3 ? stored.step : 1,
  );
  const [prompt, setPrompt] = useState<string>(() => stored?.prompt || "");
  const [loading, setLoading] = useState(false);
  const [currentFlow, setCurrentFlow] = useState<"search" | "copy" | null>(null);
  const [error, setError] = useState("");

  const [selection, setSelection] = useState<Selection | null>(() => stored?.selection || null);
  const [slides, setSlides] = useState<SlideData[]>(() =>
    Array.isArray(stored?.slides) ? stored.slides : [],
  );
  const [allImages, setAllImages] = useState<ImageRow[]>(() =>
    Array.isArray(stored?.allImages) ? stored.allImages : [],
  );
  const [autoGenCaption, setAutoGenCaption] = useState<number>(0);
  const [carrosselId, setCarrosselId] = useState<string | null>(() =>
    typeof stored?.carrosselId === "string" ? stored.carrosselId : null,
  );

  // Salva state a cada mudanca
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ step, prompt, selection, slides, allImages, carrosselId }),
      );
    } catch {}
  }, [step, prompt, selection, slides, allImages, carrosselId]);

  function resetToStart() {
    setStep(1);
    setSelection(null);
    setSlides([]);
    setAllImages([]);
    setError("");
    setCarrosselId(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("carrosel:caption:v1");
    } catch {}
  }

  const searchProgress = useProgressSim(currentFlow === "search", [
    { name: "Interpretando o tema", seconds: 6 },
    { name: "Buscando candidatas no banco de 1500 fotos", seconds: 8 },
    { name: "IA analisando cada foto (qualidade, luz, composição)", seconds: 25 },
    { name: "Selecionando as 6 melhores + capa", seconds: 10 },
  ]);

  const copyProgress = useProgressSim(currentFlow === "copy", [
    { name: "Lendo descrição visual de cada foto", seconds: 3 },
    { name: "Escrevendo copy dos slides (imitando seu tom)", seconds: 10 },
  ]);

  async function doSmartSearch(overridePrompt?: string) {
    const effective = (overridePrompt ?? prompt).trim();
    if (!effective) return;
    if (overridePrompt) setPrompt(overridePrompt);
    setLoading(true);
    setCurrentFlow("search");
    setError("");
    setCarrosselId(null); // novo tema, novo carrossel
    try {
      const r = await fetch("/api/search-smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: effective, candidateCount: 24 }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const sel: Selection = d.selection;
      setSelection(sel);
      setAllImages([sel.cover, ...sel.inner, sel.cta, ...sel.alternatives]);
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setCurrentFlow(null);
    }
  }

  async function confirmAndGenerateCopy() {
    if (!selection) return;
    setLoading(true);
    setCurrentFlow("copy");
    setError("");
    try {
      const ordered = [selection.cover, ...selection.inner, selection.cta];
      const r = await fetch("/api/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, images: ordered }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      // Aceita 6-10 slides (architect decide dinamicamente)
      const sl: SlideData[] = (d.slides || []).slice(0, 10);
      while (sl.length < 6) {
        sl.push({ type: "inspiration", imageIdx: sl.length, title: "", subtitle: "" });
      }
      setSlides(sl);
      setStep(3);
      setAutoGenCaption(Date.now());

      // Cria linha em carrosseis_gerados (dedup + historico)
      fetch("/api/carrosseis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          slides: sl,
          imagens_ids: ordered.map((im) => im.id),
        }),
      })
        .then((res) => res.json())
        .then((saved) => {
          if (saved.id) setCarrosselId(saved.id);
        })
        .catch(() => {});

      // Gera legendas em background e salva no Supabase
      const imageUrls = Array.from(
        new Set(ordered.map((im) => im.url).filter(Boolean)),
      ).slice(0, 10);
      fetch("/api/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, slides: sl, imageUrls }),
      })
        .then((res) => res.json())
        .then((cap) => {
          if (cap.options?.length) {
            fetch("/api/captions-history", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt, options: cap.options }),
            }).catch(() => {});
          }
        })
        .catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setCurrentFlow(null);
    }
  }

  function swapSelection(role: "cover" | "cta" | "inner", altIdx: number, innerPos?: number) {
    if (!selection) return;
    const alt = selection.alternatives[altIdx];
    if (!alt) return;
    const next: Selection = { ...selection, alternatives: [...selection.alternatives] };
    if (role === "cover") {
      next.alternatives.splice(altIdx, 1, selection.cover);
      next.cover = alt;
    } else if (role === "cta") {
      next.alternatives.splice(altIdx, 1, selection.cta);
      next.cta = alt;
    } else if (role === "inner" && innerPos !== undefined) {
      const oldInner = selection.inner[innerPos];
      next.alternatives.splice(altIdx, 1, oldInner);
      const newInner = [...selection.inner];
      newInner[innerPos] = alt;
      next.inner = newInner;
    }
    setSelection(next);
    setAllImages([next.cover, ...next.inner, next.cta, ...next.alternatives]);
  }

  return (
    <main className="min-h-screen px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto">
      <header className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4">
        <div>
          <div className="text-[10px] sm:text-xs tracking-[4px] uppercase opacity-60">Digital Paisagismo</div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl mt-1" style={{ fontFamily: "Georgia, serif" }}>
            Gerador de <i>Carrossel</i>
          </h1>
          <div className="text-xs opacity-60 mt-1 leading-relaxed">
            IA escolhe a melhor foto pra capa e casa a copy com o que aparece em cada imagem.
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Steps
            current={step}
            enabled={{
              1: true,
              2: !!selection,
              3: slides.length > 0,
            }}
            onNavigate={(s) => setStep(s)}
          />
          <Link
            href="/posts"
            className="text-[10px] sm:text-xs tracking-widest uppercase opacity-60 hover:opacity-100 transition-opacity border border-white/20 hover:border-white/40 rounded px-3 py-1.5"
          >
            Posts ↗
          </Link>
          <Link
            href="/tests"
            className="text-[10px] sm:text-xs tracking-widest uppercase opacity-60 hover:opacity-100 transition-opacity border border-white/20 hover:border-white/40 rounded px-3 py-1.5"
          >
            A/B
          </Link>
          {step !== 1 && (
            <button
              onClick={resetToStart}
              className="text-[10px] sm:text-xs tracking-widest uppercase opacity-60 hover:opacity-100 transition-opacity border border-white/20 hover:border-white/40 rounded px-3 py-1.5"
              title="Volta pra etapa 1 e descarta o carrossel atual"
            >
              ↺ Recomeçar
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-6 border border-red-400/40 bg-red-400/10 rounded px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Barra global — fica visivel em qualquer step enquanto gera */}
      {currentFlow && (
        <div className="mb-6 border border-[#d6e7c4]/30 bg-[#d6e7c4]/5 rounded-lg px-4 py-3">
          <div className="text-[10px] tracking-widest uppercase opacity-70 mb-1">
            {currentFlow === "search" ? "Gerando seleção de imagens…" : "Gerando copy dos slides…"} (continua mesmo se trocar de aba)
          </div>
          <ProgressBar progress={currentFlow === "search" ? searchProgress : copyProgress} />
        </div>
      )}

      {step === 1 && (
        <Step1 prompt={prompt} setPrompt={setPrompt} loading={loading} onSearch={doSmartSearch} />
      )}
      {step === 2 && selection && (
        <Step2
          selection={selection}
          loading={loading}
          onBack={() => setStep(1)}
          onConfirm={confirmAndGenerateCopy}
          onSwap={swapSelection}
        />
      )}
      {step === 3 && selection && (
        <Step3
          slides={slides}
          setSlides={setSlides}
          allImages={allImages}
          setAllImages={setAllImages}
          selection={selection}
          prompt={prompt}
          onBack={() => setStep(2)}
          autoGenTrigger={autoGenCaption}
          carrosselId={carrosselId}
        />
      )}
    </main>
  );
}
