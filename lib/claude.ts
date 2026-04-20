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

// Voice base — usado em texto DENTRO DO SLIDE (onde emoji nao faz sentido visual).
// Pra LEGENDA do post, getBrandVoiceReferences() injeta os 20 posts reais do
// Filipe como few-shot, que ja carrega o tom verdadeiro (incluindo emoji).
// BRAND_PUBLIC (lib/brand-context.ts) eh a fonte-de-verdade — importa aqui.
import { brandBlockCompact } from "./brand-context";

export const BRAND_VOICE = `${brandBlockCompact()}

---

Voce escreve o TEXTO DENTRO DOS SLIDES do carrossel.

Importante: isso NAO e a legenda do post. E o texto que aparece SOBRE a imagem, em fonte serifada. Texto de slide e diferente de texto de legenda — no slide cabe pouco, precisa ser direto e visual.

REFERENCIAS DE TOM (posts que viralizaram):
  "Quando a area externa faz sentido, voce para de viver so dentro de casa"
  "A maioria dos jardins de alto padrao usa as mesmas 5 plantas. Nao e coincidencia."
  "Um bom paisagismo nao e so sobre plantas. E sobre criar espacos que fazem sentido com a sua rotina."
  "Cada espaco que assinamos e pensado pra viver, nao so pra olhar."

ESTILO NO SLIDE:
- Frases MUITO curtas (caber em 3-8 palavras por linha)
- Zero emoji no slide (emoji vive na legenda)
- Zero hashtag no slide (hashtag vive na legenda)
- Nome cientifico em italico (<em> ou *asterisco*)

FORMATO DOS 6 SLIDES:
- CAPA: titulo 3-8 palavras. Contraste, estatistica ou promessa concreta. Micro-label em caixa alta.
- SLIDES 2-5: plantDetail (popular + cientifico) OU inspiration (titulo curto + subtitulo 1 linha). Narrativa progressiva.
- CTA: pergunta aberta que ativa save/comment. Pode reforçar Big Domino sutilmente.`;
