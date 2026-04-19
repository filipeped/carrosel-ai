import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@resvg/resvg-js"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "hnxrralhlqfsmovwmhrx.supabase.co" },
    ],
  },
};

export default config;
