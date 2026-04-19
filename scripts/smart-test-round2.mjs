// 10 prompts NOVOS pra validar robustez.
const BASE = process.argv[2] || "http://localhost:3001";

const PROMPTS = [
  "O jardim de Isabel Duprat no Morumbi e o que ele ensina sobre massa e vazio",
  "Corten, basalto ou seixo na entrada de uma propriedade",
  "4 erros de escala que denunciam pergolado sem projeto",
  "5 folhagens de contraste alto que sustentam jardins de sombra filtrada",
  "Como construir densidade visual em jardim noturno sem spot de luz",
  "Por que menos especies deixam o jardim parecer mais rico",
  "O principio de escalonamento de Burle Marx que poucos replicam",
  "Projeto de parede viva com projeto autoral versus ornamental",
  "3 especies de sub-bosque brasileiras que o mercado esqueceu",
  "Jardim seco autoral com travertino e gramineas ornamentais",
];

async function runOne(prompt, idx) {
  const t0 = Date.now();
  try {
    // 1. search-smart
    let r = await fetch(`${BASE}/api/search-smart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, candidateCount: 18 }),
    });
    let d = await r.json();
    if (d.error) return { idx, prompt, stage: "search", error: d.error };
    const sel = d.selection;
    const ordered = [sel.cover, ...sel.inner, sel.cta];
    const ids = new Set(ordered.map((o) => o.id));
    if (ids.size !== 6) return { idx, prompt, stage: "unique", error: "nao unique" };

    // 2. copy
    r = await fetch(`${BASE}/api/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, images: ordered }),
    });
    d = await r.json();
    if (d.error) return { idx, prompt, stage: "copy", error: d.error };
    const slides = d.slides || [];
    if (slides.length !== 6) return { idx, prompt, stage: "slides_count", error: `${slides.length} slides` };
    if (slides[0].type !== "cover") return { idx, prompt, stage: "slide_cover", error: slides[0].type };
    if (slides[5].type !== "cta") return { idx, prompt, stage: "slide_cta", error: slides[5].type };

    // 3. caption com vision
    r = await fetch(`${BASE}/api/caption`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, slides, imageUrls: ordered.map((o) => o.url) }),
    });
    d = await r.json();
    if (d.error) return { idx, prompt, stage: "caption", error: d.error };
    const opts = d.options || [];
    if (opts.length < 3) return { idx, prompt, stage: "options_count", error: `${opts.length} opts` };

    return {
      idx,
      prompt,
      ms: Date.now() - t0,
      ok: true,
      capa: sel.cover.arquivo,
      cover_pot: sel.cover.analise_visual.cover_potential,
      abordagens: opts.map((o) => o.abordagem),
    };
  } catch (e) {
    return { idx, prompt, stage: "crash", error: String(e.message || e) };
  }
}

async function main() {
  console.log(`# Rodada final — 10 prompts NOVOS, e2e completo\n`);
  const results = [];
  for (let i = 0; i < PROMPTS.length; i++) {
    process.stdout.write(`${i + 1}/${PROMPTS.length}  "${PROMPTS[i].slice(0, 60)}"...  `);
    const r = await runOne(PROMPTS[i], i + 1);
    results.push(r);
    if (r.ok) process.stdout.write(`OK  ${(r.ms / 1000).toFixed(1)}s  capa=${r.capa} (cov=${r.cover_pot})\n`);
    else process.stdout.write(`FAIL [${r.stage}]  ${String(r.error).slice(0, 120)}\n`);
  }
  const ok = results.filter((r) => r.ok);
  console.log(`\n## Resumo final: ${ok.length}/${results.length} OK\n`);
  if (results.length - ok.length > 0) {
    console.log("### Falhas:");
    results.filter((r) => !r.ok).forEach((r) => console.log(`  [${r.idx}] stage=${r.stage}: ${String(r.error).slice(0, 200)}`));
  }
  if (ok.length) {
    const avgMs = ok.reduce((s, r) => s + r.ms, 0) / ok.length;
    console.log(`\ntempo medio E2E (search+copy+caption): ${(avgMs / 1000).toFixed(1)}s`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
