/**
 * Observational Copy — escreve copy do carrossel COMENTANDO o que esta visivel.
 *
 * Filosofia: image-first. Copy nao argumenta tema, nao defende tese, nao promete nada.
 * Tom de CURADOR APAIXONADO apontando detalhes de fotos que ele mesmo fotografou.
 * "Olha essa palmeira real" / "Repare na textura do basalto" / "Essa luz das 17h"
 *
 * Usado pelo /api/curadoria apos visualCurator agrupar as fotos.
 */

import { getAi, MODEL } from "../claude";
import { extractJson } from "../utils";
import { brandBlockCompact } from "../brand-context";
import type { AnalyzedImage } from "../smart-pipeline";
import type { SlideSpec } from "../pipeline";

type ObservationalInput = {
  grupo: AnalyzedImage[];
  tese_detectada: string;
  slideCount?: number;
};

function buildSchema(slideCount: number): string {
  const lastIdx = slideCount - 1;
  return `SCHEMA JSON (retorna assim, zero texto fora):
{
  "slides": [
    { "type": "cover", "imageIdx": 0, "topLabel": string, "numeral": null, "title": string, "italicWords": string[] },
    ${Array.from({ length: slideCount - 2 })
      .map((_, i) => `{ "type": "inspiration", "imageIdx": ${i + 1}, "title": string, "subtitle": string, "topLabel": string, "nomePopular": null, "nomeCientifico": null }`)
      .join(",\n    ")},
    { "type": "cta", "imageIdx": ${lastIdx}, "pergunta": string, "italicWords": string[] }
  ]
}

REGRAS:
- slides[0] = cover; slides[${lastIdx}] = cta; resto = inspiration (preferido) ou plantDetail (so se planta visivel + identificada)
- plantDetail format: { "type": "plantDetail", "imageIdx": N, "nomePopular": string, "nomeCientifico": string, "title": null, "subtitle": null, "topLabel": null }
- numeral: SEMPRE null (nao promete "N de qualquer coisa")
- italicWords: 1-3 palavras pra italico decorativo`;
}

export async function observationalCopy(
  input: ObservationalInput,
): Promise<{ slides: SlideSpec[] }> {
  const { grupo, tese_detectada } = input;
  const slideCount = Math.max(6, Math.min(10, input.slideCount ?? grupo.length));

  const imgBlock = grupo
    .slice(0, slideCount)
    .map((im, i) => {
      const a = im.analise_visual;
      const plantas = (im.plantas || []).slice(0, 5).join(", ");
      const materiais = (im.elementos_form || []).slice(0, 4).join(", ");
      const mood = (a?.mood_real || []).slice(0, 3).join(", ");
      return `[${i}] VISIVEL: ${a?.descricao_visual || im.descricao || "—"}
     hero: ${a?.hero_element || "?"}
     plantas identificadas: ${plantas || "(nenhuma)"}
     materiais: ${materiais || "(nenhum)"}
     mood: ${mood || "?"}
     luz: ${a?.luz || "?"}/10  |  tipo_area: ${im.tipo_area || "?"}`;
    })
    .join("\n\n");

  const system = `${brandBlockCompact()}

---

# MODO OBSERVACIONAL — image-first

Voce eh um CURADOR APAIXONADO olhando este arquivo. NAO tem tema externo.
NAO defende tese. NAO promete "N de qualquer coisa". NAO vende nada.

Tua unica tarefa: escrever o carrossel COMENTANDO o que esta VISIVEL nas fotos.
Como um arquiteto passeando com um cliente e apontando o que repara.

## TOM

- Presente, observacional, elevado
- Frases curtas, concretas, especificas
- Zero abstracao ("a essencia...", "a alma...")
- Zero pitch ("sua casa merece", "contrate")
- Zero listagem numerada ("3 coisas", "as 5 plantas")

## ABERTURA DA CAPA (varie)

NAO repetir "olha" em todas. Mistura formas:
- Afirmacao direta: "Esse jardim tem um ritmo proprio."
- Observacao: "Reparou na luz das 17h aqui?"
- Descoberta: "Essa palmeira nao esta ali por acaso."
- Tempo: "Jardim que envelhece bem comeca assim."

## SLIDES INTERNOS

Cada slide olha UM detalhe especifico da sua foto:
- "A sombra da palmeira-real se move 40 graus entre 14h e 18h."
- "O basalto escuro muda o som do corredor quando molhado."
- "Essa camada de musgo so apareceu no segundo verao."
- "Tres texturas diferentes em um metro quadrado de jardim."

REGRAS DURAS:
- SO cita elemento/planta/material que aparece em descricao_visual
  ou plantas[] da imagem correspondente. Zero alucinacao.
- CADA slide tem um ANGULO COMPLETAMENTE DIFERENTE — proibido
  repetir ideia, conceito ou abordagem entre slides. Se slide 2 fala
  de luz, slide 3 fala de textura; se slide 3 fala de textura,
  slide 4 fala de tempo/maturidade; etc.
- ZERO titulos genericos tipo "Beleza natural", "Harmonia", "Elegancia".
  Cada titulo precisa ser CONCRETO e unico na serie.
- Proibido usar a mesma palavra-chave de hook em 2 slides.

## CTA (ultimo slide)

Pergunta aberta contemplativa que convida a OLHAR MAIS:
- "Que jardim voce tem olhado sem realmente enxergar?"
- "O que sua area externa tenta te contar no fim da tarde?"
- "Quando foi a ultima vez que voce parou no jardim?"

NAO usar: "me manda no direct", "em que fase", "quer saber mais"

---

${buildSchema(slideCount)}`;

  const user = `TESE DETECTADA (o que liga essas fotos): ${tese_detectada}

FOTOS PARA COMENTAR (${slideCount} total, em ordem):

${imgBlock}

Escreve o carrossel comentando detalhes VISIVEIS em cada foto. Retorna JSON puro.
Se alguma foto tem planta identificada forte (em plantas[]) E o hero da foto eh essa planta,
vira plantDetail. Se nao, inspiration.

ATENCAO: saida comeca com { e termina com }. Zero texto antes ou depois. Zero outline.`;

  try {
    const resp = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 2400,
      temperature: 0.75,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "";
    let parsed: any = extractJson(raw);
    if (Array.isArray(parsed)) parsed = { slides: parsed };
    if (!parsed?.slides || !Array.isArray(parsed.slides)) {
      throw new Error("copy observacional retornou JSON sem 'slides'");
    }
    return { slides: parsed.slides as SlideSpec[] };
  } catch (err) {
    console.error("[observational-copy] falhou:", (err as Error).message);
    // Fallback: monta carrossel vazio com estrutura minima
    const slides: SlideSpec[] = grupo.slice(0, slideCount).map((im, i) => {
      if (i === 0) {
        return {
          type: "cover",
          imageIdx: 0,
          topLabel: "DO ARQUIVO",
          numeral: null,
          title: tese_detectada.slice(0, 60),
          italicWords: [],
        } as SlideSpec;
      }
      if (i === slideCount - 1) {
        return {
          type: "cta",
          imageIdx: slideCount - 1,
          pergunta: "O que voce repara primeiro?",
          italicWords: [],
        } as SlideSpec;
      }
      return {
        type: "inspiration",
        imageIdx: i,
        title: im.analise_visual?.hero_element || "",
        subtitle: (im.analise_visual?.descricao_visual || "").slice(0, 120),
        topLabel: (im.analise_visual?.mood_real?.[0] || "").toUpperCase(),
        nomePopular: null,
        nomeCientifico: null,
      } as SlideSpec;
    });
    return { slides };
  }
}
