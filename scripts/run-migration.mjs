#!/usr/bin/env node
/**
 * Roda um arquivo SQL no Postgres via DATABASE_URL.
 * Uso: node scripts/run-migration.mjs scripts/migration-plant-id.sql
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = join(__dirname, "..", ".env.local");
try {
  const raw = readFileSync(envFile, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"]*)"?$/);
    if (m) process.env[m[1]] = m[2];
  }
} catch {}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ausente");
  process.exit(1);
}

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error("Uso: node scripts/run-migration.mjs <arquivo.sql>");
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");
console.log(`Conectando... rodando ${sqlPath}`);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(sql);
  console.log("✓ Migration executada com sucesso.");
} catch (e) {
  console.error("✗ Erro:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
