import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy init — evita throw no build quando env vars ainda nao estao setadas.
let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase env vars nao configuradas (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)");
  }
  _supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabase;
}

export type ImageBankRow = {
  id: number;
  arquivo: string;
  url: string;
  tipo_area: string;
  estilo: string[];
  descricao: string;
  tipos_plantas: string[];
  elementos_form: string[];
  porte: string;
  manutencao: string;
  clima: string;
  exposicao_solar: string;
  cores: string[];
  mood: string[];
  plantas: string[];
  localizacao: string[];
  tipo_piso: string[];
  estruturas: string[];
  faixa_investimento: string;
  pet_friendly: boolean;
  kid_friendly: boolean;
};

export type VegetacaoRow = {
  id: string;
  nome_popular: string;
  nome_cientifico: string;
  descricao: string;
  imagem_principal: string;
  todas_imagens: string[];
  categorias: string;
  outros_nomes: string;
  luminosidade: string;
  origem: string;
  clima: string;
  ciclo_vida: string;
  altura: string;
  familia: string;
};

/**
 * Categorias paisagisticas reconhecidas. Plantas precisam ter pelo menos 1.
 * Frutíferas e árvores genéricas saem — só entra "Árvores Ornamentais".
 */
const ORNAMENTAL_TAGS = [
  "arbustos",
  "arbustos tropicais",
  "árvores ornamentais",
  "cercas vivas",
  "flores perenes",
  "flores anuais",
  "flores",
  "folhagens",
  "forrações à meia sombra",
  "forrações ao sol pleno",
  "gramados",
  "gramados e forrações",
  "trepadeiras",
  "cactos e suculentas",
  "bulbosas",
  "orquídeas",
  "bromélias",
  "palmeiras",
  "plantas aquáticas",
  "plantas palustres",
  "plantas marginais",
  "plantas esculturais",
  "bonsai",
  "urban jungle",
];

function normTag(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

const ORNAMENTAL_SET = new Set(ORNAMENTAL_TAGS.map(normTag));

/**
 * HARD blacklist: se a planta tem qualquer dessas, SAI mesmo se tambem tem
 * categoria ornamental. Evita recomendar Mamona (toxica), daninhas etc.
 */
const HARD_BLACKLIST = new Set(
  ["Plantas Tóxicas", "Plantas Daninhas", "Plantas Parasitas"].map(normTag),
);

/**
 * Retorna true SO se a planta tem pelo menos 1 categoria estritamente
 * ornamental E NAO tem nenhuma categoria proibida (toxica/daninha/parasita).
 */
export function isPaisagistica(categorias: string | null | undefined): boolean {
  if (!categorias) return false;
  const tags = categorias.split(",").map(normTag).filter(Boolean);
  if (!tags.length) return false;
  if (tags.some((t) => HARD_BLACKLIST.has(t))) return false;
  return tags.some((t) => ORNAMENTAL_SET.has(t));
}

/**
 * Autocomplete de plantas por query do usuario.
 * Busca ILIKE em nome_popular + outros_nomes (sinonimos).
 * Filtra fora plantas nao paisagisticas (horticolas, daninhas, etc).
 */
export async function searchVegetacoesByQuery(
  query: string,
  limit = 10,
): Promise<VegetacaoRow[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = getSupabase();
  const pattern = `%${q}%`;
  const { data } = await supabase
    .from("vegetacoes")
    .select("*")
    .or(`nome_popular.ilike.${pattern},outros_nomes.ilike.${pattern}`)
    .limit(limit * 3); // overshoot pra compensar filtro
  return ((data || []) as VegetacaoRow[])
    .filter((r) => r.nome_popular && r.nome_popular.trim().length > 0)
    .filter((r) => isPaisagistica(r.categorias))
    .slice(0, limit);
}

/**
 * Pagina todas as plantas paisagisticas com imagem_principal valida.
 * Usado pela galeria visual do formato catalog.
 */
export async function listVegetacoesPaginated(
  offset = 0,
  limit = 30,
  query?: string,
): Promise<{ plantas: VegetacaoRow[]; hasMore: boolean }> {
  const supabase = getSupabase();
  // Overshoot grande porque o filtro de categoria exclui ate 25%
  const fetchLimit = limit * 4;
  let q = supabase
    .from("vegetacoes")
    .select("*")
    .not("imagem_principal", "is", null)
    .order("nome_popular", { ascending: true })
    .range(offset * 4, offset * 4 + fetchLimit - 1);
  if (query?.trim()) {
    const pattern = `%${query.trim()}%`;
    q = q.or(`nome_popular.ilike.${pattern},outros_nomes.ilike.${pattern}`);
  }
  const { data } = await q;
  const all = (data || []) as VegetacaoRow[];
  const filtered = all
    .filter((r) => r.nome_popular && r.nome_popular.trim().length > 0)
    .filter((r) => r.imagem_principal && r.imagem_principal.startsWith("http"))
    .filter((r) => isPaisagistica(r.categorias));
  return {
    plantas: filtered.slice(0, limit),
    hasMore: filtered.length > limit || all.length >= fetchLimit,
  };
}

/**
 * Resolve plantas por IDs (frontend manda IDs, backend infla).
 * Preserva a ordem dos IDs solicitados.
 */
export async function fetchVegetacoesByIds(ids: string[]): Promise<VegetacaoRow[]> {
  if (!ids.length) return [];
  const supabase = getSupabase();
  const { data } = await supabase.from("vegetacoes").select("*").in("id", ids);
  const rows = (data || []) as VegetacaoRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is VegetacaoRow => !!r);
}
