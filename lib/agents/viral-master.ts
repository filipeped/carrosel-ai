/**
 * Agente 5: Viral Master (CORE do sistema).
 * Entra DEPOIS do caption-optimizer, ANTES do variant-ranker.
 * Garante que cada copy usa 1 dos 6 hooks 2026 explicitos.
 * Mata frases inspiracionais vazias (lista banida).
 */

import { getAi, getPremiumModel, MODEL } from "../claude";
import { extractJson } from "../utils";
import {
  brandBlockFull,
  viralFrameworksBlock,
  INSPIRACIONAL_VAZIO,
  HOOK_FRAMEWORKS_2026,
  type HookFrameworkKey,
} from "../brand-context";

export type ViralOutput = {
  legenda_viral: string;
  hashtags: string[];
  gatilho_usado: HookFrameworkKey | "outro";
  score_viralidade: number; // 0-10
  changes: Array<{ from: string; to: string; reason: string }>;
  rationale: string;
};

type ViralInput = {
  legenda: string;
  hashtags?: string[];
  slides?: Array<{ type: string; title?: string | null; [k: string]: unknown }>;
  prompt?: string;
  approach?: string;
  persona?: string;
};

/**
 * Detecta frases banidas na legenda. Retorna lista de matches.
 */
export function detectInspiracionalVazio(texto: string): string[] {
  const lower = texto.toLowerCase();
  const hits: string[] = [];
  for (const bad of INSPIRACIONAL_VAZIO) {
    if (lower.includes(bad.toLowerCase())) hits.push(bad);
  }
  return hits;
}

/**
 * Se detecta gatilho conhecido (por heuristica), retorna a key.
 */
function detectGatilho(texto: string): HookFrameworkKey | "outro" {
  const lower = texto.toLowerCase();
  if (/\br?\$ ?\d+|\d+%|\d+ anos|\d+x mais|\d+ vezes/.test(lower)) return "specific_number";
  if (/obra (esta|andando|em [a-z]+)|antes (do gesso|da alvenaria)|momento (de|exato)/.test(lower)) return "timing";
  if (/a maioria|99%|seletivo|clube|alto padrao/.test(lower)) return "status_prize_frame";
  if (/nao eh|nao e o que|contrariando|vai contra/.test(lower)) return "contrarian";
  if (/^(a pergunta|o erro|o passo|o detalhe|3 decis|5 coisas|\d+ )/.test(lower)) return "information_gap";
  if (/\b(piscina|jardim) nao eh\b|reverte|quebra/.test(lower)) return "pattern_interrupt";
  return "outro";
}

const SYSTEM = `${brandBlockFull()}

${viralFrameworksBlock()}

---

# TUA FUNCAO

Voce eh o VIRAL MASTER. Recebe uma legenda ja otimizada na voz da marca.
Tua unica missao: garantir que ela VIRALIZE.

## PIPELINE DO TEU TRABALHO

1. Le a legenda recebida.
2. Identifica qual dos 6 frameworks 2026 ela usa (ou nenhum).
3. Se usa inspiracional vazio (lista banida), REESCREVE a primeira linha usando 1 dos 6 frameworks.
4. Se a primeira linha eh "setup" (descrevendo cena bonita) em vez de HOOK, REESCREVE.
5. Valida SHARE-ABILITY: a 2a frase deve funcionar sozinha copiada num WhatsApp.
6. Valida CTA: ultima frase de preferencia pede DM ("me manda 'PROJETO' no direct") — shares pesam 3-5x mais que likes em 2026.
7. Mantem o TAMANHO (max 50 palavras, ideal 30-45).
8. Nao toca no CORPO da mensagem — so polimento viral.

## REGRA DURA

Se o texto ja usa 1 framework bem, score_viralidade >= 7, NAO mexe. So valida.
Se NAO usa, voce REESCREVE a abertura ate conseguir. Iteracao invisivel — o output eh a versao melhor.

## REGRAS DURAS DE ESCRITA

- Primeira linha <= 120 caracteres (IG corta em 125)
- Tamanho total: max 50 palavras
- Hashtags: 3-5 (mantem do input, nao inventa novas)
- Zero frase inspiracional vazia (lista banida acima)
- Primeira linha = HOOK explicito (1 dos 6 frameworks), nao setup
- Estrutura: hook \\n\\n corpo (1-2 frases) \\n\\n CTA
- CTA de DM quando couber

## SCORE_VIRALIDADE (0-10)

- 10: hook forte + payoff claro + CTA DM + zero banido
- 8: hook ok + 1-2 micro ajustes
- 5: hook generico, ainda pode engajar
- 3: inspiracional disfarcado, precisa reescrever
- 0: inspiracional puro, sem hook

## RETORNE JSON PURO

{
  "legenda_viral": string (legenda final, pronta pra postar),
  "hashtags": string[] (3-5, preservando input),
  "gatilho_usado": "pattern_interrupt"|"information_gap"|"contrarian"|"specific_number"|"status_prize_frame"|"timing"|"outro",
  "score_viralidade": int (0-10),
  "changes": [{"from": string, "to": string, "reason": string}],
  "rationale": string (1 frase: por que essa versao vai engajar mais)
}`;

export async function viralMaster(input: ViralInput): Promise<ViralOutput> {
  const banidas = detectInspiracionalVazio(input.legenda);
  const gatilhoDetectado = detectGatilho(input.legenda);

  const contextBlock = `APPROACH: ${input.approach || "nao especificado"}
PERSONA: ${input.persona || "indefinida"}
${input.prompt ? `TEMA: "${input.prompt}"` : ""}
${input.slides?.[0] ? `CAPA (slide 0): ${JSON.stringify({ title: input.slides[0].title, topLabel: input.slides[0].topLabel })}` : ""}

LEGENDA RECEBIDA:
${input.legenda}

HASHTAGS: ${(input.hashtags || []).join(" ") || "(nenhuma)"}

PRE-CHECK:
- Frases banidas detectadas: ${banidas.length ? banidas.join(", ") : "nenhuma ✓"}
- Gatilho detectado (heuristica): ${gatilhoDetectado}
- Tamanho: ${input.legenda.split(/\s+/).length} palavras

${banidas.length ? "ATENCAO: contem inspiracional vazio — REESCREVER obrigatoriamente." : ""}

Retorna JSON puro.`;

  try {
    const resp = await getAi().chat.completions.create({
      model: getPremiumModel() || MODEL,
      max_tokens: 1200,
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: contextBlock },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "";
    const parsed = extractJson(raw) as Partial<ViralOutput>;

    const legenda_viral = parsed.legenda_viral || input.legenda;
    const validGatilhos: Array<HookFrameworkKey | "outro"> = [
      ...(Object.keys(HOOK_FRAMEWORKS_2026) as HookFrameworkKey[]),
      "outro",
    ];
    const gatilho_usado =
      parsed.gatilho_usado && validGatilhos.includes(parsed.gatilho_usado)
        ? parsed.gatilho_usado
        : gatilhoDetectado;

    return {
      legenda_viral,
      hashtags: Array.isArray(parsed.hashtags) && parsed.hashtags.length
        ? parsed.hashtags
        : input.hashtags || [],
      gatilho_usado,
      score_viralidade:
        typeof parsed.score_viralidade === "number" ? Math.max(0, Math.min(10, parsed.score_viralidade)) : 5,
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : "sem rationale",
    };
  } catch (err) {
    console.error("[viral-master] falha:", (err as Error)?.message || err);
    return {
      legenda_viral: input.legenda,
      hashtags: input.hashtags || [],
      gatilho_usado: gatilhoDetectado,
      score_viralidade: banidas.length ? 3 : 5,
      changes: [],
      rationale: "fallback sem mudanca (viral master offline)",
    };
  }
}
