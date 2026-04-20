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

  // Limpa espaços duplos e vírgulas duplas
  c = c.replace(/\s{2,}/g, " ").replace(/,{2,}/g, ",").replace(/,\s*,/g, ",").trim();

  return { cleaned: c, changes };
}

const SYSTEM = `${brandBlockCompact()}

Voce eh o Otimizador de Legenda Instagram. Recebe uma legenda ja gerada + contexto da marca.
Aplica microajustes pra ficar alinhada com o tom Digital Paisagismo.

Suas tarefas:
1. Manter o TOM e a MENSAGEM originais (nao reescrever do zero)
2. Substituir palavras/frases proibidas flagadas
3. Aplicar vocabulario premium onde natural
4. Se caber, reforcar sutilmente o Big Domino ("decidir com clareza" / "antes de investir") — nao forcar
5. Verificar tamanho (max 50 palavras, ideal 30-45)
6. Verificar estrutura (hook + 1-2 frases + fecho)
7. Hashtags: manter 10-14, todas minusculas, sem acento/camelCase

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
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "";
    const parsed = extractJson(raw) as Partial<OptimizedCaption>;
    const finalCaption = parsed.legenda || cleaned;
    return {
      legenda: finalCaption,
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : input.hashtags || [],
      changes: [...detChanges, ...(Array.isArray(parsed.changes) ? parsed.changes : [])],
      big_domino_adicionado: Boolean(parsed.big_domino_adicionado),
      word_count: finalCaption.trim().split(/\s+/).length,
    };
  } catch {
    return {
      legenda: cleaned,
      hashtags: input.hashtags || [],
      changes: detChanges,
      big_domino_adicionado: false,
      word_count: cleaned.trim().split(/\s+/).length,
    };
  }
}
