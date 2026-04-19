import { NextRequest, NextResponse } from "next/server";
import { getAi, MODEL } from "@/lib/claude";
import { matchVegetacao } from "@/lib/plant-matcher";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM = `Voce e botanico-paisagista especializado em flora tropical e ornamental brasileira.
Identifique a planta principal na foto e responda ESTRITAMENTE em JSON valido:

{
  "nome_popular": string,
  "nome_cientifico": string,
  "familia": string,
  "confianca": number (0-1),
  "candidatos_alternativos": [{"nome_popular": string, "nome_cientifico": string}] (ate 3, so se confianca < 0.8),
  "descricao_breve": string (2 frases)
}

Preferir especies comuns em paisagismo brasileiro. Se nao conseguir identificar, confianca = 0 e nome_cientifico = "".`;

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });
    }

    const resp = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 600,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
            { type: "text", text: "Identifique a planta principal. Responda so com o JSON." },
          ],
        },
      ],
    });

    const text = resp.choices[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "no JSON", raw: text }, { status: 500 });
    }
    const parsed = JSON.parse(jsonMatch[0]);

    const veg = parsed.nome_cientifico
      ? await matchVegetacao(parsed.nome_cientifico, parsed.nome_popular)
      : null;

    return NextResponse.json({ ...parsed, vegetacao_match: veg });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
