"use client";
import { useEffect, useRef, useState } from "react";
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

export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [prompt, setPrompt] = useState("5 plantas tropicais que sustentam jardins de sombra filtrada");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [selection, setSelection] = useState<Selection | null>(null);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [allImages, setAllImages] = useState<ImageRow[]>([]); // cover + inner + cta + alternatives

  async function doSmartSearch() {
    if (!prompt.trim()) return;
    setLoading(true);
    setStatus("Buscando 24 candidatas...");
    setError("");
    try {
      setStatus("IA analisando cada foto (pode levar 20-40s)...");
      const r = await fetch("/api/search-smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, candidateCount: 24 }),
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
      setStatus("");
    }
  }

  async function confirmAndGenerateCopy() {
    if (!selection) return;
    setLoading(true);
    setStatus("Escrevendo copy com base nas fotos...");
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
      setStatus("");
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
    <main className="min-h-screen px-6 py-8 max-w-7xl mx-auto">
      <header className="mb-8 flex items-baseline justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs tracking-[4px] uppercase opacity-60">Digital Paisagismo</div>
          <h1 className="text-3xl md:text-4xl mt-1" style={{ fontFamily: "Georgia, serif" }}>
            Gerador de <i>Carrossel</i>
          </h1>
          <div className="text-xs opacity-60 mt-1">IA escolhe a melhor foto pra capa e casa a copy com o que aparece em cada imagem.</div>
        </div>
        <Steps current={step} />
      </header>

      {error && (
        <div className="mb-6 border border-red-400/40 bg-red-400/10 rounded px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {step === 1 && (
        <Step1 prompt={prompt} setPrompt={setPrompt} loading={loading} status={status} onSearch={doSmartSearch} />
      )}
      {step === 2 && selection && (
        <Step2
          selection={selection}
          loading={loading}
          status={status}
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
    <div className="flex items-center gap-2 text-xs tracking-widest uppercase">
      {names.map((n, i) => {
        const idx = i + 1;
        return (
          <div key={n} className="flex items-center gap-2">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                idx === current ? "bg-white text-black" : idx < current ? "bg-white/30" : "bg-white/10"
              }`}
            >
              {idx}
            </span>
            <span className={idx === current ? "" : "opacity-50"}>{n}</span>
            {idx < 3 && <span className="opacity-20 mx-2">—</span>}
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
  status,
  onSearch,
}: {
  prompt: string;
  setPrompt: (s: string) => void;
  loading: boolean;
  status: string;
  onSearch: () => void;
}) {
  const [ideas, setIdeas] = useState<{ titulo: string; hook: string }[] | null>(null);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasErr, setIdeasErr] = useState("");
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoStatus, setAutoStatus] = useState("");

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
      setAutoStatus("Buscando tema viral...");
      const r = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicho: prompt || undefined }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const best = d.ideias?.[0];
      if (!best?.titulo) throw new Error("Sem ideia retornada");
      setPrompt(best.titulo);
      setAutoStatus("Gerando carrossel com o melhor tema...");
      // pequena pausa pra state flush, depois dispara o search
      await new Promise((r) => setTimeout(r, 50));
      onSearch();
    } catch (e: any) {
      setIdeasErr(e.message);
    } finally {
      setAutoLoading(false);
      setAutoStatus("");
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
        className="w-full bg-black/30 border border-white/15 rounded p-3 text-sm"
      />
      <div className="mt-4 flex gap-2 flex-wrap">
        <button
          disabled={anyLoading}
          onClick={autoViral}
          className="bg-[color:var(--color-accent,#d6e7c4)] text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-40"
          style={{ background: "#d6e7c4" }}
        >
          {autoLoading ? autoStatus || "..." : "Sugerir + gerar carrossel viral"}
        </button>
        <button
          disabled={anyLoading || !prompt.trim()}
          onClick={onSearch}
          className="bg-white text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-40"
        >
          {loading ? status || "Processando..." : "Gerar carrossel smart"}
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
  status,
  onBack,
  onConfirm,
  onSwap,
}: {
  selection: Selection;
  loading: boolean;
  status: string;
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
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="text-sm opacity-80">
          IA escolheu as 6 melhores. Capa = foto com maior impacto visual. <b>Quer trocar alguma?</b>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="px-4 py-2 text-xs tracking-wider uppercase opacity-70 hover:opacity-100">
            Voltar
          </button>
          <button
            disabled={loading}
            onClick={onConfirm}
            className="bg-white text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-40"
          >
            {loading ? status || "..." : "Confirmar e gerar copy →"}
          </button>
        </div>
      </div>

      {selection.rationale && (
        <div className="mb-4 text-xs opacity-60 italic">Curadoria: {selection.rationale}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
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
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
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

  const orderedImages = [selection.cover, ...selection.inner, selection.cta];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div className="text-sm opacity-80">Edite cada slide. Preview e download sao instantaneos.</div>
        <div className="flex gap-2">
          <button onClick={onBack} className="px-4 py-2 text-xs tracking-wider uppercase opacity-70 hover:opacity-100">
            Voltar
          </button>
          <button
            disabled={busyAll}
            onClick={downloadAll}
            className="bg-white text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-40"
          >
            {busyAll ? "Gerando..." : "Baixar todos os PNG"}
          </button>
        </div>
      </div>

      <CaptionPanel slides={slides} prompt={prompt} orderedImages={orderedImages} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
          <label className="block text-xs opacity-60 mb-1">Imagem</label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((im, idx) => (
              <button
                key={im.id}
                onClick={() => onChange({ imageIdx: idx })}
                className={`shrink-0 w-16 h-20 rounded overflow-hidden border-2 ${
                  slide.imageIdx === idx ? "border-white" : "border-white/0 opacity-60 hover:opacity-100"
                }`}
              >
                <img src={im.url} className="w-full h-full object-cover" alt="" />
              </button>
            ))}
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
}: {
  slides: SlideData[];
  prompt: string;
  orderedImages: ImageRow[];
}) {
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<CaptionOption[] | null>(null);
  const [error, setError] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [readImages, setReadImages] = useState(true);

  async function generate() {
    setLoading(true);
    setError("");
    setOptions(null);
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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function copyAll(opt: CaptionOption, i: number) {
    const full = `${opt.legenda}\n\n${(opt.hashtags || []).join(" ")}`;
    await navigator.clipboard.writeText(full);
    setCopiedIdx(i);
    setTimeout(() => setCopiedIdx(null), 1500);
  }

  return (
    <div className="mb-8 border border-white/10 rounded-lg bg-white/[0.02] p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="text-xs tracking-widest uppercase opacity-60 mb-1">Legendas virais</div>
          <div className="text-sm opacity-80">
            3 abordagens diferentes (storytelling, autoridade, pergunta).
          </div>
          <label className="mt-2 inline-flex items-center gap-2 text-xs opacity-85 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={readImages}
              onChange={(e) => setReadImages(e.target.checked)}
              className="accent-white"
            />
            Ler as fotos com Claude Vision antes (+certeiro, +10s)
          </label>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="bg-white text-black px-4 py-2 rounded tracking-wider uppercase text-xs disabled:opacity-40"
        >
          {loading ? "Gerando..." : options ? "Gerar de novo" : "Gerar legendas"}
        </button>
      </div>
      {error && <div className="text-red-300 text-sm mt-2">Erro: {error}</div>}
      {options && options.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {options.map((opt, i) => (
            <div key={i} className="border border-white/10 rounded bg-black/30 p-4 flex flex-col">
              <div className="text-[10px] tracking-widest uppercase opacity-60 mb-2">{opt.abordagem}</div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed mb-3 flex-1">{opt.legenda}</div>
              <div className="text-xs opacity-70 mb-3 break-words">
                {(opt.hashtags || []).join(" ")}
              </div>
              <button
                onClick={() => copyAll(opt, i)}
                className="mt-auto text-xs tracking-wider uppercase bg-white/10 hover:bg-white/20 border border-white/15 rounded px-3 py-2"
              >
                {copiedIdx === i ? "Copiado!" : "Copiar legenda + hashtags"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
