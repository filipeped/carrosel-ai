/**
 * Agente 3: Polish de legenda (PÓS-legenda gerada).
 * Aplica micro-ajustes: remove linguagem proibida, usa vocab premium,
 * reforça Big Domino quando couber, ajusta tamanho.
 */

import { getAi, MODEL } from "../claude";
import { extractJson } from "../utils";
import {
  brandBlockCompact,
  LINGUAGEM_PROIBIDA,
  VOCABULARIO_PREMIUM,
  EMOJI_PROIBIDOS,
} from "../brand-context";

export type OptimizedCaption = {
  legenda: string;
  hashtags: string[];
  changes: Array<{ from: string; to: string; reason: string }>;
  big_domino_adicionado: boolean;
  word_count: number;
};

type CaptionInput = {
  legenda: string;
  hashtags?: string[];
  approach?: string;
};

/**
 * Limpeza determinística (sem LLM) — mais rápida e 100% confiável.
 * Usada como primeiro passe antes de chamar Claude pra ajuste semântico.
 */
/**
 * Enforce primeira linha <=120 chars (regra IG 2026 — corta em 125).
 */
function enforceFirstLine(s: string): string {
  if (!s) return s;
  const firstBreak = s.indexOf("\n");
  const firstLine = firstBreak === -1 ? s : s.slice(0, firstBreak);
  if (firstLine.length <= 120) return s;
  const cut = firstLine.slice(0, 120);
  const breakIdx = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf(", "),
    cut.lastIndexOf(" "),
  );
  const splitAt = breakIdx > 60 ? breakIdx + 1 : 118;
  return s.slice(0, splitAt).trim() + "\n\n" + s.slice(splitAt).trim();
}

export function deterministicClean(caption: string): {
  cleaned: string;
  changes: Array<{ from: string; to: string; reason: string }>;
} {
  let c = caption;
  const changes: Array<{ from: string; to: string; reason: string }> = [];

  // Remove travessão (—) — substitui por vírgula
  if (c.includes("—")) {
    c = c.replace(/—/g, ",");
    changes.push({ from: "—", to: ",", reason: "travessão proibido" });
  }

  // Remove dois-pontos fora de URLs/horários
  // (regex conservadora: ":" seguido de espaço, não seguido de número ou "//"
  c = c.replace(/:\s+(?=[A-ZÀ-Ú])/g, ". ").replace(/:\s+(?=[a-zà-ú])/g, ". ");

  // Vocab premium — troca determinística
  for (const [old, novo] of Object.entries(VOCABULARIO_PREMIUM)) {
    const regex = new RegExp(`\\b${old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (regex.test(c)) {
      c = c.replace(regex, novo);
      changes.push({ from: old, to: novo, reason: "vocabulário premium" });
    }
  }

  // Remove emojis proibidos
  for (const emoji of EMOJI_PROIBIDOS) {
    if (c.includes(emoji)) {
      c = c.replaceAll(emoji, "");
      changes.push({ from: emoji, to: "(removido)", reason: "emoji cringe" });
    }
  }

  // Flag linguagem proibida (não remove, LLM decide)
  for (const word of LINGUAGEM_PROIBIDA) {
    if (word.length > 2 && new RegExp(`\\b${word}\\b`, "i").test(c)) {
      // não altera, só registra pra o LLM ver
      changes.push({ from: word, to: "(FLAG)", reason: "linguagem suspeita — LLM decide" });
    }
  }

  // Limpa espaços duplos e vírgulas duplas (preserva \n que o enforceFirstLine vai inserir)
  c = c.replace(/[ \t]{2,}/g, " ").replace(/,{2,}/g, ",").replace(/,\s*,/g, ",").trim();

  // Garante primeira linha <=120 chars (IG 2026)
  const before = c;
  c = enforceFirstLine(c);
  if (c !== before) changes.push({ from: "primeira linha longa", to: "quebrada", reason: "IG 2026: >120 chars" });

  return { cleaned: c, changes };
}

/**
 * Aplica regras 2026 deterministicas em hashtags:
 * - Maximo 5
 * - Minusculas, sem acento, sem espacos dentro
 * - Remove typos conhecidos
 */
export function cleanHashtags(tags: string[]): { final: string[]; changes: string[] } {
  const changes: string[] = [];
  if (!Array.isArray(tags)) return { final: [], changes };

  let cleaned = tags
    .map((t) => {
      let v = String(t).trim();
      if (!v.startsWith("#")) v = "#" + v;
      // lowercase + sem acento + sem espaço + sem char especial
      v = v
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9#]/g, "");
      return v;
    })
    .filter((t) => t.length > 1 && t.length < 40);

  // Remove duplicatas preservando ordem
  cleaned = Array.from(new Set(cleaned));

  // Max 5 (regra 2026)
  if (cleaned.length > 5) {
    const cut = cleaned.slice(5);
    cleaned = cleaned.slice(0, 5);
    changes.push(`removeu ${cut.length} hashtags (regra 2026: max 5)`);
  }

  return { final: cleaned, changes };
}

const SYSTEM = `${brandBlockCompact()}

Voce eh o Otimizador de Legenda Instagram. Recebe uma legenda ja gerada + contexto da marca.
Aplica microajustes pra ficar alinhada com o tom Digital Paisagismo.

Suas tarefas:
1. Manter o TOM e a MENSAGEM originais (nao reescrever do zero)
2. Substituir palavras/frases proibidas flagadas
3. Aplicar vocabulario premium onde natural
4. Se caber, reforcar sutilmente o Big Domino ("decidir com clareza" / "antes de investir") — nao forcar
5. Verificar tamanho (max 60 palavras, ideal 30-50)
6. Verificar estrutura (hook + 1-2 frases + fecho)
7. Hashtags: manter 3-5, todas minusculas, sem acento/camelCase

Retorne JSON puro:
{
  "legenda": string,
  "hashtags": string[],
  "changes": [{"from": string, "to": string, "reason": string}],
  "big_domino_adicionado": boolean,
  "word_count": int
}`;

export async function optimizeCaption(input: CaptionInput): Promise<OptimizedCaption> {
  // Passo 1 — limpeza deterministica (rapida)
  const { cleaned, changes: detChanges } = deterministicClean(input.legenda);
  const { final: cleanTags, changes: tagChanges } = cleanHashtags(input.hashtags || []);
  for (const ch of tagChanges) detChanges.push({ from: "hashtags", to: "(limpas)", reason: ch });

  // Passo 2 — Claude ajusta semanticamente
  const user = `LEGENDA ORIGINAL (já pré-limpa):
${cleaned}

HASHTAGS:
${(input.hashtags || []).join(" ")}

APROACH: ${input.approach || "nao especificado"}

MUDANÇAS DETERMINÍSTICAS JÁ FEITAS:
${detChanges.map((c) => `- "${c.from}" → "${c.to}" (${c.reason})`).join("\n") || "nenhuma"}

Sua tarefa: aplicar os ajustes semânticos restantes (flags linguagem suspeita, big domino se couber, tamanho).
Retorne JSON puro.`;

  try {
    const resp = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 900,
      temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "";
    const parsed = extractJson(raw) as Partial<OptimizedCaption>;
    // Enforça novamente apos LLM (o Claude as vezes junta tudo numa linha só)
    const finalCaption = enforceFirstLine(parsed.legenda || cleaned);
    // Re-aplica hashtag cleanup em cima do retorno do Claude (garante max 5)
    const { final: finalTags } = cleanHashtags(
      Array.isArray(parsed.hashtags) && parsed.hashtags.length ? parsed.hashtags : cleanTags,
    );
    return {
      legenda: finalCaption,
      hashtags: finalTags,
      changes: [...detChanges, ...(Array.isArray(parsed.changes) ? parsed.changes : [])],
      big_domino_adicionado: Boolean(parsed.big_domino_adicionado),
      word_count: finalCaption.trim().split(/\s+/).length,
    };
  } catch {
    return {
      legenda: cleaned,
      hashtags: cleanTags,
      changes: detChanges,
      big_domino_adicionado: false,
      word_count: cleaned.trim().split(/\s+/).length,
    };
  }
}
