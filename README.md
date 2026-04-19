# Carrosel AI — Digital Paisagismo

Gerador de carrosseis de Instagram por IA, no padrao visual do [@digitalpaisagismo](https://instagram.com/digitalpaisagismo). Dois modos:

- **Identificador** — upload de foto de planta, Claude Vision identifica, cruza com tabela de vegetacoes + banco de 1500 imagens de paisagismo, e monta um carrossel sobre aquela planta.
- **Tematico** — prompt livre tipo *"5 plantas pra jardim pequeno sombreado"*, busca semantica no banco, monta carrossel curado.

## Stack

- Next.js 15 App Router + TypeScript
- Tailwind v4
- Claude Sonnet 4.6 (vision + copy)
- OpenAI text-embedding-3-small (embeddings)
- Supabase (image_bank, vegetacoes, RPCs de busca semantica — 1500 imagens + 1000 plantas ja catalogadas)
- Puppeteer (render HTML -> PNG 1080x1350)
- pdf-lib (combina 6 PNGs em 1 PDF)

## Setup

```bash
npm install
cp .env.example .env.local   # preencher chaves
npm run dev
```

Abre `http://localhost:3000`.

## Deploy

Vercel Pro (timeout 60s):

```bash
vercel --prod
```

Em producao o renderer usa `puppeteer-core` + `@sparticuz/chromium` (cabe no serverless).

## Estrutura

```
app/
  api/identify    # Claude Vision -> nome planta + match em vegetacoes
  api/search      # Claude -> filtros -> embedding -> RPC busca_semantica
  api/generate    # copy + render 6 slides + PDF
  page.tsx        # UI
lib/              # supabase, claude, embeddings, plant-matcher, renderer, pdf
templates/        # HTML dos 4 tipos de slide (cover, plantDetail, inspiration, cta)
public/fonts/     # Playfair Display + Cormorant Garamond
```

## Padrao visual

- Formato 4:5 (1080 x 1350)
- Serifa Playfair Display + Cormorant Garamond italico nos destaques
- Texto branco sobre fotos escuras com vinheta sutil
- Handle `@DIGITALPAISAGISMO` no rodape direito

Referencia visual: pasta `carrosel/` tem 6 slides modelo (nao commitados).

## Proximos passos (V2)

- Editor pos-geracao (regen slide individual)
- Auto-post via Instagram Graph API
- Historico em `carrosseis_gerados`
- Formato 9:16 Stories
- Multi-brand
