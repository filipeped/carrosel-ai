// Pré-warming via endpoint interno /api/warm-one (usa o SDK OpenAI apontando
// pro gateway, que tem retries embutidos — mais robusto que chamar fetch cru).
import { readFileSync } from "node:fs";

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

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const BASE = args.base || "http://localhost:3001";
const LIMIT = Number(args.limit || 2000);
const CONCURRENCY = Number(args.concurrency || 3);

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getPendentes() {
  const u = `${SUPA_URL}/rest/v1/image_bank?select=id,url&analise_visual=is.null&excluir=eq.false&limit=${LIMIT}`;
  const r = await fetch(u, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } });
  return await r.json();
}

async function warmOne(row) {
  const r = await fetch(`${BASE}/api/warm-one`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: row.id, url: row.url }),
  });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
  return d.analise;
}

async function main() {
  console.log(`# Warm cache — ate ${LIMIT}, concorrencia ${CONCURRENCY}, via ${BASE}`);
  const pend = await getPendentes();
  console.log(`pendentes: ${pend.length}`);
  if (!pend.length) return;

  const start = Date.now();
  let done = 0,
    failed = 0,
    scoreSum = 0,
    scoreN = 0;
  for (let i = 0; i < pend.length; i += CONCURRENCY) {
    const batch = pend.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(warmOne));
    results.forEach((r, j) => {
      if (r.status === "fulfilled") {
        done++;
        const cov = r.value?.cover_potential;
        if (typeof cov === "number") {
          scoreSum += cov;
          scoreN++;
        }
      } else {
        failed++;
        if (process.env.WARM_DEBUG === "1")
          console.error(`[fail ${batch[j].id}]`, String(r.reason?.message || r.reason).slice(0, 120));
      }
    });
    const pct = (((i + batch.length) / pend.length) * 100).toFixed(1);
    const elapsed = (Date.now() - start) / 1000;
    const rate = (done + failed) / elapsed;
    const eta = (pend.length - done - failed) / (rate || 0.1);
    process.stdout.write(
      `\r[${pct}%] done=${done} fail=${failed} rate=${rate.toFixed(1)}/s eta=${eta.toFixed(0)}s avg=${scoreN ? (scoreSum / scoreN).toFixed(2) : "-"}    `,
    );
  }
  console.log(`\n\nok=${done} fail=${failed}  tempo=${((Date.now() - start) / 1000).toFixed(0)}s`);
}

main().catch((e) => {
  console.error("\nERRO:", e);
  process.exit(1);
});
