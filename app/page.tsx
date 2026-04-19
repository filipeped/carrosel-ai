"use client";
import { useEffect, useRef, useState } from "react";

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
          prompt={prompt}
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
  const [ideas, setIdeas] = useState<{ titulo: string; hook: string }[] | null>(null);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasErr, setIdeasErr] = useState("");

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

  return (
    <div className="max-w-3xl">
      <label className="block mb-2 text-sm opacity-80">Tema do carrossel</label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        className="w-full bg-black/30 border border-white/15 rounded p-3 text-sm"
        placeholder="Ex: 5 plantas pra area externa de sol pleno..."
      />

      <div className="mt-4 flex gap-2 flex-wrap">
        <button
          disabled={loading}
          onClick={onSearch}
          className="bg-white text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-40"
        >
          {loading ? status || "Buscando..." : "Buscar fotos"}
        </button>
        <button
          type="button"
          disabled={ideasLoading}
          onClick={generateIdeas}
          className="border border-white/20 px-5 py-2.5 rounded tracking-wider uppercase text-xs hover:bg-white/5 disabled:opacity-40"
        >
          {ideasLoading ? "Pensando..." : ideas ? "Gerar mais ideias" : "Sugerir temas virais"}
        </button>
      </div>

      {ideasErr && <div className="mt-4 text-red-300 text-sm">Erro: {ideasErr}</div>}

      {ideas && ideas.length > 0 && (
        <div className="mt-6">
          <div className="text-xs tracking-widest uppercase opacity-60 mb-3">
            Temas sugeridos — clica pra usar
          </div>
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
  prompt,
  onBack,
}: {
  slides: SlideData[];
  setSlides: (s: SlideData[]) => void;
  selectedImages: ImageRow[];
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
        const img = selectedImages[slides[i].imageIdx]?.url;
        if (!img) continue;
        await downloadOne(slides[i], img, i);
        await new Promise((res) => setTimeout(res, 400));
      }
    } finally {
      setBusyAll(false);
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
            disabled={busyAll}
            onClick={downloadAll}
            className="bg-white text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-40"
          >
            {busyAll ? "Gerando..." : "Baixar todos os PNG"}
          </button>
        </div>
      </div>

      <CaptionPanel slides={slides} prompt={prompt} selectedImages={selectedImages} />

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

type CaptionOption = {
  abordagem: string;
  hook: string;
  legenda: string;
  hashtags: string[];
};

function CaptionPanel({
  slides,
  prompt,
  selectedImages,
}: {
  slides: SlideData[];
  prompt: string;
  selectedImages: ImageRow[];
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
      // coleta URLs unicas das imagens realmente usadas nos slides
      const imageUrls = readImages
        ? Array.from(
            new Set(
              slides
                .map((s) => selectedImages[s.imageIdx]?.url)
                .filter((u): u is string => !!u),
            ),
          ).slice(0, 6)
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
            IA gera 3 legendas completas pro Instagram em abordagens diferentes (storytelling, autoridade,
            pergunta).
          </div>
          <label className="mt-2 inline-flex items-center gap-2 text-xs opacity-85 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={readImages}
              onChange={(e) => setReadImages(e.target.checked)}
              className="accent-white"
            />
            Ler as fotos com Claude Vision antes (mais certeiro, +10s)
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
      await downloadOne(slide, imgUrl, index);
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
            <option value="plantDetail">Planta (nome + cientifico)</option>
            <option value="inspiration">Inspiracao (titulo + subtitulo)</option>
            <option value="cta">CTA (pergunta final)</option>
          </select>
        </div>
        <button
          disabled={busy}
          onClick={handleDownload}
          className="text-xs tracking-wider uppercase bg-white text-black px-3 py-1.5 rounded hover:bg-white/90 disabled:opacity-40"
        >
          {busy ? "Gerando..." : "Baixar PNG"}
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

  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.33);

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

async function downloadOne(slide: SlideData, imageUrl: string, index: number) {
  try {
    const r = await fetch("/api/render-slide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slide, imageUrl }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      alert(`Erro no slide ${index + 1}: ${err.error || r.status}`);
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `slide-${String(index + 1).padStart(2, "0")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e: any) {
    alert(`Falha ao baixar slide ${index + 1}: ${e.message || e}`);
  }
}
