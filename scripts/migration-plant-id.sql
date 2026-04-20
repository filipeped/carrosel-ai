-- Plant ID Nível 4 — infraestrutura pra identificar plantas com RAG + validação
-- Roda no Supabase SQL Editor.

-- 1. Habilita pgvector (já tá habilitado se image_bank tem embedding)
create extension if not exists vector;

-- 2. Adiciona coluna embedding em vegetacoes
alter table vegetacoes
  add column if not exists embedding vector(1536);

-- 3. Index pra busca semântica rápida
create index if not exists idx_vegetacoes_embedding
  on vegetacoes using ivfflat (embedding vector_cosine_ops)
  with (lists = 32);

-- 4. RPC pra buscar plantas similares
create or replace function match_vegetacoes(
  query_embedding vector(1536),
  match_count int default 15
) returns table (
  id uuid,
  nome_popular text,
  nome_cientifico text,
  descricao text,
  luminosidade text,
  origem text,
  clima text,
  familia text,
  categorias text,
  outros_nomes text,
  similarity float
) language sql stable as $$
  select
    v.id,
    v.nome_popular,
    v.nome_cientifico,
    v.descricao,
    v.luminosidade,
    v.origem,
    v.clima,
    v.familia,
    v.categorias,
    v.outros_nomes,
    1 - (v.embedding <=> query_embedding) as similarity
  from vegetacoes v
  where v.embedding is not null
  order by v.embedding <=> query_embedding
  limit match_count;
$$;

-- 5. Tabela de correções (feedback loop)
create table if not exists plant_corrections (
  id bigserial primary key,
  image_id integer references image_bank(id) on delete cascade,
  plant_id_wrong text,
  plant_id_correct uuid references vegetacoes(id) on delete set null,
  visual_clue text,
  created_at timestamptz default now()
);
create index if not exists idx_plant_corrections_image
  on plant_corrections (image_id);

-- 6. Colunas de rascunho + agendamento em carrosseis_gerados
alter table carrosseis_gerados
  add column if not exists is_draft boolean default false,
  add column if not exists draft_caption text,
  add column if not exists scheduled_for timestamptz;

create index if not exists idx_carrosseis_drafts
  on carrosseis_gerados (created_at desc)
  where is_draft = true and instagram_post_id is null;
