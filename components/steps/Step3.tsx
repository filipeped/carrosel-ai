"use client";
import { useEffect, useState } from "react";
import type { ImageRow, Selection, SlideData } from "@/lib/types";
import { useProgressSim, useWakeLock } from "@/lib/hooks";
import { renderBatch, downloadUrl, shareSlides, canShareFiles } from "@/lib/capture";
import { CaptionPanel } from "../CaptionPanel";
import { SlideEditor } from "../SlideEditor";
import { InstagramPreviewModal } from "../InstagramPreviewModal";
import { ProgressBar } from "../ProgressBar";

function MenuItem({
  label,
  hint,
  onClick,
  disabled,
  accent,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-4 py-3 border-b border-white/5 last:border-b-0 transition-colors disabled:opacity-40 ${
        accent
          ? "text-[#d6e7c4] hover:bg-[#d6e7c4]/10"
          : "hover:bg-white/5"
      }`}
    >
      <div className="text-sm tracking-wide">{label}</div>
      {hint && <div className="text-[11px] opacity-50 mt-0.5">{hint}</div>}
    </button>
  );
}

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

  const publishProgress = useProgressSim(
    busyPost,
    [
      { name: "Instagram: criando containers de mídia", seconds: 12 },
      { name: "Instagram: aguardando processamento", seconds: 15 },
      { name: "Publicando carrossel", seconds: 8 },
    ],
    "publish",
  );
  const renderProgress = useProgressSim(
    capturingPreview || busyAll,
    [
      { name: "Renderizando slides em alta qualidade (server)", seconds: 15 },
      { name: "Otimizando PNGs e subindo", seconds: 8 },
    ],
    "render",
  );
  // Wake Lock: mantem o device acordado durante qualquer operacao longa
  useWakeLock(busyAll || busyPost || capturingPreview || regenCopy || fetchingMore || savingDraft);

  const regenCopyProgress = useProgressSim(
    regenCopy,
    [
      { name: "Lendo descrição visual de cada foto", seconds: 3 },
      { name: "Escrevendo texto dentro dos slides (cards)", seconds: 10 },
      { name: "Gerando legendas do post em background", seconds: 15 },
    ],
    "regenCopy",
  );

  const [actionsOpen, setActionsOpen] = useState(false);

  const [realRenderProgress, setRealRenderProgress] = useState<{
    ready: number;
    total: number;
    status: string;
  } | null>(null);

  async function downloadAll() {
    setBusyAll(true);
    setPostResult(null);
    setRealRenderProgress(null);
    try {
      const orderedForRender = slides.map((s) => allImages[s.imageIdx] || allImages[0]);
      const { slides: rendered } = await renderBatch(slides, orderedForRender, (u) =>
        setRealRenderProgress({ ready: u.slidesReady, total: u.totalSlides, status: u.status }),
      );
      const urls = rendered.map((r) => r.url);
      // Mobile (iOS/Android): tenta Share API nativa pra abrir menu "Salvar na galeria"
      if (canShareFiles()) {
        try {
          await shareSlides(urls);
          return;
        } catch (shareErr) {
          // user cancelou share ou deu erro — cai pra download direto
          if ((shareErr as Error).name === "AbortError") return;
        }
      }
      // Desktop + Android fallback: baixa cada PNG via fetch + <a download>
      for (let i = 0; i < urls.length; i++) {
        await downloadUrl(urls[i], `slide-${String(i + 1).padStart(2, "0")}.png`);
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (e) {
      setPostResult({ ok: false, error: (e as Error).message || String(e) });
    } finally {
      setBusyAll(false);
      setRealRenderProgress(null);
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
      // Se status nao-ok, response pode ser HTML (ex: 504 timeout Vercel).
      // r.json() quebra com 'Unexpected token A' porque comeca com 'An error...'.
      // Leemos como texto primeiro e tratamos.
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        const msg = text.startsWith("{")
          ? (() => {
              try {
                return JSON.parse(text).error;
              } catch {
                return "";
              }
            })()
          : "";
        throw new Error(msg || `HTTP ${r.status} — servidor demorou demais ou caiu`);
      }
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
      // Salva SOMENTE as imagens escolhidas (ordem final), nao o pool inteiro.
      // Antes enviava allImages (24 fotos do banco) — virou bug ao reabrir rascunho.
      const orderedNow = [selection.cover, ...selection.inner, selection.cta];
      const imagens_ids = orderedNow.map((im) => im?.id).filter(Boolean);

      const r = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: carrosselId,
          caption: selectedCaption,  // legenda selecionada no momento
          slides,                     // slides com edicoes atuais
          imagens_ids,                // ordem final das escolhidas
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

  // URLs publicas dos slides ja renderizados no server — usadas direto pra postar
  const [renderedUrls, setRenderedUrls] = useState<string[] | null>(null);

  async function openPreview() {
    // Caption vazia agora eh OK — IG aceita carrossel sem legenda.
    setCapturingPreview(true);
    setPostResult(null);
    setRenderedUrls(null);
    setRealRenderProgress(null);
    try {
      const orderedForRender = slides.map((s) => allImages[s.imageIdx] || allImages[0]);
      const { slides: rendered } = await renderBatch(slides, orderedForRender, (u) =>
        setRealRenderProgress({ ready: u.slidesReady, total: u.totalSlides, status: u.status }),
      );
      const urls = rendered.map((r) => r.url);
      setPreviewImages(urls);
      setRenderedUrls(urls);
      setPreviewOpen(true);
    } catch (e) {
      setPostResult({ ok: false, error: (e as Error).message || String(e) });
    } finally {
      setCapturingPreview(false);
      setRealRenderProgress(null);
    }
  }

  async function postarNoInstagram() {
    if (!renderedUrls?.length) return;
    setBusyPost(true);
    setPostResult(null);
    try {
      // URLs ja sao publicas (renderizadas server-side, subidas pro Supabase Storage).
      // Vai direto pro /api/publish — IG baixa do Supabase. Zero 413, zero overhead.
      const orderedNow = [selection.cover, ...selection.inner, selection.cta];
      const imagens_ids = orderedNow.map((im) => im?.id).filter(Boolean);
      const r = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrls: renderedUrls,
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
      <div className="flex items-center justify-between gap-3 mb-6 sm:mb-8">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <button
            onClick={onBack}
            className="w-10 h-10 shrink-0 border border-white/15 rounded flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-white/5 transition"
            aria-label="Voltar pra etapa 2"
            title="Voltar"
          >
            ←
          </button>
          <div className="min-w-0">
            <h2
              className="text-lg sm:text-xl leading-tight truncate"
              style={{ fontFamily: "Georgia, serif" }}
            >
              Editor
            </h2>
            <div className="text-[11px] sm:text-xs opacity-60 truncate">
              Ajuste slides, <i>legenda</i> e poste
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 relative">
          <button
            onClick={() => setActionsOpen((v) => !v)}
            className={`w-11 h-11 border rounded flex items-center justify-center text-lg transition-colors ${
              actionsOpen
                ? "border-white/40 bg-white/10"
                : "border-white/15 hover:bg-white/5"
            }`}
            title="Ações"
            aria-label="Ações"
          >
            ⋯
          </button>
          {actionsOpen && (
            <>
              <button
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setActionsOpen(false)}
                aria-label="Fechar menu"
                tabIndex={-1}
              />
              <div className="absolute right-0 top-12 z-50 w-64 bg-[#131612] border border-white/15 rounded-lg shadow-2xl overflow-hidden">
                <MenuItem
                  disabled={busyAll}
                  onClick={() => {
                    setActionsOpen(false);
                    downloadAll();
                  }}
                  label={busyAll ? "Renderizando..." : "⬇ Baixar PNGs"}
                  hint="Renderiza em 2160×2700 e baixa / compartilha"
                  accent
                />
                <MenuItem
                  disabled={fetchingMore || !setAllImages}
                  onClick={() => {
                    setActionsOpen(false);
                    fetchMoreImages();
                  }}
                  label={fetchingMore ? "Buscando..." : `+ Mais imagens (${allImages.length})`}
                  hint="Busca mais fotos do banco pra esse tema"
                />
                <MenuItem
                  disabled={regenCopy}
                  onClick={() => {
                    setActionsOpen(false);
                    regenerateCopy();
                  }}
                  label={regenCopy ? "Gerando..." : "↻ Regerar copy"}
                  hint="Reescreve o texto de todos os slides"
                />
                <MenuItem
                  onClick={() => {
                    setActionsOpen(false);
                    setBriefOpen((v) => !v);
                  }}
                  label={customBrief ? "✎ Editar briefing" : "+ Briefing extra"}
                  hint="Guia pro tom da copy"
                  accent={!!customBrief}
                />
                <MenuItem
                  disabled={savingDraft || !carrosselId}
                  onClick={() => {
                    setActionsOpen(false);
                    saveDraft();
                  }}
                  label={savingDraft ? "Salvando..." : draftSaved ? "✓ Salvo" : "Salvar rascunho"}
                  hint={!carrosselId ? "Aguarde o carrossel ser salvo" : "Guarda pra postar depois"}
                />
              </div>
            </>
          )}
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

      {(capturingPreview || busyAll) && (
        <div className="mb-4 border border-[#d6e7c4]/30 bg-[#d6e7c4]/5 rounded-lg px-4 py-3">
          <div className="text-[10px] tracking-widest uppercase opacity-70 mb-1 flex flex-wrap items-center gap-x-3">
            <span>
              {busyAll ? "Preparando PNGs para download…" : "Renderizando slides…"}
            </span>
            {realRenderProgress && realRenderProgress.total > 0 && (
              <span className="text-[#d6e7c4] normal-case tracking-normal">
                {realRenderProgress.ready} de {realRenderProgress.total} prontos
              </span>
            )}
            <span className="opacity-60 normal-case tracking-normal">
              · pode minimizar · fecha o navegador e volta depois, continua rodando
            </span>
          </div>
          <ProgressBar progress={renderProgress} />
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
