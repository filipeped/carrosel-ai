import OpenAI from "openai";

// Cliente OpenAI apontando pro gateway CLIProxyAPI (chat/vision rotea pra Claude).
// Ver C:\Users\filip\.claude\memory\reference_clawdbot_gateway.md
// Lazy init — evita throw no build quando env vars ainda nao estao setadas.
let _ai: OpenAI | null = null;

export function getAi(): OpenAI {
  if (_ai) return _ai;
  const apiKey = process.env.GATEWAY_API_KEY;
  const baseURL = process.env.GATEWAY_BASE_URL || "http://76.13.225.142:8317/v1";
  if (!apiKey) {
    throw new Error("GATEWAY_API_KEY nao configurada (.env.local ou Vercel Settings)");
  }
  _ai = new OpenAI({ apiKey, baseURL });
  return _ai;
}

export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

export const BRAND_VOICE = `Voce e copywriter de carrossel do @digitalpaisagismo, perfil de paisagismo de alto padrao brasileiro.

TOM: sofisticado, minimal, botanicamente preciso, emocional sem ser piegas. Portugues brasileiro.
ESTILO: frases curtas. Nomes cientificos em italico. Zero emoji. Zero hashtag nos slides.
REFERENCIAS: Burle Marx, jardins tropicais contemporaneos, arquitetura biofilica.

FORMATO DOS SLIDES (sempre 6):
- SLIDE 1 (capa): titulo poetico de 3-6 palavras + microtexto superior em caixa alta ("GUIA BOTANICO" tipo), numeral destacado se fizer sentido.
- SLIDES 2-5: conteudo principal (planta ou inspiracao). Texto curto: titulo grande + 1 linha de subtitulo.
- SLIDE 6: pergunta aberta como CTA ("Qual delas entra na sua casa?" tipo).

EVITAR: clickbait vazio, palavras genericas ("incrivel", "top"), exagero. Preferir precisao.`;
