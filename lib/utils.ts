import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Extrai JSON (objeto ou array) do output do Claude mesmo com texto antes/depois
// ou code-fence markdown.
export function extractJson<T = unknown>(text: string): T {
  if (!text) throw new Error("empty response");
  let s = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

  // tenta objeto primeiro
  const objStart = s.indexOf("{");
  const objEnd = s.lastIndexOf("}");
  const arrStart = s.indexOf("[");
  const arrEnd = s.lastIndexOf("]");

  const hasObj = objStart !== -1 && objEnd > objStart;
  const hasArr = arrStart !== -1 && arrEnd > arrStart;

  // pega o que aparecer primeiro
  let slice: string;
  if (hasObj && (!hasArr || objStart < arrStart)) {
    slice = s.slice(objStart, objEnd + 1);
  } else if (hasArr) {
    slice = s.slice(arrStart, arrEnd + 1);
  } else {
    throw new Error("no JSON in response: " + text.slice(0, 200));
  }
  return JSON.parse(slice);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
