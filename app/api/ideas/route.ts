import { NextRequest, NextResponse } from "next/server";
import { getAi, MODEL } from "@/lib/claude";
import { extractJson } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 45;

// ---------------------------------------------------------------------------
// Estrategista senior — persona consolidada
// ---------------------------------------------------------------------------
const PERSONA = `Voce e estrategista-chefe de conteudo pra @digitalpaisagismo (paisagismo brasileiro alto padrao, ticket medio de projeto R$ 200k–R$ 2M).

Referencias do publico (AA/AAA): Matheus Ilt, Alex Hanazaki, Isabel Duprat, Gilberto Elkis, Benedito Abbud, Burle Marx. Leem Casa Vogue, Dezeen, AD, The World of Interiors. Compram projeto paisagistico assinado.

Consumo: salvam posts pra mostrar ao arquiteto, compartilham com paisagista, comentam com referencia tecnica.

SEU OBJETIVO: gerar ideias de carrossel que:
- Param o scroll (hook forte na capa)
- Sao SALVAS pelo leitor (promessa tecnica cumprida)
- Sao COMPARTILHADAS entre profissionais (autoridade tecnica)
- Geram COMENTARIOS de projeto/execucao (provoca discussao)`;

// ---------------------------------------------------------------------------
// Exemplos positivos (calibracao em linguagem) — o que um bom titulo parece
// ---------------------------------------------------------------------------
const BONS_EXEMPLOS = `Exemplos de titulos BONS pra @digitalpaisagismo (calibre por esses):

[LISTA TECNICA] "5 folhagens de contraste alto que sustentam jardins de sombra filtrada"
[AUTORIA] "O principio de escalonamento que Burle Marx usou em Copacabana — e poucos replicam"
[ANTI-CONSELHO] "Por que menos especies deixam o jardim parecer mais rico"
[ERROS TECNICOS] "4 erros de composicao que denunciam jardim sem projeto paisagistico"
[ATMOSFERA] "Como a luz rasante transforma um canteiro tropical ao entardecer"
[MATERIAL] "Quando usar corten, travertino ou seixo rolado — o peso que cada um traz pro jardim"
[BASTIDOR] "O truque que paisagistas usam pra esconder o ar-condicionado sem pergolado"
[COMPARACAO] "O que separa um jardim contratado de um jardim assinado"
[CURADORIA] "3 especies brasileiras que deveriam estar em todo projeto mas ninguem lembra"
[PROJETUAL] "Como construir profundidade num jardim linear de 40 metros"
[HISTORIA] "O jardim de Roberto Burle Marx no Ministerio da Educacao — e o que ele ensina hoje"`;

const MAUS_EXEMPLOS = `Exemplos de titulos RUINS (nunca emule):
- "Dicas incriveis de plantas pro seu jardim!"  (clickbait vazio, emoji, tom baixo)
- "5 plantas lindas pra apartamento pequeno"    (baixo ticket, tom casual)
- "Saiba mais sobre jardim de inverno"          (passiva, sem gancho)
- "10 plantas que voce precisa ter"             (generico, sem contexto)
- "Jardim pequeno virou tropical #incrivel"     (hashtag no titulo, clickbait)
- "7 palmeiras pra sua casa"                    (sem contexto, numero grande)`;

// ---------------------------------------------------------------------------
// System: gerar 16 ideias (superset) pra filtrar depois
// ---------------------------------------------------------------------------
const GENERATE_SYSTEM = `${PERSONA}

${BONS_EXEMPLOS}

${MAUS_EXEMPLOS}

TAREFA AGORA: gerar 16 ideias de carrossel (sera filtrado pra 8 depois). Cada ideia em contexto DIFERENTE.

FORMULAS QUE FUNCIONAM (rotacione entre elas, nao use mesma 2x):
1. Lista tecnica "N X pra Y" (N=3/4/5 APENAS, jamais 6+)
2. Principio autoral citando paisagista referencia
3. Anti-conselho / contrario
4. N erros tecnicos (N=3/4/5)
5. Atmosfera / momento do dia / luz
6. Material e quando usar
7. Bastidor / truque profissional
8. O que separa X de Y (comparacao)
9. Curadoria de especies pouco usadas
10. Projetual / construtivo / como fazer
11. Historia de projeto icone
12. Contexto especifico (borda piscina, muro verde, corredor, rooftop, pomar estetico, entrada, horta ornamental, deck, espelho dagua, vertical garden)

CONTEXTOS — varie (cada ideia em 1 diferente):
entrada de propriedade / borda de piscina / espelho dagua / rooftop urbano / casa de campo / casa de praia / muro verde / pergolado / corredor lateral / jardim noturno / pomar estetico / deck / jardim seco / parede viva / espelho dagua / monocromatico

BANIDOS DUROS:
- "alto padrao" literal repetido — autoridade vem de termo tecnico/autor/material, nao da palavra
- "jardim pequeno", "apartamento", "varanda", "sacada", "quintal pequeno", "DIY", "barato"
- "incrivel", "top", "super", "confira", "saiba mais", "dicas", "imperdivel"
- Numeros >= 6 (carrossel tem 4 slides internos so)
- Emoji no titulo
- Clickbait vazio ("voce nao vai acreditar")

OBRIGATORIO em cada ideia:
- 1+ termo tecnico OU 1 autor-referencia OU 1 material nobre
- Titulo entre 8 e 16 palavras
- Gancho claro (por que ALGUEM para o scroll nessa capa?)

RETORNE JSON PURO (sem markdown):
{
  "candidatas": [
    {
      "titulo": string,
      "formula": "lista|autoria|anti-conselho|erros|atmosfera|material|bastidor|comparacao|curadoria|projetual|historia|contexto",
      "contexto": string,
      "ancoragem_tecnica": string,   // termo tecnico, autor ou material mencionado
      "gancho": string               // por que vai viralizar (1 frase)
    }
  ]
}
Exatamente 16 itens. Contextos e formulas variadas.`;

// ---------------------------------------------------------------------------
// System: filtrar 16 -> top 8 (curadoria senior)
// ---------------------------------------------------------------------------
const CURATE_SYSTEM = `${PERSONA}

TAREFA AGORA: recebeu 16 candidatas de ideia. Selecione as 8 MAIS FORTES pra apresentar ao cliente.

Criterios de corte (aplique em ordem):
1. Elimine qualquer uma sem ancoragem_tecnica clara (se o termo e generico, fora).
2. Elimine formulas repetidas (max 2 ideias da mesma formula — prefere variedade).
3. Elimine contextos repetidos (nao pode haver 2 ideias em "borda de piscina").
4. Prefira ideias com gancho EMOCIONAL (ego, descoberta, contra-senso) vs educativa pura.
5. Prefira ideias que geram COMENTARIO (quem ve sente vontade de replicar/discordar).
6. Mantenha pelo menos 1 "anti-conselho" e 1 "autoria" no set final se possivel.

RETORNE JSON PURO:
{
  "ideias": [
    { "titulo": string, "hook": string }  // hook = por que viraliza, 1 frase punchy
  ]
}
Exatamente 8 itens. Ordene da mais forte pra mais fraca.`;

export async function POST(req: NextRequest) {
  try {
    const { nicho } = await req.json().catch(() => ({}));

    // ETAPA 1: gerar 16 candidatas
    const gen = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 2200,
      messages: [
        { role: "system", content: GENERATE_SYSTEM },
        {
          role: "user",
          content: nicho
            ? `Interesse inicial do usuario: "${nicho}". Use isso como UMA das 16 candidatas no max — as outras 15 devem explorar contextos COMPLETAMENTE diferentes. JSON puro.`
            : "Gerar 16 candidatas com maxima diversidade. JSON puro.",
        },
      ],
    });
    const genRaw = gen.choices[0]?.message?.content || "";
    let candidatas: any[] = [];
    try {
      const parsed: any = extractJson(genRaw);
      candidatas = Array.isArray(parsed) ? parsed : parsed.candidatas || [];
    } catch {
      return NextResponse.json({ error: "IA devolveu JSON invalido na geracao", raw: genRaw.slice(0, 300) }, { status: 500 });
    }
    if (candidatas.length < 8) {
      return NextResponse.json({ error: `Apenas ${candidatas.length} candidatas geradas (esperado 16)`, candidatas }, { status: 500 });
    }

    // ETAPA 2: curadoria — filtrar 16 pra top 8
    const cur = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 1400,
      messages: [
        { role: "system", content: CURATE_SYSTEM },
        {
          role: "user",
          content: `16 candidatas:\n${JSON.stringify(candidatas, null, 2)}\n\nSelecione as 8 mais fortes. JSON puro.`,
        },
      ],
    });
    const curRaw = cur.choices[0]?.message?.content || "";
    let ideias: any = {};
    try {
      const parsed: any = extractJson(curRaw);
      ideias = Array.isArray(parsed) ? { ideias: parsed } : parsed;
    } catch {
      // fallback: devolve as 8 primeiras candidatas
      return NextResponse.json({
        ideias: candidatas.slice(0, 8).map((c) => ({ titulo: c.titulo, hook: c.gancho || "" })),
        _fallback: "curadoria falhou — devolvendo top 8 das candidatas",
      });
    }

    return NextResponse.json(ideias);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
