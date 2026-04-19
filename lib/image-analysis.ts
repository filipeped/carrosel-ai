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

const SYSTEM = `Voce e diretor de arte especializado em paisagismo alto padrao. Analise a imagem fornecida e devolva JSON ESTRITO:

{
  "qualidade": numero 0-10,       // foco, nitidez, exposicao, ausencia de ruido
  "composicao": numero 0-10,      // enquadramento, regra dos tercos, hierarquia visual, profundidade
  "luz": numero 0-10,             // qualidade de luz (dourada/rasante/difusa vale mais; luz dura/chapada menos)
  "cover_potential": numero 0-10, // impacto visual como CAPA de carrossel (drama, ponto focal forte, respiro pra texto)
  "descricao_visual": string,     // 2-3 frases descrevendo o que a foto mostra, incluindo luz, estruturas, plantas visiveis
  "hero_element": string,         // elemento principal da cena em 3-6 palavras (ex: "maciço de pacovas com luz filtrada")
  "mood_real": string[],          // 2-4 adjetivos que a foto transmite (refugio, drama, minimalismo, tropical, autoral)
  "palavras_chave": string[]      // 4-8 termos busca (ex: corredor, pedra, pisantes, muro verde, licuala)
}

Regras:
- Seja preciso e tecnico. Eleve a barra: 9-10 so pra fotos REALMENTE de revista. 7-8 bom padrao. <7 comum.
- descricao_visual: em portugues BR, factual, cite especies se reconhecer.
- Sem markdown, sem texto fora do JSON.`;

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
