import { NextRequest, NextResponse } from "next/server";
import { claude, MODEL } from "@/lib/claude";
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

    const msg = await claude.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                data: imageBase64,
              },
            },
            { type: "text", text: "Identifique a planta principal. Responda so com o JSON." },
          ],
        },
      ],
    });

    const text = msg.content.find((c) => c.type === "text");
    if (!text || text.type !== "text") {
      return NextResponse.json({ error: "no text in response" }, { status: 500 });
    }

    // extrai JSON
    const jsonMatch = text.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "no JSON", raw: text.text }, { status: 500 });
    }
    const parsed = JSON.parse(jsonMatch[0]);

    // tenta match no vegetacoes
    const veg = parsed.nome_cientifico
      ? await matchVegetacao(parsed.nome_cientifico, parsed.nome_popular)
      : null;

    return NextResponse.json({
      ...parsed,
      vegetacao_match: veg,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
