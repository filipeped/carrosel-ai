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
    }
    .slide { position: relative; width: 1080px; height: 1350px; overflow: hidden; }
    .bg {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      object-fit: cover;
    }
    .vignette {
      position: absolute; inset: 0;
      background: linear-gradient(
        180deg,
        rgba(0,0,0,0.15) 0%,
        rgba(0,0,0,0.25) 50%,
        rgba(0,0,0,0.55) 100%
      );
    }
    .side-shadow {
      position: absolute; inset: 0;
      background: linear-gradient(
        90deg,
        rgba(0,0,0,0.55) 0%,
        rgba(0,0,0,0.15) 45%,
        rgba(0,0,0,0) 65%
      );
    }
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
    }
  `;
}
