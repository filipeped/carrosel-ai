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
