"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ImageRow, Selection, SlideData } from "@/lib/types";
import { useProgressSim, useWakeLock, usePageVisible } from "@/lib/hooks";
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
  // State inicial sempre vazio (match SSR). Hidrata do localStorage em useEffect
  // abaixo — evita React error #418 (hydration mismatch).
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [prompt, setPrompt] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [currentFlow, setCurrentFlow] = useState<"search" | "copy" | null>(null);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [allImages, setAllImages] = useState<ImageRow[]>([]);
  const [autoGenCaption, setAutoGenCaption] = useState<number>(0);
  const [carrosselId, setCarrosselId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hidrata do localStorage apos mount (apos 1o render) — zero mismatch SSR/client
  useEffect(() => {
    const stored = loadStoredState();
    if (stored) {
      if (stored.step === 2 || stored.step === 3) setStep(stored.step);
      if (typeof stored.prompt === "string") setPrompt(stored.prompt);
      if (stored.selection) setSelection(stored.selection);
      if (Array.isArray(stored.slides)) setSlides(stored.slides);
      if (Array.isArray(stored.allImages)) setAllImages(stored.allImages);
      if (typeof stored.carrosselId === "string") setCarrosselId(stored.carrosselId);
    }
    setHydrated(true);
  }, []);

  // Salva state a cada mudanca — so depois de hydrated pra nao sobrescrever com vazio
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ step, prompt, selection, slides, allImages, carrosselId }),
      );
    } catch {}
  }, [step, prompt, selection, slides, allImages, carrosselId, hydrated]);

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
      localStorage.removeItem("carrosel:ideas:v1");   // Limpa ideias sugeridas
      // NAO limpa teses/obsImageIds — historico serve pra NAO repetir entre sessoes
    } catch {}
  }

  // Wake Lock: mantem a tela ligada enquanto o flow de gerar imagens/copy roda.
  // Evita o celular dormir e matar os fetchs. Fallback silencioso onde nao suporta.
  const wake = useWakeLock(loading);
  const pageVisible = usePageVisible();

  const searchProgress = useProgressSim(
    currentFlow === "search",
    [
      { name: "Interpretando o tema", seconds: 6 },
      { name: "Buscando candidatas no banco de 1500 fotos", seconds: 8 },
      { name: "IA analisando cada foto (qualidade, luz, composição)", seconds: 25 },
      { name: "Selecionando as 6 melhores + capa", seconds: 10 },
    ],
    "search",
  );

  const copyProgress = useProgressSim(
    currentFlow === "copy",
    [
      { name: "Lendo descrição visual de cada foto", seconds: 3 },
      { name: "Escrevendo texto dentro dos slides (cards)", seconds: 10 },
    ],
    "copy",
  );

  async function doCuradoria() {
    setLoading(true);
    setCurrentFlow("search");
    setError("");
    setCarrosselId(null);
    try {
      // Historico: ultimas teses (evita repetir) + ultimas imagens (evita mesma selecao)
      let excludeTeses: string[] = [];
      let excludeImageIds: number[] = [];
      try {
        excludeTeses = JSON.parse(localStorage.getItem("carrosel:teses:v1") || "[]");
        excludeImageIds = JSON.parse(
          localStorage.getItem("carrosel:obsImageIds:v1") || "[]",
        );
      } catch {}

      const r = await fetch("/api/curadoria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slideCount: 8,
          excludeTeses: excludeTeses.slice(-8),
          excludeImageIds: excludeImageIds.slice(-60),
          seed: Date.now(),
        }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        let msg = `HTTP ${r.status}`;
        try {
          msg = JSON.parse(text).error || msg;
        } catch {}
        throw new Error(msg);
      }
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const sel: Selection = d.selection;
      setSelection(sel);
      setAllImages([sel.cover, ...sel.inner, sel.cta, ...(sel.alternatives || [])]);
      setSlides(d.slides || []);
      setPrompt(d.tese_detectada || "[observacional]");
      setCarrosselId(d.carrosselId || null);
      setStep(3); // Pula Step 2 (ja tem slides)
      setAutoGenCaption(Date.now());

      // Persiste tese + ids pra evitar repetir no proximo click
      try {
        const prevT: string[] = JSON.parse(
          localStorage.getItem("carrosel:teses:v1") || "[]",
        );
        if (d.tese_detectada) {
          const nextT = [...prevT, d.tese_detectada].slice(-12);
          localStorage.setItem("carrosel:teses:v1", JSON.stringify(nextT));
        }
        const prevIds: number[] = JSON.parse(
          localStorage.getItem("carrosel:obsImageIds:v1") || "[]",
        );
        const newIds = [sel.cover, ...sel.inner, sel.cta]
          .map((im) => im?.id)
          .filter((x): x is number => typeof x === "number");
        const nextIds = [...prevIds, ...newIds].slice(-80);
        localStorage.setItem("carrosel:obsImageIds:v1", JSON.stringify(nextIds));
      } catch {}
    } catch (e) {
      setError(`Curadoria: ${(e as Error).message}`);
    } finally {
      setLoading(false);
      setCurrentFlow(null);
    }
  }

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
    <main className="min-h-screen px-4 sm:px-6 py-5 sm:py-8 max-w-7xl mx-auto">
      <header className="mb-5 sm:mb-8">
        {/* Linha 1: logo/titulo + menu mobile. Desktop: tambem stepper + navs inline */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] sm:text-xs tracking-[4px] uppercase opacity-60">
              Digital Paisagismo
            </div>
            <h1
              className="text-2xl sm:text-3xl md:text-4xl mt-0.5"
              style={{ fontFamily: "Georgia, serif" }}
            >
              Gerador de <i>Carrossel</i>
            </h1>
            <div className="text-xs opacity-60 mt-1 leading-relaxed hidden sm:block">
              IA escolhe a melhor foto pra capa e casa a copy com o que aparece em cada imagem.
            </div>
          </div>

          {/* Desktop: navs inline */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <Link
              href="/posts"
              className="text-xs tracking-widest uppercase opacity-60 hover:opacity-100 transition-opacity border border-white/20 hover:border-white/40 rounded px-3 py-1.5"
            >
              Posts ↗
            </Link>
            <Link
              href="/tests"
              className="text-xs tracking-widest uppercase opacity-60 hover:opacity-100 transition-opacity border border-white/20 hover:border-white/40 rounded px-3 py-1.5"
            >
              A/B
            </Link>
            {step !== 1 && (
              <button
                onClick={resetToStart}
                className="text-xs tracking-widest uppercase opacity-60 hover:opacity-100 transition-opacity border border-white/20 hover:border-white/40 rounded px-3 py-1.5"
                title="Volta pra etapa 1 e descarta o carrossel atual"
              >
                ↺ Recomeçar
              </button>
            )}
          </div>

          {/* Mobile: menu hamburguer */}
          <MobileMenu step={step} onReset={resetToStart} />
        </div>

        {/* Linha 2: stepper. Mobile apenas bullets. Desktop full */}
        <div className="mt-4 sm:mt-5">
          <Steps
            current={step}
            enabled={{
              1: true,
              2: !!selection,
              3: slides.length > 0,
            }}
            onNavigate={(s) => setStep(s)}
          />
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
          <div className="text-[10px] tracking-widest uppercase opacity-70 mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {currentFlow === "search" ? "Gerando seleção de imagens…" : "Gerando copy dos slides…"}
            </span>
            {wake.held && (
              <span className="text-[#d6e7c4] normal-case tracking-normal">
                · tela ativa (pode minimizar)
              </span>
            )}
            {!pageVisible && (
              <span className="text-amber-300 normal-case tracking-normal">
                · app em segundo plano, mantenha a tela desbloqueada
              </span>
            )}
          </div>
          <ProgressBar progress={currentFlow === "search" ? searchProgress : copyProgress} />
        </div>
      )}

      {step === 1 && (
        <Step1
          prompt={prompt}
          setPrompt={setPrompt}
          loading={loading}
          onSearch={doSmartSearch}
          onCuradoria={doCuradoria}
          curadoriaLoading={loading && currentFlow === "search" && !prompt.trim()}
        />
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

function MobileMenu({
  step,
  onReset,
}: {
  step: number;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sm:hidden relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-11 h-11 border rounded flex items-center justify-center text-lg transition-colors ${
          open ? "border-white/40 bg-white/10" : "border-white/15 hover:bg-white/5"
        }`}
        aria-label="Menu"
      >
        {open ? "×" : "≡"}
      </button>
      {open && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Fechar"
            tabIndex={-1}
          />
          <div className="absolute right-0 top-12 z-50 w-52 bg-[#131612] border border-white/15 rounded-lg shadow-2xl overflow-hidden">
            <Link
              href="/posts"
              onClick={() => setOpen(false)}
              className="block w-full text-left px-4 py-3 text-sm tracking-wide border-b border-white/5 hover:bg-white/5"
            >
              Posts ↗
            </Link>
            <Link
              href="/tests"
              onClick={() => setOpen(false)}
              className="block w-full text-left px-4 py-3 text-sm tracking-wide border-b border-white/5 hover:bg-white/5"
            >
              A/B Tests
            </Link>
            {step !== 1 && (
              <button
                onClick={() => {
                  setOpen(false);
                  onReset();
                }}
                className="block w-full text-left px-4 py-3 text-sm tracking-wide hover:bg-white/5"
              >
                ↺ Recomeçar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
