import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "puppeteer"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "hnxrralhlqfsmovwmhrx.supabase.co" },
    ],
  },
  outputFileTracingIncludes: {
    "/api/render-slide": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/v1/carousel": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default config;
