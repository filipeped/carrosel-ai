/**
 * Slides Architect — decide o TAMANHO do carrossel (7-10 slides).
 * Pesquisa 2026: 7-10 eh sweet spot. 10 slides = boost Explore quando completion >80%.
 * Decide tambem o OUTLINE (roteiro sumario de cada slide).
 */

import { getAi, MODEL } from "../claude";
import { extractJson } from "../utils";
import { brandBlockCompact } from "../brand-context";

export type SlideOutline = {
  slideIdx: number;
  type: "cover" | "plantDetail" | "inspiration" | "cta";
  purpose: string;     // 1 frase: o que esse slide faz na narrativa
  imageHint?: string;  // que tipo de imagem casa (opcional)
};

export type ArchitectPlan = {
  slideCount: 7 | 8 | 9 | 10;
  outline: SlideOutline[];
  rationale: string;
  recommended_hook_framework: string; // pattern_interrupt, information_gap, etc
};

const SYSTEM = `${brandBlockCompact()}

# TUA FUNCAO — ARQUITETO DO CARROSSEL

Dado um TEMA, voce decide quantos slides tem o carrossel (7-10) e planeja o roteiro.

## HEURISTICA 2026

- 7 slides: tema raso, 1 ideia central, payoff rapido
- 8 slides: tema medio, 1 ideia + 3-4 angulos
- 9 slides: tema rico, 2 ideias relacionadas com progressao
- 10 slides: tema complexo, mini-guia completo (maior retention + boost Explore)

**IMPORTANTE:** numero maior NAO eh sempre melhor. Se o tema nao sustenta 10, fica em 7-8 e respeita atencao.

## ESTRUTURA

- Slide 0: CAPA com HOOK (1 dos 6 frameworks)
- Slides 1..N-2: MIOLO alternando plantDetail (planta especifica) e inspiration (conceito/micro-ensaio)
- Slide N-1: CTA (pergunta aberta ou DM call)

## 6 FRAMEWORKS DE HOOK (recomenda 1 pra capa)
- pattern_interrupt: frase afirmativa que quebra expectativa
- information_gap: abre loop que so o carrossel fecha
- contrarian: vai contra senso comum (gera debate)
- specific_number: R$X mil, Y%, Z vezes (credibilidade)
- status_prize_frame: ativa pertencimento — por GOSTO e CUIDADO, nao renda
- timing: urgencia especifica de obra ou estacao

## RETORNE JSON PURO

{
  "slideCount": 7|8|9|10,
  "outline": [
    { "slideIdx": 0, "type": "cover", "purpose": "...", "imageHint": "..." },
    { "slideIdx": 1, "type": "plantDetail"|"inspiration", "purpose": "...", "imageHint": "..." },
    ...
    { "slideIdx": N-1, "type": "cta", "purpose": "...", "imageHint": "..." }
  ],
  "rationale": string (1-2 frases: por que esse tamanho e esse hook),
  "recommended_hook_framework": "pattern_interrupt"|"information_gap"|"contrarian"|"specific_number"|"status_prize_frame"|"timing"
}`;

export async function planSlides(params: {
  prompt: string;
  userBrief?: string;
  persona?: string;
  availableImages?: number;
}): Promise<ArchitectPlan> {
  const { prompt, userBrief, persona, availableImages = 12 } = params;

  const userMsg = `TEMA: "${prompt}"
${userBrief ? `BRIEFING: ${userBrief}\n` : ""}
PERSONA: ${persona || "indefinida"}
IMAGENS DISPONIVEIS: ${availableImages}

Decide slideCount (7-10) e retorna outline completo. JSON puro.`;

  try {
    const resp = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 1800,
      temperature: 0.5,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMsg },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "";
    const parsed = extractJson(raw) as Partial<ArchitectPlan>;

    const slideCount = ([7, 8, 9, 10] as const).includes(parsed.slideCount as 7 | 8 | 9 | 10)
      ? (parsed.slideCount as 7 | 8 | 9 | 10)
      : 8;

    // Valida outline
    let outline: SlideOutline[] = Array.isArray(parsed.outline) ? parsed.outline : [];
    if (outline.length !== slideCount) {
      // Gera outline default
      outline = Array.from({ length: slideCount }).map((_, i) => {
        let type: SlideOutline["type"] = "inspiration";
        if (i === 0) type = "cover";
        else if (i === slideCount - 1) type = "cta";
        else type = i % 2 === 1 ? "plantDetail" : "inspiration";
        return {
          slideIdx: i,
          type,
          purpose:
            i === 0
              ? "capa com hook forte"
              : i === slideCount - 1
              ? "CTA de DM ou pergunta aberta"
              : `slide ${i}: progressao da narrativa`,
        };
      });
    }

    return {
      slideCount,
      outline,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : "default plan (LLM invalid)",
      recommended_hook_framework:
        typeof parsed.recommended_hook_framework === "string"
          ? parsed.recommended_hook_framework
          : "information_gap",
    };
  } catch (err) {
    console.error("[slides-architect] falhou:", (err as Error).message);
    // Fallback seguro: 8 slides padrao
    const slideCount: 8 = 8;
    const outline: SlideOutline[] = Array.from({ length: slideCount }).map((_, i) => {
      let type: SlideOutline["type"] = "inspiration";
      if (i === 0) type = "cover";
      else if (i === slideCount - 1) type = "cta";
      else type = i % 2 === 1 ? "plantDetail" : "inspiration";
      return {
        slideIdx: i,
        type,
        purpose: i === 0 ? "capa" : i === slideCount - 1 ? "CTA" : "miolo",
      };
    });
    return {
      slideCount,
      outline,
      rationale: "fallback: architect offline, usando 8 slides default",
      recommended_hook_framework: "information_gap",
    };
  }
}
