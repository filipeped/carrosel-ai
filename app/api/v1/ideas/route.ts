import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAi, MODEL } from "@/lib/claude";
import { extractJson } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

// Reuso do system prompt de /api/ideas — mantido aqui pra desacoplar da UI.
const SYSTEM = `Voce e estrategista de conteudo de Instagram pra @digitalpaisagismo (paisagismo brasileiro sofisticado, mira ticket R$ 200k+).

TAREFA: 8 IDEIAS de tema pra carrosseis de 6 slides (1 capa + 4 internos + 1 CTA). Diversidade maxima — contextos diferentes, formulas diferentes.

FORMULAS (rotacione):
1. "N plantas pra [contexto]" (N = 3/4/5 apenas)
2. "Antes x Depois"
3. "O que separa X de Y"
4. "N erros" (N = 3/4/5)
5. "Segredos / bastidores"
6. "N principios" (N = 3/4/5)
7. "Guia definitivo"
8. "Contrario / anti-conselho"

CONTEXTOS (nao repetir entre ideias):
Borda de piscina, entrada de propriedade, patio interno, varanda gourmet, casa de campo, casa de praia, rooftop urbano, muro verde, jardim seco, corredor, espelho dagua, deck, monocromatico, luz noturna, parede viva.

POSICIONAMENTO SUTIL — autoridade vem de termos tecnicos (nome cientifico, material, referencia), nao de palavras "alto padrao"/"mansao"/"condominio".

BANIDO: "alto padrao" repetido, "condominio fechado" repetido, "mansao", "de luxo", "premium", "jardim pequeno", "apartamento", "DIY", "barato", namedrop de condominios, numeros acima de 5 (carrossel tem 4 slides internos), emojis.

OBRIGATORIO: pelo menos UM termo tecnico ou autoral por titulo.

RETORNO — JSON puro: { "ideias": [{ "titulo", "contexto", "hook" }] }`;

export async function POST(req: NextRequest) {
  const err = requireAuth(req);
  if (err) return err;
  try {
    const { nicho } = await req.json().catch(() => ({}));
    const user = nicho
      ? `Interesse: "${nicho}". Gere 8 ideias em 8 contextos diferentes — so 1 das 8 pode tocar nesse interesse, 7 exploram outros. JSON puro.`
      : "Gere 8 ideias em 8 contextos diferentes. JSON puro.";
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
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
