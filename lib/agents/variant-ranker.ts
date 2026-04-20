/**
 * Agente 4: Variant Ranker (PÓS-legenda).
 * Recebe as 3 (ou mais) abordagens de legenda e estima qual vai engajar mais.
 * Usa brand context + (futuramente) histórico de caption_performance.
 */

import { getAi, MODEL } from "../claude";
import { extractJson } from "../utils";
import { brandBlockCompact } from "../brand-context";

export type VariantScore = {
  idx: number;
  estimatedScore: number; // 0-100
  reason: string;
  strengths: string[];
  weaknesses: string[];
};

type CaptionVariant = {
  approach?: string;
  hook?: string;
  legenda: string;
  hashtags?: string[];
};

const SYSTEM = `${brandBlockCompact()}

Voce eh o Ranqueador A/B de legendas Instagram pra Digital Paisagismo.

Recebe N variantes de legenda (cada uma com approach/hook/texto). Avalia qual tem MAIS POTENCIAL de engajamento (saves + shares > likes).

Abordagens reconhecidas (CURADOR, nao vendedor):
- **direta_emocional** — emocional simples, boa pra saves. Score tipico: 65-80.
- **contraste_verdade** — revela padrao, gera curiosidade. Score tipico: 75-88.
- **tecnico_relacional** — educativo sem jargao. Score tipico: 70-82.
- **sensorial_curador** — textura/som/luz/tempo. Score alto quando concreto: 78-90.
- **historia_da_planta** — tempo de especie, comportamento. Score: 78-92.

Criterios pra alto score:
- Hook nos primeiros 120 caracteres (IG corta no feed em ~125)
- Revelacao, sensorial, historia ou observacao (gatilhos de curador) ganham pontos
- Imagem/textura/som concreto em vez de promessa vaga
- Fecho contemplativo (pergunta aberta organica) > CTA comercial
- Vocabulario premium sem forçar
- Zero linguagem proibida
- SHARE-ABILITY: 2a frase funciona copiada num WhatsApp

PENALIDADES FORTES (tom comercial — tira 20+ pontos):
- "contratar", "antes de chamar", "3 decisoes antes", "projeto 3D"
- "retrabalho", "custa R$", "custa 3x", "40% do orcamento"
- "me manda no direct", "em que fase", "antes do gesso"
- Frase que parece pitch de venda > score <= 50

Criterios pra baixo score:
- Começa com descrição de foto (aborto de hook)
- Tecnicismo que so paisagista entende
- Linguagem vendedor
- Generica ("jardim bonito", "espaço aconchegante")
- CTA fraco ("o que acha?" sem direcionamento)

Retorne JSON puro:
{
  "ranked": [
    {"idx": int, "estimatedScore": int, "reason": string, "strengths": string[], "weaknesses": string[]}
  ]
}

Ordem: melhor (maior score) pra pior.`;

export async function rankCaptionVariants(
  captions: CaptionVariant[],
): Promise<VariantScore[]> {
  if (!captions.length) return [];
  if (captions.length === 1) {
    return [
      {
        idx: 0,
        estimatedScore: 50,
        reason: "única variante",
        strengths: [],
        weaknesses: [],
      },
    ];
  }

  const list = captions
    .map(
      (c, i) =>
        `[${i}] approach=${c.approach || "?"} | hook=${c.hook || "?"}\n${c.legenda}`,
    )
    .join("\n\n---\n\n");

  const user = `VARIANTES:\n\n${list}\n\nRanqueia. JSON puro.`;

  try {
    const resp = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "";
    const parsed = extractJson(raw) as { ranked?: VariantScore[] };
    if (!Array.isArray(parsed.ranked)) throw new Error("invalid");
    return parsed.ranked;
  } catch {
    // Fallback: mantém ordem original
    return captions.map((_, i) => ({
      idx: i,
      estimatedScore: 50,
      reason: "ranker falhou, ordem original",
      strengths: [],
      weaknesses: [],
    }));
  }
}
