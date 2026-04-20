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

Abordagens reconhecidas (cada uma tem potencial diferente em 2026):
- **direta_emocional** — emocional simples, boa pra saves mas fraca em shares. Score tipico: 60-75.
- **contraste_verdade** — quebra crenca, gera debate. Score tipico: 75-88.
- **tecnico_relacional** — educativo, saves altos com publico em obra. Score tipico: 65-80.
- **contrarian_forte** — controversia + numero concreto. Gera comments e shares. Score tipico: 80-93.
- **information_gap** — curiosity gap forte. Maior completion rate e saves. Score tipico: 82-95.

Criterios pra alto score:
- Hook nos primeiros 120 caracteres (IG corta no feed em ~125)
- Information gap ou contrarian ganham pontos extras (2026 favorece)
- Promessa concreta e visualizável, numero quando possivel
- CTA ativo de DM ("me manda X no direct") > salve passivo
- Vocabulario premium sem forçar
- Zero linguagem proibida
- Big Domino presente sutilmente
- Persona clara (em obra ou casa pronta)
- SHARE-ABILITY: 2a frase funciona copiada num WhatsApp

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
