-- Adiciona metadados do post publicado em carrosseis_gerados.
-- Rodar no Supabase SQL Editor.

alter table carrosseis_gerados
  add column if not exists instagram_permalink text,
  add column if not exists thumb_url text;

create index if not exists idx_carrosseis_instagram_posted
  on carrosseis_gerados (instagram_posted_at desc)
  where instagram_post_id is not null;
