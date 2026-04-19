-- Historico de carrosseis gerados + anti-repeticao.
-- Rodar 1x no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS carrosseis_gerados (
  id uuid primary key default gen_random_uuid(),
  prompt text,
  tema text,
  slides jsonb,
  imagens_ids int[],
  caption_options jsonb,
  instagram_post_id text,
  instagram_posted_at timestamptz,
  performance jsonb,
  created_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_carrosseis_created
  ON carrosseis_gerados (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_carrosseis_imagens_gin
  ON carrosseis_gerados USING gin (imagens_ids);

COMMENT ON TABLE carrosseis_gerados IS
  'Historico de carrosseis. Usado pra anti-repeticao e learning loop com Instagram Insights.';
