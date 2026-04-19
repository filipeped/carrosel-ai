import { NextRequest, NextResponse } from "next/server";
import { claude, MODEL, BRAND_VOICE } from "@/lib/claude";
import { renderMany } from "@/lib/renderer";
import { pngsToPdf } from "@/lib/pdf";
import { renderCover } from "@/templates/cover";
import { renderPlantDetail } from "@/templates/plantDetail";
import { renderInspiration } from "@/templates/inspiration";
import { renderCta } from "@/templates/cta";

export const runtime = "nodejs";
export const maxDuration = 60;

type GenInput =
  | { mode: "identifier"; plant: any; images: any[] }
  | { mode: "thematic"; prompt: string; images: any[] };

const COPY_SCHEMA = `Retorne JSON com:
{
  "cover": { "topLabel": string, "numeral": string|null, "title": string, "italicWords": string[] },
  "slides": [
    { "title": string, "subtitle": string, "topLabel": string }  // 4 slides
  ],
  "cta": { "pergunta": string, "italicWords": string[] }
}`;

function copyPromptIdentifier(plant: any, images: any[]): string {
  return `Gerar carrossel sobre: ${plant.nome_popular} (${plant.nome_cientifico}).
Dados da planta: familia=${plant.familia ?? "?"}, luminosidade=${plant.luminosidade ?? "?"}, altura=${plant.altura ?? "?"}, clima=${plant.clima ?? "?"}, origem=${plant.origem ?? "?"}.
Descricao curta: ${(plant.descricao || "").slice(0, 400)}

Estrutura:
- cover: capa com titulo elegante sobre a planta, numeral opcional.
- slides[0]: curiosidade botanica (titulo + subtitulo)
- slides[1]: cuidados essenciais (titulo + subtitulo)
- slides[2]: onde usar no paisagismo (titulo + subtitulo)
- slides[3]: visto em projetos (titulo + subtitulo curto)
- cta: pergunta aberta sobre a planta.

${COPY_SCHEMA}`;
}

function copyPromptThematic(prompt: string, images: any[]): string {
  const imgDescs = images
    .map(
      (im, i) =>
        `  #${i + 1}: plantas=[${(im.plantas || []).slice(0, 4).join(", ")}], estilo=${im.estilo?.join(",")}, mood=${(im.mood || []).join(",")}, area=${im.tipo_area}`,
    )
    .join("\n");
  return `Prompt do usuario: "${prompt}"
Imagens selecionadas:
${imgDescs}

Estrutura:
- cover: titulo tematico forte.
- slides[0..3]: 4 das 5 imagens (titulo + subtitulo curto baseado no contexto da imagem)
- cta: pergunta aberta final.

${COPY_SCHEMA}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenInput;
    const origin = req.nextUrl.origin;

    // 1. gera copy
    const copyUser =
      body.mode === "identifier"
        ? copyPromptIdentifier(body.plant, body.images)
        : copyPromptThematic(body.prompt, body.images);

    const msg = await claude.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: BRAND_VOICE + "\n\n" + COPY_SCHEMA,
      messages: [{ role: "user", content: copyUser }],
    });
    const rawText = msg.content.find((c) => c.type === "text");
    const copy = JSON.parse(
      (rawText && rawText.type === "text" ? rawText.text : "").match(/\{[\s\S]*\}/)?.[0] ?? "{}",
    );

    // 2. escolhe imagens pros 6 slides
    const coverImg =
      body.mode === "identifier"
        ? body.images[0]?.url || body.plant?.imagem_principal
        : body.images[0]?.url;

    const slideImgs: string[] =
      body.mode === "identifier"
        ? [
            body.plant?.imagem_principal || body.images[0]?.url,
            body.images[0]?.url || body.plant?.imagem_principal,
            body.images[1]?.url || body.images[0]?.url,
            body.images[2]?.url || body.images[1]?.url || body.images[0]?.url,
          ].filter(Boolean)
        : body.images.slice(1, 5).map((i) => i.url);

    const ctaImg = body.images[body.images.length - 1]?.url || coverImg;

    // 3. monta 6 HTMLs
    const htmls: string[] = [];
    htmls.push(
      renderCover(
        {
          imageUrl: coverImg,
          topLabel: copy.cover?.topLabel,
          numeral: copy.cover?.numeral ?? undefined,
          title: copy.cover?.title || "Jardim",
          italicWords: copy.cover?.italicWords || [],
          edition: process.env.BRAND_EDITION || undefined,
        },
        origin,
      ),
    );

    const slidesCopy = copy.slides || [];
    for (let i = 0; i < 4; i++) {
      const s = slidesCopy[i] || { title: "", subtitle: "" };
      const img = slideImgs[i] || slideImgs[0];
      if (body.mode === "identifier" && i === 0) {
        // primeiro slide usa plantDetail (nome popular + cientifico)
        htmls.push(
          renderPlantDetail(
            {
              imageUrl: img,
              nomePopular: body.plant.nome_popular,
              nomeCientifico: body.plant.nome_cientifico,
            },
            origin,
          ),
        );
      } else {
        htmls.push(
          renderInspiration(
            { imageUrl: img, title: s.title, subtitle: s.subtitle, topLabel: s.topLabel },
            origin,
          ),
        );
      }
    }

    htmls.push(
      renderCta(
        {
          imageUrl: ctaImg,
          pergunta: copy.cta?.pergunta || "Qual delas entra na sua casa?",
          italicWords: copy.cta?.italicWords || [],
        },
        origin,
      ),
    );

    // 4. render paralelo
    const pngs = await renderMany(htmls);

    // 5. PDF combinado
    const pdf = await pngsToPdf(pngs);

    // 6. retorna tudo em base64
    return NextResponse.json({
      pngs: pngs.map((p) => p.toString("base64")),
      pdf: pdf.toString("base64"),
      copy,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
