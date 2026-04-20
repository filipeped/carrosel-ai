#!/usr/bin/env node
/**
 * Auditoria de qualidade das fotos do banco (image_bank).
 *
 * Verifica cada URL e classifica:
 *   HD (>= 2160px na maior dimensao): OK pra captura 2.5x
 *   Media (1500-2159): ok mas nao ideal (upscale no fundo)
 *   Baixa (< 1500): vai aparecer borrada no slide final
 *
 * Uso: node scripts/audit-image-quality.mjs
 * Requer: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no .env.local
 *
 * Output: relatorio no console + audit-images.csv com ids + status.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY nao setados em .env.local");
  process.exit(1);
}

const sb = createClient(url, key);
const LIMIT = Number(process.argv[2] || 200);

/** Faz HEAD na URL e le dimensoes via GET de 32 bytes (PNG/JPEG header). */
async function getImageDimensions(imgUrl) {
  try {
    const res = await fetch(imgUrl, { method: "GET", headers: { Range: "bytes=0-2048" } });
    if (!res.ok && res.status !== 206) return null;
    const buf = Buffer.from(await res.arrayBuffer());

    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      return { width, height, format: "png" };
    }
    // JPEG: procura marcador SOF0 (0xFFC0) ou SOF2 (0xFFC2)
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = buf[i + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          const height = buf.readUInt16BE(i + 5);
          const width = buf.readUInt16BE(i + 7);
          return { width, height, format: "jpeg" };
        }
        const len = buf.readUInt16BE(i + 2);
        i += 2 + len;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function classify(w, h) {
  const max = Math.max(w, h);
  if (max >= 2160) return "HD";
  if (max >= 1500) return "media";
  return "baixa";
}

async function main() {
  console.log(`Lendo ${LIMIT} imagens de image_bank...\n`);
  const { data, error } = await sb
    .from("image_bank")
    .select("id, arquivo, url")
    .limit(LIMIT);
  if (error) throw new Error(error.message);

  const results = [];
  let done = 0;
  for (const row of data) {
    done++;
    if (done % 10 === 0) process.stdout.write(`\r  ${done}/${data.length}...`);
    const dims = row.url ? await getImageDimensions(row.url) : null;
    const status = dims ? classify(dims.width, dims.height) : "erro";
    results.push({
      id: row.id,
      arquivo: row.arquivo,
      url: row.url,
      width: dims?.width ?? "?",
      height: dims?.height ?? "?",
      status,
    });
  }
  process.stdout.write("\r                                  \r");

  const hd = results.filter((r) => r.status === "HD");
  const media = results.filter((r) => r.status === "media");
  const baixa = results.filter((r) => r.status === "baixa");
  const erro = results.filter((r) => r.status === "erro");

  console.log("===== RESUMO =====");
  console.log(`Total auditadas: ${results.length}`);
  console.log(`HD       (>=2160): ${hd.length} (${((hd.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`Media    (1500-2159): ${media.length} (${((media.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`Baixa    (<1500): ${baixa.length} (${((baixa.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`Erro/inacessivel: ${erro.length}`);
  console.log("");

  if (baixa.length > 0) {
    console.log("TOP 20 mais criticas (baixa resolucao):");
    baixa
      .slice(0, 20)
      .forEach((r) => console.log(`  id=${r.id} ${r.width}x${r.height} ${r.arquivo}`));
  }

  // CSV
  const csvPath = path.resolve(__dirname, "..", "audit-images.csv");
  const rows = ["id,arquivo,width,height,status,url"];
  for (const r of results) {
    rows.push(`${r.id},"${r.arquivo}",${r.width},${r.height},${r.status},"${r.url || ""}"`);
  }
  fs.writeFileSync(csvPath, rows.join("\n"));
  console.log(`\nCSV completo: ${csvPath}`);
  console.log("\nCorrecao sugerida: exportar fotos em HD (>=2000x2500) das baixa-res mais usadas.");
}

main().catch((e) => {
  console.error("falhou:", e.message);
  process.exit(1);
});
