// Analise visual via Claude Vision + cache em image_bank.analise_visual.
import { getAi, MODEL } from "./claude";
import { getSupabase, ImageBankRow } from "./supabase";
import { extractJson } from "./utils";

export type AnaliseVisual = {
  qualidade: number;         // 0-10
  composicao: number;        // 0-10
  luz: number;               // 0-10
  cover_potential: number;   // 0-10 — potencial como CAPA (impacto visual)
  descricao_visual: string;  // 2-3 frases
  hero_element: string;      // elemento principal
  mood_real: string[];
  palavras_chave: string[];
  analisado_em: string;      // ISO
  modelo: string;
};

const SYSTEM = `Voce avalia fotos de paisagismo que serao usadas em carrosseis de Instagram do @digitalpaisagismo (alto padrao, publico AA/AAA). NAO esta avaliando pra revista AD — esta avaliando pra carrossel de Instagram. Retorne JSON ESTRITO:

{
  "qualidade": 0-10,        // foco, nitidez, exposicao, resolucao. Foto borrada/pixelada: baixo. Foco nitido: 7+.
  "composicao": 0-10,       // enquadramento, hierarquia visual, profundidade, espaco negativo pra texto
  "luz": 0-10,              // dourada/rasante/noturna autoral = 8-10. difusa uniforme BOA (sem chapar) = 6-7. chapada meio-dia = 4-5. ceu estourado ou subexposto = 2-3.
  "cover_potential": 0-10,  // potencial especifico como CAPA de Instagram: ponto focal forte, respira pra texto, para o scroll
  "descricao_visual": string,  // 2-3 frases factuais em PT-BR. Cite: luz, estruturas/materiais, plantas (nome cientifico se reconhecer), atmosfera
  "hero_element": string,      // elemento principal em 3-6 palavras
  "mood_real": string[],       // 2-4 adjetivos (refugio, drama, minimalismo, tropical, autoral, melancolico, solar, urbano)
  "palavras_chave": string[]   // 4-8 termos (corredor, pedra, pisantes, muro verde, licuala, etc)
}

CALIBRACAO DE ESCALA (use a FAIXA TODA — diferencie):
- 9-10: excepcional, autoral, viral potential — raro (~5%)
- 7-8: acima da media, solida, usavel como capa sem duvida (~25%)
- 5-6: padrao de mercado, funcional, utilizavel mas sem destaque (~40%)
- 3-4: fraca, sem impacto, ou com defeito leve (~20%)
- 0-2: defeituosa, borrada, cortada, sem uso (~10%)

PRINCIPIOS:
- Fotos de catalogo de paisagismo sao geralmente competentes. 5-7 e faixa NORMAL, nao ruim.
- Voce PRECISA diferenciar — se voce da 4 pra 80% das fotos, esta sendo covarde pelo outro lado.
- DIFERENCIE: se duas fotos sao parecidas, uma deve ganhar 0.5-1.0 a mais.
- Luz difusa sem direcao NAO e automaticamente ruim — so chape quando perde dimensao/modelagem.
- Noturna bem iluminada com pontos focais = 8-9 em luz. Um drama visual otimo.
- Foto ampla de area com piscina/deck/pergolado = cover_potential 6-8 se tiver composicao clara.
- Foto so de plantas em close (sem contexto arquitetonico) = cover_potential 4-6 tipicamente.

EVITE ANCORAGEM EM 6 (bug comum): se voce esta dando 6 pra tudo, FORCE-SE a subir as 2 melhores da serie pra 7-8 e abaixar a pior pra 4-5. Distribua ATIVAMENTE. Notas fracionadas sao OK (6.5, 7.5, 8.5).

Sem markdown. Sem texto fora do JSON.`;

export async function analyzeOne(imageUrl: string): Promise<AnaliseVisual> {
  const r = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 800,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: "Analise esta imagem de paisagismo e devolva JSON puro." },
        ] as any,
      },
    ],
  });
  const raw = r.choices[0]?.message?.content || "";
  const parsed = extractJson<Partial<AnaliseVisual>>(raw);
  return {
    qualidade: clamp(parsed.qualidade ?? 5),
    composicao: clamp(parsed.composicao ?? 5),
    luz: clamp(parsed.luz ?? 5),
    cover_potential: clamp(parsed.cover_potential ?? 5),
    descricao_visual: String(parsed.descricao_visual ?? "").slice(0, 500),
    hero_element: String(parsed.hero_element ?? "").slice(0, 120),
    mood_real: Array.isArray(parsed.mood_real) ? parsed.mood_real.slice(0, 6) : [],
    palavras_chave: Array.isArray(parsed.palavras_chave) ? parsed.palavras_chave.slice(0, 10) : [],
    analisado_em: new Date().toISOString(),
    modelo: MODEL,
  };
}

function clamp(n: any): number {
  const x = Number(n);
  if (Number.isNaN(x)) return 5;
  return Math.max(0, Math.min(10, x));
}

/**
 * Analisa imagens que ainda nao tem cache. Retorna todas com analise_visual preenchida.
 * Tolerante a ausencia da coluna (feature opcional ate migration rodar).
 */
export async function analyzeAndCache(
  images: ImageBankRow[],
  opts: { concurrency?: number } = {},
): Promise<(ImageBankRow & { analise_visual: AnaliseVisual })[]> {
  const concurrency = opts.concurrency ?? 5;
  const supabase = getSupabase();

  // Separa quem ja tem cache
  const result: (ImageBankRow & { analise_visual: AnaliseVisual })[] = [];
  const toAnalyze: ImageBankRow[] = [];
  for (const img of images) {
    const existing = (img as any).analise_visual;
    if (existing && typeof existing === "object" && existing.qualidade !== undefined) {
      result.push({ ...img, analise_visual: existing as AnaliseVisual });
    } else {
      toAnalyze.push(img);
    }
  }

  // batch paralelo
  for (let i = 0; i < toAnalyze.length; i += concurrency) {
    const batch = toAnalyze.slice(i, i + concurrency);
    const analyzed = await Promise.all(
      batch.map(async (img) => {
        try {
          const analise = await analyzeOne(img.url);
          // tenta cachear — se coluna nao existir, erro silencioso
          try {
            await supabase
              .from("image_bank")
              .update({ analise_visual: analise as any })
              .eq("id", img.id);
          } catch {
            /* coluna pode nao existir em instalacoes novas */
          }
          return { ...img, analise_visual: analise };
        } catch (e) {
          // falha na analise — devolve default pra nao quebrar pipeline
          return {
            ...img,
            analise_visual: {
              qualidade: 5,
              composicao: 5,
              luz: 5,
              cover_potential: 5,
              descricao_visual: img.descricao?.slice(0, 300) || "",
              hero_element: "",
              mood_real: img.mood || [],
              palavras_chave: [],
              analisado_em: new Date().toISOString(),
              modelo: "fallback",
            } as AnaliseVisual,
          };
        }
      }),
    );
    result.push(...analyzed);
  }

  return result;
}

/**
 * Enriquece imagens com identificação profissional de plantas (RAG + Vision focado).
 * Usa lib/plant-identifier. Cacheia em image_bank.plantas (nome cientifico) e
 * image_bank.analise_visual.plantas_identificadas (confidence + id).
 *
 * Roda só nas imagens selecionadas finais (nao em todas 24 candidatas) —
 * evita custo O(N) desnecessario.
 */
export async function enrichImagesWithPlantId(
  images: Array<{ id: number; url: string; plantas?: string[]; analise_visual?: any }>,
  force = false,
): Promise<void> {
  const { identifyPlants } = await import("./plant-identifier");
  const supabase = getSupabase();
  for (const img of images) {
    try {
      const av = img.analise_visual || {};
      // Skip se ja tem plantas identificadas com confidence e nao eh force
      if (!force && Array.isArray(av.plantas_identificadas) && av.plantas_identificadas.length > 0) {
        continue;
      }
      const identified = await identifyPlants(img.url, {
        descricaoVisual: av.descricao_visual,
        heroElement: av.hero_element,
        elementos: av.palavras_chave,
      });
      if (!identified.length) continue;

      // Atualiza cache: plantas[] (nomes cientificos) + plantas_identificadas (detalhe)
      const nomesCient = identified.map((p) => p.nome_cientifico).filter(Boolean);
      const newAV = { ...av, plantas_identificadas: identified };
      const newPlantas = Array.from(new Set([...(img.plantas || []), ...nomesCient]));

      await supabase
        .from("image_bank")
        .update({ plantas: newPlantas, analise_visual: newAV })
        .eq("id", img.id);

      img.plantas = newPlantas;
      img.analise_visual = newAV;
    } catch (e) {
      console.warn(`[plant-id] img ${img.id}:`, (e as Error).message);
    }
  }
}
