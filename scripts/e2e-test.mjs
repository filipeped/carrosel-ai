// End-to-end: ideias -> smart search -> copy -> caption com vision.
const BASE = process.argv[2] || "http://localhost:3001";

async function step(label, fn) {
  console.log(`\n--- ${label} ---`);
  const t0 = Date.now();
  try {
    const r = await fn();
    console.log(`${label} OK  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return r;
  } catch (e) {
    console.log(`${label} FAIL  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${e.message}`);
    throw e;
  }
}

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

async function runOne(prompt, idx) {
  console.log(`\n========================================`);
  console.log(`RODADA ${idx}: "${prompt}"`);
  console.log(`========================================`);

  const smart = await step("1. /api/search-smart", () =>
    post("/api/search-smart", { prompt, candidateCount: 18 }),
  );
  const sel = smart.selection;
  console.log(`  capa: ${sel.cover.arquivo} (cover=${sel.cover.analise_visual.cover_potential})`);
  console.log(`  inner: ${sel.inner.map((i) => i.arquivo).join(", ")}`);
  console.log(`  cta: ${sel.cta.arquivo}`);
  console.log(`  rationale: ${sel.rationale}`);

  const ordered = [sel.cover, ...sel.inner, sel.cta];
  const allIds = ordered.map((i) => i.id);
  const unique = new Set(allIds).size;
  if (unique !== 6) console.log(`  ⚠️ NAO UNIQUE: ${allIds.join(",")}`);

  const copyRes = await step("2. /api/copy", () =>
    post("/api/copy", { prompt, images: ordered }),
  );
  const slides = copyRes.slides || [];
  console.log(`  slides gerados: ${slides.length}`);
  slides.forEach((s, i) => {
    const txt = s.title || s.nomePopular || s.pergunta || "?";
    console.log(`    [${i + 1}] ${s.type}: ${txt}`);
  });
  if (slides[0]?.type !== "cover") console.log(`  ⚠️ slide 0 nao eh cover`);
  if (slides[5]?.type !== "cta") console.log(`  ⚠️ slide 5 nao eh cta`);

  const capRes = await step("3. /api/caption (com vision)", () =>
    post("/api/caption", {
      prompt,
      slides,
      imageUrls: ordered.map((i) => i.url),
    }),
  );
  const opts = capRes.options || [];
  console.log(`  legendas geradas: ${opts.length}`);
  opts.forEach((o, i) => {
    console.log(`    [${i + 1}] ${o.abordagem}`);
    console.log(`        hook: ${o.hook}`);
    console.log(`        hashtags: ${(o.hashtags || []).length} tags`);
  });

  return { idx, prompt, smart, slides, opts, unique };
}

async function main() {
  console.log(`# E2E test — ${BASE}`);
  const prompts = [
    "Corten basalto ou seixo — o peso visual que cada material impoe ao rooftop",
    "3 especies brasileiras de sub-bosque que Burle Marx usava e o mercado esqueceu",
    "Por que espelho d'agua sem lastro visual esvazia qualquer composicao",
  ];
  const results = [];
  for (let i = 0; i < prompts.length; i++) {
    try {
      const r = await runOne(prompts[i], i + 1);
      results.push(r);
    } catch (e) {
      results.push({ idx: i + 1, prompt: prompts[i], error: e.message });
    }
  }

  console.log(`\n\n# SUMARIO\n`);
  results.forEach((r) => {
    if (r.error) {
      console.log(`[${r.idx}] FAIL: ${r.error}`);
    } else {
      const uniqueOk = r.unique === 6 ? "✓" : "✗";
      const slidesOk =
        r.slides.length === 6 && r.slides[0]?.type === "cover" && r.slides[5]?.type === "cta"
          ? "✓"
          : "✗";
      const capsOk = r.opts.length >= 3 ? "✓" : "✗";
      console.log(`[${r.idx}] ${uniqueOk} unique  ${slidesOk} 6 slides (cover+cta)  ${capsOk} 3 legendas`);
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
