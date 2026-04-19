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
node scripts/smart-test.mjs http://localhost:3001          # 10 rodadas só /api/search-smart (~15s c/ cache)
node scripts/quality-parallel.mjs http://localhost:3001    # 5 E2E completos em paralelo (~100s)
node scripts/e2e-test.mjs http://localhost:3001            # 3 E2E detalhados sequenciais
node scripts/ideas-test.mjs http://localhost:3001          # 3 rodadas só /api/ideas
```
Não há testes unitários. Os scripts acima são a validação de regressão — rode `quality-parallel` após qualquer mudança em `lib/smart-pipeline.ts`, `lib/pipeline.ts` ou prompts.

**Limpar cache de análise visual do Supabase** (após mudar o prompt em `lib/image-analysis.ts`):
```sql
-- SQL Editor do Supabase dashboard
UPDATE image_bank SET analise_visual = NULL WHERE analise_visual IS NOT NULL;
```
Sem isso, imagens antigas ficam com scores baseados no prompt anterior.

## Arquitetura

### Dois pipelines paralelos em `lib/`

1. **`pipeline.ts`** — pipeline clássico (V1): `extractFilters → searchImages → generateCopy → generateCaption`. Usado pelas rotas `/api/copy`, `/api/caption`, `/api/v1/carousel`.

2. **`smart-pipeline.ts`** — pipeline inteligente (V2) com análise visual e curadoria IA:
   ```
   searchImages (24) → enrichFromImageBank → analyzeAndCache (Vision) →
   rankAndSelect (score composto 35% cover_potential + 30% aderencia ao tema) →
   generateCopyFromAnalysis → validateSlidesAgainstImages (anti-alucinação)
   ```
   Usado por `/api/search-smart`, `/api/v1/smart-carousel`, UI principal (`app/page.tsx`).

### Integrações externas críticas

- **Gateway CLIProxyAPI** (`lib/claude.ts` — `getAi()`): proxy OpenAI-compatible que roteia `/v1/chat/completions` pro Claude. Usado pra TUDO que não seja embedding (copy, vision, ideas). URL em `GATEWAY_BASE_URL`, key em `GATEWAY_API_KEY`. **Não roteia `/v1/embeddings` — retorna 404.**
- **OpenAI direto** (`lib/embeddings.ts` — `getOpenai()`): usado APENAS pra `text-embedding-3-small` (1536 dims, compatível com a coluna `embedding` em `image_bank`). Key em `OPENAI_API_KEY`.
- **Supabase** (`lib/supabase.ts` — `getSupabase()`): service_role no server. Tabelas-chave:
  - `image_bank` (1498 linhas) — `embedding pgvector(1536)` + `analise_visual jsonb` (cache Vision)
  - `vegetacoes` (1003 linhas) — plantas com nome popular/científico/família
  - RPCs úteis: `busca_semantica`, `match_imagens_inspiracoes`, `buscar_imagens_semantico`
  - Todos os clients são **lazy-init** — sem env vars o build passa, erro só em runtime

### Camada de autenticação API v1

`lib/auth.ts` — `requireAuth(req)` valida header `Authorization: Bearer <token>` ou `X-API-Key: <token>` via `timingSafeEqual`. Token em `CARROSEL_API_TOKEN` (alias `CLAWDBOT_API_TOKEN` aceito). Aplicado em `/api/v1/*` (exceto `GET /api/v1/mcp` que é discovery público).

### MCP server em `/api/v1/mcp`

JSON-RPC 2.0 compatível com Claude Desktop, Cline, Cursor. Expõe 8 tools: `ideas_generate`, `images_search`, `images_search_smart`, `copy_generate`, `caption_generate`, `carousel_create`, `carousel_smart_create`, `slide_render`. Todas com `inputSchema` JSONSchema. Handler em `app/api/v1/mcp/route.ts` usa funções importadas de `lib/pipeline.ts` e `lib/smart-pipeline.ts`.

### Renderização de slides (dual stack)

- **Cliente (UI)** — `html-to-image` (`app/page.tsx downloadSlideFromDom`): captura o `<iframe>` do preview via DOM → PNG. Instantâneo, 100% fiel, zero servidor. Este é o caminho padrão de download pro user.
- **Servidor (API v1)** — `lib/renderer.ts` usa `satori` + `@resvg/resvg-js`: HTML → SVG → PNG, puro JS sem chromium. Usado por `/api/v1/render`, `/api/v1/carousel` e `/api/v1/smart-carousel` quando `withPng: true`. **Satori exige `display: flex|contents|none`** em todo `<div>` com 2+ filhos — os templates em `templates/` estão conformes.

### Templates de slide (`templates/`)

`base.ts` exporta `baseStyle()` (CSS compartilhado) e `BRAND_HANDLE`. 4 renderers retornam string HTML: `renderCover`, `renderPlantDetail`, `renderInspiration`, `renderCta`. Fontes (Fraunces / Archivo / JetBrains Mono) são carregadas via `<link>` Google Fonts no iframe cliente; no servidor (Satori) são baixadas como ArrayBuffer e passadas em `satori({fonts})`.

### Padrões importantes

- **Parse de JSON do LLM** — SEMPRE usar `extractJson()` de `lib/utils.ts`, nunca `JSON.parse` direto. Essa função cascateia: (1) parse direto → (2) `jsonrepair` → (3) escape manual de newlines/trailing commas → (4) completar truncamento → (5) extrair objetos parciais de array. Lida com resposta vindo como `[...]` ou `{...}` ou com code-fence markdown.
- **Saneamento de legendas** (`generateCaption` em `lib/pipeline.ts`): depois do parse, remove emojis (`/[\p{Extended_Pictographic}]/gu`), setas unicode (→↓), e normaliza hashtags pra `/^#[a-z0-9]+$/` (sem acento, sem camelCase).
- **Anti-alucinação** (`validateSlidesAgainstImages` em `lib/smart-pipeline.ts`): cada `plantDetail` é validado — a planta citada DEVE aparecer em `plantas[]` ou `descricao_visual` da imagem correspondente. Caso contrário é convertido automaticamente em `inspiration`. Também força `imageIdx = posição do slide` pra evitar duplicação de foto entre slots.
- **Score composto para rank** (`rankAndSelect`): `0.35*cover_potential + 0.15*composicao + 0.10*qualidade + 0.10*semantic + 0.30*aderenciaTema`. Aderência ao tema conta interseção de palavras (4+ chars, sem stopwords) entre o prompt e a metadata completa da imagem.

### Deploy

- Vercel Pro (timeout 60s) — `vercel.json` não existe, usa `maxDuration=60` declarado nas rotas que rendem PNG (`/api/v1/render`, `/api/v1/carousel`, `/api/v1/smart-carousel`).
- Env vars em 3 ambientes (production/preview/development). `scripts/vercel-sync.sh` lê `.env.local` e sincroniza via Vercel CLI.
- `next.config.ts` tem `outputFileTracingIncludes` apontando `@sparticuz/chromium/bin/**` pras rotas que usam puppeteer em dev local (Satori em prod dispensa isso, mas o trace é preservado pra evitar regressão).
