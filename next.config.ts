import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  // Evita warning "inferred workspace root" — lockfile no home do user confundia o Next
  outputFileTracingRoot: path.join(__dirname),
  images: {
    // Avif eh o formato moderno recomendado. WebP removido.
    formats: ["image/avif"],
    remotePatterns: [
      { protocol: "https", hostname: "hnxrralhlqfsmovwmhrx.supabase.co" },
    ],
  },
};

export default config;
