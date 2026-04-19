// Pré-warming — analisa com Claude Vision todas as imagens do image_bank
// que ainda nao tem analise_visual e grava no Supabase.
// Uso:  node scripts/warm-cache.mjs [--limit=100] [--concurrency=4]
// Requer env vars: GATEWAY_API_KEY, GATEWAY_BASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import "dotenv/config";
import { readFileSync } from "node:fs";

// Carrega .env.local manualmente (dotenv padrao nao pega)
try {
  const env = readFileSync(".env.local", "utf8");
  env.split("\n").forEach((line) => {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) {
      const v = m[2].replace(/^"|"$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  });
} catch {}

const GATEWAY_KEY = process.env.GATEWAY_API_KEY;
const GATEWAY_URL = process.env.GATEWAY_BASE_URL || "http://76.13.225.142:8317/v1";
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GATEWAY_KEY || !SUPA_URL || !SUPA_KEY) {
  console.error("env vars faltando. Confira .env.local");
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const LIMIT = Number(args.limit || 2000);
const CONCURRENCY = Number(args.concurrency || 4);

const SYSTEM = `Voce avalia fotos de paisagismo pra carrosseis Instagram @digitalpaisagismo. JSON ESTRITO:
{
  "qualidade": 0-10,
  "composicao": 0-10,
  "luz": 0-10,
  "cover_potential": 0-10,
  "descricao_visual": string (2-3 frases PT-BR com luz, materiais, plantas),
  "hero_element": string (3-6 palavras),
  "mood_real": string[] (2-4),
  "palavras_chave": string[] (4-8)
}
Escala: 9-10 raro, 7-8 bom, 5-6 padrao, 3-4 fraca, 0-2 defeituosa. DIFERENCIE — nao nivele tudo em 6.
Sem markdown.`;

async function analyzeOne(url) {
  const r = await fetch(`${GATEWAY_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GATEWAY_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url } },
            { type: "text", text: "Analise. JSON puro." },
          ],
        },
      ],
    }),
  });
  const d = await r.json();
  const raw = d?.choices?.[0]?.message?.content || "";
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON: " + raw.slice(0, 120));
  const parsed = JSON.parse(m[0]);
  return {
    qualidade: clamp(parsed.qualidade),
    composicao: clamp(parsed.composicao),
    luz: clamp(parsed.luz),
    cover_potential: clamp(parsed.cover_potential),
    descricao_visual: String(parsed.descricao_visual || "").slice(0, 500),
    hero_element: String(parsed.hero_element || "").slice(0, 120),
    mood_real: Array.isArray(parsed.mood_real) ? parsed.mood_real.slice(0, 6) : [],
    palavras_chave: Array.isArray(parsed.palavras_chave) ? parsed.palavras_chave.slice(0, 10) : [],
    analisado_em: new Date().toISOString(),
    modelo: MODEL,
  };
}

function clamp(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return 5;
  return Math.max(0, Math.min(10, x));
}

async function getPendentes() {
  const u = `${SUPA_URL}/rest/v1/image_bank?select=id,url&analise_visual=is.null&excluir=eq.false&limit=${LIMIT}`;
  const r = await fetch(u, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  if (!r.ok) throw new Error("fetch pendentes " + r.status);
  return await r.json();
}

async function saveAnalise(id, analise) {
  const u = `${SUPA_URL}/rest/v1/image_bank?id=eq.${id}`;
  const r = await fetch(u, {
    method: "PATCH",
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ analise_visual: analise }),
  });
  if (!r.ok) throw new Error("save " + r.status);
}

async function runBatch(rows) {
  const results = await Promise.allSettled(
    rows.map(async (row) => {
      try {
        const a = await analyzeOne(row.url);
        await saveAnalise(row.id, a);
        return { id: row.id, ok: true, cov: a.cover_potential };
      } catch (e) {
        return { id: row.id, ok: false, err: String(e.message || e) };
      }
    }),
  );
  return results.map((r) => r.value || { ok: false, err: r.reason });
}

async function main() {
  console.log(`# Warm cache — ate ${LIMIT} imagens, concorrencia ${CONCURRENCY}`);
  const pendentes = await getPendentes();
  console.log(`pendentes: ${pendentes.length}`);
  if (!pendentes.length) {
    console.log("cache quente, nada a fazer.");
    return;
  }

  const start = Date.now();
  let done = 0;
  let failed = 0;
  let scoreSum = 0;
  let scoreN = 0;
  for (let i = 0; i < pendentes.length; i += CONCURRENCY) {
    const batch = pendentes.slice(i, i + CONCURRENCY);
    const results = await runBatch(batch);
    for (const r of results) {
      if (r.ok) {
        done++;
        if (typeof r.cov === "number") {
          scoreSum += r.cov;
          scoreN++;
        }
      } else {
        failed++;
      }
    }
    const pct = (((i + batch.length) / pendentes.length) * 100).toFixed(1);
    const elapsed = (Date.now() - start) / 1000;
    const rate = (done + failed) / elapsed;
    const eta = (pendentes.length - done - failed) / rate;
    process.stdout.write(
      `\r[${pct}%] done=${done} fail=${failed} rate=${rate.toFixed(1)}/s eta=${eta.toFixed(0)}s avg_cov=${scoreN ? (scoreSum / scoreN).toFixed(2) : "-"}   `,
    );
  }
  console.log(`\n\nok=${done} fail=${failed}  tempo total=${((Date.now() - start) / 1000).toFixed(0)}s`);
}

main().catch((e) => {
  console.error("\nERRO:", e);
  process.exit(1);
});
