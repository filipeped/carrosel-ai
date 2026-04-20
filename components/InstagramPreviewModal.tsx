"use client";
import { useEffect, useState } from "react";
import type { ProgressState } from "@/lib/types";

const IG_AVATAR_URL = "/ig-avatar.jpg";
const CAPTION_PREVIEW_CHARS = 125;
const BRAND_HANDLE = "digitalpaisagismo";
const BRAND_BIO = "Paisagismo autoral · São Paulo";

export function InstagramPreviewModal({
  images,
  caption,
  onCancel,
  onConfirm,
  publishing,
  publishProgress,
  postResult,
}: {
  images: string[];
  caption: string;
  onCancel: () => void;
  onConfirm: () => void;
  publishing?: boolean;
  publishProgress?: ProgressState;
  postResult?: { ok: boolean; permalink?: string; error?: string } | null;
}) {
  const [idx, setIdx] = useState(0);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [slideInfo, setSlideInfo] = useState<
    Array<{ bytes: number; width: number; height: number }>
  >([]);

  // Mede bytes + dimensao de cada PNG capturado (data URL ou http URL).
  // Transparente pro user: so pra exibir no rodape de qualidade.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const info: Array<{ bytes: number; width: number; height: number }> = [];
      for (const url of images) {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const bytes = blob.size;
          const bitmap = await createImageBitmap(blob);
          info.push({ bytes, width: bitmap.width, height: bitmap.height });
          bitmap.close?.();
        } catch {
          info.push({ bytes: 0, width: 0, height: 0 });
        }
        if (cancelled) return;
      }
      if (!cancelled) setSlideInfo(info);
    })();
    return () => {
      cancelled = true;
    };
  }, [images]);
  const prev = () => !publishing && setIdx((i) => Math.max(0, i - 1));
  const next = () => !publishing && setIdx((i) => Math.min(images.length - 1, i + 1));

  // Keyboard shortcuts: Esc fecha, ← → navega
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (publishing || postResult?.ok) return;
      if (e.key === "Escape") onCancel();
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx((i) => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [publishing, postResult, images.length, onCancel]);

  const captionText = caption || "";
  const needsTruncation = captionText.length > CAPTION_PREVIEW_CHARS;
  const displayCaption =
    needsTruncation && !captionExpanded
      ? captionText.slice(0, CAPTION_PREVIEW_CHARS).trimEnd()
      : captionText;

  const canCancel = !publishing && !postResult?.ok;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      onClick={() => canCancel && onCancel()}
    >
      <div
        className="bg-white text-black rounded-2xl w-full max-w-[468px] overflow-hidden shadow-2xl my-8 border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
            <div className="w-full h-full rounded-full bg-white p-[2px]">
              {avatarFailed ? (
                <div className="w-full h-full rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white text-[10px] font-semibold">
                  DP
                </div>
              ) : (
                <img
                  src={IG_AVATAR_URL}
                  alt="avatar"
                  className="w-full h-full rounded-full object-cover"
                  onError={() => setAvatarFailed(true)}
                />
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold flex items-center gap-1">
              {BRAND_HANDLE}
              <span className="text-blue-500 text-xs" title="Verificado">✓</span>
            </div>
            <div className="text-[11px] text-gray-500 truncate">{BRAND_BIO}</div>
          </div>
          <div className="text-gray-900 text-xl leading-none">⋯</div>
        </div>

        <div className="relative bg-black aspect-[4/5] select-none">
          <img
            src={images[idx]}
            alt={`slide ${idx + 1}`}
            className="w-full h-full object-contain"
            draggable={false}
          />
          {idx > 0 && !publishing && (
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/95 text-black flex items-center justify-center shadow hover:bg-white text-lg leading-none"
              aria-label="anterior"
            >
              ‹
            </button>
          )}
          {idx < images.length - 1 && !publishing && (
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/95 text-black flex items-center justify-center shadow hover:bg-white text-lg leading-none"
              aria-label="proximo"
            >
              ›
            </button>
          )}
          <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/70 text-white text-[11px] font-medium">
            {idx + 1}/{images.length}
          </div>
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1">
            {images.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === idx ? "bg-white" : "bg-white/45"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="px-4 pt-3">
          <div className="flex items-center gap-4 mb-1.5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            <svg className="ml-auto" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div className="text-sm font-semibold mb-1">1.248 curtidas</div>
          <div className="text-sm leading-snug break-words whitespace-pre-wrap">
            <span className="font-semibold mr-1.5">{BRAND_HANDLE}</span>
            <span>{displayCaption}</span>
            {needsTruncation && !captionExpanded && (
              <>
                <span className="text-gray-500">...</span>{" "}
                <button
                  onClick={() => setCaptionExpanded(true)}
                  className="text-gray-500 hover:text-gray-700 font-normal"
                >
                  mais
                </button>
              </>
            )}
          </div>
          {needsTruncation && captionExpanded && (
            <button
              onClick={() => setCaptionExpanded(false)}
              className="mt-2 text-sm text-gray-500 hover:text-gray-800 font-medium"
            >
              mostrar menos
            </button>
          )}
          <div className="text-[11px] text-gray-500 uppercase tracking-wide mt-2 pb-3">
            há alguns segundos
          </div>
        </div>

        <div className="border-t border-gray-200 bg-gray-50 p-3">
          {postResult?.ok ? (
            <div className="text-center">
              <div className="text-green-600 font-medium text-sm mb-1">✓ Publicado no Instagram</div>
              {postResult.permalink && (
                <a
                  href={postResult.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 underline break-all"
                >
                  {postResult.permalink}
                </a>
              )}
              <button
                onClick={onCancel}
                className="mt-3 w-full min-h-[44px] py-2.5 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800"
              >
                Fechar
              </button>
            </div>
          ) : postResult?.error ? (
            <div>
              <div className="text-red-600 font-medium text-sm mb-2">Falha ao publicar</div>
              <div className="text-xs text-gray-700 bg-red-50 border border-red-200 rounded p-2 break-words mb-3">
                {postResult.error}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onCancel}
                  className="flex-1 min-h-[44px] py-2.5 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  onClick={onConfirm}
                  className="flex-1 min-h-[44px] py-2.5 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800"
                >
                  Tentar de novo
                </button>
              </div>
            </div>
          ) : publishing ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-black rounded-full animate-spin"></div>
                <div className="text-sm font-medium">Publicando no Instagram...</div>
              </div>
              {publishProgress && (
                <div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-black transition-all duration-300"
                      style={{ width: `${Math.round(publishProgress.pct)}%` }}
                    ></div>
                  </div>
                  <div className="text-[11px] text-gray-600">
                    {publishProgress.phase} · {Math.round(publishProgress.pct)}% · ~{Math.round(publishProgress.etaSec)}s
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {slideInfo.length > 0 && (
                <div className="mb-3 text-[10px] text-gray-500 leading-tight space-y-0.5">
                  {(() => {
                    const curr = slideInfo[idx];
                    if (!curr) return null;
                    const kb = (curr.bytes / 1024).toFixed(0);
                    const warn = curr.width < 1800;
                    const avgKb = (
                      slideInfo.reduce((s, x) => s + x.bytes, 0) / slideInfo.length / 1024
                    ).toFixed(0);
                    return (
                      <>
                        <div>
                          Slide {idx + 1}: <strong>{curr.width}×{curr.height}</strong> · {kb}KB
                          {warn && (
                            <span className="ml-1 text-amber-600">⚠ dimensão baixa</span>
                          )}
                        </div>
                        <div>
                          {slideInfo.length} slides · média {avgKb}KB · Instagram faz downsize para 1080×1350
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={onCancel}
                  className="flex-1 min-h-[44px] py-2.5 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  onClick={onConfirm}
                  className="flex-1 min-h-[44px] py-2.5 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800"
                >
                  Postar no Instagram
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
