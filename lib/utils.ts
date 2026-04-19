import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Extrai JSON (objeto ou array) do output do Claude mesmo com texto antes/depois
// ou code-fence markdown. Com fallback de reparo pra JSONs malformados.
export function extractJson<T = unknown>(text: string): T {
  if (!text) throw new Error("empty response");
  const s = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

  const objStart = s.indexOf("{");
  const objEnd = s.lastIndexOf("}");
  const arrStart = s.indexOf("[");
  const arrEnd = s.lastIndexOf("]");

  const hasObj = objStart !== -1 && objEnd > objStart;
  const hasArr = arrStart !== -1 && arrEnd > arrStart;

  let slice: string;
  if (hasObj && (!hasArr || objStart < arrStart)) {
    slice = s.slice(objStart, objEnd + 1);
  } else if (hasArr) {
    slice = s.slice(arrStart, arrEnd + 1);
  } else {
    throw new Error("no JSON in response: " + text.slice(0, 200));
  }

  try {
    return JSON.parse(slice);
  } catch {
    // LLM as vezes manda: trailing commas, newlines crus dentro de strings,
    // aspas/controle nao-escapados. Tenta reparar e parsear de novo.
    let repaired = slice.replace(/,\s*([}\]])/g, "$1");
    // escapa newlines/tabs/cr dentro de strings ja delimitadas
    repaired = repaired.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, inner) => {
      const fixed = inner
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t");
      return `"${fixed}"`;
    });
    try {
      return JSON.parse(repaired);
    } catch (e: any) {
      throw new Error(`JSON parse failed: ${e.message} | raw: ${slice.slice(0, 300)}`);
    }
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
