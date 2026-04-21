import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  // Evita warning "inferred workspace root" — lockfile no home do user confundia o Next
  outputFileTracingRoot: path.join(__dirname),
  // Puppeteer/@sparticuz/chromium precisam estar FORA do bundle serverless.
  // Sao carregados como native node modules em runtime (nao transpilados pelo webpack).
  serverExternalPackages: [
    "puppeteer-core",
    "puppeteer",
    "@sparticuz/chromium",
  ],
  // Inclui as fontes .woff2 no output traced do Vercel (sao lidas via fs no lib/fonts.ts)
  outputFileTracingIncludes: {
    "/api/render-batch": ["./public/fonts/**/*"],
  },
  images: {
    // Avif eh o formato moderno recomendado. WebP removido.
    formats: ["image/avif"],
    remotePatterns: [
      { protocol: "https", hostname: "hnxrralhlqfsmovwmhrx.supabase.co" },
    ],
  },
};

export default config;
