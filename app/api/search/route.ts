import { NextRequest, NextResponse } from "next/server";
import { claude, MODEL } from "@/lib/claude";
import { embed } from "@/lib/embeddings";
import { searchImagesSemantic } from "@/lib/plant-matcher";

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
    const { prompt, count = 5 } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 });
    }

    // 1. extrai filtros
    const msg = await claude.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: EXTRACT_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const txt = msg.content.find((c) => c.type === "text");
    const text = txt && txt.type === "text" ? txt.text : "{}";
    const filters = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

    // 2. embedding da query expandida
    const queryEmb = await embed(filters.query_expandida || prompt);

    // 3. busca semantica com filtros
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
