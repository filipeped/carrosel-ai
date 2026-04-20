import { NextRequest, NextResponse } from "next/server";
import { getAi, MODEL, BRAND_VOICE } from "@/lib/claude";
import { extractJson } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

const SCHEMA = `Retorne JSON valido com EXATAMENTE 6 slides NESSA ORDEM:

IMPORTANTE: retorne um OBJETO JSON com a chave "slides" contendo array de 6 items. NAO retorne array direto. SEM texto explicativo antes ou depois. SEM code-fence markdown.

Formato:
{
  "slides": [ ...6 slides aqui... ]
}

Onde cada slide segue:

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
    const { prompt, images, userBrief } = await req.json();
    if (!images?.length) return NextResponse.json({ error: "images required" }, { status: 400 });

    // Prioriza descricao_visual do Vision (analise_visual.descricao_visual) — e o que
    // realmente aparece na foto. So cai pra 'descricao' generica se nao tiver cache Vision.
    const imgDescs = images
      .map((im: any, i: number) => {
        const av = im.analise_visual;
        const visual = av?.descricao_visual
          ? `VISIVEL="${String(av.descricao_visual).slice(0, 220)}"`
          : `descricao="${(im.descricao || "").slice(0, 180)}"`;
        const hero = av?.hero_element ? `hero="${String(av.hero_element).slice(0, 60)}"` : "";
        const plantas = (im.plantas || []).slice(0, 4).join(", ");
        return `  [${i}] ${visual}${hero ? ` | ${hero}` : ""} | plantas=[${plantas}] | area=${im.tipo_area}`;
      })
      .join("\n");

    const briefBlock = userBrief?.trim()
      ? `\n\nBRIEFING EXTRA DO USUARIO (PRIORIDADE ALTA — segue literalmente):\n"""\n${String(userBrief).slice(0, 1200).trim()}\n"""`
      : "";

    const userPrompt = `Tema do usuario: "${prompt || "(sem tema — inspire-se nas imagens)"}"
${briefBlock}

Imagens selecionadas (${images.length} no total). VISIVEL = o que a IA ja viu na foto (use isso pra nao inventar):
${imgDescs}

REGRA DURA ANTI-ALUCINACAO:
- Nao cite elemento (piscina, pergolado, deck, espelho d'agua etc) se ele NAO aparece em VISIVEL ou hero da imagem correspondente.
- Se VISIVEL nao menciona X, nao escreva sobre X naquela slide.

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
    // normaliza: pode vir como array direto OU objeto com .slides
    if (Array.isArray(parsed)) parsed = { slides: parsed };
    else if (!parsed.slides && Array.isArray(parsed.carrossel)) parsed = { slides: parsed.carrossel };

    // Validacao anti-alucinacao: plantDetail so passa se a planta realmente
    // aparece na imagem correspondente; caso contrario vira inspiration.
    // Falha aqui = copy nao-validado. Escala erro em vez de silenciar.
    const { validateSlidesAgainstImages } = await import("@/lib/smart-pipeline");
    if (parsed.slides && Array.isArray(images)) {
      parsed.slides = validateSlidesAgainstImages(parsed.slides, images as any);
    }

    return NextResponse.json(parsed);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
