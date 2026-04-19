// CSS base compartilhado por todos os templates.
// Fontes self-hosted em /public/fonts (carregadas via file:// no puppeteer dev).
export const BRAND_HANDLE = process.env.BRAND_HANDLE || "@DIGITALPAISAGISMO";
export const BRAND_EDITION = process.env.BRAND_EDITION || "";

export function baseStyle(fontsBaseUrl = ""): string {
  return `
    @font-face {
      font-family: 'Playfair';
      font-style: normal;
      font-weight: 400;
      src: url('${fontsBaseUrl}/fonts/PlayfairDisplay-Regular.woff2') format('woff2');
    }
    @font-face {
      font-family: 'Playfair';
      font-style: italic;
      font-weight: 400;
      src: url('${fontsBaseUrl}/fonts/PlayfairDisplay-Italic.woff2') format('woff2');
    }
    @font-face {
      font-family: 'Cormorant';
      font-style: italic;
      font-weight: 400;
      src: url('${fontsBaseUrl}/fonts/CormorantGaramond-Italic.woff2') format('woff2');
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1080px;
      height: 1350px;
      font-family: 'Playfair', 'Georgia', serif;
      color: #fff;
      overflow: hidden;
      position: relative;
      background: #0a0d0b;
    }
    .slide { position: relative; width: 1080px; height: 1350px; overflow: hidden; }

    /* ---- Tratamento cinematografico da foto ---- */
    .bg {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      object-fit: cover;
      /* leve escurecimento + contraste + saturacao editorial */
      filter: brightness(0.82) contrast(1.10) saturate(1.08);
      transform: scale(1.02);
    }

    /* Vinheta radial sutil pra dar profundidade */
    .vignette-soft {
      position: absolute; inset: 0;
      background: radial-gradient(
        ellipse at center,
        rgba(0,0,0,0) 45%,
        rgba(0,0,0,0.45) 100%
      );
      pointer-events: none;
    }

    /* Gradiente vertical classico (mais forte embaixo) */
    .vignette {
      position: absolute; inset: 0;
      background: linear-gradient(
        180deg,
        rgba(0,0,0,0.20) 0%,
        rgba(0,0,0,0.25) 50%,
        rgba(0,0,0,0.60) 100%
      );
    }

    /* Sombra lateral esquerda (pra textos que ficam no canto) */
    .side-shadow {
      position: absolute; inset: 0;
      background: linear-gradient(
        90deg,
        rgba(0,0,0,0.60) 0%,
        rgba(0,0,0,0.20) 45%,
        rgba(0,0,0,0) 65%
      );
    }

    /* ---- Tratamento tipografico ---- */
    /* Sombra editorial: duas camadas pra dar peso sem poluir */
    .tx-shadow {
      text-shadow:
        0 2px 10px rgba(0,0,0,0.45),
        0 1px 2px rgba(0,0,0,0.55);
    }
    .tx-shadow-strong {
      text-shadow:
        0 3px 20px rgba(0,0,0,0.55),
        0 2px 4px rgba(0,0,0,0.60);
    }

    /* Handles e labels */
    .handle {
      position: absolute;
      bottom: 42px;
      right: 60px;
      font-family: 'Playfair', serif;
      font-size: 20px;
      letter-spacing: 3px;
      color: #fff;
      text-transform: uppercase;
      opacity: 0.95;
      text-shadow: 0 1px 6px rgba(0,0,0,0.5);
    }
    .top-label {
      position: absolute;
      top: 42px;
      left: 60px;
      font-family: 'Playfair', serif;
      font-size: 18px;
      letter-spacing: 4px;
      color: #fff;
      text-transform: uppercase;
      opacity: 0.9;
      text-shadow: 0 1px 6px rgba(0,0,0,0.5);
    }
  `;
}
