/**
 * Agente 1: Análise de prompt (PRÉ-geração).
 * Enriquece o prompt do usuário com persona, dor central, style hints.
 * Usado em runSmartCarousel antes da busca semântica.
 */

import { getAi, MODEL } from "../claude";
import { extractJson } from "../utils";
import { brandBlockCompact } from "../brand-context";

export type PromptAnalysis = {
  enrichedPrompt: string;
  persona: "emObra" | "casaPronta" | "indefinido";
  mainDor: string;
  styleHints: string[];
  semanticKeywords: string[];
  reasoning: string;
};

const SYSTEM = `${brandBlockCompact()}

Voce eh o Analista de Prompts do gerador de carrossel Instagram pra Digital Paisagismo.

Recebe um prompt/tema cru do usuario (pode vir impreciso, curto, ou muito amplo).
Retorna analise estruturada pra orientar as proximas etapas do pipeline.

Sua tarefa:
1. Classificar PERSONA do provavel leitor do post:
   - "emObra" — conteudo fala de obra, construcao, planejamento, integracao com arquitetura
   - "casaPronta" — conteudo fala de area subutilizada, reforma, refugio, rotina com familia
   - "indefinido" — tema generico que cabe aos dois
2. Extrair a DOR central que o post vai atacar (max 20 palavras)
3. Sugerir STYLE HINTS visuais pra guiar a busca de imagens (ex: "jardim tropical denso", "minimalismo com pedra", "deck + piscina + verde")
4. Listar SEMANTIC KEYWORDS pra busca vetorial
5. Retornar PROMPT ENRIQUECIDO — versao expandida com contexto pra os proximos agentes

Retorne JSON puro:
{
  "enrichedPrompt": string,
  "persona": "emObra" | "casaPronta" | "indefinido",
  "mainDor": string,
  "styleHints": string[],
  "semanticKeywords": string[],
  "reasoning": string
}`;

export async function analyzePrompt(
  prompt: string,
  userBrief?: string,
): Promise<PromptAnalysis> {
  const input = `PROMPT DO USUARIO: "${prompt}"${
    userBrief?.trim() ? `\n\nBRIEFING EXTRA:\n${userBrief.slice(0, 800)}` : ""
  }`;

  const resp = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 800,
    temperature: 0.3,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: input },
    ],
  });
  const raw = resp.choices[0]?.message?.content || "";
  try {
    const parsed = extractJson(raw) as Partial<PromptAnalysis>;
    return {
      enrichedPrompt: parsed.enrichedPrompt || prompt,
      persona: (parsed.persona as PromptAnalysis["persona"]) || "indefinido",
      mainDor: parsed.mainDor || "",
      styleHints: Array.isArray(parsed.styleHints) ? parsed.styleHints : [],
      semanticKeywords: Array.isArray(parsed.semanticKeywords) ? parsed.semanticKeywords : [],
      reasoning: parsed.reasoning || "",
    };
  } catch {
    // Fallback — não quebra pipeline
    return {
      enrichedPrompt: prompt,
      persona: "indefinido",
      mainDor: "",
      styleHints: [],
      semanticKeywords: [],
      reasoning: "fallback — análise falhou",
    };
  }
}
