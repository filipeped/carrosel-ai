import { NextRequest, NextResponse } from "next/server";
import { getAi, MODEL, BRAND_VOICE } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 30;

const SCHEMA = `Retorne JSON valido com EXATAMENTE 6 slides:
{
  "slides": [
    { "type": "cover", "imageIdx": 0, "topLabel": string, "numeral": string|null, "title": string, "italicWords": string[] },
    { "type": "inspiration"|"plantDetail", "imageIdx": number, "title": string, "subtitle": string, "topLabel": string, "nomePopular": string|null, "nomeCientifico": string|null },
    ...mais 3 slides do mesmo tipo...
    { "type": "cta", "imageIdx": 5, "pergunta": string, "italicWords": string[] }
  ]
}

- imageIdx: indice da imagem selecionada (0 a N-1) — distribua bem, evite repetir
- type "plantDetail" quando faz sentido destacar uma planta especifica (usa nomePopular+nomeCientifico)
- type "inspiration" quando eh contexto/ambiente (usa title+subtitle+topLabel curto como "INSPIRACAO 01")
- italicWords: 1-3 palavras do title/pergunta pra renderizar em italico decorativo`;

export async function POST(req: NextRequest) {
  try {
    const { prompt, images } = await req.json();
    if (!images?.length) return NextResponse.json({ error: "images required" }, { status: 400 });

    const imgDescs = images
      .map(
        (im: any, i: number) =>
          `  [${i}] plantas=[${(im.plantas || []).slice(0, 4).join(", ")}], estilo=${im.estilo?.join(",")}, mood=${(im.mood || []).join(",")}, area=${im.tipo_area}, descricao="${(im.descricao || "").slice(0, 180)}"`,
      )
      .join("\n");

    const userPrompt = `Tema do usuario: "${prompt || "(sem tema — inspire-se nas imagens)"}"

Imagens selecionadas (${images.length} no total):
${imgDescs}

${SCHEMA}`;

    const resp = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 1800,
      messages: [
        { role: "system", content: BRAND_VOICE + "\n\n" + SCHEMA },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

    return NextResponse.json(parsed);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
