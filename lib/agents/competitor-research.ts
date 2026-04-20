/**
 * Competitor Research — retorna 5-10 hooks de referencia pra injetar no prompt.
 * NAO eh pra copiar — eh pra calibrar o modelo com exemplos que funcionaram.
 * Dataset estatico em data/competitor-hooks.json, editavel manualmente.
 */

import fs from "node:fs";
import path from "node:path";

type HookRef = {
  hook: string;
  framework: string;
  estimate: "baixo" | "medio" | "alto";
};

type CompetitorEntry = {
  handle: string;
  style: string;
  note?: string;
  top_hooks: HookRef[];
};

type DatasetShape = {
  version: string;
  updated_at: string;
  competitors: CompetitorEntry[];
  anti_examples: string[];
};

let _cache: DatasetShape | null = null;

function loadDataset(): DatasetShape | null {
  if (_cache) return _cache;
  try {
    const p = path.join(process.cwd(), "data", "competitor-hooks.json");
    const raw = fs.readFileSync(p, "utf8");
    _cache = JSON.parse(raw) as DatasetShape;
    return _cache;
  } catch (err) {
    console.error("[competitor-research] falha ao ler dataset:", (err as Error).message);
    return null;
  }
}

/**
 * Retorna top N hooks filtrados por framework (opcional) e ordenados por estimate.
 */
export function getCompetitorHooks(opts: {
  framework?: string;
  limit?: number;
}): HookRef[] {
  const ds = loadDataset();
  if (!ds) return [];

  const all: HookRef[] = ds.competitors.flatMap((c) => c.top_hooks);
  const filtered = opts.framework
    ? all.filter((h) => h.framework === opts.framework)
    : all;
  const ord = { alto: 3, medio: 2, baixo: 1 } as Record<string, number>;
  return filtered
    .sort((a, b) => (ord[b.estimate] ?? 0) - (ord[a.estimate] ?? 0))
    .slice(0, opts.limit ?? 10);
}

/**
 * Bloco markdown pronto pra injetar num prompt de sistema.
 */
export function competitorInspirationBlock(opts: { framework?: string; limit?: number } = {}): string {
  const hooks = getCompetitorHooks({ limit: 10, ...opts });
  if (!hooks.length) return "";
  const lines = hooks.map((h) => `- "${h.hook}" [framework=${h.framework}, estimate=${h.estimate}]`).join("\n");
  const ds = loadDataset();
  const antiBlock = ds?.anti_examples.length
    ? `\n\nANTI-EXEMPLOS (NAO imite este tom):\n${ds.anti_examples.map((a) => `- ${a}`).join("\n")}`
    : "";
  return `## INSPIRACAO — hooks que viralizaram em nichos similares
(use como calibracao, NAO copie)

${lines}${antiBlock}`;
}
