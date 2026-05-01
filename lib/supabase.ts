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
 * Autocomplete de plantas por query do usuario.
 * Busca ILIKE em nome_popular + outros_nomes (sinonimos).
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
    .limit(limit);
  return ((data || []) as VegetacaoRow[]).filter(
    (r) => r.nome_popular && r.nome_popular.trim().length > 0,
  );
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
