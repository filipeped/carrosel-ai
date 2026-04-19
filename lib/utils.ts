import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { jsonrepair } from "jsonrepair";

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
    // Tentativa 1: jsonrepair — lib dedicada, lida com a maioria dos casos
    try {
      const repaired = jsonrepair(slice);
      return JSON.parse(repaired);
    } catch {
      /* fallthrough */
    }

    // Tentativa 2: escapa newlines/tabs/trailing commas manualmente
    let manual = slice.replace(/,\s*([}\]])/g, "$1");
    manual = manual.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (_m, inner) => {
      const fixed = String(inner)
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t");
      return `"${fixed}"`;
    });
    try {
      return JSON.parse(manual);
    } catch {
      /* fallthrough */
    }

    // Tentativa 3: JSON truncado — completa com chaves/colchetes
    const attempts = completeTruncated(slice);
    for (const cand of attempts) {
      try {
        return JSON.parse(jsonrepair(cand));
      } catch {
        try {
          return JSON.parse(cand);
        } catch {
          /* continue */
        }
      }
    }

    // Tentativa 4: array parcial — extrai objetos completos
    const partialArr = extractPartialArray(slice);
    if (partialArr !== null) return partialArr as T;

    throw new Error(
      `JSON parse failed | raw inicial: ${slice.slice(0, 200)} | raw final: ${slice.slice(-200)}`,
    );
  }
}

// Tenta completar JSON truncado adicionando os fechamentos mais provaveis.
function completeTruncated(s: string): string[] {
  const out: string[] = [];
  // Remove ultima virgula ou aspas penduradas
  let base = s.replace(/[,\s]*$/, "");
  // Se terminou no meio de uma string, corta ate a ultima aspa e feche-a
  const lastQuote = base.lastIndexOf('"');
  const lastBrace = Math.max(base.lastIndexOf("}"), base.lastIndexOf("]"));
  if (lastQuote > lastBrace) {
    base = base.slice(0, lastQuote); // corta antes de abrir string truncada
    base = base.replace(/[,\s]*$/, "");
  }

  // Conta brackets nao fechados
  let openCurly = 0, openSquare = 0;
  for (const c of base) {
    if (c === "{") openCurly++;
    else if (c === "}") openCurly--;
    else if (c === "[") openSquare++;
    else if (c === "]") openSquare--;
  }
  // Fecha na ordem mais provavel
  let close = "";
  while (openCurly-- > 0) close += "}";
  while (openSquare-- > 0) close += "]";
  if (close) out.push(base + close);

  // Variante: corta ate ultimo `}` de um objeto completo dentro do array
  const lastObjEnd = base.lastIndexOf("}");
  if (lastObjEnd > 0) {
    const truncated = base.slice(0, lastObjEnd + 1);
    // se estamos num array, fecha com ]
    const openBr = countChar(truncated, "[") - countChar(truncated, "]");
    const openCu = countChar(truncated, "{") - countChar(truncated, "}");
    let tail = "";
    for (let i = 0; i < openCu; i++) tail += "}";
    for (let i = 0; i < openBr; i++) tail += "]";
    out.push(truncated + tail);
  }
  return out;
}

function countChar(s: string, c: string): number {
  let n = 0;
  for (const ch of s) if (ch === c) n++;
  return n;
}

// Se for array "[...,{obj},{obj_parcial...", tenta extrair so os objetos completos
function extractPartialArray(s: string): unknown[] | null {
  if (!s.trimStart().startsWith("[")) return null;
  const objs: unknown[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 1; i < s.length; i++) {
    const c = s[i];
    if (c === "{" && depth === 0) start = i;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        const chunk = s.slice(start, i + 1);
        try {
          objs.push(JSON.parse(chunk));
        } catch {
          /* ignora obj malformado */
        }
        start = -1;
      }
    }
  }
  return objs.length ? objs : null;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
