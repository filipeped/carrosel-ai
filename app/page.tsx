"use client";
import { useEffect, useState } from "react";

type ImageRow = {
  id: number;
  arquivo: string;
  url: string;
  estilo: string[];
  plantas: string[];
  mood: string[];
  tipo_area: string;
  descricao: string;
};

type SlideKind = "cover" | "inspiration" | "plantDetail" | "cta";

type SlideData = {
  type: SlideKind;
  imageIdx: number;
  // cover
  topLabel?: string;
  numeral?: string | null;
  title?: string;
  italicWords?: string[];
  // inspiration
  subtitle?: string;
  // plantDetail
  nomePopular?: string | null;
  nomeCientifico?: string | null;
  // cta
  pergunta?: string;
};

export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [prompt, setPrompt] = useState("5 plantas tropicais pra jardim pequeno sombreado");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [candidates, setCandidates] = useState<ImageRow[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number[]>([]);
  const [slides, setSlides] = useState<SlideData[]>([]);

  async function doSearch() {
    if (!prompt.trim()) return;
    setLoading(true);
    setStatus("Buscando fotos no banco...");
    setError("");
    try {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, count: 24 }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setCandidates(d.imagens || []);
      setSelectedIdx([]);
      setStep(2);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setStatus("");
    }
  }

  function toggleSelect(i: number) {
    setSelectedIdx((s) =>
      s.includes(i) ? s.filter((x) => x !== i) : s.length < 12 ? [...s, i] : s,
    );
  }

  async function generateCopy() {
    if (selectedIdx.length < 6) {
      setError("Selecione pelo menos 6 imagens");
      return;
    }
    setLoading(true);
    setStatus("Gerando copy com IA...");
    setError("");
    try {
      const chosen = selectedIdx.map((i) => candidates[i]);
      const r = await fetch("/api/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, images: chosen }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const sl: SlideData[] = (d.slides || []).slice(0, 6);
      while (sl.length < 6) {
        sl.push({ type: "inspiration", imageIdx: sl.length % selectedIdx.length, title: "", subtitle: "" });
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

  const selectedImages = selectedIdx.map((i) => candidates[i]);

  return (
    <main className="min-h-screen px-6 py-8 max-w-7xl mx-auto">
      <header className="mb-8 flex items-baseline justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs tracking-[4px] uppercase opacity-60">Digital Paisagismo</div>
          <h1 className="text-3xl md:text-4xl mt-1" style={{ fontFamily: "Georgia, serif" }}>
            Gerador de <i>Carrossel</i>
          </h1>
        </div>
        <Steps current={step} />
      </header>

      {error && (
        <div className="mb-6 border border-red-400/40 bg-red-400/10 rounded px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {step === 1 && (
        <Step1
          prompt={prompt}
          setPrompt={setPrompt}
          loading={loading}
          status={status}
          onSearch={doSearch}
        />
      )}
      {step === 2 && (
        <Step2
          candidates={candidates}
          selected={selectedIdx}
          toggle={toggleSelect}
          loading={loading}
          status={status}
          onBack={() => setStep(1)}
          onNext={generateCopy}
        />
      )}
      {step === 3 && (
        <Step3
          slides={slides}
          setSlides={setSlides}
          selectedImages={selectedImages}
          onBack={() => setStep(2)}
        />
      )}
    </main>
  );
}

function Steps({ current }: { current: number }) {
  const names = ["Tema", "Fotos", "Editor"];
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
  return (
    <div className="max-w-2xl">
      <label className="block mb-2 text-sm opacity-80">Tema do carrossel</label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        className="w-full bg-black/30 border border-white/15 rounded p-3 text-sm"
        placeholder="Ex: 5 plantas pra area externa de sol pleno..."
      />
      <button
        disabled={loading}
        onClick={onSearch}
        className="mt-4 bg-white text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-40"
      >
        {loading ? status || "Buscando..." : "Buscar fotos"}
      </button>
    </div>
  );
}

function Step2({
  candidates,
  selected,
  toggle,
  loading,
  status,
  onBack,
  onNext,
}: {
  candidates: ImageRow[];
  selected: number[];
  toggle: (i: number) => void;
  loading: boolean;
  status: string;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="text-sm opacity-80">
          Escolha entre <b>6 e 12 imagens</b>. Selecionadas: <b>{selected.length}</b>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="px-4 py-2 text-xs tracking-wider uppercase opacity-70 hover:opacity-100">
            Voltar
          </button>
          <button
            disabled={selected.length < 6 || loading}
            onClick={onNext}
            className="bg-white text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-40"
          >
            {loading ? status || "Gerando..." : "Gerar carrossel →"}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {candidates.map((img, i) => {
          const ord = selected.indexOf(i);
          const isOn = ord >= 0;
          return (
            <button
              key={img.id}
              onClick={() => toggle(i)}
              className={`relative aspect-[4/5] rounded overflow-hidden border-2 transition-all ${
                isOn ? "border-white scale-[0.96]" : "border-white/0 hover:border-white/40"
              }`}
            >
              <img src={img.url} className="w-full h-full object-cover" alt="" />
              {isOn && (
                <span className="absolute top-2 left-2 bg-white text-black text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold">
                  {ord + 1}
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-[10px] uppercase tracking-wider opacity-90">
                {img.estilo?.[0]} · {img.tipo_area}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Step3({
  slides,
  setSlides,
  selectedImages,
  onBack,
}: {
  slides: SlideData[];
  setSlides: (s: SlideData[]) => void;
  selectedImages: ImageRow[];
  onBack: () => void;
}) {
  function update(i: number, patch: Partial<SlideData>) {
    const next = [...slides];
    next[i] = { ...next[i], ...patch };
    setSlides(next);
  }

  async function downloadAll() {
    for (let i = 0; i < slides.length; i++) {
      const img = selectedImages[slides[i].imageIdx]?.url;
      if (!img) continue;
      const r = await fetch("/api/render-slide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide: slides[i], imageUrl: img }),
      });
      const d = await r.json();
      if (d.png) {
        const a = document.createElement("a");
        a.href = `data:image/png;base64,${d.png}`;
        a.download = `slide-${String(i + 1).padStart(2, "0")}.png`;
        a.click();
        await new Promise((res) => setTimeout(res, 250));
      }
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div className="text-sm opacity-80">Edite cada slide. Preview atualiza sozinho.</div>
        <div className="flex gap-2">
          <button onClick={onBack} className="px-4 py-2 text-xs tracking-wider uppercase opacity-70 hover:opacity-100">
            Voltar
          </button>
          <button
            onClick={downloadAll}
            className="bg-white text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs"
          >
            Baixar todos os PNG
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {slides.map((s, i) => (
          <SlideEditor
            key={i}
            index={i}
            slide={s}
            images={selectedImages}
            onChange={(patch) => update(i, patch)}
          />
        ))}
      </div>
    </div>
  );
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

  async function download() {
    const r = await fetch("/api/render-slide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slide, imageUrl: imgUrl }),
    });
    const d = await r.json();
    if (d.png) {
      const a = document.createElement("a");
      a.href = `data:image/png;base64,${d.png}`;
      a.download = `slide-${String(index + 1).padStart(2, "0")}.png`;
      a.click();
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
            <option value="plantDetail">Planta (nome + cientifico)</option>
            <option value="inspiration">Inspiracao (titulo + subtitulo)</option>
            <option value="cta">CTA (pergunta final)</option>
          </select>
        </div>
        <button
          onClick={download}
          className="text-xs tracking-wider uppercase bg-white text-black px-3 py-1.5 rounded hover:bg-white/90"
        >
          Baixar PNG
        </button>
      </div>

      <SlidePreview slide={slide} imageUrl={imgUrl} />

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
            <Field label="Numeral (opcional)" value={slide.numeral ?? ""} onChange={(v) => onChange({ numeral: v || null })} />
            <Field label="Titulo" value={slide.title} onChange={(v) => onChange({ title: v })} big />
            <Field
              label="Palavras em italico (separadas por virgula)"
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
              label="Palavras em italico (separadas por virgula)"
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
  // Preview em HTML (nao PNG) para ser instantaneo durante edicao
  const [html, setHtml] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { renderCover } = await import("@/templates/cover");
      const { renderPlantDetail } = await import("@/templates/plantDetail");
      const { renderInspiration } = await import("@/templates/inspiration");
      const { renderCta } = await import("@/templates/cta");
      let out = "";
      if (slide.type === "cover") {
        out = renderCover(
          {
            imageUrl,
            topLabel: slide.topLabel,
            numeral: slide.numeral ?? undefined,
            title: slide.title || "",
            italicWords: slide.italicWords || [],
          },
          origin,
        );
      } else if (slide.type === "plantDetail") {
        out = renderPlantDetail(
          {
            imageUrl,
            nomePopular: slide.nomePopular || "",
            nomeCientifico: slide.nomeCientifico || "",
          },
          origin,
        );
      } else if (slide.type === "cta") {
        out = renderCta(
          {
            imageUrl,
            pergunta: slide.pergunta || "",
            italicWords: slide.italicWords || [],
          },
          origin,
        );
      } else {
        out = renderInspiration(
          {
            imageUrl,
            title: slide.title || "",
            subtitle: slide.subtitle || "",
            topLabel: slide.topLabel || "",
          },
          origin,
        );
      }
      if (!cancelled) setHtml(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [slide, imageUrl]);

  return (
    <div className="relative w-full" style={{ aspectRatio: "1080/1350" }}>
      <iframe
        srcDoc={html}
        title="preview"
        className="absolute inset-0 w-full h-full bg-black"
        sandbox="allow-same-origin"
        style={{ border: 0, pointerEvents: "none" }}
      />
    </div>
  );
}
