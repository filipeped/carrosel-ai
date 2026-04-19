// 5 rodadas COM DETALHES rodando em paralelo via Promise.all.
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
  const t0 = Date.now();
  try {
    const ideasRes = await post("/api/ideas", nicho ? { nicho } : {});
    const top = ideasRes.ideias?.[0];
    const smart = await post("/api/search-smart", { prompt: top.titulo, candidateCount: 18 });
    const sel = smart.selection;
    const ordered = [sel.cover, ...sel.inner, sel.cta];
    const copy = await post("/api/copy", { prompt: top.titulo, images: ordered });
    const slides = copy.slides || [];
    const cap = await post("/api/caption", {
      prompt: top.titulo,
      slides,
      imageUrls: ordered.map((o) => o.url),
    });
    return {
      idx,
      ok: true,
      ms: Date.now() - t0,
      tema: top.titulo,
      hook: top.hook,
      capa: sel.cover.arquivo,
      capa_hero: sel.cover.analise_visual?.hero_element,
      capa_cov: sel.cover.analise_visual?.cover_potential,
      rationale: sel.rationale,
      imgs: ordered.map((o) => ({
        arq: o.arquivo,
        hero: o.analise_visual?.hero_element,
        cov: o.analise_visual?.cover_potential,
        desc: (o.analise_visual?.descricao_visual || "").slice(0, 140),
        plantas: (o.plantas || []).slice(0, 3),
      })),
      slides,
      caption: cap.options || [],
    };
  } catch (e) {
    return { idx, ok: false, ms: Date.now() - t0, tema: nicho || "-", error: e.message };
  }
}

function printRodada(r) {
  console.log(`\n╔═══════════════════════════════════════════════════════════════`);
  console.log(`║ RODADA ${r.idx} — ${(r.ms / 1000).toFixed(1)}s`);
  console.log(`╚═══════════════════════════════════════════════════════════════`);
  if (!r.ok) {
    console.log(`❌ FAIL: ${r.error}`);
    return;
  }
  console.log(`\n📌 TEMA: ${r.tema}`);
  console.log(`   hook: ${r.hook}`);
  console.log(`\n🖼️  IMAGENS:`);
  r.imgs.forEach((im, i) => {
    const lbl = i === 0 ? "[CAPA]" : i === 5 ? "[CTA]" : `[S${i + 1}]`;
    console.log(`   ${lbl} ${im.arq} cov=${im.cov?.toFixed?.(1) ?? "-"} — ${im.hero}`);
    console.log(`         plantas: ${(im.plantas || []).join(", ") || "(nenhuma)"}`);
    console.log(`         desc: ${im.desc}`);
  });
  console.log(`\n   rationale: ${r.rationale}`);
  console.log(`\n✍️  COPY:`);
  r.slides.forEach((s, i) => {
    const marker = i === 0 ? "CAPA  " : i === 5 ? "CTA   " : s.type.padEnd(6);
    const txt =
      s.type === "cover"
        ? `${s.topLabel || ""} | ${s.title} (italicos: ${(s.italicWords || []).join(", ")})`
        : s.type === "plantDetail"
        ? `${s.nomePopular} — ${s.nomeCientifico}`
        : s.type === "cta"
        ? `${s.pergunta} (italicos: ${(s.italicWords || []).join(", ")})`
        : `${s.topLabel || ""} | ${s.title} — ${s.subtitle || ""}`;
    console.log(`   [${i + 1}] ${marker} ${txt}`);
  });
  console.log(`\n📝 LEGENDAS (${r.caption.length}):`);
  r.caption.forEach((c, k) => {
    console.log(`   ── ${c.abordagem} ──`);
    const lines = c.legenda.split("\n").filter(Boolean);
    lines.slice(0, 4).forEach((l) => console.log(`      ${l.slice(0, 110)}`));
    if (lines.length > 4) console.log(`      [+${lines.length - 4} linhas]`);
    console.log(`      tags: ${(c.hashtags || []).slice(0, 5).join(" ")}${c.hashtags.length > 5 ? ` +${c.hashtags.length - 5}` : ""}`);
  });
}

async function main() {
  console.log(`# 5 rodadas PARALELAS contra ${BASE}\n`);
  const start = Date.now();
  const nichos = [null, "espelho dagua", "jardim de sombra", "material nobre", "autoria brasileira"];
  const results = await Promise.all(nichos.map((n, i) => viralRound(i + 1, n)));
  const totalMs = Date.now() - start;
  results.sort((a, b) => a.idx - b.idx);
  results.forEach(printRodada);
  const ok = results.filter((r) => r.ok);
  console.log(`\n\n# FINAL: ${ok.length}/${results.length} OK  |  tempo TOTAL (paralelo) = ${(totalMs / 1000).toFixed(1)}s`);
  if (ok.length) {
    const avg = ok.reduce((s, r) => s + r.ms, 0) / ok.length;
    console.log(`tempo medio POR RODADA: ${(avg / 1000).toFixed(1)}s`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
