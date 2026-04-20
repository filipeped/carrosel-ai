// Historico de carrosseis gerados — persiste no Supabase + anti-repeticao.
import { getSupabase } from "./supabase";
import type { SlideSpec } from "./pipeline";

export type CarrosselRow = {
  id: string;
  prompt: string;
  tema: string;
  slides: SlideSpec[];
  imagens_ids: number[];
  caption_options?: unknown;
  instagram_post_id?: string | null;
  instagram_permalink?: string | null;
  instagram_posted_at?: string | null;
  thumb_url?: string | null;
  performance?: unknown;
  created_at: string;
};

export async function saveCarrossel(data: {
  prompt: string;
  tema?: string;
  slides: SlideSpec[];
  imagens_ids: number[];
  caption_options?: any;
}): Promise<{ id: string } | null> {
  try {
    const sb = getSupabase();
    const { data: inserted, error } = await sb
      .from("carrosseis_gerados")
      .insert({
        prompt: data.prompt,
        tema: data.tema || data.prompt,
        slides: data.slides,
        imagens_ids: data.imagens_ids,
        caption_options: data.caption_options || null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return inserted;
  } catch (e) {
    console.warn("[history] save falhou:", e);
    return null;
  }
}

/**
 * Retorna Set de image_ids usados nos ultimos N carrosseis (padrao 20).
 * Usado pra anti-repeticao no rankAndSelect.
 */
export async function getRecentlyUsedImageIds(limit = 20): Promise<Set<number>> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from("carrosseis_gerados")
      .select("imagens_ids")
      .order("created_at", { ascending: false })
      .limit(limit);
    const set = new Set<number>();
    for (const row of data || []) {
      for (const id of row.imagens_ids || []) set.add(id);
    }
    return set;
  } catch {
    return new Set();
  }
}

export async function listRecent(limit = 30): Promise<CarrosselRow[]> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from("carrosseis_gerados")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data as any) || [];
  } catch {
    return [];
  }
}

export async function updateInstagramPost(
  id: string | number,
  postData: {
    instagram_post_id: string;
    instagram_permalink?: string;
    instagram_posted_at?: string;
    thumb_url?: string;
  },
) {
  try {
    const sb = getSupabase();
    const update: Record<string, string> = {
      instagram_post_id: postData.instagram_post_id,
      instagram_posted_at: postData.instagram_posted_at || new Date().toISOString(),
    };
    if (postData.instagram_permalink) update.instagram_permalink = postData.instagram_permalink;
    if (postData.thumb_url) update.thumb_url = postData.thumb_url;
    await sb.from("carrosseis_gerados").update(update).eq("id", id);
  } catch (e) {
    console.warn("[history] updateInstagramPost:", e);
  }
}
