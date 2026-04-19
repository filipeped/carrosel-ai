// Purge de imagens abaixo do padrao — preview + opcao de aplicar.
// Uso:
//   node scripts/purge-low-quality.mjs              — preview (dry-run)
//   node scripts/purge-low-quality.mjs --apply       — aplica (marca excluir=true)
//   node scripts/purge-low-quality.mjs --cover=6     — muda limite de cover_potential
import { readFileSync } from "node:fs";

try {
  const env = readFileSync(".env.local", "utf8");
  env.split("\n").forEach((line) => {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) {
      const v = m[2].replace(/^"|"$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  });
} catch {}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const BASE = args.base || "http://localhost:3001";
const APPLY = !!args.apply;
const COVER = args.cover || 5;
const COMP = args.comp || 5;
const QUAL = args.qual || 6;

async function main() {
  const qs = `?cover=${COVER}&comp=${COMP}&qual=${QUAL}`;
  console.log(`# Purge de imagens abaixo do padrao`);
  console.log(`Limites: cover_potential<${COVER} E composicao<${COMP} E qualidade<${QUAL}`);
  console.log(`Modo: ${APPLY ? "APLICAR (marcar excluir=true)" : "PREVIEW (dry-run)"}\n`);

  // 1. GET preview
  const gr = await fetch(`${BASE}/api/admin/curadoria-imagens${qs}`);
  const gd = await gr.json();
  if (gd.error) {
    console.error("ERRO:", gd.error);
    process.exit(1);
  }
  console.log(`Total analisadas: ${gd.total_analisadas}`);
  console.log(`Seriam removidas: ${gd.seriam_removidas} (${((gd.seriam_removidas / gd.total_analisadas) * 100).toFixed(1)}%)`);
  console.log(`Mantidas:         ${gd.mantidas}\n`);

  if (gd.preview?.length) {
    console.log(`Exemplos das 30 piores (que seriam removidas):`);
    gd.preview.forEach((p, i) => {
      console.log(
        `  ${i + 1}. [${p.id}] ${p.arquivo}  cov=${p.cover} comp=${p.comp} qual=${p.qual}`,
      );
      if (p.desc) console.log(`     ${p.desc.slice(0, 100)}`);
    });
  }

  if (!APPLY) {
    console.log(`\n(preview) nada foi alterado. Use --apply pra executar.`);
    return;
  }

  console.log(`\nAplicando...`);
  const pr = await fetch(`${BASE}/api/admin/curadoria-imagens${qs}`, { method: "POST" });
  const pd = await pr.json();
  if (pd.error) {
    console.error("ERRO:", pd.error);
    process.exit(1);
  }
  console.log(`OK — marcadas como excluidas: ${pd.marcadas_excluidas}`);
  console.log(`Essas imagens nao aparecerao mais na busca de carrosseis.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
