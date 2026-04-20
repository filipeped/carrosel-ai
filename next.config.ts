import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: [
    "@resvg/resvg-js",
    "@sparticuz/chromium",
    "puppeteer-core",
  ],
  outputFileTracingIncludes: {
    "/api/render-slide": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/v1/render": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/v1/smart-carousel": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/v1/carousel": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "hnxrralhlqfsmovwmhrx.supabase.co" },
    ],
  },
};

export default config;
