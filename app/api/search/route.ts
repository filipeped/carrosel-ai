import { NextRequest, NextResponse } from "next/server";
import { getAi, MODEL } from "@/lib/claude";
import { embed } from "@/lib/embeddings";
import { searchImagesSemantic } from "@/lib/plant-matcher";
import { extractJson } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

const EXTRACT_SYSTEM = `Voce extrai filtros de busca de paisagismo de um prompt livre em portugues.
Responda ESTRITAMENTE em JSON valido:
{
  "estilo": "Moderno" | "Tropical" | "Classico" | null,
  "tipo_area": "pequeno" | "medio" | "grande" | null,
  "query_expandida": string (reescreva o prompt em portugues para busca semantica, incluindo sinonimos e elementos implicitos)
}
Se nao tiver sinal claro pra um campo, use null.`;

export async function POST(req: NextRequest) {
  try {
    const { prompt, count = 24 } = await req.json();
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    // 1. extrai filtros via gateway
    const resp = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 400,
      messages: [
        { role: "system", content: EXTRACT_SYSTEM },
        { role: "user", content: prompt },
      ],
    });
    const text = resp.choices[0]?.message?.content || "";
    let filters: any = {};
    try {
      filters = extractJson(text);
    } catch {
      filters = {};
    }

    // 2. embedding (OpenAI direto)
    const queryEmb = await embed(filters.query_expandida || prompt);

    // 3. busca semantica
    const imagens = await searchImagesSemantic(
      queryEmb,
      { estilo: filters.estilo, tipo_area: filters.tipo_area },
      count,
    );

    return NextResponse.json({ filters, imagens });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
