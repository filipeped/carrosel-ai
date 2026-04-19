# Carrosel AI — API v1

API HTTP autenticada pra outros sistemas (Clawdbot, n8n, bots, agents) gerarem carrosseis do @digitalpaisagismo programaticamente.

## Auth

Todo request precisa de header:

```
Authorization: Bearer cr_<seu_token>
```

Ou (equivalente):

```
X-API-Key: cr_<seu_token>
```

O token vive em `CARROSEL_API_TOKEN` (env var, mesmo valor em dev/preview/prod na Vercel).

---

## Endpoints REST

### POST `/api/v1/carousel` — oneshot

Pipeline completo: busca imagens → gera copy → (opcional) renderiza PNGs → (opcional) gera legendas.

**Request**
```json
{
  "prompt": "7 palmeiras autorais pra entrada monumental de condominio fechado",
  "withCaption": true,
  "withPng": false,
  "imageCount": 12
}
```

**Response**
```json
{
  "prompt": "7 palmeiras autorais...",
  "filters": { "estilo": "Moderno", "tipo_area": "grande", "query_expandida": "..." },
  "imagens": [ /* 8 imagens do banco com metadata completa */ ],
  "slides": [
    { "type": "cover", "imageIdx": 0, "topLabel": "...", "numeral": "7", "title": "...", "italicWords": [] },
    { "type": "plantDetail", "imageIdx": 1, "nomePopular": "...", "nomeCientifico": "..." },
    /* ... */
    { "type": "cta", "imageIdx": 5, "pergunta": "...", "italicWords": [] }
  ],
  "caption": {
    "options": [
      { "abordagem": "Storytelling", "hook": "...", "legenda": "...", "hashtags": [] }
    ]
  },
  "pngs": ["base64...", "base64..."]   // so se withPng=true
}
```

### POST `/api/v1/search`
Busca semantica no banco de 1498 imagens.
```json
{ "prompt": "jardim tropical borda de piscina", "count": 24 }
```

### POST `/api/v1/caption`
Gera 3 legendas virais pra slides ja definidos.
```json
{ "prompt": "tema do post", "slides": [ /* array de SlideSpec */ ] }
```

---

## MCP — Model Context Protocol

Endpoint: `POST /api/v1/mcp`  (JSON-RPC 2.0, compativel com Claude Desktop/Code, Cline, Cursor, agents MCP-aware)

### Descoberta via GET
```bash
curl https://SEU_DOMINIO/api/v1/mcp
```
Retorna lista de tools disponiveis sem precisar auth.

### Chamar tool
```bash
curl -X POST https://SEU_DOMINIO/api/v1/mcp \
  -H "Authorization: Bearer cr_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "carousel_create",
      "arguments": {
        "prompt": "7 palmeiras autorais pra entrada monumental",
        "withCaption": true
      }
    }
  }'
```

### Tools expostas
| name | descricao |
|---|---|
| `carousel_create` | Pipeline completo: prompt -> slides editaveis + imagens + legendas |
| `images_search` | Busca semantica no image_bank (1498 imagens) |
| `caption_generate` | 3 legendas virais pra slides ja definidos |

### Metodos JSON-RPC suportados
- `initialize` — handshake MCP
- `tools/list` — devolve schema JSON das tools
- `tools/call` — executa tool

---

## Exemplos

### curl oneshot
```bash
curl -X POST http://localhost:3000/api/v1/carousel \
  -H "Authorization: Bearer cr_d7c239cd36bb84cc4b9540eec6a7fa644817b79ba1a26d6e" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"projeto autoral de espelho dagua com vegetacao nativa"}'
```

### Node/fetch
```js
const res = await fetch("https://SEU_DOMINIO/api/v1/carousel", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.CARROSEL_API_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    prompt: "cobertura duplex com rooftop paisagistico",
    withCaption: true,
    withPng: false,
  }),
});
const data = await res.json();
```

### n8n
Node HTTP Request:
- Method: POST
- URL: `https://SEU_DOMINIO/api/v1/carousel`
- Auth: Header Auth, `Authorization` = `Bearer cr_xxx`
- Body JSON: `{"prompt": "{{$json.tema}}"}`

### Claude Desktop / Cline — MCP
No arquivo de config (`claude_desktop_config.json` ou equivalente):
```json
{
  "mcpServers": {
    "carrosel-ai": {
      "url": "https://SEU_DOMINIO/api/v1/mcp",
      "headers": { "Authorization": "Bearer cr_xxx" }
    }
  }
}
```

---

## Observacoes

- Timeout prod: 60s (pipeline completo leva 15-40s)
- `withPng: true` pode passar de 60s em Vercel Hobby — usar so com `maxDuration=60` em plano Pro
- `CARROSEL_API_TOKEN` aceita tambem o alias `CLAWDBOT_API_TOKEN` pra compatibilidade
- Rate limit: nao implementado v1 — controle externo por enquanto
