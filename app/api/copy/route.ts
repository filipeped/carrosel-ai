import { NextRequest, NextResponse } from "next/server";
import { getAi, MODEL, BRAND_VOICE } from "@/lib/claude";
import { extractJson } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

const SCHEMA = `Retorne JSON valido com EXATAMENTE 6 slides NESSA ORDEM:

[0] CAPA (obrigatorio type="cover"):
    { "type": "cover", "imageIdx": 0, "topLabel": string, "numeral": string|null, "title": string, "italicWords": string[] }

[1..4] MIOLO — 4 slides (obrigatorio type="plantDetail" ou "inspiration"):
    { "type": "plantDetail", "imageIdx": number, "nomePopular": string, "nomeCientifico": string, "title": null, "subtitle": null, "topLabel": null }
    OU
    { "type": "inspiration", "imageIdx": number, "title": string, "subtitle": string, "topLabel": string, "nomePopular": null, "nomeCientifico": null }

[5] CTA FINAL (obrigatorio type="cta"):
    { "type": "cta", "imageIdx": 5, "pergunta": string, "italicWords": string[] }

REGRAS DURAS:
- slides[0].type DEVE ser "cover"
- slides[5].type DEVE ser "cta" (pergunta aberta pro leitor, ex: "Qual delas entra na sua casa?")
- slides[1..4] podem misturar "plantDetail" e "inspiration" conforme fizer sentido pra cada foto
- imageIdx: use indices 0..N-1 das imagens; distribua bem, evite repetir
- italicWords: 1-3 palavras do title/pergunta pra renderizar em italico decorativo
- pra plantDetail, tire o nome cientifico da lista de plantas da imagem; nomePopular curto e poetico`;

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

    const raw = resp.choices[0]?.message?.content || "";
    let parsed: any;
    try {
      parsed = extractJson(raw);
    } catch (e) {
      console.error("JSON parse failed. Raw:", raw);
      return NextResponse.json({ error: "IA devolveu JSON invalido", raw: raw.slice(0, 300) }, { status: 500 });
    }
    return NextResponse.json(parsed);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
