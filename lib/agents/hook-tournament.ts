/**
 * Hook Tournament — gera 20 hooks e ranqueia pelos 4 criterios 2026.
 * Curiosity gap, specificity, swipe-incentive, pattern interrupt.
 * Top N viram candidatos de capa nas variantes A/B.
 *
 * O hook eh 80% do sucesso do carrossel (pesquisa 2026).
 */

import { getAi, getPremiumModel, MODEL } from "../claude";
import { extractJson } from "../utils";
import { brandBlockFull, viralFrameworksBlock, type HookFrameworkKey } from "../brand-context";
import { competitorInspirationBlock } from "./competitor-research";

export type HookCandidate = {
  texto: string;              // a frase do hook (title da capa, 3-10 palavras)
  topLabel?: string;          // label curto UPPERCASE 2-3 palavras
  framework: HookFrameworkKey;
  scores: {
    curiosity: number;        // 0-10
    specificity: number;      // 0-10
    swipe_incentive: number;  // 0-10
    pattern_interrupt: number;// 0-10
  };
  total: number;              // media dos 4, 0-10
  rationale: string;
};

type TournamentOptions = {
  count?: number;              // default 20
  approach?: string;
  persona?: string;
};

const GENERATE_SYSTEM = `${brandBlockFull()}

${viralFrameworksBlock()}

${competitorInspirationBlock({ limit: 8 })}

# TUA FUNCAO — HOOK GENERATOR

Gera 20 hooks DIFERENTES pra uma capa de carrossel Instagram de paisagismo.
Publico: quem AMA jardim bonito — casa em obra, reforma, ou casa pronta.
NAO eh conteudo pra ricos — eh conteudo pra quem tem GOSTO e VONTADE de
transformar a area externa. Tom aspiracional + acessivel.
Cada hook eh 1 frase curta (title da capa, 3-10 palavras) + um topLabel UPPERCASE.

## REGRAS DURAS

- Variar os 6 frameworks: 3-4 hooks por framework (pattern_interrupt, information_gap, contrarian, specific_number, status_prize_frame, timing)
- Max 10 palavras no title
- topLabel: 2-3 palavras UPPERCASE (ex: "ANTES DA OBRA", "AREA EXTERNA")
- Zero inspiracional vazio
- Zero "incrivel", "impressionante", "exuberante"
- Linguagem concreta (casa, obra, projeto, decisao, custo, timing)
- Cada hook precisa abrir um LOOP que obriga swipe

## RETORNE JSON PURO

{
  "hooks": [
    {
      "texto": string (3-10 palavras, vira o title da capa),
      "topLabel": string (2-3 palavras UPPERCASE),
      "framework": "pattern_interrupt"|"information_gap"|"contrarian"|"specific_number"|"status_prize_frame"|"timing"
    }
  ]
}

Gera EXATAMENTE 20. Variacao obrigatoria.`;

const EVALUATE_SYSTEM = `${brandBlockFull()}

# TUA FUNCAO — HOOK EVALUATOR

Recebe uma lista de hooks candidatos. Avalia cada um em 4 criterios de 0-10.

## CRITERIOS

### curiosity (0-10)
Quanto o hook abre um LOOP que faz a pessoa precisar saber a resposta?
- 10: "O erro de R$40 mil que aparece 6 meses depois" (obriga swipe)
- 7: "3 decisoes que mudam o projeto" (curiosity generica)
- 3: "Paisagismo que faz diferenca" (zero curiosity)

### specificity (0-10)
Quanto o hook eh especifico e concreto (numero, tempo, pessoa) em vez de vago?
- 10: "Quebrar piso pra passar irrigacao custa 3x mais"
- 6: "3 perguntas pro arquiteto"
- 2: "Decisoes importantes"

### swipe_incentive (0-10)
Quanto o hook PROMETE payoff no resto do carrossel?
- 10: "A pergunta que paisagista evita — e muda tudo" (promete revelacao)
- 6: "O que ninguem fala sobre jardim" (promessa generica)
- 2: "Natureza eh vida" (zero promessa)

### pattern_interrupt (0-10)
Quanto o hook quebra expectativa do leitor em 2 segundos?
- 10: "Piscina nao eh o destaque. Eh o que ta em volta." (quebra forte)
- 6: "Jardim bom nao eh questao de sorte" (quebra leve)
- 2: "Jardim lindo eh relaxante" (zero quebra)

## RETORNE JSON PURO

{
  "evaluations": [
    {
      "idx": int,
      "curiosity": int (0-10),
      "specificity": int (0-10),
      "swipe_incentive": int (0-10),
      "pattern_interrupt": int (0-10),
      "rationale": string (1 frase)
    }
  ]
}

Ordem: mesmo que o input.`;

export async function hookTournament(params: {
  prompt: string;
  userBrief?: string;
  options?: TournamentOptions;
}): Promise<HookCandidate[]> {
  const { prompt, userBrief, options = {} } = params;
  const count = options.count ?? 20;

  const briefBlock = userBrief ? `\nBRIEFING: ${userBrief}\n` : "";
  const personaBlock = options.persona ? `PERSONA: ${options.persona}\n` : "";
  const approachBlock = options.approach ? `APPROACH alvo: ${options.approach}\n` : "";

  // ETAPA 1: gerar 20 hooks
  const genResp = await getAi().chat.completions.create({
    model: getPremiumModel() || MODEL,
    max_tokens: 2800,
    temperature: 0.9,
    messages: [
      { role: "system", content: GENERATE_SYSTEM },
      {
        role: "user",
        content: `TEMA: "${prompt}"${briefBlock}${personaBlock}${approachBlock}

Gera EXATAMENTE ${count} hooks variados. JSON puro.`,
      },
    ],
  });

  const genRaw = genResp.choices[0]?.message?.content || "";
  const genParsed = extractJson(genRaw) as { hooks?: Array<{ texto: string; topLabel?: string; framework: HookFrameworkKey }> };
  const hooks = Array.isArray(genParsed.hooks) ? genParsed.hooks.slice(0, count) : [];

  if (hooks.length === 0) {
    console.error("[hook-tournament] zero hooks gerados");
    return [];
  }

  // ETAPA 2: avaliar os hooks
  const listBlock = hooks.map((h, i) => `${i}. "${h.texto}" [framework=${h.framework}]`).join("\n");
  const evalResp = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 2800,
    temperature: 0.3,
    messages: [
      { role: "system", content: EVALUATE_SYSTEM },
      {
        role: "user",
        content: `TEMA: "${prompt}"

${hooks.length} HOOKS CANDIDATOS:
${listBlock}

Avalia cada um nos 4 criterios. JSON puro.`,
      },
    ],
  });

  const evalRaw = evalResp.choices[0]?.message?.content || "";
  const evalParsed = extractJson(evalRaw) as {
    evaluations?: Array<{
      idx: number;
      curiosity: number;
      specificity: number;
      swipe_incentive: number;
      pattern_interrupt: number;
      rationale?: string;
    }>;
  };

  const evaluations = Array.isArray(evalParsed.evaluations) ? evalParsed.evaluations : [];

  // Mescla hook + avaliacao
  const candidates: HookCandidate[] = hooks.map((h, i) => {
    const ev = evaluations.find((e) => e.idx === i);
    const scores = {
      curiosity: Math.max(0, Math.min(10, ev?.curiosity ?? 5)),
      specificity: Math.max(0, Math.min(10, ev?.specificity ?? 5)),
      swipe_incentive: Math.max(0, Math.min(10, ev?.swipe_incentive ?? 5)),
      pattern_interrupt: Math.max(0, Math.min(10, ev?.pattern_interrupt ?? 5)),
    };
    const total = (scores.curiosity + scores.specificity + scores.swipe_incentive + scores.pattern_interrupt) / 4;
    return {
      texto: h.texto,
      topLabel: h.topLabel,
      framework: h.framework,
      scores,
      total: Math.round(total * 10) / 10,
      rationale: ev?.rationale || "",
    };
  });

  // Ordena best -> worst
  return candidates.sort((a, b) => b.total - a.total);
}
