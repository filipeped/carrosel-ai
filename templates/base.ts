// Padrao visual extraido de Carrossel Plantas.html.
// Compativel com Satori (todo div com 2+ filhos precisa display:flex|contents|none,
// sem backdrop-filter, sem filter em img, sem transform:scale em imagens).
export const BRAND_HANDLE = process.env.BRAND_HANDLE || "@DIGITALPAISAGISMO";
export const BRAND_EDITION = process.env.BRAND_EDITION || "";

export function baseStyle(fontsBaseUrl = ""): string {
  // Fontes sao carregadas pelo renderer (Satori) nao via @font-face aqui.
  // Apenas mantemos os seletores.
  void fontsBaseUrl;
  return `
    :root {
      --paper: #f1ede3;
      --ink: #131a12;
      --accent: #d6e7c4;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html {
      width: 1080px; height: 1350px;
      color: #fff;
      background: #0a0d0b;
      display: flex;
    }
    .slide {
      position: relative;
      width: 1080px; height: 1350px;
      display: flex;
      overflow: hidden;
    }

    /* imagem de fundo sem filter/scale (Satori nao suporta) */
    .bg {
      position: absolute; inset: 0;
      width: 1080px; height: 1350px;
      display: flex;
    }
    .bg img {
      width: 1080px; height: 1350px;
      object-fit: cover;
    }

    /* veus de gradiente */
    .veil { position: absolute; inset: 0; display: flex; }
    .veil-side {
      background:
        linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.40) 55%, rgba(0,0,0,0.05) 100%);
    }
    .veil-bottom {
      background: linear-gradient(180deg,
        rgba(0,0,0,0.55) 0%,
        rgba(0,0,0,0.12) 22%,
        rgba(0,0,0,0.12) 40%,
        rgba(0,0,0,0.75) 72%,
        rgba(0,0,0,0.96) 100%);
    }
    .veil-cover {
      background: linear-gradient(180deg,
        rgba(10,14,8,0.40) 0%,
        rgba(10,14,8,0.20) 28%,
        rgba(10,14,8,0.60) 62%,
        rgba(10,14,8,0.95) 100%);
    }
    .veil-cta {
      background: linear-gradient(180deg,
        rgba(10,14,8,0.45) 0%,
        rgba(10,14,8,0.60) 50%,
        rgba(10,14,8,0.92) 100%);
    }

    /* moldura com meta top e meta bottom */
    .chrome {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      padding: 75px 68px 70px;
      color: #fff;
    }

    .meta-top {
      display: flex; justify-content: space-between; align-items: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px; letter-spacing: 3px; text-transform: uppercase;
      color: rgba(255,255,255,0.92);
    }
    .meta-top .rule {
      display: flex;
      flex: 1; height: 1px; background: rgba(255,255,255,0.35);
      margin: 0 18px;
    }

    .meta-bottom {
      display: flex; justify-content: space-between; align-items: flex-end;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px; letter-spacing: 2px; text-transform: uppercase;
      color: rgba(255,255,255,0.92);
      padding-top: 18px;
      border-top: 1px solid rgba(255,255,255,0.3);
    }

    .content {
      margin-top: auto;
      display: flex; flex-direction: column;
    }

    .care {
      display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px;
    }
    .care span {
      display: flex;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px; letter-spacing: 2px; text-transform: uppercase;
      color: rgba(255,255,255,0.85);
      background: rgba(0,0,0,0.45);
      border: 1px solid rgba(255,255,255,0.25);
      padding: 10px 16px; border-radius: 999px;
    }
  `;
}
