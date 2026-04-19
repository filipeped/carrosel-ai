// 10 rodadas auto-viral completas — avaliacao de qualidade editorial.
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

const DEFEITOS = [];
function checkCaption(legenda, hashtags, idx, ab) {
  // emoji
  const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u;
  if (EMOJI.test(legenda || "")) DEFEITOS.push(`[${idx}/${ab}] emoji na legenda`);
  // arrows
  if (/[→↑↓←➤➡]/.test(legenda || "")) DEFEITOS.push(`[${idx}/${ab}] arrow unicode na legenda`);
  // tamanho
  const palavras = (legenda || "").split(/\s+/).filter(Boolean).length;
  if (palavras > 280) DEFEITOS.push(`[${idx}/${ab}] legenda ${palavras} palavras (>280)`);
  if (palavras < 80) DEFEITOS.push(`[${idx}/${ab}] legenda muito curta ${palavras} palavras`);
  // hashtags
  (hashtags || []).forEach((tag) => {
    const clean = tag.startsWith("#") ? tag.slice(1) : tag;
    if (/[A-Z]/.test(clean)) DEFEITOS.push(`[${idx}/${ab}] hashtag camelCase: ${tag}`);
    if (/[^a-z0-9#]/i.test(tag)) DEFEITOS.push(`[${idx}/${ab}] hashtag com char especial: ${tag}`);
  });
}

async function runOne(idx, nicho) {
  const t0 = Date.now();
  const ideas = await post("/api/ideas", nicho ? { nicho } : {});
  const top = ideas.ideias?.[0];
  if (!top) throw new Error("sem ideia");
  const smart = await post("/api/search-smart", { prompt: top.titulo, candidateCount: 18 });
  const sel = smart.selection;
  const ordered = [sel.cover, ...sel.inner, sel.cta];
  const ids = [...new Set(ordered.map((o) => o.id))].length;
  if (ids !== 6) DEFEITOS.push(`[${idx}] ids repetidos (${ids}/6)`);

  const copy = await post("/api/copy", { prompt: top.titulo, images: ordered });
  const slides = copy.slides || [];
  if (slides.length !== 6) DEFEITOS.push(`[${idx}] slides ${slides.length}/6`);
  if (slides[0]?.type !== "cover") DEFEITOS.push(`[${idx}] slide[0]=${slides[0]?.type}`);
  if (slides[5]?.type !== "cta") DEFEITOS.push(`[${idx}] slide[5]=${slides[5]?.type}`);

  const cap = await post("/api/caption", { prompt: top.titulo, slides, imageUrls: ordered.map((o) => o.url) });
  const opts = cap.options || [];
  if (opts.length < 3) DEFEITOS.push(`[${idx}] ${opts.length} legendas`);
  opts.forEach((o) => checkCaption(o.legenda, o.hashtags, idx, o.abordagem));

  const scores = {
    cover: sel.cover.analise_visual?.cover_potential,
    inner_avg: sel.inner.reduce((s, i) => s + (i.analise_visual?.cover_potential || 0), 0) / sel.inner.length,
    cta: sel.cta.analise_visual?.cover_potential,
  };
  return { idx, tema: top.titulo, capa: sel.cover.arquivo, ms: Date.now() - t0, scores, opts_count: opts.length };
}

async function main() {
  console.log(`# 10 rodadas auto-viral — ${BASE}\n`);
  const nichos = [null, null, "espelho dagua", "jardim seco", "rooftop urbano", null, "piscina borda infinita", "muro verde", "pergolado", "casa de praia"];
  const results = [];
  for (let i = 0; i < 10; i++) {
    process.stdout.write(`${i + 1}/10 ${nichos[i] ? "(" + nichos[i] + ") " : ""}... `);
    try {
      const r = await runOne(i + 1, nichos[i]);
      results.push(r);
      process.stdout.write(`OK ${(r.ms/1000).toFixed(0)}s cov=${r.scores.cover.toFixed(1)}/${r.scores.inner_avg.toFixed(1)}/${r.scores.cta.toFixed(1)}\n`);
    } catch (e) {
      results.push({ idx: i + 1, error: e.message });
      process.stdout.write(`FAIL ${e.message.slice(0, 80)}\n`);
    }
  }
  const ok = results.filter((r) => !r.error);
  console.log(`\n## ${ok.length}/${results.length} OK`);
  if (ok.length) {
    const covAvg = ok.reduce((s, r) => s + r.scores.cover, 0) / ok.length;
    const covMax = Math.max(...ok.map((r) => r.scores.cover));
    const covMin = Math.min(...ok.map((r) => r.scores.cover));
    console.log(`cover_potential: avg ${covAvg.toFixed(2)} range [${covMin}-${covMax}]`);
    console.log(`tempo medio: ${(ok.reduce((s, r) => s + r.ms, 0) / ok.length / 1000).toFixed(1)}s`);
  }
  console.log(`\n## Defeitos encontrados (${DEFEITOS.length}):`);
  DEFEITOS.forEach((d) => console.log(`  - ${d}`));
  if (!DEFEITOS.length) console.log(`  (nenhum — qualidade padrao)`);
  console.log(`\n## Temas gerados:`);
  ok.forEach((r) => console.log(`  [${r.idx}] ${r.tema}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
