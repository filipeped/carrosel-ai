import { NextRequest, NextResponse } from "next/server";
import { getAi, MODEL, BRAND_VOICE } from "@/lib/claude";
import { extractJson } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

function buildSchema(slideCount: number): string {
  const lastIdx = slideCount - 1;
  return `Retorne JSON valido com EXATAMENTE ${slideCount} slides NESSA ORDEM:

IMPORTANTE: retorne um OBJETO JSON com a chave "slides" contendo array de ${slideCount} items. NAO retorne array direto. SEM texto explicativo antes ou depois. SEM code-fence markdown.

FILOSOFIA: carrossel eh TESE defendida em ${slideCount} slides, nao lista numerada.
- Capa afirma uma CRENCA ou observacao forte (ex: "Sua casa eh unica. Seu jardim tambem deveria ser.")
- Slides internos sustentam a tese com observacoes concretas ou especies reais
- CTA contempla a tese — pergunta aberta, nao pitch

Formato:
{
  "slides": [ ...${slideCount} slides aqui... ]
}

[0] CAPA:
    { "type": "cover", "imageIdx": 0, "topLabel": string, "numeral": null, "title": string, "italicWords": string[] }

[1..${lastIdx - 1}] MIOLO:
    { "type": "plantDetail", "imageIdx": number, "nomePopular": string, "nomeCientifico": string, "title": null, "subtitle": null, "topLabel": null }
    OU (PREFERIR pra sustentar tese)
    { "type": "inspiration", "imageIdx": number, "title": string, "subtitle": string, "topLabel": string, "nomePopular": null, "nomeCientifico": null }

[${lastIdx}] CTA FINAL:
    { "type": "cta", "imageIdx": ${lastIdx}, "pergunta": string, "italicWords": string[] }

REGRAS DURAS:
- slides[0].type DEVE ser "cover"; slides[${lastIdx}].type DEVE ser "cta"
- numeral da capa: SEMPRE null. NAO prometa "N plantas", "N decisoes", "N motivos".
  Numero dificilmente cobre N itens exatos — fica vazio, perde credibilidade.
- plantDetail SO se a planta aparece VISIVELMENTE na imagem; se duvida, use inspiration.
- imageIdx: 0..${lastIdx} das imagens; distribua bem, evite repetir
- italicWords: 1-3 palavras do title/pergunta pra italico decorativo
- CTA: pergunta aberta contemplativa, nao pitch de DM`;
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, images, userBrief, slideCount: rawSlideCount } = await req.json();
    if (!images?.length) return NextResponse.json({ error: "images required" }, { status: 400 });
    // Slide count: respeita request OU usa count das imagens (clamped 6-10)
    const slideCount = Math.max(6, Math.min(10, rawSlideCount || images.length));
    const SCHEMA = buildSchema(slideCount);

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

    const strictOutputRule = `
=== SAIDA ===
Tua resposta DEVE:
- Comecar com { como primeiro caractere
- Terminar com } como ultimo caractere
- NAO ter texto explicativo antes ou depois
- NAO ter markdown, NAO ter code fence, NAO ter outline, NAO ter thinking visivel
- NAO conter chave "hashtags" (isso eh de legenda, nao de slides)
- NAO conter chave "legenda" (isso eh de legenda, nao de slides)
- SO a chave "slides" com array de objetos`;

    const userPrompt = `Tema do usuario: "${prompt || "(sem tema — inspire-se nas imagens)"}"
${briefBlock}

Imagens selecionadas (${images.length} no total). VISIVEL = o que a IA ja viu na foto (use isso pra nao inventar):
${imgDescs}

REGRA DURA ANTI-ALUCINACAO:
- Nao cite elemento (piscina, pergolado, deck, espelho d'agua etc) se ele NAO aparece em VISIVEL ou hero da imagem correspondente.
- Se VISIVEL nao menciona X, nao escreva sobre X naquela slide.

${SCHEMA}
${strictOutputRule}`;

    const callCopy = async (extraInstruction = "") =>
      getAi().chat.completions.create({
        model: MODEL,
        max_tokens: 2400,
        temperature: 0.65,
        messages: [
          { role: "system", content: BRAND_VOICE + "\n\n" + SCHEMA + strictOutputRule },
          { role: "user", content: userPrompt + (extraInstruction ? `\n\n${extraInstruction}` : "") },
        ],
      });

    let resp = await callCopy();
    let raw = resp.choices[0]?.message?.content || "";
    let parsed: any;
    try {
      parsed = extractJson(raw);
    } catch {
      // Retry 1: instrucao ainda mais rigida
      console.warn("[copy] JSON parse falhou na 1a tentativa, retry...");
      resp = await callCopy(
        'ATENCAO: tua ultima resposta nao foi JSON valido. ' +
          'Retorna APENAS o objeto JSON. Comeca com { e termina com }. ' +
          'Zero texto, outline, lista markdown, explicacao, hashtag, ou legenda.',
      );
      raw = resp.choices[0]?.message?.content || "";
      try {
        parsed = extractJson(raw);
      } catch (e) {
        console.error("JSON parse failed apos retry. Raw:", raw.slice(0, 500));
        return NextResponse.json({ error: "IA devolveu JSON invalido apos retry", raw: raw.slice(0, 300) }, { status: 500 });
      }
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
