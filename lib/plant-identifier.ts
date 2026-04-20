/**
 * Identifica plantas em uma imagem usando pipeline de 3 fases:
 *   1. RAG: embedding da descricao visual + hints → busca top-15 plantas similares
 *   2. Vision focado: Claude ve foto + lista → match + confidence
 *   3. Validação cruzada: descarta se luminosidade/clima/tipo_area nao batem
 *
 * Só retorna plantas com confidence ≥ threshold. Nunca inventa nome que
 * não existe em `vegetacoes`.
 */

import { embed } from "./embeddings";
import { getAi, MODEL } from "./claude";
import { getSupabase } from "./supabase";
import { extractJson } from "./utils";

export type IdentifiedPlant = {
  id: string;
  nome_popular: string;
  nome_cientifico: string;
  confidence: number;
  similarity: number;
  reasoning?: string;
};

type VegCandidate = {
  id: string;
  nome_popular: string;
  nome_cientifico: string;
  descricao: string | null;
  luminosidade: string | null;
  origem: string | null;
  clima: string | null;
  familia: string | null;
  categorias: string | null;
  outros_nomes: string | null;
  similarity: number;
};

export type IdentifyContext = {
  descricaoVisual?: string;
  heroElement?: string;
  tipoArea?: string; // jardim externo / varanda / interno etc
  exposicaoSolar?: string;
  elementos?: string[];
};

const DEFAULT_CONFIDENCE = 70;
const RAG_CANDIDATES = 15;

/**
 * Gera embedding da descrição visual pra buscar plantas similares.
 */
async function queryEmbedding(ctx: IdentifyContext): Promise<number[]> {
  const parts = [
    ctx.descricaoVisual,
    ctx.heroElement,
    ctx.tipoArea && `area: ${ctx.tipoArea}`,
    ctx.exposicaoSolar && `luz: ${ctx.exposicaoSolar}`,
    (ctx.elementos || []).join(", "),
  ].filter(Boolean);
  const text = parts.join(" | ").slice(0, 4000);
  return await embed(text);
}

/**
 * Busca top-N plantas mais similares no banco.
 */
async function ragCandidates(ctx: IdentifyContext): Promise<VegCandidate[]> {
  const emb = await queryEmbedding(ctx);
  const sb = getSupabase();
  const { data, error } = await sb.rpc("match_vegetacoes", {
    query_embedding: emb as unknown as string,
    match_count: RAG_CANDIDATES,
  });
  if (error) {
    console.warn("[plant-id] rag falhou:", error.message);
    return [];
  }
  return (data as VegCandidate[]) || [];
}

/**
 * Claude Vision vê a foto + lista de candidatos → identifica + score.
 */
async function focusedVision(
  imageUrl: string,
  candidates: VegCandidate[],
  ctx: IdentifyContext,
): Promise<Array<{ id: string; confidence: number; reasoning: string }>> {
  if (!candidates.length) return [];
  const list = candidates
    .map(
      (c, i) =>
        `${i + 1}. id="${c.id}" | ${c.nome_popular} (${c.nome_cientifico})` +
        (c.luminosidade ? ` | luz:${c.luminosidade}` : "") +
        (c.origem ? ` | origem:${c.origem}` : "") +
        (c.familia ? ` | fam:${c.familia}` : ""),
    )
    .join("\n");

  const system = `Voce e botanico identificando plantas em fotos de paisagismo.
Recebe uma LISTA de ${candidates.length} plantas candidatas (pre-filtradas por similaridade).
Sua tarefa: dizer quais dessas plantas estao VISIVEIS na foto, com confidence 0-100.

REGRAS:
- So retorne plantas da lista. NUNCA invente nome que nao esta na lista.
- Confidence alto (85+) so se tem CERTEZA VISUAL (forma da folha, porte, floracao).
- Confidence medio (60-85) se e plausivel mas ambiguo.
- Confidence baixo (abaixo 60): NAO retorne essa planta.
- reasoning: 1 frase curta com PISTA VISUAL concreta (ex: "folha rasgada caracteristica", "porte colunar de 3m").
- Ordene do maior confidence pro menor.
- Maximo 5 plantas retornadas.

Retorne JSON puro:
{ "matches": [ { "id": "...", "confidence": 90, "reasoning": "..." } ] }`;

  const ctxLine = [
    ctx.tipoArea && `Area: ${ctx.tipoArea}`,
    ctx.exposicaoSolar && `Exposicao: ${ctx.exposicaoSolar}`,
    ctx.heroElement && `Elemento hero: ${ctx.heroElement}`,
  ]
    .filter(Boolean)
    .join(" | ");

  const userText = `Contexto: ${ctxLine || "n/a"}\n\nCandidatas:\n${list}\n\nIdentifique as que estao na foto. JSON puro.`;

  const resp = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 800,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: imageUrl } },
        ] as unknown as string,
      },
    ],
  });
  const raw = resp.choices[0]?.message?.content || "";
  try {
    const parsed = extractJson(raw);
    const matches = (parsed as { matches?: unknown }).matches;
    if (!Array.isArray(matches)) return [];
    return matches.filter(
      (m): m is { id: string; confidence: number; reasoning: string } =>
        typeof m?.id === "string" &&
        typeof m?.confidence === "number",
    );
  } catch {
    return [];
  }
}

/**
 * Validação cruzada: descarta se luminosidade/origem bate contra tipo_area da foto.
 * Heuristica simples — se planta e 'sombra' mas foto e 'sol pleno', desconfia.
 */
function crossValidate(
  match: { id: string; confidence: number; reasoning: string },
  candidate: VegCandidate,
  ctx: IdentifyContext,
): { ok: boolean; adjustedConfidence: number } {
  let confidence = match.confidence;
  const exp = (ctx.exposicaoSolar || "").toLowerCase();
  const lum = (candidate.luminosidade || "").toLowerCase();

  // Incompat sol direto vs sombra
  if (
    (exp.includes("sol pleno") || exp.includes("sol direto")) &&
    (lum.includes("sombra") || lum.includes("meia-sombra"))
  ) {
    confidence -= 15;
  }
  if (
    (exp.includes("sombra") && !exp.includes("meia")) &&
    lum.includes("sol pleno")
  ) {
    confidence -= 20;
  }

  // Ambiente interno com planta que exige sol pleno
  const area = (ctx.tipoArea || "").toLowerCase();
  if (area.includes("interno") && lum.includes("sol pleno")) {
    confidence -= 10;
  }

  return { ok: confidence >= DEFAULT_CONFIDENCE, adjustedConfidence: confidence };
}

/**
 * API publica. Retorna array (vazio se nada acima de confidence threshold).
 */
export async function identifyPlants(
  imageUrl: string,
  ctx: IdentifyContext,
  minConfidence = DEFAULT_CONFIDENCE,
): Promise<IdentifiedPlant[]> {
  if (!imageUrl) return [];
  try {
    const candidates = await ragCandidates(ctx);
    if (!candidates.length) return [];
    const matches = await focusedVision(imageUrl, candidates, ctx);
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const result: IdentifiedPlant[] = [];
    for (const m of matches) {
      const cand = byId.get(m.id);
      if (!cand) continue;
      const { ok, adjustedConfidence } = crossValidate(m, cand, ctx);
      if (!ok) continue;
      if (adjustedConfidence < minConfidence) continue;
      result.push({
        id: cand.id,
        nome_popular: cand.nome_popular,
        nome_cientifico: cand.nome_cientifico,
        confidence: adjustedConfidence,
        similarity: cand.similarity,
        reasoning: m.reasoning,
      });
    }
    return result.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  } catch (e) {
    console.warn("[plant-id] falhou:", (e as Error).message);
    return [];
  }
}
