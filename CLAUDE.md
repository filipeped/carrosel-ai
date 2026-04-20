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

**100% client-side via `html-to-image`.** `app/page.tsx` captura o iframe do preview via DOM → PNG (`captureSlideAsBlob` / `downloadSlideFromDom`). Mesmo fluxo pro download, preview modal e post (upload em `/api/upload-slide` → Supabase Storage → Graph API recebe URL pública).

**Zero render server-side** — não existe Satori, Puppeteer, Chromium no projeto.

### Templates de slide (`templates/`)

`base.ts` exporta `baseStyle()` + `BRAND_HANDLE`. 4 renderers retornam string HTML: `renderCover`, `renderPlantDetail`, `renderInspiration`, `renderCta`. Fontes (Fraunces / Archivo / JetBrains Mono) via `<link>` Google Fonts no iframe.

### Persistência

- **`captions_history`**: legendas geradas por prompt (GET/POST/PATCH em `/api/captions-history`). Preserva entre refreshes/browsers.
- **`carrosseis_gerados`** (`lib/history.ts`): metadata de cada carrossel, inclusive `instagram_post_id`, `instagram_permalink`, `thumb_url` quando postado.

### Padrões importantes

- **Parse de JSON do LLM** — SEMPRE `extractJson()` de `lib/utils.ts`. Cascateia parse direto → jsonrepair → escape manual → completar truncamento → extrair objetos parciais.
- **Saneamento de legendas** (`generateCaption` em `lib/pipeline.ts`): remove emojis, setas unicode (→↓), normaliza hashtags.
- **Anti-alucinação** (`validateSlidesAgainstImages`): cada `plantDetail` valida que a planta citada aparece em `plantas[]` ou `descricao_visual` da imagem. Senão vira `inspiration`.
- **Score composto**: `0.35*cover_potential + 0.15*composicao + 0.10*qualidade + 0.10*semantic + 0.30*aderenciaTema`.
- **Preview Instagram** (`InstagramPreviewModal`): mostra o PNG real (mesma conversão do post) antes de publicar. Bug aparece no preview antes de sair.

### Deploy

- Vercel Pro — `maxDuration=60` nas rotas que precisam (upload/publish).
- Env vars em 3 ambientes (production/preview/development).
