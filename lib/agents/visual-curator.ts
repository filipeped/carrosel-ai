/**
 * Visual Curator — agrupa fotos coerentes a partir do arquivo.
 *
 * Filosofia: image-first. Fotos geram o carrossel, nao o contrario.
 * Recebe ~30 candidatas com analise_visual ja cacheada, agrupa 8-10 que
 * fazem SERIE: mesmo mood, familia de materiais, especies compartilhadas,
 * luz parecida ou mesmo contexto.
 *
 * Saida inclui "tese_detectada" — o que liga as fotos escolhidas,
 * pra alimentar o copy observacional sem precisar de tema externo.
 */

import { getAi, MODEL } from "../claude";
import { extractJson } from "../utils";
import type { AnalyzedImage } from "../smart-pipeline";

export type CuratorGroup = {
  grupo: AnalyzedImage[];          // 8-10 fotos ordenadas (cover primeiro, cta ultima)
  tese_detectada: string;          // o que liga essas fotos
  rationale: string;               // justificativa curta do agrupamento
  alternatives: AnalyzedImage[];   // fotos descartadas mas disponiveis
};

const SYSTEM = `Voce eh CURADOR VISUAL do @digitalpaisagismo.

Recebe lista de fotos analisadas (vision) do arquivo e precisa agrupar 8-10 que fazem SERIE COERENTE.

## O QUE EH SERIE COERENTE

Fotos ligadas por PELO MENOS 1 destes eixos:
- Atmosfera compartilhada (mood_real: refugio, drama, minimalismo, tropicalidade)
- Familia de materiais (pedra+madeira+agua, corten+verde, concreto+palmeira)
- Especies compartilhadas (2+ fotos com a mesma planta)
- Luz/hora do dia similar (rasante final tarde, difusa, noturna)
- Mesmo contexto espacial (fachada, area externa, jardim interno, corredor)

## REGRAS DURAS

- Exatamente 8-10 fotos no grupo (default 8)
- MAXIMO 2 fotos com o mesmo hero_element (evita 8 piscinas iguais)
- Ordem: cover = maior cover_potential + mais forte visualmente, cta = mais contemplativa/panoramica
- Slides do meio: diversidade de enquadramento, mesmo que a serie seja coerente

## TESE DETECTADA (critico)

Depois de agrupar, escreve em 1 frase CONCRETA o que liga as fotos:
✅ BOM: "area externa alto padrao com dominio de pedra basalto e palmeira real"
✅ BOM: "jardins tropicais densos com luz rasante final tarde"
✅ BOM: "corredores laterais que usam verde pra transformar passagem em momento"
❌ RUIM: "jardins bonitos de alto padrao" (vago)
❌ RUIM: "fotos coerentes" (meta, nao eh tese)

A tese vai virar base do copy. Quanto mais concreta, melhor o copy sai.

## RETORNO (JSON puro)

{
  "grupo_ids": [int, int, ..., int],   // EXATAMENTE 8-10 ids, ordenados (0=cover, ultimo=cta)
  "tese_detectada": string,             // frase concreta do que liga
  "rationale": string                   // por que agrupou assim (1-2 frases)
}

Retorna APENAS JSON. Zero markdown, zero texto antes ou depois.`;

function flattenImage(img: AnalyzedImage, idx: number): string {
  const a = img.analise_visual;
  const plantas = (img.plantas || []).slice(0, 4).join(", ");
  const materiais = (img.elementos_form || []).slice(0, 3).join(", ");
  const mood = (a.mood_real || []).slice(0, 3).join(", ");
  return `[id=${img.id}] idx=${idx} hero="${a.hero_element}" | ver="${a.descricao_visual.slice(0, 140)}" | plantas=[${plantas}] | materiais=[${materiais}] | mood=[${mood}] | luz=${a.luz}/10 cover=${a.cover_potential}/10 | tipo_area=${img.tipo_area}`;
}

export async function visualCurator(params: {
  candidates: AnalyzedImage[];
  slideCount?: number;
  avoidTeses?: string[];   // teses ja usadas recentemente — nao repetir
}): Promise<CuratorGroup> {
  const { candidates, slideCount = 8, avoidTeses = [] } = params;
  const target = Math.max(8, Math.min(10, slideCount));

  if (candidates.length < target) {
    // Fallback: nao tem fotos suficientes, entrega o que tem ordenado por cover_potential
    const sorted = [...candidates].sort(
      (a, b) => (b.analise_visual?.cover_potential || 0) - (a.analise_visual?.cover_potential || 0),
    );
    return {
      grupo: sorted.slice(0, target),
      tese_detectada: "fotos disponiveis do arquivo",
      rationale: "poucas candidatas com vision cacheada — ordenadas por cover_potential",
      alternatives: [],
    };
  }

  const dump = candidates.map((c, i) => flattenImage(c, i)).join("\n");
  const avoidBlock =
    avoidTeses.length > 0
      ? `\n\nTESES JA USADAS RECENTEMENTE (NAO repetir, escolhe angulo DIFERENTE):\n${avoidTeses
          .map((t, i) => `${i + 1}. ${t}`)
          .join("\n")}\n\nSe as fotos disponiveis so permitem essas mesmas teses, escolhe um SUBRECORTE novo: por exemplo, em vez de "jardim alto padrao", foca em "gestao de luz" ou "contraste de texturas" ou "ritmo de alturas". Angulo novo sempre.`
      : "";
  const user = `CANDIDATAS (${candidates.length} fotos com vision):

${dump}${avoidBlock}

TAREFA: escolhe ${target} fotos que fazem SERIE COERENTE. Ordena: 0=cover forte, ultima=cta contemplativa. Retorna JSON.`;

  try {
    const resp = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 1400,
      temperature: 0.85,  // alto — forca variacao entre rodadas consecutivas
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "";
    const parsed = extractJson(raw) as {
      grupo_ids?: number[];
      tese_detectada?: string;
      rationale?: string;
    };

    const ids = Array.isArray(parsed.grupo_ids) ? parsed.grupo_ids : [];
    if (ids.length < 6) throw new Error(`curador retornou ${ids.length} ids (minimo 6)`);

    const byId = new Map(candidates.map((c) => [c.id, c]));
    const grupo: AnalyzedImage[] = [];
    const usedIds = new Set<number>();
    for (const id of ids) {
      const img = byId.get(id);
      if (!img || usedIds.has(id)) continue;
      usedIds.add(id);
      grupo.push(img);
      if (grupo.length >= target) break;
    }

    // Garante minimo preenchendo com maior cover_potential disponivel
    if (grupo.length < target) {
      const remaining = candidates
        .filter((c) => !usedIds.has(c.id))
        .sort((a, b) => (b.analise_visual?.cover_potential || 0) - (a.analise_visual?.cover_potential || 0));
      for (const img of remaining) {
        grupo.push(img);
        usedIds.add(img.id);
        if (grupo.length >= target) break;
      }
    }

    const alternatives = candidates.filter((c) => !usedIds.has(c.id));

    return {
      grupo,
      tese_detectada:
        typeof parsed.tese_detectada === "string" && parsed.tese_detectada.length > 8
          ? parsed.tese_detectada
          : "serie do arquivo",
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : "curadoria automatica",
      alternatives,
    };
  } catch (err) {
    console.error("[visual-curator] falhou:", (err as Error).message);
    // Fallback determinstico: ordena por cover_potential + garante diversidade de hero
    const sorted = [...candidates].sort(
      (a, b) => (b.analise_visual?.cover_potential || 0) - (a.analise_visual?.cover_potential || 0),
    );
    const grupo: AnalyzedImage[] = [];
    const heroCounts = new Map<string, number>();
    for (const img of sorted) {
      const hero = (img.analise_visual?.hero_element || "").toLowerCase();
      const count = heroCounts.get(hero) || 0;
      if (count >= 2) continue;
      heroCounts.set(hero, count + 1);
      grupo.push(img);
      if (grupo.length >= target) break;
    }
    const used = new Set(grupo.map((g) => g.id));
    return {
      grupo,
      tese_detectada: "serie diversa do arquivo",
      rationale: "fallback: curator offline, sort por cover_potential + diversidade de hero",
      alternatives: candidates.filter((c) => !used.has(c.id)),
    };
  }
}
