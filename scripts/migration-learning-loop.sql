-- Learning loop + A/B testing infrastructure
-- Rodar via: node scripts/run-migration.mjs scripts/migration-learning-loop.sql

-- 1. Performance real dos posts publicados
create table if not exists caption_performance (
  id bigserial primary key,
  carrossel_id uuid references carrosseis_gerados(id) on delete cascade,
  caption_idx int,
  approach text, -- direta_emocional, contraste_verdade, tecnico_relacional
  caption text,
  hashtags text[],
  word_count int,

  -- Snapshot Instagram insights
  likes int,
  comments int,
  saves int,
  shares int,
  reach int,
  engagement_rate float,

  -- Feedback manual
  manual_score int, -- 1-5
  notes text,

  created_at timestamptz default now(),
  insights_fetched_at timestamptz
);
create index if not exists idx_caption_perf_carrossel
  on caption_performance (carrossel_id);

-- 2. Testes A/B de variantes
create table if not exists test_batches (
  id bigserial primary key,
  prompt text not null,
  user_brief text,
  variants_count int default 10,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists test_generations (
  id bigserial primary key,
  batch_id bigint references test_batches(id) on delete cascade,
  variant_label text, -- ex: "direta_pergunta", "contraste_contraste"
  approach text,
  hook_strategy text, -- pergunta, contraste, promessa
  slides jsonb,
  caption_options jsonb,
  agents_used text[],
  critic_score int,
  user_manual_score int, -- 1-5
  is_winner boolean default false,
  notes text,
  created_at timestamptz default now()
);
create index if not exists idx_test_gen_batch
  on test_generations (batch_id);

-- 3. Stats agregadas por fórmula/abordagem
create table if not exists caption_formula_stats (
  id bigserial primary key,
  formula text unique, -- ex: "contraste_%_noaoorac%", slug da fórmula
  approach text,
  times_used int default 0,
  avg_saves float,
  avg_shares float,
  avg_comments float,
  avg_engagement_rate float,
  best_exemplo text,
  updated_at timestamptz default now()
);

-- 4. Feedback de iterações de calibração
create table if not exists calibration_iterations (
  id bigserial primary key,
  iter_number int,
  avg_score_before float,
  avg_score_after float,
  adjustments_made text, -- markdown do que foi mudado
  batch_id bigint references test_batches(id),
  created_at timestamptz default now()
);
