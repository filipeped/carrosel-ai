-- Persiste legendas geradas + pick do user.
-- Rodar no Supabase SQL Editor.

create table if not exists captions_history (
  id bigserial primary key,
  prompt text not null,
  options jsonb not null,
  picked_idx integer,
  created_at timestamptz default now()
);

create index if not exists idx_captions_history_prompt_created
  on captions_history (prompt, created_at desc);
