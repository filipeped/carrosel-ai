import { NextRequest, NextResponse } from "next/server";
import { getAi, MODEL } from "@/lib/claude";
import { extractJson } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM = `Voce e copywriter senior especializado em Instagram de paisagismo e arquitetura de ALTO PADRAO brasileiro. Perfil: @digitalpaisagismo.

PUBLICO-ALVO: clientes AA/AAA — arquitetos, donos de casa de campo/mansao, pessoas que contratam projeto de paisagismo acima de R$100k. Leem revista AD, Casa Vogue, Dezeen. Valorizam: sofisticacao, discricao, autoridade tecnica, referencias internacionais, botanica correta.

OBJETIVO DA LEGENDA: maximizar SALVE + COMPARTILHAMENTO + COMENTARIO. Nao curtida — salve/share valem mais no algoritmo.

FORMULA VIRAL COMPROVADA (use em TODAS as opcoes):
1. HOOK (linha 1): afirmacao contraintuitiva ou dado surpreendente. Para parar o scroll em 1 segundo.
2. PAUSA: linha em branco.
3. DESENVOLVIMENTO (2-4 linhas): contexto, storytelling, ou lista com quebras. NUNCA paragrafo denso.
4. AUTORIDADE: 1 frase com nome cientifico, dado botanico ou referencia (Burle Marx, Isabel Duprat, projeto conhecido).
5. PAUSA.
6. CTA SUAVE: pergunta aberta OU convite pra salvar ("salva pra consultar antes do proximo projeto"). NUNCA "curte ai".
7. PAUSA.
8. HASHTAGS: 12-18 tags, agrupadas mentalmente em: (a) amplo 50-500k posts, (b) nicho 5-50k, (c) micro 1-5k, (d) localizacao/estilo. Minusculas.

REGRAS DURAS:
- Portugues BR. Jamais "ola pessoal", "confira", "incrivel", "dica", "top", "super".
- Frases curtas. Quebras de linha sao arma. Instagram corta em 125 char.
- Emoji: maximo 2 no texto inteiro. Preferir NENHUM.
- Nada de clickbait vazio ("voce nao vai acreditar"). Alto padrao = promessa cumprida.
- Nomes cientificos entre *asteriscos* (italico no Insta).
- Caption entre 120 e 280 palavras (sweet spot de tempo de leitura + algoritmo).

RETORNO OBRIGATORIO: JSON ESTRITO, SEM markdown, SEM texto fora do JSON:
{
  "options": [
    {
      "abordagem": "Storytelling editorial",
      "hook": "<primeira linha, ate 90 char>",
      "legenda": "<texto completo ja formatado com quebras de linha \\n>",
      "hashtags": ["#hashtag1", "#hashtag2", ...]
    },
    {
      "abordagem": "Autoridade tecnica botanica",
      ...
    },
    {
      "abordagem": "Pergunta provocativa + lista",
      ...
    }
  ]
}

Gere 3 opcoes com abordagens BEM DIFERENTES entre si.`;

export async function POST(req: NextRequest) {
  try {
    const { prompt, slides } = await req.json();
    if (!slides?.length) return NextResponse.json({ error: "slides required" }, { status: 400 });

    const slidesSummary = slides
      .map((s: any, i: number) => {
        if (s.type === "cover") return `  [${i + 1}] CAPA: "${s.title}" (${s.topLabel || ""})`;
        if (s.type === "plantDetail") return `  [${i + 1}] PLANTA: ${s.nomePopular} (${s.nomeCientifico})`;
        if (s.type === "cta") return `  [${i + 1}] CTA: "${s.pergunta}"`;
        return `  [${i + 1}] ${s.topLabel || "INSPIRACAO"}: "${s.title}" — ${s.subtitle || ""}`;
      })
      .join("\n");

    const userMsg = `Tema do carrossel: "${prompt || "(sem tema explicito)"}"

Conteudo dos 6 slides:
${slidesSummary}

Gere 3 opcoes de legenda conforme o system prompt. JSON puro.`;

    const resp = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 2200,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMsg },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "";

    let parsed: any;
    try {
      parsed = extractJson(raw);
    } catch {
      return NextResponse.json({ error: "IA devolveu JSON invalido", raw: raw.slice(0, 400) }, { status: 500 });
    }

    if (Array.isArray(parsed)) parsed = { options: parsed };
    return NextResponse.json(parsed);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
