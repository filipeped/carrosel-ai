// Debug: dumpa o HTML sanitizado pra ver o que Satori recebe
import { renderCta } from "../templates/cta";

const html = renderCta({ imageUrl: "https://example.com/x.jpg", pergunta: "Qual delas?", italicWords: ["delas"] });

// Inline sanitizeForSatori logic (reprod do renderer.ts)
function sanitizeForSatori(html: string): string {
  const styles: string[] = [];
  html.replace(/<style[\s\S]*?<\/style>/gi, (m) => {
    styles.push(m);
    return "";
  });
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let cleaned = bodyMatch ? bodyMatch[1] : html;
  cleaned = cleaned.replace(/<!doctype[^>]*>/gi, "");
  cleaned = cleaned.replace(/<\/?html[^>]*>/gi, "");
  cleaned = cleaned.replace(/<\/?body[^>]*>/gi, "");
  cleaned = cleaned.replace(/<head[\s\S]*?<\/head>/gi, "");
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");
  cleaned = cleaned.replace(/>\s+</g, "><");
  const stylesMinified = styles.map((s) => s.replace(/\n\s*/g, " ")).join("");
  return (stylesMinified + cleaned).trim();
}

const out = sanitizeForSatori(html);
console.log("--- FIRST 2000 CHARS OF SANITIZED ---");
console.log(out.slice(0, 2000));
console.log("\n--- STYLES PRESENT? ---");
console.log("display:flex count:", (out.match(/display:\s*flex/g) || []).length);
console.log("has <style>:", out.includes("<style>"));
console.log("body content starts with <div class=\"slide\">:", out.includes("<div class=\"slide\""));
