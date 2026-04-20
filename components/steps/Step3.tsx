"use client";
import { useEffect, useState } from "react";
import type { ImageRow, Selection, SlideData } from "@/lib/types";
import { useProgressSim } from "@/lib/hooks";
import { captureSlideAsBlob, downloadSlideFromDom } from "@/lib/capture";
import { CaptionPanel } from "../CaptionPanel";
import { SlideEditor } from "../SlideEditor";
import { InstagramPreviewModal } from "../InstagramPreviewModal";

export function Step3({
  slides,
  setSlides,
  allImages,
  selection,
  prompt,
  onBack,
  autoGenTrigger,
  carrosselId,
}: {
  slides: SlideData[];
  setSlides: (s: SlideData[]) => void;
  allImages: ImageRow[];
  selection: Selection;
  prompt: string;
  onBack: () => void;
  autoGenTrigger?: number;
  carrosselId?: string | null;
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[] | null>(null);
  const [capturingPreview, setCapturingPreview] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem("carrosel:caption:v1");
      if (v) setSelectedCaption(v);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (selectedCaption) localStorage.setItem("carrosel:caption:v1", selectedCaption);
      else localStorage.removeItem("carrosel:caption:v1");
    } catch {}
  }, [selectedCaption]);

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

  async function openPreview() {
    if (!selectedCaption.trim()) {
      alert("Escolha uma legenda antes de postar (clica em 'Usar esta' no card que quiser).");
      return;
    }
    setCapturingPreview(true);
    setPostResult(null);
    try {
      const dataUrls: string[] = [];
      for (let i = 0; i < slides.length; i++) {
        const blob = await captureSlideAsBlob(i);
        if (!blob) throw new Error(`falha ao capturar slide ${i + 1}`);
        const u = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result as string);
          fr.onerror = () => reject(fr.error);
          fr.readAsDataURL(blob);
        });
        dataUrls.push(u);
      }
      setPreviewImages(dataUrls);
      setPreviewOpen(true);
    } catch (e) {
      setPostResult({ ok: false, error: (e as Error).message || String(e) });
    } finally {
      setCapturingPreview(false);
    }
  }

  async function postarNoInstagram() {
    if (!previewImages) return;
    setBusyPost(true);
    setPostResult(null);
    try {
      const batchId = String(Date.now());
      const imageUrls: string[] = [];
      for (let i = 0; i < previewImages.length; i++) {
        const png = previewImages[i].replace(/^data:image\/\w+;base64,/, "");
        const up = await fetch("/api/upload-slide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ png, batchId, index: i }),
        });
        if (!up.ok) {
          const err = await up.json().catch(() => ({ error: `status ${up.status}` }));
          throw new Error(`upload slide ${i + 1}: ${err.error}`);
        }
        const { url } = await up.json();
        imageUrls.push(url);
      }
      const r = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls, caption: selectedCaption, carrosselId }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "falha");
      if (d.already_posted) {
        setPostResult({
          ok: true,
          permalink: d.permalink,
          error: "Ja publicado anteriormente",
        });
      } else {
        setPostResult({ ok: true, permalink: d.permalink });
      }
    } catch (e) {
      setPostResult({ ok: false, error: (e as Error).message || String(e) });
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
            className="flex-1 sm:flex-none px-3 sm:px-4 py-2 min-h-[44px] text-xs tracking-wider uppercase opacity-60 hover:opacity-100 transition-opacity"
          >
            ← Voltar
          </button>
          <button
            disabled={busyAll}
            onClick={downloadAll}
            className="flex-1 sm:flex-none border border-white/15 px-4 sm:px-5 py-2.5 min-h-[44px] rounded tracking-wider uppercase text-xs disabled:opacity-40 hover:bg-white/5 transition-colors"
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
      {postResult?.error && !postResult?.ok && (
        <div className="mb-6 border border-red-400/40 bg-red-400/10 rounded-lg px-5 py-4 text-sm text-red-200">
          <div className="font-medium mb-1">Erro ao postar no Instagram</div>
          <div className="text-xs opacity-80">{postResult.error}</div>
        </div>
      )}

      {previewOpen && previewImages && (
        <InstagramPreviewModal
          images={previewImages}
          caption={selectedCaption}
          onCancel={() => setPreviewOpen(false)}
          onConfirm={postarNoInstagram}
          publishing={busyPost}
          publishProgress={publishProgress}
          postResult={postResult}
        />
      )}

      <CaptionPanel
        slides={slides}
        prompt={prompt}
        orderedImages={orderedImages}
        onCaptionPicked={setSelectedCaption}
        selectedCaption={selectedCaption}
        onPublish={openPreview}
        publishing={busyPost || capturingPreview}
        publishProgress={publishProgress}
        autoGenTrigger={autoGenTrigger}
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
