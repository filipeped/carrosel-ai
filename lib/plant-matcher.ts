import { getSupabase, VegetacaoRow, ImageBankRow } from "./supabase";

export async function matchVegetacao(
  nomeCientifico: string,
  nomePopular: string,
): Promise<VegetacaoRow | null> {
  const supabase = getSupabase();

  const { data: byCientifico } = await supabase
    .from("vegetacoes")
    .select("*")
    .ilike("nome_cientifico", `%${nomeCientifico}%`)
    .limit(1);
  if (byCientifico && byCientifico.length > 0) return byCientifico[0] as VegetacaoRow;

  const { data: byPopular } = await supabase
    .from("vegetacoes")
    .select("*")
    .ilike("nome_popular", `%${nomePopular}%`)
    .limit(1);
  if (byPopular && byPopular.length > 0) return byPopular[0] as VegetacaoRow;

  const { data: byOutros } = await supabase
    .from("vegetacoes")
    .select("*")
    .ilike("outros_nomes", `%${nomePopular}%`)
    .limit(1);
  if (byOutros && byOutros.length > 0) return byOutros[0] as VegetacaoRow;

  return null;
}

export async function imagesWithPlant(
  nomeCientifico: string,
  limit = 4,
): Promise<ImageBankRow[]> {
  const supabase = getSupabase();

  const { data } = await supabase
    .from("image_bank")
    .select("*")
    .contains("plantas", [nomeCientifico])
    .eq("excluir", false)
    .limit(limit);
  if (data && data.length > 0) return data as ImageBankRow[];

  const { data: data2 } = await supabase
    .from("image_bank")
    .select("*")
    .ilike("descricao_busca", `%${nomeCientifico}%`)
    .eq("excluir", false)
    .limit(limit);
  return (data2 as ImageBankRow[]) || [];
}

export async function searchImagesSemantic(
  queryEmbedding: number[],
  filters: { estilo?: string; tipo_area?: string } = {},
  count = 5,
): Promise<ImageBankRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("busca_semantica", {
    query_embedding: queryEmbedding as unknown as string,
    match_threshold: 0.3,
    match_count: count,
    filtro_estilo: filters.estilo ?? null,
    filtro_tipo_area: filters.tipo_area ?? null,
    tabelas: ["image_bank"],
  });
  if (error) {
    console.error("busca_semantica error", error);
    return [];
  }
  return (data as ImageBankRow[]) || [];
}
