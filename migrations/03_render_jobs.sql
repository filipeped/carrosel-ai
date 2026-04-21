-- Jobs de render server-side (desacopla client de processamento longo).
-- Permite que o user minimize/feche o navegador enquanto o Vercel processa.
-- Rodar 1x no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS render_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending',  -- pending | running | done | error
  input jsonb not null,                     -- { slides, imageUrls, batchId }
  result jsonb,                             -- { slides: [{url, bytes, w, h}] }
  error text,
  progress int default 0,                   -- 0-100 (quantos slides prontos)
  total_slides int,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_render_jobs_created
  ON render_jobs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_render_jobs_status
  ON render_jobs (status) WHERE status IN ('pending', 'running');

-- Limpeza automatica: jobs mais velhos que 7 dias ja foram consumidos ou perdidos.
-- Rode manualmente de tempos em tempos, ou crie um cron:
--   DELETE FROM render_jobs WHERE created_at < now() - interval '7 days';

COMMENT ON TABLE render_jobs IS
  'Jobs de render de slides server-side. Desacopla client de processamento. Cliente faz poll em /api/render/status/:id';
