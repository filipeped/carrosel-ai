import { NextRequest, NextResponse } from "next/server";
import { getAi, MODEL } from "@/lib/claude";
import { extractJson } from "@/lib/utils";
import { fetchVegetacoesForPrompt } from "@/lib/smart-pipeline";
import { fetchVegetacoesByIds } from "@/lib/supabase";
import type { VegetacaoRow } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM = `Voce e curador botanico do @digitalpaisagismo (paisagismo de alto padrao).

TAREFA: dado um TEMA e uma lista de plantas reais do banco, escolha EXATAMENTE 6 plantas que juntas formam um carrossel coeso pro Instagram.

REGRAS:
- As 6 plantas DEVEM existir na lista fornecida (use o ID exato).
- Diversidade: misture portes (alta + media + baixa), cores, texturas. Evite 6 plantas iguais.
- Coerencia com o tema: se tema e "sombra", todas devem aceitar sombra. Se "tropical", aspecto tropical.
- Publico alto padrao: prefira especies que sao usadas em projetos premium, nao plantas vulgares.
- Ordem narrativa: planta 1 abre (capa, impacto visual); plantas 2-5 desenvolvem; planta 6 fecha (CTA, contemplativa).

SAIDA: JSON puro, sem markdown.
{
  "ids": ["uuid1", "uuid2", "uuid3", "uuid4", "uuid5", "uuid6"],
  "rationale": "1-2 frases sobre por que esse conjunto faz sentido pro tema"
}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt: string = (body?.prompt || "").trim();
    if (!prompt) {
      return NextResponse.json({ error: "prompt obrigatorio" }, { status: 400 });
    }

    // Pool maior pra IA escolher (60 plantas paisagisticas aderentes ao tema)
    const pool = await fetchVegetacoesForPrompt(prompt, 60);
    const filtered = pool.filter(
      (p) => p.imagem_principal && p.imagem_principal.startsWith("http"),
    );
    if (filtered.length < 6) {
      return NextResponse.json(
        { error: `Banco retornou so ${filtered.length} plantas validas pro tema. Tenta tema mais aberto.` },
        { status: 400 },
      );
    }

    const list = filtered
      .map(
        (p) =>
          `- id=${p.id} | ${p.nome_popular} (${p.nome_cientifico || "?"}) | luminosidade: ${p.luminosidade || "?"} | clima: ${p.clima || "?"} | altura: ${p.altura || "?"} | categorias: ${p.categorias || "?"}`,
      )
      .join("\n");

    const userMsg = `Tema: "${prompt}"

Lista de plantas disponiveis (escolha 6):
${list}

Retorne JSON puro com 6 IDs + rationale.`;

    const resp = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 800,
      temperature: 0.6,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMsg },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "";
    const parsed = extractJson<{ ids: string[]; rationale?: string }>(raw);

    const ids = Array.isArray(parsed?.ids) ? parsed.ids.slice(0, 6) : [];
    if (ids.length < 6) {
      return NextResponse.json(
        { error: "IA nao retornou 6 IDs validos. Tenta de novo." },
        { status: 500 },
      );
    }

    // Resolve via banco (preserva ordem da IA)
    const plantas: VegetacaoRow[] = await fetchVegetacoesByIds(ids);
    if (plantas.length < 6) {
      // Completa com plantas do pool original (filtra fora as ja escolhidas)
      const escolhidasSet = new Set(plantas.map((p) => p.id));
      const extras = filtered.filter((p) => !escolhidasSet.has(p.id));
      while (plantas.length < 6 && extras.length) {
        plantas.push(extras.shift()!);
      }
    }

    return NextResponse.json({
      plantas: plantas.slice(0, 6),
      rationale: parsed.rationale || "",
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
