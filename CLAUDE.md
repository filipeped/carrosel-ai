# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Finalidade | Comando |
|---|---|
| Dev server (porta 3000, fallback 3001+) | `npm run dev` |
| Build de produção | `npm run build` |
| Type check (mais rápido que build) | `npm run typecheck` |
| Lint | `npm run lint` |
| Deploy prod (Vercel) | `vercel --prod --token $VERCEL_TOKEN` |

**Testes de qualidade** (scripts em `scripts/`, rodam contra dev server — passe a URL):
```bash
node scripts/smart-test.mjs http://localhost:3001          # 10 rodadas só /api/search-smart
node scripts/quality-parallel.mjs http://localhost:3001    # 5 E2E completos em paralelo
node scripts/e2e-test.mjs http://localhost:3001            # 3 E2E detalhados sequenciais
node scripts/ideas-test.mjs http://localhost:3001          # 3 rodadas só /api/ideas
```
Rode `quality-parallel` após qualquer mudança em `lib/smart-pipeline.ts`, `lib/pipeline.ts` ou prompts.

**Limpar cache de análise visual do Supabase** (após mudar o prompt em `lib/image-analysis.ts`):
```sql
UPDATE image_bank SET analise_visual = NULL WHERE analise_visual IS NOT NULL;
```

## Arquitetura

### Dois pipelines paralelos em `lib/`

1. **`pipeline.ts`** — pipeline clássico: `extractFilters → searchImages → generateCopy → generateCaption`. Usado por `/api/copy`, `/api/caption`.

2. **`smart-pipeline.ts`** — pipeline com visão e curadoria IA:
   ```
   searchImages (24) → enrichFromImageBank → analyzeAndCache (Vision) →
   rankAndSelect (score composto) → generateCopyFromAnalysis → validateSlidesAgainstImages
   ```
   Usado por `/api/search-smart` e pela UI principal.

### Integrações externas

- **Gateway CLIProxyAPI** (`lib/claude.ts` — `getAi()`): proxy OpenAI-compatible pra Claude. URL em `GATEWAY_BASE_URL`, key em `GATEWAY_API_KEY`.
- **OpenAI direto** (`lib/embeddings.ts` — `getOpenai()`): APENAS `text-embedding-3-small` (1536 dims). Key em `OPENAI_API_KEY`.
- **Supabase** (`lib/supabase.ts`): service_role. Tabelas: `image_bank`, `vegetacoes`, `carrosseis_gerados`, `captions_history`. Bucket `carrosseis-publicados` pros PNGs. Lazy init — sem env o build passa, erro em runtime.
- **Instagram Graph API** (`lib/instagram.ts`): System User token permanente em `INSTAGRAM_ACCESS_TOKEN`. `publishCarousel()` cria containers → aguarda FINISHED → publica.

### Renderização de slides

**100% client-side via `html-to-image`.** Captura do iframe do preview via DOM → PNG (`lib/capture.ts:captureSlideAsBlob`). PixelRatio adaptativo (2.5x → 2x → 1.5x → 1x) — supersampling quando cabe, fallback automático senão. `lib/capture.ts:lastSuccessfulRatio` memoiza entre slides do mesmo batch pra não desperdiçar tempo testando ratios que já falharam.

**Upload bypassa Vercel** (evita limite 4.5MB body): `POST /api/upload-url` retorna signed URL, cliente dá `PUT` binário direto pro Supabase Storage. Zero base64 overhead, zero 413.

**Zero render server-side** — não existe Satori, Puppeteer, Chromium.

### Templates de slide (`templates/`)

`base.ts` exporta `baseStyle()` + `BRAND_HANDLE`. 4 renderers retornam string HTML: `renderCover`, `renderPlantDetail`, `renderInspiration`, `renderCta`. Fontes (Fraunces / Archivo / JetBrains Mono) são **self-hosted** em `/public/fonts/*.woff2` e injetadas via `@font-face` inline no iframe (evita SecurityError cssRules de CORS do Google Fonts).

### Persistência

- **`captions_history`**: legendas geradas por prompt (GET/POST/PATCH em `/api/captions-history`). Preserva entre refreshes/browsers.
- **`carrosseis_gerados`** (`lib/history.ts`): metadata de cada carrossel, inclusive `instagram_post_id`, `instagram_permalink`, `thumb_url` quando postado.

### Padrões importantes

- **Parse de JSON do LLM** — SEMPRE `extractJson()` de `lib/utils.ts`. Cascateia parse direto → jsonrepair → escape manual → completar truncamento → extrair objetos parciais.
- **Saneamento de legendas** (`generateCaption` em `lib/pipeline.ts`): remove emojis, setas unicode (→↓), normaliza hashtags.
- **Anti-alucinação** (`validateSlidesAgainstImages`): cada `plantDetail` valida que a planta citada aparece em `plantas[]` ou `descricao_visual` da imagem. Senão vira `inspiration`.
- **Score composto**: `0.35*cover_potential + 0.15*composicao + 0.10*qualidade + 0.10*semantic + 0.30*aderenciaTema`.
- **Preview Instagram** (`InstagramPreviewModal`): mostra o PNG real (mesma conversão do post) antes de publicar. Bug aparece no preview antes de sair.

### Equipe de agentes IA (`lib/agents/`)

Pipeline modular com agentes especializados que podem ser encadeados:

- **`prompt-analyst.ts`** — classifica persona (em obra / casa pronta), extrai dor principal, enriquece prompt antes da busca.
- **`carousel-critic.ts`** — critica slides com rubrica por dimensão (hook 0-25, narrativa 0-25, persona 0-20, vocab 0-15, cta 0-15). `temperature: 0.3` + benchmarks concretos.
- **`ensemble-critic.ts`** — roda 3 critics em paralelo (viral/marca/técnico), retorna mediana + flag "controverso" se desacordam (stddev > 10).
- **`caption-optimizer.ts`** — brand polish: pré-clean determinístico (vocab premium, emoji proibido) + polish semântico Claude.
- **`viral-master.ts`** — garante que copy usa 1 dos 6 frameworks 2026 (pattern_interrupt, information_gap, contrarian, specific_number, prize_frame, timing). Mata frases inspiracionais vazias.
- **`self-refine.ts`** — loop iterativo gera → critica → reescreve até score ≥ 88 ou cap 3 iterações.
- **`hook-tournament.ts`** — gera 20 hooks, avalia em 4 dimensões (curiosity, specificity, swipe-incentive, pattern-interrupt), retorna top 3.
- **`caption-tournament.ts`** — 4 rodadas paralelas = ~20 legendas, ranker escolhe top K.
- **`slides-architect.ts`** — decide tamanho do carrossel (7-10 slides) + outline.
- **`visual-curator.ts`** — modo observacional (image-first): agrupa 8-10 fotos coerentes do banco, detecta tese.
- **`observational-copy.ts`** — escreve copy observacional (curador) sobre fotos agrupadas, sem tema externo.
- **`competitor-research.ts`** — RAG com hooks de referência em `data/competitor-hooks.json`.

### Deploy

- Vercel Pro — `maxDuration` configurado por rota (10s default, 30s pra search/copy, 60s pra publish, 120s pra post completo, 300s pra test-batch).
- Env vars em 3 ambientes (production/preview/development).
- Cron diário `/api/cron-insights` (Vercel Cron) puxa métricas IG dos posts publicados.
