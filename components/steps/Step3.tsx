"use client";
import { useEffect, useState } from "react";
import type { ImageRow, Selection, SlideData } from "@/lib/types";
import { useProgressSim } from "@/lib/hooks";
import { captureSlideAsBlob, downloadSlideFromDom } from "@/lib/capture";
import { CaptionPanel } from "../CaptionPanel";
import { SlideEditor } from "../SlideEditor";
import { InstagramPreviewModal } from "../InstagramPreviewModal";
import { ProgressBar } from "../ProgressBar";

export function Step3({
  slides,
  setSlides,
  allImages,
  setAllImages,
  selection,
  prompt,
  onBack,
  autoGenTrigger,
  carrosselId,
}: {
  slides: SlideData[];
  setSlides: (s: SlideData[]) => void;
  allImages: ImageRow[];
  setAllImages?: (imgs: ImageRow[]) => void;
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
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [regenCopy, setRegenCopy] = useState(false);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [customBrief, setCustomBrief] = useState("");

  async function fetchMoreImages() {
    if (!setAllImages) return;
    setFetchingMore(true);
    try {
      const r = await fetch("/api/search-more", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          excludeIds: allImages.map((i) => i.id),
          limit: 18,
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (!d.images?.length) {
        alert("Sem mais imagens no banco pra esse tema.");
        return;
      }
      setAllImages([...allImages, ...d.images]);
    } catch (e) {
      alert(`Erro: ${(e as Error).message}`);
    } finally {
      setFetchingMore(false);
    }
  }

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
    { name: "Capturando os slides do preview", seconds: 8 },
    { name: "Subindo PNGs pro Supabase Storage", seconds: 10 },
    { name: "Instagram: criando containers de mídia", seconds: 12 },
    { name: "Instagram: aguardando processamento", seconds: 15 },
    { name: "Publicando carrossel", seconds: 8 },
  ]);

  const regenCopyProgress = useProgressSim(regenCopy, [
    { name: "Lendo descrição visual de cada foto", seconds: 3 },
    { name: "Escrevendo texto dentro dos slides (cards)", seconds: 10 },
    { name: "Gerando legendas do post em background", seconds: 15 },
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

  async function regenerateCopy() {
    setRegenCopy(true);
    try {
      // Pega as imagens atualmente atribuidas aos slides (respeita trocas)
      const ordered = slides.map((s) => allImages[s.imageIdx] || allImages[0]);
      const r = await fetch("/api/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, images: ordered, userBrief: customBrief }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const sl = (d.slides || []).slice(0, 10);
      while (sl.length < 6) {
        sl.push({ type: "inspiration", imageIdx: sl.length, title: "", subtitle: "" });
      }
      setSlides(sl);

      // Regenera legendas em background com prompt + slides novos
      const imageUrls = Array.from(
        new Set(ordered.map((im) => im?.url).filter(Boolean)),
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
      alert(`Erro ao regenerar: ${(e as Error).message}`);
    } finally {
      setRegenCopy(false);
    }
  }

  async function saveDraft() {
    if (!carrosselId) {
      alert("Carrossel ainda nao foi salvo. Aguarde alguns segundos.");
      return;
    }
    setSavingDraft(true);
    try {
      const r = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: carrosselId,
          caption: selectedCaption,
          slides, // persiste edicoes dos slides
          imagens_ids: allImages.map((i) => i.id),
        }),
      });
      if (!r.ok) throw new Error("falha ao salvar");
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2500);
    } catch (e) {
      alert(`Erro: ${(e as Error).message}`);
    } finally {
      setSavingDraft(false);
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
      // Envia slides + imagens_ids atuais pra persistir a versao FINAL editada
      // (senao a linha fica com o estado antigo de quando foi criada).
      const orderedNow = [selection.cover, ...selection.inner, selection.cta];
      const imagens_ids = orderedNow.map((im) => im?.id).filter(Boolean);
      const r = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrls,
          caption: selectedCaption,
          carrosselId,
          slides,
          imagens_ids,
        }),
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
            disabled={fetchingMore || !setAllImages}
            onClick={fetchMoreImages}
            className="flex-1 sm:flex-none border border-white/15 px-4 sm:px-5 py-2.5 min-h-[44px] rounded tracking-wider uppercase text-xs disabled:opacity-40 hover:bg-white/5 transition-colors"
            title="Busca mais imagens do banco pra esse tema"
          >
            {fetchingMore ? "Buscando..." : `+ Mais imagens (${allImages.length})`}
          </button>
          <div className="flex-1 sm:flex-none flex gap-1">
            <button
              disabled={regenCopy}
              onClick={regenerateCopy}
              className="flex-1 sm:flex-none border border-white/15 px-4 sm:px-5 py-2.5 min-h-[44px] rounded tracking-wider uppercase text-xs disabled:opacity-40 hover:bg-white/5 transition-colors"
              title="Regenera todos os slides. Pra regenerar so 1, clica no ↻ de cada card"
            >
              {regenCopy ? "Gerando..." : "↻ Gerar copy"}
            </button>
            <button
              onClick={() => setBriefOpen((v) => !v)}
              className={`min-h-[44px] px-3 border rounded tracking-wider uppercase text-xs transition-colors ${
                briefOpen || customBrief
                  ? "border-[#d6e7c4] text-[#d6e7c4] bg-[#d6e7c4]/10"
                  : "border-white/15 hover:bg-white/5"
              }`}
              title="Briefing extra pra copy (opcional)"
            >
              {customBrief ? "✎" : "+"}
            </button>
          </div>
          <button
            disabled={savingDraft || !carrosselId}
            onClick={saveDraft}
            className="flex-1 sm:flex-none border border-white/15 px-4 sm:px-5 py-2.5 min-h-[44px] rounded tracking-wider uppercase text-xs disabled:opacity-40 hover:bg-white/5 transition-colors"
            title={!carrosselId ? "Aguarde o carrossel ser salvo" : "Salva como rascunho pra postar depois"}
          >
            {savingDraft ? "Salvando..." : draftSaved ? "✓ Salvo" : "Salvar rascunho"}
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

      {briefOpen && (
        <div className="mb-4 border border-[#d6e7c4]/30 bg-[#d6e7c4]/5 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] tracking-widest uppercase opacity-80">
              Briefing extra — só afeta texto dentro dos cards (não a legenda do post)
            </div>
            {customBrief && (
              <button
                onClick={() => setCustomBrief("")}
                className="text-[10px] uppercase opacity-60 hover:opacity-100"
              >
                limpar
              </button>
            )}
          </div>
          <textarea
            value={customBrief}
            onChange={(e) => setCustomBrief(e.target.value)}
            rows={3}
            placeholder="Ex: foque mais na Strelitzia, quero tom menos técnico, não fale de 'alto padrão'..."
            className="w-full bg-black/30 border border-white/10 rounded p-3 text-sm"
          />
          <div className="text-[10px] opacity-50 mt-2">
            Clica "↻ Gerar copy" pra usar esse briefing nos slides. A legenda do post continua sendo gerada separada, complementar aos slides.
          </div>
        </div>
      )}

      {regenCopy && (
        <div className="mb-4 border border-[#d6e7c4]/30 bg-[#d6e7c4]/5 rounded-lg px-4 py-3">
          <div className="text-[10px] tracking-widest uppercase opacity-70 mb-1">
            Regenerando copy de todos os slides…
          </div>
          <ProgressBar progress={regenCopyProgress} />
        </div>
      )}

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
            prompt={prompt}
            allSlides={slides}
            userBrief={customBrief}
          />
        ))}
      </div>
    </div>
  );
}
