import OpenAI from "openai";

// Gateway nao suporta /v1/embeddings (retorna 404), entao vai direto pro OpenAI.
// Lazy init — evita throw no build quando env vars ainda nao estao setadas.
let _openai: OpenAI | null = null;
function getOpenai(): OpenAI {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY nao configurada (.env.local ou Vercel Settings)");
  }
  _openai = new OpenAI({ apiKey });
  return _openai;
}

export async function embed(text: string): Promise<number[]> {
  const res = await getOpenai().embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    dimensions: 1536,
  });
  return res.data[0].embedding;
}
