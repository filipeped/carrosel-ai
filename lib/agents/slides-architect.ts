/**
 * Slides Architect — decide o TAMANHO do carrossel (7-10 slides).
 * Pesquisa 2026: 7-10 eh sweet spot. 10 slides = boost Explore quando completion >80%.
 * Decide tambem o OUTLINE (roteiro sumario de cada slide).
 *
 * Frameworks alinhados com brand-context.ts (7 frameworks 2026).
 */

import { getAi, MODEL } from "../claude";
import { extractJson } from "../utils";
import { brandBlockCompact, type HookFrameworkKey } from "../brand-context";

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
  recommended_hook_framework: HookFrameworkKey;
};

const VALID_FRAMEWORKS: HookFrameworkKey[] = [
  "sensorial",
  "manifesto_tese",
  "revelacao",
  "quebra_expectativa",
  "historia_da_planta",
  "observacao_de_quem_entende",
  "comportamento_do_jardim",
];

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

- Slide 0: CAPA com HOOK (1 dos 7 frameworks)
- Slides 1..N-2: MIOLO alternando plantDetail (planta especifica) e inspiration (conceito/micro-ensaio)
- Slide N-1: CTA (pergunta aberta — NAO call de DM)

## 7 FRAMEWORKS DE HOOK 2026 (recomenda 1 pra capa)
PRIORIZE sensorial e manifesto_tese — sao os que mais performam no perfil (dados reais).

- sensorial: convida a sentir textura, som, luz, cenario. MELHOR framework (avg 282 eng, top post 609 likes)
- manifesto_tese: afirmacao forte que posiciona a marca com conviccao. 2o melhor (avg 155 eng)
- revelacao: revela padrao/segredo que so quem ve muitos jardins percebe
- quebra_expectativa: afirmacao curta que contraria intuicao visual
- historia_da_planta: conta o tempo de uma planta, crescimento, transformacao
- observacao_de_quem_entende: olhar tecnico traduzido em detalhe visivel
- comportamento_do_jardim: como o jardim age ao longo do tempo

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
  "recommended_hook_framework": "sensorial"|"manifesto_tese"|"revelacao"|"quebra_expectativa"|"historia_da_planta"|"observacao_de_quem_entende"|"comportamento_do_jardim"
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
              ? "CTA pergunta aberta"
              : `slide ${i}: progressao da narrativa`,
        };
      });
    }

    // Valida framework — fallback pra sensorial (melhor performer)
    const recFramework = typeof parsed.recommended_hook_framework === "string"
      ? parsed.recommended_hook_framework as HookFrameworkKey
      : "sensorial";
    const validFramework = VALID_FRAMEWORKS.includes(recFramework) ? recFramework : "sensorial";

    return {
      slideCount,
      outline,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : "default plan (LLM invalid)",
      recommended_hook_framework: validFramework,
    };
  } catch (err) {
    console.error("[slides-architect] falhou:", (err as Error).message);
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
      recommended_hook_framework: "sensorial",
    };
  }
}
