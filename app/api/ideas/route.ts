import { NextRequest, NextResponse } from "next/server";
import { getAi, MODEL } from "@/lib/claude";
import { extractJson } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM = `Voce e estrategista de conteudo de Instagram pra @digitalpaisagismo (paisagismo de alto padrao brasileiro).

PUBLICO: clientes AA/AAA, arquitetos, donos de mansao/casa de campo. Leem AD, Casa Vogue.

TAREFA: gerar 8 IDEIAS DE TEMA pra carrosseis de 6 slides. Temas com alto potencial viral (salve + share + comentario).

FORMULAS VIRAIS QUE FUNCIONAM NESSE NICHO:
- "N plantas pra [contexto especifico]" — ex: "5 plantas que transformam jardim sombreado", "7 plantas pra piscina sem derrubar folha"
- "Antes x Depois" — ex: "Como esse jardim de 20m2 virou refugio tropical"
- "O que separa X de Y" — ex: "O que separa um jardim bom de um jardim de alto padrao"
- "Erros" — ex: "4 erros que fazem seu jardim parecer barato"
- "Segredos / bastidores" — ex: "Como paisagistas de mansao escondem o ar-condicionado"
- "Lista de curadoria" — ex: "10 plantas que todo jardim contemporaneo tem"
- "Definitivo" — ex: "O guia definitivo de palmeiras pra casa de campo"
- "Contrario" — ex: "Por que menos plantas da mais sofisticacao"

REGRAS DE BOM TITULO:
- Numeros especificos (5, 7, 12 — nao 'varias')
- Adjetivos de classe: alto padrao, autoral, contemporaneo, sofisticado, brasileiro
- Contexto concreto: jardim pequeno, varanda urbana, casa de praia, borda de piscina, entrada de condominio
- Proibido: "dicas", "super", "incrivel", "confira", emoji, clickbait vazio
- Entre 6 e 12 palavras idealmente

RETORNO OBRIGATORIO — JSON puro, sem markdown:
{
  "ideias": [
    { "titulo": "texto do tema", "hook": "por que isso viraliza (1 frase)" },
    ...8 ideias variadas entre as formulas acima
  ]
}

Cada ideia precisa ser ACIONAVEL como prompt pro proximo step (vai virar carrossel de 6 slides usando banco de imagens).`;

export async function POST(req: NextRequest) {
  try {
    const { nicho } = await req.json().catch(() => ({}));
    const user = nicho
      ? `Gerar 8 ideias com foco em: ${nicho}. JSON puro.`
      : "Gerar 8 ideias variadas. JSON puro.";

    const resp = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 1400,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "";
    let parsed: any;
    try {
      parsed = extractJson(raw);
    } catch {
      return NextResponse.json({ error: "IA devolveu JSON invalido", raw: raw.slice(0, 300) }, { status: 500 });
    }
    if (Array.isArray(parsed)) parsed = { ideias: parsed };
    return NextResponse.json(parsed);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
