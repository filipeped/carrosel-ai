-- Adiciona cache de analise visual (Claude Vision) ao image_bank.
-- Rodar 1x no SQL Editor do Supabase (Dashboard -> SQL Editor -> New query).

ALTER TABLE image_bank
  ADD COLUMN IF NOT EXISTS analise_visual jsonb;

CREATE INDEX IF NOT EXISTS idx_image_bank_analise_gin
  ON image_bank USING gin (analise_visual);

COMMENT ON COLUMN image_bank.analise_visual IS
  'Cache de analise Claude Vision: { qualidade, composicao, luz, cover_potential, descricao_visual, hero_element, mood_real, palavras_chave, analisado_em, modelo }';
