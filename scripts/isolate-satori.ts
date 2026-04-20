process.env.USE_SATORI = "1";

// Teste isolado — chama direto o endpoint com variações
async function test(name: string, payload: any) {
  const r = await fetch("http://localhost:3002/api/render-slide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const t0 = Date.now();
  const body = await r.text();
  const ok = r.status === 200;
  console.log(`${name}: ${r.status} ${Date.now() - t0}ms`);
  if (!ok) console.log(`  error:`, body.slice(0, 200));
}

const IMG = "https://kzcrvxzgbmmcjegqhbkf.supabase.co/storage/v1/object/public/image-bank/IMG_3706.jpg";

(async () => {
  // cover progressivo
  await test("cover-empty", { slide: { type: "cover", title: "", italicWords: [], numeral: "" }, imageUrl: IMG });
  await test("cover-simple", { slide: { type: "cover", title: "X", italicWords: [] }, imageUrl: IMG });
  await test("cover-with-italic", { slide: { type: "cover", title: "X Y", italicWords: ["X"] }, imageUrl: IMG });
  await test("cover-numeral", { slide: { type: "cover", title: "X", italicWords: [], numeral: "5" }, imageUrl: IMG });
  await test("plantDetail-simple", { slide: { type: "plantDetail", nomePopular: "X", nomeCientifico: "Y" }, imageUrl: IMG });
  await test("inspiration-simple", { slide: { type: "inspiration", title: "X", subtitle: "Y" }, imageUrl: IMG });
  await test("cta-simple", { slide: { type: "cta", pergunta: "X", italicWords: [] }, imageUrl: IMG });
})();
