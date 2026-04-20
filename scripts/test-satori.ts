// Validacao do render via Satori — simula o path de producao.
// Usa: npx tsx scripts/test-satori.ts

process.env.USE_SATORI = "1";

import { writeFileSync, mkdirSync } from "node:fs";
import { renderHtmlToPng } from "../lib/renderer";
import { renderCover } from "../templates/cover";
import { renderPlantDetail } from "../templates/plantDetail";
import { renderInspiration } from "../templates/inspiration";
import { renderCta } from "../templates/cta";

const IMG = "https://kzcrvxzgbmmcjegqhbkf.supabase.co/storage/v1/object/public/image-bank/IMG_3706.jpg";

async function test(name: string, html: string) {
  const t0 = Date.now();
  try {
    const buf = await renderHtmlToPng(html);
    const ms = Date.now() - t0;
    try { mkdirSync("./tmp", { recursive: true }); } catch {}
    writeFileSync(`./tmp/satori-${name}.png`, buf);
    console.log(`${name}: OK ${ms}ms ${buf.length}B`);
    return true;
  } catch (e: any) {
    const ms = Date.now() - t0;
    console.error(`${name}: FAIL ${ms}ms — ${e.message}`);
    return false;
  }
}

(async () => {
  const results: boolean[] = [];
  results.push(await test("cover", renderCover({ imageUrl: IMG, topLabel: "GUIA", numeral: "5", title: "5 plantas tropicais", italicWords: ["tropicais"], edition: "ED 01" })));
  results.push(await test("plantDetail", renderPlantDetail({ imageUrl: IMG, nomePopular: "Pacova", nomeCientifico: "Philodendron bipinnatifidum", index: 2, total: 5 })));
  results.push(await test("inspiration", renderInspiration({ imageUrl: IMG, title: "Volume sem peso", subtitle: "Palmeiras criam escala sem fechar o espaço", topLabel: "INSPIRACAO", index: 3, total: 5 })));
  results.push(await test("cta", renderCta({ imageUrl: IMG, pergunta: "Qual delas vai pra sua casa?", italicWords: ["sua casa"] })));
  const passed = results.filter((r) => r).length;
  console.log(`\n${passed}/${results.length} passaram`);
  process.exit(passed === results.length ? 0 : 1);
})();
