/**
 * Slides Architect — decide o TAMANHO do carrossel (6-10 slides).
 * Pesquisa 2026: 6-10 (6 = sweet spot baseado em dados reais do perfil). 10 slides = boost Explore quando completion >80%.
 * Decide tambem o OUTLINE (roteiro sumario de cada slide).
 *
 * Frameworks alinhados com brand-context.ts (7 frameworks 2026).
 */

import { getAi, MODEL } from "../claude";
import { extractJson } from "../utils";
import { brandBlockCompact, type HookFrameworkKey } from "../brand-context";
import type { CarouselFormat } from "../types";
import type { VegetacaoRow } from "../supabase";

export type SlideOutline = {
  slideIdx: number;
  type:
    | "cover"
    | "plantDetail"
    | "inspiration"
    | "cta"
    | "beforeAfter"
    | "mythBuster"
    | "listItem"
    | "problemSolution";
  purpose: string;     // 1 frase: o que esse slide faz na narrativa
  imageHint?: string;  // que tipo de imagem casa (opcional)
  phase?: "ANTES" | "DEPOIS" | "PROCESSO"; // beforeAfter only
};

export type ArchitectPlan = {
  slideCount: 6 | 7 | 8 | 9 | 10;
  outline: SlideOutline[];
  rationale: string;
  recommended_hook_framework: HookFrameworkKey;
  format: CarouselFormat;
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

Dado um TEMA, voce decide quantos slides tem o carrossel (6-10) e planeja o roteiro.

## HEURISTICA 2026

- 6 slides: tema direto, 1 tese forte, payoff imediato (sweet spot do perfil)
- 7 slides: tema raso, 1 ideia central, payoff rapido
- 8 slides: tema medio, 1 ideia + 3-4 angulos
- 9 slides: tema rico, 2 ideias relacionadas com progressao
- 10 slides: tema complexo, mini-guia completo (maior retention + boost Explore)

**IMPORTANTE:** numero maior NAO eh sempre melhor. Se o tema nao sustenta 10, fica em 7-8 e respeita atencao.

## ESTRUTURA

- Slide 0: CAPA com HOOK (1 dos 7 frameworks)
- Slides 1..N-2: MIOLO alternando plantDetail (planta especifica) e inspiration (conceito/micro-ensaio)
- Slide N-1: CTA (afirmacao contemplativa — NAO call de DM)

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
  "slideCount": 6|7|8|9|10,
  "outline": [
    { "slideIdx": 0, "type": "cover", "purpose": "...", "imageHint": "..." },
    { "slideIdx": 1, "type": "plantDetail"|"inspiration", "purpose": "...", "imageHint": "..." },
    ...
    { "slideIdx": N-1, "type": "cta", "purpose": "...", "imageHint": "..." }
  ],
  "rationale": string (1-2 frases: por que esse tamanho e esse hook),
  "recommended_hook_framework": "sensorial"|"manifesto_tese"|"revelacao"|"quebra_expectativa"|"historia_da_planta"|"observacao_de_quem_entende"|"comportamento_do_jardim"
}`;

/**
 * Outline deterministico pros formatos NAO-CLASSICOS.
 * Cada formato tem estrutura propria (tamanho fixo + types fixos por slot).
 * Hook framework default por formato baseado em performance esperada.
 */
function buildFormatOutline(
  format: CarouselFormat,
  plantasEscolhidas?: VegetacaoRow[],
): {
  slideCount: 6 | 7 | 8 | 9 | 10;
  outline: SlideOutline[];
  hookFramework: HookFrameworkKey;
  rationale: string;
} | null {
  if (format === "classic") return null;

  // Distribui plantas escolhidas pelos slots de miolo (cycling se faltar planta).
  // O purpose ganha o nome da planta protagonista — ajuda o LLM a focar.
  const pickPlanta = (idx: number): string => {
    if (!plantasEscolhidas?.length) return "";
    const p = plantasEscolhidas[idx % plantasEscolhidas.length];
    return p ? ` [protagonista: ${p.nome_popular}${p.nome_cientifico ? ` (${p.nome_cientifico})` : ""}]` : "";
  };

  if (format === "transformation") {
    // 8 slides: cover + 2 ANTES + 2 PROCESSO + 2 DEPOIS + cta
    const phases: Array<"ANTES" | "PROCESSO" | "DEPOIS"> = [
      "ANTES", "ANTES", "PROCESSO", "PROCESSO", "DEPOIS", "DEPOIS",
    ];
    const outline: SlideOutline[] = [
      { slideIdx: 0, type: "cover", purpose: "capa com hook de transformacao" },
      ...phases.map<SlideOutline>((phase, i) => ({
        slideIdx: i + 1,
        type: "beforeAfter",
        purpose: `${phase}: ${phase === "ANTES" ? "estado inicial do espaco" : phase === "PROCESSO" ? "execucao em andamento" : "resultado finalizado"}${pickPlanta(i)}`,
        phase,
        imageHint: phase === "ANTES" ? "area sem paisagismo, terreno bruto" : phase === "PROCESSO" ? "execucao, plantio, montagem" : "jardim pronto, cena finalizada",
      })),
      { slideIdx: 7, type: "cta", purpose: "fechamento contemplativo sobre transformacao" },
    ];
    return {
      slideCount: 8,
      outline,
      hookFramework: "quebra_expectativa",
      rationale: "transformation 8 slides (cover + 2 ANTES + 2 PROCESSO + 2 DEPOIS + cta)",
    };
  }

  if (format === "myths") {
    // 7 slides: cover + 5 myth + cta
    const outline: SlideOutline[] = [
      { slideIdx: 0, type: "cover", purpose: "capa anunciando lista de mitos" },
      ...Array.from({ length: 5 }).map<SlideOutline>((_, i) => ({
        slideIdx: i + 1,
        type: "mythBuster",
        purpose: `mito ${i + 1}: derruba uma crenca comum sobre paisagismo${pickPlanta(i)}`,
      })),
      { slideIdx: 6, type: "cta", purpose: "fechamento provocando reflexao sobre os mitos" },
    ];
    return {
      slideCount: 7,
      outline,
      hookFramework: "revelacao",
      rationale: "myths 7 slides (cover + 5 mitos + cta)",
    };
  }

  if (format === "listicle") {
    // 9 slides: cover + 7 itens + cta
    const outline: SlideOutline[] = [
      { slideIdx: 0, type: "cover", purpose: "capa com numero e beneficio claro da lista" },
      ...Array.from({ length: 7 }).map<SlideOutline>((_, i) => ({
        slideIdx: i + 1,
        type: "listItem",
        purpose: `item ${i + 1} da lista: planta com nome e dica curta`,
      })),
      { slideIdx: 8, type: "cta", purpose: "convite a salvar o post pra consultar depois" },
    ];
    return {
      slideCount: 9,
      outline,
      hookFramework: "manifesto_tese",
      rationale: "listicle 9 slides (cover + 7 itens + cta)",
    };
  }

  if (format === "problemSolution") {
    // 7 slides: cover + 5 problema/solucao + cta
    const outline: SlideOutline[] = [
      { slideIdx: 0, type: "cover", purpose: "capa com hook de dor (problema comum no jardim)" },
      ...Array.from({ length: 5 }).map<SlideOutline>((_, i) => ({
        slideIdx: i + 1,
        type: "problemSolution",
        purpose: `problema ${i + 1} e como resolver${pickPlanta(i)}`,
      })),
      { slideIdx: 6, type: "cta", purpose: "fechamento provocando reflexao sobre os problemas" },
    ];
    return {
      slideCount: 7,
      outline,
      hookFramework: "observacao_de_quem_entende",
      rationale: "problemSolution 7 slides (cover + 5 problema/solucao + cta)",
    };
  }

  return null;
}

export async function planSlides(params: {
  prompt: string;
  userBrief?: string;
  persona?: string;
  availableImages?: number;
  format?: CarouselFormat;
  plantasEscolhidas?: VegetacaoRow[];
}): Promise<ArchitectPlan> {
  const { prompt, userBrief, persona, availableImages = 12, format = "classic", plantasEscolhidas } = params;

  // Formatos nao-classicos tem estrutura fixa — short-circuit sem chamar LLM
  const fixed = buildFormatOutline(format, plantasEscolhidas);
  if (fixed) {
    return {
      slideCount: fixed.slideCount,
      outline: fixed.outline,
      rationale: fixed.rationale,
      recommended_hook_framework: fixed.hookFramework,
      format,
    };
  }

  const userMsg = `TEMA: "${prompt}"
${userBrief ? `BRIEFING: ${userBrief}\n` : ""}
PERSONA: ${persona || "indefinida"}
IMAGENS DISPONIVEIS: ${availableImages}

Decide slideCount (6-10) e retorna outline completo. JSON puro.`;

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

    const slideCount = ([6, 7, 8, 9, 10] as const).includes(parsed.slideCount as 6 | 7 | 8 | 9 | 10)
      ? (parsed.slideCount as 6 | 7 | 8 | 9 | 10)
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
              ? "CTA fechamento contemplativo"
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
      format,
    };
  } catch (err) {
    console.error("[slides-architect] falhou:", (err as Error).message);
    const slideCount: 6 = 6;
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
      rationale: "fallback: architect offline, usando 6 slides default",
      recommended_hook_framework: "sensorial",
      format,
    };
  }
}
