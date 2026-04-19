// Testa o /api/ideas 3 vezes com nichos diferentes e imprime as 24 ideias.
const BASE = process.argv[2] || "http://localhost:3001";

const NICHOS = [
  null,
  "espelho dagua e reflexo",
  "jardim de sombra com autoria",
];

async function runOne(nicho, idx) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/ideas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nicho ? { nicho } : {}),
  });
  const data = await r.json();
  const ms = Date.now() - t0;
  return { idx, nicho, ms, data };
}

async function main() {
  console.log(`# /api/ideas — 3 rodadas\n`);
  for (let i = 0; i < NICHOS.length; i++) {
    const { idx, nicho, ms, data } = await runOne(NICHOS[i], i + 1);
    console.log(`\n## Rodada ${idx} — nicho: ${nicho || "(aberto)"} — ${(ms / 1000).toFixed(1)}s`);
    if (data.error) {
      console.log(`  ERRO: ${data.error}`);
      continue;
    }
    (data.ideias || []).forEach((id, i) => {
      console.log(`  ${i + 1}. ${id.titulo}`);
      console.log(`     hook: ${id.hook}`);
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
