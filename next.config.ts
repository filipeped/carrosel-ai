import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "puppeteer"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "hnxrralhlqfsmovwmhrx.supabase.co" },
    ],
  },
  outputFileTracingIncludes: {
    "/api/generate": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default config;
