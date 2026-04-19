// Teste de QUALIDADE — simula o botao 'sugerir + gerar viral' 5 vezes
// e imprime TUDO: tema gerado, capa, copy dos slides, 3 legendas.
// Pra avaliacao editorial manual.
const BASE = process.argv[2] || "http://localhost:3001";

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

async function viralRound(idx, nicho) {
  console.log(`\n\n╔════════════════════════════════════════════════════════════════`);
  console.log(`║ RODADA ${idx}${nicho ? " — nicho: " + nicho : ""}`);
  console.log(`╚════════════════════════════════════════════════════════════════`);
  const t0 = Date.now();

  // 1. IDEAS — pega a #1
  const ideasRes = await post("/api/ideas", nicho ? { nicho } : {});
  const top = ideasRes.ideias?.[0];
  console.log(`\n📌 TEMA VIRAL ESCOLHIDO`);
  console.log(`   titulo: ${top.titulo}`);
  console.log(`   hook:   ${top.hook}`);

  // 2. SEARCH-SMART
  const smart = await post("/api/search-smart", { prompt: top.titulo, candidateCount: 18 });
  const sel = smart.selection;
  const ordered = [sel.cover, ...sel.inner, sel.cta];
  console.log(`\n🖼️  CURADORIA VISUAL`);
  console.log(`   capa: ${sel.cover.arquivo} — ${sel.cover.analise_visual.hero_element} (cov=${sel.cover.analise_visual.cover_potential})`);
  sel.inner.forEach((i, k) => console.log(`   s${k + 2}: ${i.arquivo} — ${i.analise_visual.hero_element} (cov=${i.analise_visual.cover_potential})`));
  console.log(`   cta:  ${sel.cta.arquivo} — ${sel.cta.analise_visual.hero_element} (cov=${sel.cta.analise_visual.cover_potential})`);
  console.log(`   rationale: ${sel.rationale}`);

  // 3. COPY
  const copy = await post("/api/copy", { prompt: top.titulo, images: ordered });
  const slides = copy.slides || [];
  console.log(`\n✍️  COPY DOS 6 SLIDES`);
  slides.forEach((s, i) => {
    if (s.type === "cover") {
      console.log(`   [1] CAPA:  topLabel="${s.topLabel || ""}" | numeral="${s.numeral || ""}"`);
      console.log(`              titulo: ${s.title}`);
      console.log(`              italicos: ${(s.italicWords || []).join(", ")}`);
    } else if (s.type === "plantDetail") {
      console.log(`   [${i + 1}] PLANTA: ${s.nomePopular} — ${s.nomeCientifico}`);
    } else if (s.type === "cta") {
      console.log(`   [6] CTA: ${s.pergunta}`);
      console.log(`              italicos: ${(s.italicWords || []).join(", ")}`);
    } else {
      console.log(`   [${i + 1}] INSP:  ${s.topLabel || ""} | ${s.title}`);
      console.log(`              ${s.subtitle || ""}`);
    }
  });

  // 4. CAPTION COM VISION
  const caption = await post("/api/caption", {
    prompt: top.titulo,
    slides,
    imageUrls: ordered.map((o) => o.url),
  });
  const opts = caption.options || [];
  console.log(`\n📝 LEGENDAS (3 abordagens, leu fotos com Vision)`);
  opts.forEach((o, k) => {
    console.log(`\n   ─── ${o.abordagem} ───`);
    console.log(`   ${o.legenda}`);
    console.log(`   tags: ${(o.hashtags || []).join(" ")}`);
  });

  console.log(`\n⏱  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { idx, tema: top.titulo, capa: sel.cover.arquivo, ms: Date.now() - t0 };
}

async function main() {
  console.log(`# Quality test — 5 rodadas auto-viral completas contra ${BASE}`);
  const nichos = [null, "espelho dagua", "jardim de sombra", "material nobre", "autoria brasileira"];
  const results = [];
  for (let i = 0; i < 5; i++) {
    try {
      const r = await viralRound(i + 1, nichos[i]);
      results.push({ ...r, ok: true });
    } catch (e) {
      console.log(`\n❌ RODADA ${i + 1} FAIL: ${e.message}`);
      results.push({ idx: i + 1, ok: false, error: e.message });
    }
  }
  console.log(`\n\n# FINAL: ${results.filter((r) => r.ok).length}/5 OK`);
  results.forEach((r) => {
    if (r.ok) console.log(`  [${r.idx}] ${(r.ms / 1000).toFixed(1)}s — ${r.tema}`);
    else console.log(`  [${r.idx}] FAIL: ${r.error}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
