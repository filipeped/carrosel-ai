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
  COMERCIAL_VENDEDOR,
  HOOK_FRAMEWORKS_2026,
  type HookFrameworkKey,
} from "../brand-context";
import { competitorInspirationBlock } from "./competitor-research";

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
 * Detecta frases banidas (inspiracional E comercial). Retorna lista de matches.
 */
export function detectInspiracionalVazio(texto: string): string[] {
  const lower = texto.toLowerCase();
  const hits: string[] = [];
  for (const bad of INSPIRACIONAL_VAZIO) {
    if (lower.includes(bad.toLowerCase())) hits.push(bad);
  }
  return hits;
}

export function detectComercialVendedor(texto: string): string[] {
  const lower = texto.toLowerCase();
  const hits: string[] = [];
  for (const bad of COMERCIAL_VENDEDOR) {
    if (lower.includes(bad.toLowerCase())) hits.push(bad);
  }
  return hits;
}

/**
 * Se detecta gatilho conhecido (por heuristica), retorna a key.
 * Agora com os 6 frameworks NAO-COMERCIAIS (revelacao, sensorial, etc).
 */
function detectGatilho(texto: string): HookFrameworkKey | "outro" {
  const lower = texto.toLowerCase();
  if (/a maioria|em comum|nao eh coincidencia|quase ninguem|poucos notam|raro/.test(lower)) return "revelacao";
  if (/barulho|cheiro|sombra|luz|textura|folha|desenha|silencio|perfume/.test(lower)) return "sensorial";
  if (/\d+ anos|\d+o verao|\d+o ano|leva \d|floracao|crescimento|primeiro ano/.test(lower)) return "historia_da_planta";
  if (/detalhe que|repare|olhar de quem|quem entende|percebe|nao eh o mesmo/.test(lower)) return "observacao_de_quem_entende";
  if (/\bno (primeiro|segundo) (mes|verao|ano)\b|estacao|comportamento|se mostra/.test(lower)) return "comportamento_do_jardim";
  if (/\b(piscina|jardim|cor|grande) nao eh\b/.test(lower)) return "quebra_expectativa";
  return "outro";
}

const SYSTEM = `${brandBlockFull()}

${viralFrameworksBlock()}

${competitorInspirationBlock({ limit: 6 })}

---

# TUA FUNCAO

Voce eh o VIRAL MASTER. Recebe uma legenda otimizada na voz da marca.
Tua unica missao: garantir que ela VIRALIZA sem parecer ANUNCIO.

## FILOSOFIA EDITORIAL

CURADOR APAIXONADO > VENDEDOR EDUCANDO CLIENTE.

Posts que viralizam no @digitalpaisagismo (hits reais: 249, 170, 94 saves) sao todos
de REVELACAO, SENSORIAL, OBSERVACAO DE CURADOR. Nao sao "3 decisoes antes de contratar".
Algoritmo 2026 detecta tom comercial disfarcado e REBAIXA. Share zero vem de ad vibe.

## PIPELINE DO TEU TRABALHO

1. Le a legenda recebida.
2. Identifica qual dos 6 frameworks ela usa (revelacao/sensorial/historia/observacao/comportamento/quebra).
3. Se usa INSPIRACIONAL vazio (lista banida), REESCREVE a primeira linha.
4. Se usa COMERCIAL vendedor (lista banida: "contratar", "antes de chamar", "projeto 3D",
   "o erro de R$", "me manda no direct", "3 decisoes"), REESCREVE removendo o tom de venda.
5. Se a primeira linha eh "setup" em vez de HOOK, REESCREVE.
6. Valida SHARE-ABILITY: a 2a frase deve funcionar sozinha copiada num WhatsApp.
7. CTA sutil: afirmacao contemplativa que fecha com conviccao OU pergunta retorica curta.
   Posts SEM pergunta performam 3.4x melhor (dados reais). Prefira fechar com afirmacao forte.
8. Mantem o TAMANHO (max 60 palavras, ideal 30-50).
9. Nao toca no CORPO da mensagem — so polimento editorial.

## REGRA DURA

Se o texto ja usa 1 framework bem, score_viralidade >= 7, NAO mexe. So valida.
Se NAO usa, voce REESCREVE a abertura ate conseguir. Iteracao invisivel — o output eh a versao melhor.

## REGRAS DURAS DE ESCRITA

- Primeira linha <= 120 caracteres (IG corta em 125)
- Tamanho total: max 60 palavras
- Hashtags: 3-5 (mantem do input, nao inventa novas)
- Zero frase inspiracional vazia (lista banida acima)
- Zero tom comercial (lista COMERCIAL_VENDEDOR banida)
- Primeira linha = HOOK de curador (1 dos 6 frameworks), nao setup nem pitch
- Estrutura: hook \\n\\n corpo (1-2 frases curator tone) \\n\\n fecho contemplativo
- Fecho = afirmacao contemplativa OU pergunta retorica curta (dados: sem pergunta = 3.4x mais eng),
  NAO "me manda no direct", NAO "em que fase", NAO "qual projeto", NAO "qual planta voce..."

## SCORE_VIRALIDADE (0-10)

- 10: hook de curador forte + revelacao ou sensorial claro + fecho contemplativo + zero banido
- 8: hook ok + 1-2 micro ajustes
- 5: hook generico ou neutro
- 3: inspiracional vazio disfarcado OU tom comercial sutil
- 0: venda explicita, "contrate", pitch de projeto

## RETORNE JSON PURO

{
  "legenda_viral": string (legenda final, pronta pra postar),
  "hashtags": string[] (3-5, preservando input),
  "gatilho_usado": "sensorial"|"manifesto_tese"|"revelacao"|"quebra_expectativa"|"historia_da_planta"|"observacao_de_quem_entende"|"comportamento_do_jardim",
  "score_viralidade": int (0-10),
  "changes": [{"from": string, "to": string, "reason": string}],
  "rationale": string (1 frase: por que essa versao vai engajar mais)
}`;

export async function viralMaster(input: ViralInput): Promise<ViralOutput> {
  const banidas = detectInspiracionalVazio(input.legenda);
  const comerciais = detectComercialVendedor(input.legenda);
  const gatilhoDetectado = detectGatilho(input.legenda);

  const contextBlock = `APPROACH: ${input.approach || "nao especificado"}
PERSONA: ${input.persona || "indefinida"}
${input.prompt ? `TEMA: "${input.prompt}"` : ""}
${input.slides?.[0] ? `CAPA (slide 0): ${JSON.stringify({ title: input.slides[0].title, topLabel: input.slides[0].topLabel })}` : ""}

LEGENDA RECEBIDA:
${input.legenda}

HASHTAGS: ${(input.hashtags || []).join(" ") || "(nenhuma)"}

PRE-CHECK:
- Inspiracional vazio detectado: ${banidas.length ? banidas.join(", ") : "nenhum ✓"}
- Tom comercial detectado: ${comerciais.length ? comerciais.join(", ") : "nenhum ✓"}
- Gatilho detectado (heuristica): ${gatilhoDetectado}
- Tamanho: ${input.legenda.split(/\s+/).length} palavras

${banidas.length ? "ATENCAO: contem inspiracional vazio — REESCREVER obrigatoriamente." : ""}
${comerciais.length ? "ATENCAO: contem TOM COMERCIAL (venda disfarcada). REESCREVE removendo pitch — curador, nao vendedor." : ""}

Retorna JSON puro.`;

  try {
    const resp = await getAi().chat.completions.create({
      model: getPremiumModel() || MODEL,
      max_tokens: 1200,
      temperature: 0.55,
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
      score_viralidade: banidas.length || comerciais.length ? 3 : 5,
      changes: [],
      rationale: "fallback sem mudanca (viral master offline)",
    };
  }
}
