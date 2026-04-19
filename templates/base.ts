// Padrao visual extraido de Carrossel Plantas.html — alto padrao editorial.
// Fontes: Fraunces (serif), Archivo (sans), JetBrains Mono (meta).
// Paleta: --paper #f1ede3 / --ink #131a12 / --accent #d6e7c4 (verde pastel em italicos).
export const BRAND_HANDLE = process.env.BRAND_HANDLE || "@DIGITALPAISAGISMO";
export const BRAND_EDITION = process.env.BRAND_EDITION || "";

export const FONTS_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;1,9..144,300;1,9..144,400&family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

export function baseStyle(_fontsBaseUrl = ""): string {
  return `
    :root {
      --paper: #f1ede3;
      --ink: #131a12;
      --accent: #d6e7c4;
      --serif: 'Fraunces', Georgia, serif;
      --sans:  'Archivo', system-ui, sans-serif;
      --mono:  'JetBrains Mono', ui-monospace, monospace;
    }
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      width: 1080px; height: 1350px;
      font-family: var(--sans);
      color: #fff;
      background: #0a0d0b;
      overflow: hidden; position: relative;
    }
    .slide { position:relative; width:1080px; height:1350px; overflow:hidden; }

    /* ---- imagem de fundo com tratamento editorial sutil ---- */
    .bg {
      position:absolute; inset:0; z-index:0; overflow:hidden;
    }
    .bg img {
      width:100%; height:100%; object-fit:cover; display:block;
      object-position:center center;
      /* curva editorial: contraste + saturacao + nitidez aparente */
      filter:
        brightness(0.96)
        contrast(1.12)
        saturate(1.12);
      transform: scale(1.015); /* evita borda fina do filter */
    }

    /* color grade sutil: highlights levemente quentes, sombras verde-profundo */
    .color-grade {
      position:absolute; inset:0; z-index:1;
      background:
        radial-gradient(ellipse at top, rgba(235, 220, 190, 0.06) 0%, transparent 55%),
        linear-gradient(180deg,
          rgba(200, 220, 200, 0.03) 0%,
          rgba(0, 0, 0, 0) 35%,
          rgba(10, 20, 12, 0.14) 100%);
      mix-blend-mode: multiply;
      pointer-events: none;
    }

    /* ---- veu de gradiente (aplicado pela classe do template) ---- */
    .veil { position:absolute; inset:0; z-index:2; pointer-events:none; }

    .veil-side {
      background:
        linear-gradient(90deg, rgba(0,0,0,.88) 0%, rgba(0,0,0,.35) 55%, rgba(0,0,0,.05) 100%),
        linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,.45) 100%);
    }
    .veil-bottom {
      background: linear-gradient(180deg,
        rgba(0,0,0,.55) 0%,
        rgba(0,0,0,.12) 22%,
        rgba(0,0,0,.12) 40%,
        rgba(0,0,0,.75) 72%,
        rgba(0,0,0,.96) 100%);
    }
    .veil-full-soft {
      background: linear-gradient(180deg, rgba(0,0,0,.70) 0%, rgba(0,0,0,.45) 40%, rgba(0,0,0,.90) 100%);
    }
    .veil-cover {
      background: linear-gradient(180deg,
        rgba(10,14,8,.35) 0%, rgba(10,14,8,.15) 28%,
        rgba(10,14,8,.55) 60%, rgba(10,14,8,.95) 100%);
    }
    .veil-cta {
      background: linear-gradient(180deg,
        rgba(10,14,8,.40) 0%, rgba(10,14,8,.55) 50%, rgba(10,14,8,.90) 100%);
    }

    /* ---- chrome: padding + meta superior + meta inferior ---- */
    .chrome {
      position:absolute; inset:0; z-index:3;
      display:flex; flex-direction:column;
      padding:75px 68px 70px;
      color:#fff;
      pointer-events:none;
    }
    .chrome > * { pointer-events:auto; }

    .meta-top {
      display:flex; justify-content:space-between; align-items:center;
      font-family: var(--mono);
      font-size: 13px; letter-spacing:.22em; text-transform:uppercase;
      color: rgba(255,255,255,.92);
      text-shadow: 0 2px 14px rgba(0,0,0,.85), 0 1px 3px rgba(0,0,0,.7);
    }
    .meta-top .rule {
      flex:1; height:1px; background: rgba(255,255,255,.35);
      margin: 0 18px;
    }
    .meta-top .idx { color:#fff; }

    .meta-bottom {
      margin-top:auto;
      display:flex; justify-content:space-between; align-items:flex-end;
      font-family: var(--mono);
      font-size: 13px; letter-spacing:.18em; text-transform:uppercase;
      color: rgba(255,255,255,.92);
      padding-top: 18px;
      border-top: 1px solid rgba(255,255,255,.3);
      text-shadow: 0 2px 14px rgba(0,0,0,.85), 0 1px 3px rgba(0,0,0,.7);
    }

    .content { margin-top:auto; display:flex; flex-direction:column; gap:0; }

    /* ---- care pills ---- */
    .care {
      display:flex; gap:10px; flex-wrap:wrap; margin-top:22px;
    }
    .care span {
      font-family: var(--mono);
      font-size: 12px; letter-spacing:.16em; text-transform:uppercase;
      color: rgba(255,255,255,.82);
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.22);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      padding: 10px 16px; border-radius: 999px;
    }
  `;
}
