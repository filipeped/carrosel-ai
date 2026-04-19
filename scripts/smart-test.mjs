// Roda 10 prompts contra /api/search-smart e imprime resumo.
// Uso: node scripts/smart-test.mjs [BASE_URL]

const BASE = process.argv[2] || "http://localhost:3001";

const PROMPTS = [
  "5 palmeiras autorais pra entrada monumental",
  "Projeto de paisagismo com espelho d'agua contemporaneo",
  "Jardim seco com pedras portuguesas e suculentas",
  "3 erros de composicao que denunciam falta de projeto paisagistico",
  "Muro verde tropical com folhagens de contraste",
  "Piscina de borda infinita em casa de campo",
  "Paisagismo noturno com iluminacao cenica autoral",
  "Jardim monocromatico verde com texturas diferentes",
  "Pergolado com trepadeiras aromaticas e luz filtrada",
  "Corredor lateral com pisantes e maciço tropical denso",
];

async function runOne(prompt, idx) {
  const t0 = Date.now();
  let res;
  try {
    const r = await fetch(`${BASE}/api/search-smart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, candidateCount: 18 }),
    });
    const data = await r.json();
    const ms = Date.now() - t0;
    if (!r.ok || data.error) {
      return { idx, prompt, ms, ok: false, error: data.error || `HTTP ${r.status}` };
    }
    const sel = data.selection || {};
    const cov = sel.cover?.analise_visual || {};
    const inner = (sel.inner || []).map((x) => x?.analise_visual || {});
    const cta = sel.cta?.analise_visual || {};
    const avgInnerCover = inner.length
      ? inner.reduce((s, a) => s + (a.cover_potential || 0), 0) / inner.length
      : 0;
    const allAnalyzed = data.allAnalyzed || [];
    const altsCount = (sel.alternatives || []).length;

    return {
      idx,
      prompt,
      ms,
      ok: true,
      total: allAnalyzed.length,
      cover_arquivo: sel.cover?.arquivo,
      cover_potential: cov.cover_potential,
      cover_composicao: cov.composicao,
      cover_qualidade: cov.qualidade,
      cover_hero: cov.hero_element,
      cover_desc: cov.descricao_visual?.slice(0, 140),
      inner_ids: (sel.inner || []).map((x) => x?.id),
      inner_avg_cover: Number(avgInnerCover.toFixed(2)),
      cta_cover: cta.cover_potential,
      rationale: sel.rationale,
      alts: altsCount,
    };
  } catch (e) {
    return { idx, prompt, ms: Date.now() - t0, ok: false, error: String(e.message || e) };
  }
}

async function main() {
  console.log(`# Smart pipeline — 10 testes contra ${BASE}\n`);
  const results = [];
  for (let i = 0; i < PROMPTS.length; i++) {
    process.stdout.write(`${i + 1}/${PROMPTS.length}  "${PROMPTS[i].slice(0, 60)}"...  `);
    const r = await runOne(PROMPTS[i], i + 1);
    results.push(r);
    if (r.ok) {
      process.stdout.write(`OK  ${(r.ms / 1000).toFixed(1)}s  cover=${r.cover_potential?.toFixed(1)}/${r.cover_composicao?.toFixed(1)}/${r.cover_qualidade?.toFixed(1)}\n`);
    } else {
      process.stdout.write(`FAIL  ${(r.ms / 1000).toFixed(1)}s  ${r.error}\n`);
    }
  }

  console.log("\n## Resumo\n");
  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  console.log(`sucessos: ${ok.length}/${results.length}`);
  console.log(`falhas: ${fail.length}`);
  if (fail.length) {
    console.log(`\n### Falhas:`);
    fail.forEach((f) => console.log(`  - [${f.idx}] ${f.prompt}\n    ${f.error}`));
  }
  if (ok.length) {
    const avgMs = ok.reduce((s, r) => s + r.ms, 0) / ok.length;
    const avgCover = ok.reduce((s, r) => s + (r.cover_potential || 0), 0) / ok.length;
    const avgComp = ok.reduce((s, r) => s + (r.cover_composicao || 0), 0) / ok.length;
    const avgQual = ok.reduce((s, r) => s + (r.cover_qualidade || 0), 0) / ok.length;
    const avgInner = ok.reduce((s, r) => s + (r.inner_avg_cover || 0), 0) / ok.length;
    const avgCta = ok.reduce((s, r) => s + (r.cta_cover || 0), 0) / ok.length;
    const avgAlts = ok.reduce((s, r) => s + (r.alts || 0), 0) / ok.length;
    console.log(`\n### Metricas medias (ok):`);
    console.log(`  tempo medio: ${(avgMs / 1000).toFixed(1)}s`);
    console.log(`  cover (capa): cover_potential=${avgCover.toFixed(2)} composicao=${avgComp.toFixed(2)} qualidade=${avgQual.toFixed(2)}`);
    console.log(`  inner avg cover_potential: ${avgInner.toFixed(2)}`);
    console.log(`  cta cover_potential: ${avgCta.toFixed(2)}`);
    console.log(`  alternativas retornadas: ${avgAlts.toFixed(0)}`);

    console.log(`\n### Exemplos de rationale IA:`);
    ok.slice(0, 5).forEach((r) => console.log(`  [${r.idx}] "${r.prompt.slice(0, 45)}..." → ${r.rationale}`));

    console.log(`\n### Capas escolhidas (cover_potential):`);
    ok.forEach((r) => console.log(`  [${r.idx}] ${r.cover_arquivo} (${r.cover_potential}) — ${r.cover_hero} | ${r.cover_desc}`));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
