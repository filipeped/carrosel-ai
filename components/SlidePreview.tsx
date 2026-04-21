"use client";
import { useEffect, useRef, useState } from "react";
import type { SlideData } from "@/lib/types";

/**
 * Fontes SELF-HOSTED em /public/fonts/*.woff2 — elimina cross-origin de
 * Google Fonts que causava SecurityError cssRules no html-to-image.
 * Ao capturar via toPng(), CSS eh same-origin → zero erro.
 */
const FONTS_LINK = `<style>
@font-face{font-family:'Fraunces';font-style:normal;font-weight:300;src:url('/fonts/Fraunces-Light.woff2') format('woff2');font-display:swap}
@font-face{font-family:'Fraunces';font-style:normal;font-weight:400;src:url('/fonts/Fraunces-Regular.woff2') format('woff2');font-display:swap}
@font-face{font-family:'Fraunces';font-style:italic;font-weight:300;src:url('/fonts/Fraunces-LightItalic.woff2') format('woff2');font-display:swap}
@font-face{font-family:'Fraunces';font-style:italic;font-weight:400;src:url('/fonts/Fraunces-Italic.woff2') format('woff2');font-display:swap}
@font-face{font-family:'Archivo';font-style:normal;font-weight:400;src:url('/fonts/Archivo-Regular.woff2') format('woff2');font-display:swap}
@font-face{font-family:'Archivo';font-style:normal;font-weight:500;src:url('/fonts/Archivo-Medium.woff2') format('woff2');font-display:swap}
@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:400;src:url('/fonts/JetBrainsMono-Regular.woff2') format('woff2');font-display:swap}
</style>`;

export function SlidePreview({ slide, imageUrl }: { slide: SlideData; imageUrl: string }) {
  const [html, setHtml] = useState("");
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.33);

  // FIX hydration: iframe so renderiza apos mount — evita srcDoc mismatch
  // entre SSR (html="") e client (html={template}).
  useEffect(() => setMounted(true), []);

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
        out = renderCover({
          imageUrl,
          topLabel: slide.topLabel,
          numeral: slide.numeral ?? undefined,
          title: slide.title || "",
          italicWords: slide.italicWords || [],
        }, origin);
      } else if (slide.type === "plantDetail") {
        out = renderPlantDetail({
          imageUrl,
          nomePopular: slide.nomePopular || "",
          nomeCientifico: slide.nomeCientifico || "",
        }, origin);
      } else if (slide.type === "cta") {
        out = renderCta({
          imageUrl,
          pergunta: slide.pergunta || "",
          italicWords: slide.italicWords || [],
        }, origin);
      } else {
        out = renderInspiration({
          imageUrl,
          title: slide.title || "",
          subtitle: slide.subtitle || "",
          topLabel: slide.topLabel || "",
        }, origin);
      }
      out = out.replace(/<head>/i, `<head>${FONTS_LINK}`);
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
      {mounted && (
      <iframe
        ref={iframeRef}
        srcDoc={html}
        title="preview"
        /*
         * Sem sandbox: o render agora eh server-side (nao usa mais o iframe pra
         * html-to-image). srcDoc eh HTML controlado por nos — seguro.
         * Remove o warning "Blocked script execution in about:srcdoc".
         */
        onLoad={() => {
          try {
            const doc = iframeRef.current?.contentDocument;
            if (doc?.fonts?.ready) {
              doc.fonts.ready.catch(() => {});
            }
          } catch {
            // ignora
          }
        }}
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
      )}
    </div>
  );
}
