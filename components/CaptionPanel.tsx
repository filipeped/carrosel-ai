"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CaptionOption, ImageRow, ProgressState, SlideData } from "@/lib/types";
import { useProgressSim } from "@/lib/hooks";
import { ProgressBar } from "./ProgressBar";

export function CaptionPanel({
  slides,
  prompt,
  orderedImages,
  onCaptionPicked,
  selectedCaption,
  onPublish,
  publishing,
  publishProgress,
  autoGenTrigger,
}: {
  slides: SlideData[];
  prompt: string;
  orderedImages: ImageRow[];
  onCaptionPicked?: (fullText: string) => void;
  selectedCaption?: string;
  onPublish?: () => void;
  publishing?: boolean;
  publishProgress?: ProgressState;
  autoGenTrigger?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<CaptionOption[] | null>(null);
  const [error, setError] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [readImages, setReadImages] = useState(true);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [autoBgPolling, setAutoBgPolling] = useState(false);
  const captionProgress = useProgressSim(loading || autoBgPolling, [
    { name: "Claude lendo as 6 fotos do carrossel", seconds: 12 },
    { name: "Escrevendo 3 legendas no seu tom real", seconds: 20 },
    { name: "Limpando hashtags e emojis", seconds: 3 },
  ]);

  const imagesKey = useMemo(
    () => orderedImages.map((im) => im.id).join(","),
    [orderedImages],
  );
  const lastKeyRef = useRef<string | null>(null);
  const regenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!prompt?.trim()) {
      setHydrated(true);
      return;
    }
    (async () => {
      try {
        const r = await fetch(`/api/captions-history?prompt=${encodeURIComponent(prompt)}`);
        const d = await r.json();
        if (d.data?.options) {
          setOptions(d.data.options);
          if (typeof d.data.picked_idx === "number") {
            setPickedIdx(d.data.picked_idx);
            const opt = d.data.options[d.data.picked_idx];
            if (opt && onCaptionPicked) {
              const hashtags = Array.isArray(opt.hashtags) ? opt.hashtags.join(" ") : "";
              onCaptionPicked(`${opt.legenda}\n\n${hashtags}`.trim());
            }
          }
          setHistoryId(d.data.id ?? null);
          lastKeyRef.current = imagesKey;
        }
      } catch {}
      setHydrated(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  useEffect(() => {
    if (!autoGenTrigger || !prompt?.trim()) return;
    // Limpa options antigas — sinaliza "regerando, aguarde as novas"
    setOptions(null);
    setPickedIdx(null);
    setHistoryId(null);
    if (onCaptionPicked) onCaptionPicked("");
    let cancelled = false;
    setAutoBgPolling(true);
    const start = Date.now();
    // O background-save pos-copy cria nova linha em captions_history;
    // guardamos esse trigger pra so aceitar id > que o antigo conhecido.
    const triggerAt = autoGenTrigger;
    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/captions-history?prompt=${encodeURIComponent(prompt)}`);
        const d = await r.json();
        if (d.data?.options?.length) {
          // So aceita se o registro foi criado APOS o trigger (evita pegar cache antigo)
          const createdAt = d.data.created_at ? new Date(d.data.created_at).getTime() : 0;
          if (createdAt >= triggerAt - 5000) {
            setOptions(d.data.options);
            setHistoryId(d.data.id ?? null);
            lastKeyRef.current = imagesKey;
            setAutoBgPolling(false);
            return;
          }
        }
      } catch {}
      if (Date.now() - start > 120000) {
        setAutoBgPolling(false);
        return;
      }
      setTimeout(poll, 3000);
    };
    poll();
    return () => {
      cancelled = true;
      setAutoBgPolling(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenTrigger, prompt]);

  useEffect(() => {
    if (!hydrated) return;
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
  }, [imagesKey, options, hydrated]);

  async function generate() {
    setLoading(true);
    setError("");
    setOptions(null);
    setStale(false);
    setPickedIdx(null);
    if (onCaptionPicked) onCaptionPicked("");
    try {
      const imageUrls = readImages
        ? Array.from(new Set(orderedImages.map((im) => im.url).filter(Boolean))).slice(0, 10)
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
      try {
        const save = await fetch("/api/captions-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, options: d.options || [] }),
        });
        const saved = await save.json();
        if (saved.id) setHistoryId(saved.id);
      } catch {}
    } catch (e) {
      setError((e as Error).message);
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
    if (historyId) {
      fetch("/api/captions-history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: historyId, picked_idx: i }),
      }).catch(() => {});
    }
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
