"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";

type AnaliseVisual = {
  qualidade: number;
  composicao: number;
  luz: number;
  cover_potential: number;
  descricao_visual: string;
  hero_element: string;
  mood_real: string[];
  palavras_chave: string[];
};

type ImageRow = {
  id: number;
  arquivo: string;
  url: string;
  estilo: string[];
  plantas: string[];
  mood: string[];
  tipo_area: string;
  descricao: string;
  analise_visual?: AnaliseVisual;
};

type SlideKind = "cover" | "inspiration" | "plantDetail" | "cta";

type SlideData = {
  type: SlideKind;
  imageIdx: number;
  topLabel?: string;
  numeral?: string | null;
  title?: string;
  italicWords?: string[];
  subtitle?: string;
  nomePopular?: string | null;
  nomeCientifico?: string | null;
  pergunta?: string;
};

type Selection = {
  cover: ImageRow;
  inner: ImageRow[];
  cta: ImageRow;
  alternatives: ImageRow[];
  rationale?: string;
};

// Barra de progresso com fases nomeadas e timer estimado.
export type ProgressState = { pct: number; phase: string; etaSec: number } | null;

function useProgressSim(active: boolean, phases: { name: string; seconds: number }[]) {
  const [state, setState] = useState<ProgressState>(null);
  useEffect(() => {
    if (!active) {
      setState(null);
      return;
    }
    const totalSec = phases.reduce((s, p) => s + p.seconds, 0);
    const start = Date.now();
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      let acc = 0;
      let phaseName = phases[0].name;
      for (const p of phases) {
        if (elapsed < acc + p.seconds) {
          phaseName = p.name;
          break;
        }
        acc += p.seconds;
      }
      // Avanca ate 95% baseado no tempo estimado, deixa 5% pro fim real
      const pct = Math.min(95, (elapsed / totalSec) * 95);
      const etaSec = Math.max(0, totalSec - elapsed);
      setState({ pct, phase: phaseName, etaSec });
    };
    tick();
    const id = setInterval(tick, 300);
    return () => clearInterval(id);
  }, [active]);
  return state;
}

function ProgressBar({ progress }: { progress: ProgressState }) {
  if (!progress) return null;
  return (
    <div className="mt-4 border border-white/10 rounded-lg bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-2 text-xs">
        <span className="opacity-85">{progress.phase}</span>
        <span className="tabular-nums opacity-70">
          {Math.round(progress.pct)}% · {Math.ceil(progress.etaSec)}s
        </span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#d6e7c4] transition-all duration-300 ease-out"
          style={{ width: `${progress.pct}%` }}
        />
      </div>
    </div>
  );
}

const STORAGE_KEY = "carrosel:state:v1";

async function mapLimit<T, R>(items: T[], limit: number, fn: (it: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentFlow, setCurrentFlow] = useState<"search" | "copy" | null>(null);
  const [error, setError] = useState("");

  const [selection, setSelection] = useState<Selection | null>(null);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [allImages, setAllImages] = useState<ImageRow[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Restaura estado salvo no mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.prompt) setPrompt(s.prompt);
        if (s.selection) setSelection(s.selection);
        if (Array.isArray(s.slides)) setSlides(s.slides);
        if (Array.isArray(s.allImages)) setAllImages(s.allImages);
        if (s.step === 2 || s.step === 3) setStep(s.step);
      }
    } catch {}
    setHydrated(true);
  }, []);

  // Persiste estado a cada mudanca
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ step, prompt, selection, slides, allImages }),
      );
    } catch {}
  }, [hydrated, step, prompt, selection, slides, allImages]);

  function resetToStart() {
    setStep(1);
    setSelection(null);
    setSlides([]);
    setAllImages([]);
    setError("");
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  const searchProgress = useProgressSim(currentFlow === "search", [
    { name: "Interpretando o tema", seconds: 6 },
    { name: "Buscando candidatas no banco de 1500 fotos", seconds: 8 },
    { name: "IA analisando cada foto (qualidade, luz, composição)", seconds: 25 },
    { name: "Selecionando as 6 melhores + capa", seconds: 10 },
  ]);

  const copyProgress = useProgressSim(currentFlow === "copy", [
    { name: "Lendo descrição visual de cada foto", seconds: 3 },
    { name: "Escrevendo copy dos 6 slides (imitando seu tom)", seconds: 10 },
  ]);

  async function doSmartSearch(overridePrompt?: string) {
    const effective = (overridePrompt ?? prompt).trim();
    if (!effective) return;
    if (overridePrompt) setPrompt(overridePrompt);
    setLoading(true);
    setCurrentFlow("search");
    setError("");
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
    } catch (e: any) {
      setError(e.message);
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
      const sl: SlideData[] = (d.slides || []).slice(0, 6);
      while (sl.length < 6) {
        sl.push({ type: "inspiration", imageIdx: sl.length, title: "", subtitle: "" });
      }
      setSlides(sl);
      setStep(3);
    } catch (e: any) {
      setError(e.message);
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
        <div className="flex items-center gap-3">
          <Steps current={step} />
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

      {step === 1 && (
        <>
          <Step1 prompt={prompt} setPrompt={setPrompt} loading={loading} onSearch={doSmartSearch} />
          <ProgressBar progress={searchProgress} />
        </>
      )}
      {step === 2 && selection && (
        <>
          <Step2
            selection={selection}
            loading={loading}
            onBack={() => setStep(1)}
            onConfirm={confirmAndGenerateCopy}
            onSwap={swapSelection}
          />
          <ProgressBar progress={copyProgress} />
        </>
      )}
      {step === 3 && selection && (
        <Step3
          slides={slides}
          setSlides={setSlides}
          allImages={allImages}
          selection={selection}
          prompt={prompt}
          onBack={() => setStep(2)}
        />
      )}
    </main>
  );
}

function Steps({ current }: { current: number }) {
  const names = ["Tema", "Curadoria", "Editor"];
  return (
    <div className="flex items-center gap-2 text-[10px] sm:text-xs tracking-widest uppercase">
      {names.map((n, i) => {
        const idx = i + 1;
        return (
          <div key={n} className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                idx === current ? "bg-white text-black" : idx < current ? "bg-white/30" : "bg-white/10"
              }`}
            >
              {idx}
            </span>
            <span className={idx === current ? "" : "opacity-50"}>{n}</span>
            {idx < 3 && <span className="opacity-20 mx-1 sm:mx-2">—</span>}
          </div>
        );
      })}
    </div>
  );
}

function Step1({
  prompt,
  setPrompt,
  loading,
  onSearch,
}: {
  prompt: string;
  setPrompt: (s: string) => void;
  loading: boolean;
  onSearch: (overridePrompt?: string) => void;
}) {
  const [ideas, setIdeas] = useState<{ titulo: string; hook: string }[] | null>(null);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasErr, setIdeasErr] = useState("");
  const [autoLoading, setAutoLoading] = useState(false);

  const ideasProgress = useProgressSim(ideasLoading || autoLoading, [
    { name: "Gerando 16 ideias virais (fase 1)", seconds: 20 },
    { name: "Filtrando as 8 mais fortes (curadoria IA)", seconds: 18 },
  ]);

  async function generateIdeas() {
    setIdeasLoading(true);
    setIdeasErr("");
    try {
      const r = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicho: prompt || undefined }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setIdeas(d.ideias || []);
    } catch (e: any) {
      setIdeasErr(e.message);
    } finally {
      setIdeasLoading(false);
    }
  }

  async function autoViral() {
    setAutoLoading(true);
    setIdeasErr("");
    try {
      const r = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicho: prompt || undefined }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const best = d.ideias?.[0];
      if (!best?.titulo) throw new Error("Sem ideia retornada");
      // passa direto pro search — evita closure stale do prompt
      onSearch(best.titulo);
    } catch (e: any) {
      setIdeasErr(e.message);
    } finally {
      setAutoLoading(false);
    }
  }

  const anyLoading = loading || autoLoading;

  return (
    <div className="max-w-3xl">
      <label className="block mb-2 text-sm opacity-80">Tema do carrossel</label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder="Ex: entradas monumentais em condominios fechados..."
        className="w-full bg-black/30 border border-white/15 rounded p-3 text-sm"
      />
      <div className="mt-4 grid grid-cols-1 sm:flex sm:flex-wrap gap-2">
        <button
          disabled={anyLoading}
          onClick={autoViral}
          className="bg-[color:var(--color-accent,#d6e7c4)] text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-40"
          style={{ background: "#d6e7c4" }}
        >
          {autoLoading ? "Processando..." : "Sugerir + gerar carrossel viral"}
        </button>
        <button
          disabled={anyLoading || !prompt.trim()}
          onClick={() => onSearch()}
          className="bg-white text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-40"
        >
          {loading ? "Processando..." : "Gerar carrossel smart"}
        </button>
        <button
          type="button"
          disabled={ideasLoading || autoLoading}
          onClick={generateIdeas}
          className="border border-white/20 px-5 py-2.5 rounded tracking-wider uppercase text-xs hover:bg-white/5 disabled:opacity-40"
        >
          {ideasLoading ? "Pensando..." : ideas ? "Gerar mais ideias" : "Sugerir temas virais"}
        </button>
      </div>
      <ProgressBar progress={ideasProgress} />
      {ideasErr && <div className="mt-4 text-red-300 text-sm">Erro: {ideasErr}</div>}
      {ideas && ideas.length > 0 && (
        <div className="mt-6">
          <div className="text-xs tracking-widest uppercase opacity-60 mb-3">Temas sugeridos</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ideas.map((idea, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPrompt(idea.titulo)}
                className={`text-left border rounded-lg p-4 transition-colors ${
                  prompt === idea.titulo
                    ? "border-white bg-white/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/30"
                }`}
              >
                <div className="font-medium text-sm leading-snug mb-2">{idea.titulo}</div>
                <div className="text-xs opacity-60 leading-snug">{idea.hook}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Step2({
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
            className="flex-1 sm:flex-none px-4 py-2 text-xs tracking-wider uppercase opacity-70 hover:opacity-100"
          >
            ← Voltar
          </button>
          <button
            disabled={loading}
            onClick={onConfirm}
            className="flex-1 sm:flex-none bg-white text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-40"
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

function Step3({
  slides,
  setSlides,
  allImages,
  selection,
  prompt,
  onBack,
}: {
  slides: SlideData[];
  setSlides: (s: SlideData[]) => void;
  allImages: ImageRow[];
  selection: Selection;
  prompt: string;
  onBack: () => void;
}) {
  function update(i: number, patch: Partial<SlideData>) {
    const next = [...slides];
    next[i] = { ...next[i], ...patch };
    setSlides(next);
  }

  const [busyAll, setBusyAll] = useState(false);
  const [busyPost, setBusyPost] = useState(false);
  const [postResult, setPostResult] = useState<{ ok: boolean; permalink?: string; error?: string } | null>(null);
  const [selectedCaption, setSelectedCaption] = useState<string>("");

  const publishProgress = useProgressSim(busyPost, [
    { name: "Capturando os 6 slides do preview", seconds: 8 },
    { name: "Subindo PNGs pro Supabase Storage", seconds: 10 },
    { name: "Instagram: criando containers de mídia", seconds: 12 },
    { name: "Instagram: aguardando processamento", seconds: 15 },
    { name: "Publicando carrossel", seconds: 8 },
  ]);

  async function downloadAll() {
    setBusyAll(true);
    try {
      for (let i = 0; i < slides.length; i++) {
        await downloadSlideFromDom(i);
        await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      setBusyAll(false);
    }
  }

  async function postarNoInstagram() {
    if (!selectedCaption.trim()) {
      alert("Escolha uma legenda antes de postar (clica em 'Copiar legenda + hashtags' no card que quiser usar).");
      return;
    }
    if (!confirm("Postar esse carrossel agora no Instagram?")) return;
    setBusyPost(true);
    setPostResult(null);
    try {
      // render server-side com concorrencia controlada (max 3) — evita overwhelm do Puppeteer
      const pngs = await mapLimit(slides, 3, async (s, i) => {
        const imgUrl = allImages[s.imageIdx]?.url || allImages[0]?.url;
        if (!imgUrl) throw new Error(`slide ${i + 1} sem imagem`);
        const r = await fetch("/api/render-slide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slide: s, imageUrl: imgUrl }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: `status ${r.status}` }));
          throw new Error(`falha ao renderizar slide ${i + 1}: ${err.error}`);
        }
        const buf = await r.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
        return btoa(binary);
      });
      const r = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pngs, caption: selectedCaption }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "falha");
      setPostResult({ ok: true, permalink: d.permalink });
    } catch (e: any) {
      setPostResult({ ok: false, error: e.message || String(e) });
    } finally {
      setBusyPost(false);
    }
  }

  const orderedImages = [selection.cover, ...selection.inner, selection.cta];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-6 sm:mb-8 gap-3">
        <div>
          <div className="text-[10px] tracking-[4px] uppercase opacity-50 mb-1">
            Step 3 — Editor & Publicação
          </div>
          <h2 className="text-lg sm:text-xl leading-snug" style={{ fontFamily: "Georgia, serif" }}>
            Ajuste os slides, gere a <i>legenda</i> e poste.
          </h2>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={onBack}
            className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs tracking-wider uppercase opacity-60 hover:opacity-100 transition-opacity"
          >
            ← Voltar
          </button>
          <button
            disabled={busyAll}
            onClick={downloadAll}
            className="flex-1 sm:flex-none border border-white/15 px-4 sm:px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-40 hover:bg-white/5 transition-colors"
          >
            {busyAll ? "Gerando..." : "Baixar PNGs"}
          </button>
        </div>
      </div>

      {postResult?.ok && (
        <div className="mb-6 border border-[#d6e7c4]/50 bg-[#d6e7c4]/10 rounded-lg px-5 py-4 text-sm flex items-center gap-3">
          <span className="text-xl">✓</span>
          <div className="flex-1">
            <div className="font-medium">Post publicado no Instagram</div>
            {postResult.permalink && (
              <a
                href={postResult.permalink}
                target="_blank"
                rel="noreferrer"
                className="text-xs opacity-80 underline hover:opacity-100"
              >
                {postResult.permalink}
              </a>
            )}
          </div>
        </div>
      )}
      {postResult?.error && (
        <div className="mb-6 border border-red-400/40 bg-red-400/10 rounded-lg px-5 py-4 text-sm text-red-200">
          <div className="font-medium mb-1">Erro ao postar no Instagram</div>
          <div className="text-xs opacity-80">{postResult.error}</div>
        </div>
      )}

      <CaptionPanel
        slides={slides}
        prompt={prompt}
        orderedImages={orderedImages}
        onCaptionPicked={setSelectedCaption}
        selectedCaption={selectedCaption}
        onPublish={postarNoInstagram}
        publishing={busyPost}
        publishProgress={publishProgress}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {slides.map((s, i) => (
          <SlideEditor
            key={i}
            index={i}
            slide={s}
            images={allImages}
            onChange={(patch) => update(i, patch)}
          />
        ))}
      </div>
    </div>
  );
}

async function captureSlideAsBlob(index: number): Promise<Blob | null> {
  const wrap = document.getElementById(`slide-preview-${index}`);
  if (!wrap) return null;
  const iframe = wrap.querySelector("iframe") as HTMLIFrameElement | null;
  if (!iframe || !iframe.contentDocument) return null;
  const inner = iframe.contentDocument.body;
  try {
    const dataUrl = await toPng(inner, {
      width: 1080,
      height: 1350,
      pixelRatio: 1,
      cacheBust: true,
      skipFonts: true,
    });
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}

async function downloadSlideFromDom(index: number) {
  const wrap = document.getElementById(`slide-preview-${index}`);
  if (!wrap) return;
  const iframe = wrap.querySelector("iframe") as HTMLIFrameElement | null;
  if (!iframe || !iframe.contentDocument) return;
  const inner = iframe.contentDocument.body;
  try {
    const dataUrl = await toPng(inner, {
      width: 1080,
      height: 1350,
      pixelRatio: 1,
      cacheBust: true,
      skipFonts: true,
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `slide-${String(index + 1).padStart(2, "0")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (e: any) {
    alert(`Falha no slide ${index + 1}: ${e.message || e}`);
  }
}

function SlideEditor({
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
            {/* fade edges pra sinalizar que rola */}
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

function SlidePreview({ slide, imageUrl }: { slide: SlideData; imageUrl: string }) {
  const [html, setHtml] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.33);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { renderCover } = await import("@/templates/cover");
      const { renderPlantDetail } = await import("@/templates/plantDetail");
      const { renderInspiration } = await import("@/templates/inspiration");
      const { renderCta } = await import("@/templates/cta");
      let out = "";
      const fontsLink = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;1,9..144,300;1,9..144,400&family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;
      if (slide.type === "cover") {
        out = renderCover({ imageUrl, topLabel: slide.topLabel, numeral: slide.numeral ?? undefined, title: slide.title || "", italicWords: slide.italicWords || [] }, origin);
      } else if (slide.type === "plantDetail") {
        out = renderPlantDetail({ imageUrl, nomePopular: slide.nomePopular || "", nomeCientifico: slide.nomeCientifico || "" }, origin);
      } else if (slide.type === "cta") {
        out = renderCta({ imageUrl, pergunta: slide.pergunta || "", italicWords: slide.italicWords || [] }, origin);
      } else {
        out = renderInspiration({ imageUrl, title: slide.title || "", subtitle: slide.subtitle || "", topLabel: slide.topLabel || "" }, origin);
      }
      // injeta link do Google Fonts (templates simplificados nao tem mais)
      out = out.replace(/<head>/i, `<head>${fontsLink}`);
      if (!cancelled) setHtml(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [slide, imageUrl]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const compute = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / 1080);
    };
    compute();
    const obs = new ResizeObserver(compute);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden bg-black"
      style={{ aspectRatio: "1080/1350" }}
    >
      <iframe
        srcDoc={html}
        title="preview"
        sandbox="allow-same-origin"
        style={{
          width: 1080,
          height: 1350,
          border: 0,
          position: "absolute",
          top: 0,
          left: 0,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

type CaptionOption = {
  abordagem: string;
  hook: string;
  legenda: string;
  hashtags: string[];
};

function CaptionPanel({
  slides,
  prompt,
  orderedImages,
  onCaptionPicked,
  selectedCaption,
  onPublish,
  publishing,
  publishProgress,
}: {
  slides: SlideData[];
  prompt: string;
  orderedImages: ImageRow[];
  onCaptionPicked?: (fullText: string) => void;
  selectedCaption?: string;
  onPublish?: () => void;
  publishing?: boolean;
  publishProgress?: ProgressState;
}) {
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<CaptionOption[] | null>(null);
  const [error, setError] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [readImages, setReadImages] = useState(true);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const captionProgress = useProgressSim(loading, [
    { name: "Claude lendo as 6 fotos do carrossel", seconds: 12 },
    { name: "Escrevendo 3 legendas no seu tom real", seconds: 20 },
    { name: "Limpando hashtags e emojis", seconds: 3 },
  ]);

  // Detecta troca de imagens — marca stale + auto-regenera depois de 2s de calma
  const imagesKey = useMemo(
    () => orderedImages.map((im) => im.id).join(","),
    [orderedImages],
  );
  const lastKeyRef = useRef<string | null>(null);
  const regenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (options && lastKeyRef.current && lastKeyRef.current !== imagesKey) {
      setStale(true);
      if (onCaptionPicked) onCaptionPicked("");
      setPickedIdx(null);
      if (regenTimerRef.current) clearTimeout(regenTimerRef.current);
      regenTimerRef.current = setTimeout(() => {
        generate();
      }, 2000);
    }
    lastKeyRef.current = imagesKey;
    return () => {
      if (regenTimerRef.current) clearTimeout(regenTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesKey, options]);

  async function generate() {
    setLoading(true);
    setError("");
    setOptions(null);
    setStale(false);
    setPickedIdx(null);
    if (onCaptionPicked) onCaptionPicked("");
    try {
      const imageUrls = readImages
        ? Array.from(new Set(orderedImages.map((im) => im.url).filter(Boolean))).slice(0, 6)
        : undefined;
      const r = await fetch("/api/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, slides, imageUrls }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setOptions(d.options || []);
      lastKeyRef.current = imagesKey;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function pickCaption(opt: CaptionOption, i: number) {
    const full = `${opt.legenda}\n\n${(opt.hashtags || []).join(" ")}`;
    await navigator.clipboard.writeText(full);
    setCopiedIdx(i);
    setPickedIdx(i);
    if (onCaptionPicked) onCaptionPicked(full);
    setTimeout(() => setCopiedIdx(null), 1500);
  }

  return (
    <div className="mb-6 sm:mb-8 border border-white/10 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 gap-4">
        <div className="flex-1">
          <div className="text-[10px] tracking-[4px] uppercase opacity-50 mb-1">
            Legendas
          </div>
          <h3 className="text-base sm:text-lg mb-1 leading-snug" style={{ fontFamily: "Georgia, serif" }}>
            Gere 3 versões no <i>seu tom real</i> e poste.
          </h3>
          <div className="text-xs opacity-70 leading-relaxed">
            IA lê seus 20 posts top e imita seu ritmo, hashtags e emojis.
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-xs opacity-75 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={readImages}
              onChange={(e) => setReadImages(e.target.checked)}
              className="accent-[#d6e7c4]"
            />
            Ler também as fotos com Claude Vision antes
          </label>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button
            onClick={generate}
            disabled={loading}
            className="w-full sm:w-auto bg-white text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-40 transition-colors hover:bg-white/90"
          >
            {loading ? "Gerando..." : options ? "Gerar de novo" : "Gerar legendas"}
          </button>
          {onPublish && (
            <button
              onClick={onPublish}
              disabled={publishing || !selectedCaption || !options}
              className="w-full sm:w-auto bg-[#d6e7c4] text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:shadow-[0_4px_20px_rgba(214,231,196,0.4)]"
              title={
                !options
                  ? "Gere as legendas primeiro"
                  : !selectedCaption
                    ? "Escolha uma legenda clicando em 'Usar esta'"
                    : publishing
                      ? "Postando..."
                      : "Postar no Instagram agora"
              }
            >
              {publishing ? "Postando..." : "Postar no Instagram ↗"}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="text-red-300 text-sm mb-3 bg-red-400/10 border border-red-400/30 rounded px-3 py-2">
          {error}
        </div>
      )}
      {stale && !loading && (
        <div className="text-amber-200 text-sm mb-3 bg-amber-400/10 border border-amber-400/30 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <b>Imagens trocadas.</b> Regenerando legendas automaticamente com as novas fotos…
          </div>
          <button
            onClick={() => {
              if (regenTimerRef.current) clearTimeout(regenTimerRef.current);
              generate();
            }}
            className="shrink-0 bg-amber-400/30 hover:bg-amber-400/50 text-amber-100 px-3 py-1.5 rounded text-xs tracking-wider uppercase"
          >
            Agora
          </button>
        </div>
      )}
      <ProgressBar progress={captionProgress} />
      {publishing && publishProgress && <ProgressBar progress={publishProgress} />}

      {options && options.length > 0 && (
        <>
          <div className="text-[10px] tracking-widest uppercase opacity-50 mt-5 mb-3">
            Escolha uma abaixo · a marcada será usada no post
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {options.map((opt, i) => {
              const isActive = pickedIdx === i;
              return (
                <div
                  key={i}
                  className={`relative rounded-lg p-4 flex flex-col transition-all duration-200 ${
                    isActive
                      ? "border-2 border-[#d6e7c4] bg-[#d6e7c4]/5 shadow-[0_8px_30px_rgba(214,231,196,0.15)]"
                      : "border border-white/10 bg-black/20 hover:border-white/25"
                  }`}
                >
                  {isActive && (
                    <div className="absolute -top-2 -right-2 bg-[#d6e7c4] text-black text-[9px] tracking-widest uppercase px-2 py-1 rounded-full font-bold">
                      Escolhida
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        isActive ? "bg-[#d6e7c4]" : "bg-white/30"
                      }`}
                    />
                    <div className="text-[10px] tracking-widest uppercase opacity-70">
                      {opt.abordagem}
                    </div>
                  </div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed mb-3 flex-1 opacity-90">
                    {opt.legenda}
                  </div>
                  <div className="text-[11px] opacity-60 mb-3 break-words leading-relaxed">
                    {(opt.hashtags || []).join(" ")}
                  </div>
                  <button
                    onClick={() => pickCaption(opt, i)}
                    className={`mt-auto text-xs tracking-wider uppercase rounded-md px-3 py-2.5 transition-colors ${
                      isActive
                        ? "bg-[#d6e7c4] text-black hover:bg-[#c9dbb4]"
                        : "bg-white/10 hover:bg-white/20 border border-white/15"
                    }`}
                  >
                    {copiedIdx === i
                      ? "Copiado ✓"
                      : isActive
                        ? "Usar esta legenda"
                        : "Usar esta"}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
