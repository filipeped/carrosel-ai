import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carrosel AI — Digital Paisagismo",
  description: "Gerador de carrosseis virais de paisagismo por IA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
