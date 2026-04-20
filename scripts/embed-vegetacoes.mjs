#!/usr/bin/env node
/**
 * Popula embeddings na tabela vegetacoes.
 * Uso: node scripts/embed-vegetacoes.mjs
 * Requer envs: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carrega .env.local manual (evita depender de dotenv)
const envFile = join(__dirname, "..", ".env.local");
const env = {};
try {
  const raw = readFileSync(envFile, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"]*)"?$/);
    if (m) env[m[1]] = m[2];
  }
} catch {}
Object.assign(process.env, env);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error("Missing env vars");
  process.exit(1);
}

async function sbFetch(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

async function embed(text) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.data[0].embedding;
}

function buildText(v) {
  const parts = [
    v.nome_popular,
    v.nome_cientifico,
    v.outros_nomes,
    v.descricao?.slice(0, 600),
    v.categorias,
    v.familia && `família ${v.familia}`,
    v.luminosidade && `luminosidade: ${v.luminosidade}`,
    v.clima && `clima: ${v.clima}`,
    v.origem && `origem: ${v.origem}`,
    v.altura && `altura: ${v.altura}`,
    v.ciclo_vida && `ciclo: ${v.ciclo_vida}`,
  ].filter(Boolean);
  return parts.join(" | ");
}

async function main() {
  console.log("Fetching vegetacoes sem embedding...");
  const rows = await sbFetch(
    "/vegetacoes?select=id,nome_popular,nome_cientifico,descricao,outros_nomes,categorias,familia,luminosidade,clima,origem,altura,ciclo_vida&embedding=is.null&limit=2000",
  );
  console.log(`Total a processar: ${rows.length}`);
  if (!rows.length) {
    console.log("Nada a fazer. Todas já tem embedding.");
    return;
  }

  let done = 0;
  let errors = 0;
  for (const v of rows) {
    try {
      const text = buildText(v);
      if (!text.trim()) {
        console.warn(`  skip ${v.id} (sem texto)`);
        continue;
      }
      const emb = await embed(text);
      await sbFetch(`/vegetacoes?id=eq.${encodeURIComponent(v.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ embedding: emb }),
      });
      done++;
      if (done % 25 === 0) {
        console.log(`  ${done}/${rows.length} (${v.nome_popular || v.nome_cientifico})`);
      }
    } catch (e) {
      errors++;
      console.error(`  erro em ${v.id}: ${e.message}`);
    }
    // rate limit soft — OpenAI embeddings tier 1 = 500 RPM
    await new Promise((r) => setTimeout(r, 120));
  }
  console.log(`\nDone. ${done} embeddings gerados. ${errors} erros.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
