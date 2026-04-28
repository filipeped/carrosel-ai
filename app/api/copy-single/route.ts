import { NextRequest, NextResponse } from "next/server";
import { getAi, MODEL, BRAND_VOICE } from "@/lib/claude";
import { extractJson } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Regenera a copy de UM unico slide (sem mexer nos outros).
 * Body: { prompt, slideIndex, slideType, image, allSlides }
 * Onde allSlides é o array atual dos 6 pra dar contexto de coerencia.
 */

type SlideKind = "cover" | "inspiration" | "plantDetail" | "cta";

function schemaFor(type: SlideKind): string {
  if (type === "cover")
    return `{ "type": "cover", "topLabel": string, "numeral": string|null, "title": string, "italicWords": string[] }`;
  if (type === "plantDetail")
    return `{ "type": "plantDetail", "nomePopular": string, "nomeCientifico": string }`;
  if (type === "cta")
    return `{ "type": "cta", "fechamento": string, "italicWords": string[] }`;
  return `{ "type": "inspiration", "topLabel": string, "title": string, "subtitle": string }`;
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, slideIndex, slideType, image, allSlides, userBrief } = await req.json();
    if (!image) return NextResponse.json({ error: "image required" }, { status: 400 });

    const av = image.analise_visual || {};
    const visual = av.descricao_visual
      ? `VISIVEL="${String(av.descricao_visual).slice(0, 250)}"`
      : `descricao="${(image.descricao || "").slice(0, 180)}"`;
    const hero = av.hero_element ? ` | hero="${av.hero_element}"` : "";
    const plantas = (image.plantas || []).slice(0, 5).join(", ");

    const contextoCarrossel = Array.isArray(allSlides)
      ? allSlides
          .map((s, i: number) => {
            if (i === slideIndex) return `  [${i}] <ESTE — vou regenerar>`;
            if (s.type === "cover") return `  [${i}] CAPA: "${s.title || ""}"`;
            if (s.type === "plantDetail")
              return `  [${i}] PLANTA: ${s.nomePopular} (${s.nomeCientifico})`;
            if (s.type === "cta") return `  [${i}] CTA: "${s.fechamento || s.pergunta || ""}"`;
            return `  [${i}] INSPIRACAO: "${s.title || ""}" - ${s.subtitle || ""}`;
          })
          .join("\n")
      : "";

    const briefBlock = userBrief?.trim()
      ? `\n\nBRIEFING EXTRA DO USUARIO (segue literalmente):\n"""\n${String(userBrief).slice(0, 800).trim()}\n"""`
      : "";

    const userPrompt = `Tema do carrossel: "${prompt || "sem tema"}"${briefBlock}

Carrossel completo (nao altere os outros, so o [${slideIndex}]):
${contextoCarrossel}

Imagem do slide [${slideIndex}] (${slideType}):
  ${visual}${hero} | plantas=[${plantas}]

REGRA: mantenha coerencia com os outros slides. Regenere apenas o [${slideIndex}] como tipo "${slideType}".
Anti-alucinacao: so cite elemento se VISIVEL contem.

Retorne JSON puro com o slide regenerado:
${schemaFor(slideType as SlideKind)}`;

    const resp = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 500,
      messages: [
        { role: "system", content: BRAND_VOICE },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = resp.choices[0]?.message?.content || "";
    const parsed = extractJson(raw);
    return NextResponse.json({ slide: parsed });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
