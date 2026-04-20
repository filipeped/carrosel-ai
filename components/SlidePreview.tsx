"use client";
import { useEffect, useRef, useState } from "react";
import type { SlideData } from "@/lib/types";

const FONTS_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;1,9..144,300;1,9..144,400&family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

export function SlidePreview({ slide, imageUrl }: { slide: SlideData; imageUrl: string }) {
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
