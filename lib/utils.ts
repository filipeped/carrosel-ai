import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Extrai JSON do output do Claude mesmo com texto antes/depois ou code-fence markdown.
export function extractJson<T = unknown>(text: string): T {
  if (!text) throw new Error("empty response");
  // remove code fences ```json ... ```
  let s = text.replace(/```json\s*/gi, "").replace(/```/g, "");
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("no JSON object in response: " + text.slice(0, 200));
  return JSON.parse(s.slice(first, last + 1));
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
