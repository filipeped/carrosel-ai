import type { SlideData } from "./types";
import { renderCover } from "../templates/cover";
import { renderPlantDetail } from "../templates/plantDetail";
import { renderInspiration } from "../templates/inspiration";
import { renderCta } from "../templates/cta";
import { renderBeforeAfter } from "../templates/beforeAfter";
import { renderMythBuster } from "../templates/mythBuster";
import { renderListItem } from "../templates/listItem";
import { renderProblemSolution } from "../templates/problemSolution";
import { getFontFaceCss } from "./fonts";

/**
 * Monta o HTML final de 1 slide, pronto pra Puppeteer renderizar.
 * Injeta as fontes self-hosted (base64 inline) no <head>.
 *
 * Fonte unica de verdade: mesmo template do preview client-side.
 * Garante que o que o user ve no modal == o que vai pro Instagram.
 */
export function buildSlideHtml(slide: SlideData, imageUrl: string): string {
  let html = "";
  if (slide.type === "cover") {
    html = renderCover({
      imageUrl,
      topLabel: slide.topLabel,
      numeral: slide.numeral ?? undefined,
      title: slide.title || "",
      italicWords: slide.italicWords || [],
    });
  } else if (slide.type === "plantDetail") {
    html = renderPlantDetail({
      imageUrl,
      nomePopular: slide.nomePopular || "",
      nomeCientifico: slide.nomeCientifico || "",
    });
  } else if (slide.type === "cta") {
    html = renderCta({
      imageUrl,
      pergunta: slide.fechamento || slide.pergunta || "",
      italicWords: slide.italicWords || [],
    });
  } else if (slide.type === "beforeAfter") {
    html = renderBeforeAfter({
      imageUrl,
      phase: slide.phase || "PROCESSO",
      caption: slide.caption,
    });
  } else if (slide.type === "mythBuster") {
    html = renderMythBuster({
      imageUrl,
      mito: slide.mito || "",
      verdade: slide.verdade || "",
    });
  } else if (slide.type === "listItem") {
    html = renderListItem({
      imageUrl,
      numeral: slide.numeral || "",
      nomePopular: slide.nomePopular || "",
      nomeCientifico: slide.nomeCientifico || undefined,
      dica: slide.dica,
    });
  } else if (slide.type === "problemSolution") {
    html = renderProblemSolution({
      imageUrl,
      problema: slide.problema || "",
      solucao: slide.solucao || "",
    });
  } else {
    html = renderInspiration({
      imageUrl,
      title: slide.title || "",
      subtitle: slide.subtitle || "",
      topLabel: slide.topLabel || "",
    });
  }
  const fonts = `<style>${getFontFaceCss()}</style>`;
  return html.replace(/<head>/i, `<head>${fonts}`);
}
