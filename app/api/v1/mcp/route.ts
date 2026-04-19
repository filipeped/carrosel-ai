import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { runFullCarousel, searchImages, generateCaption } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * MCP-compatible JSON-RPC 2.0 endpoint.
 * Supporta: initialize, tools/list, tools/call.
 *
 * Use:
 *   POST /api/v1/mcp
 *   Headers: Authorization: Bearer <CARROSEL_API_TOKEN>
 *   Body: { jsonrpc:"2.0", id, method, params }
 */

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const TOOLS: Tool[] = [
  {
    name: "carousel_create",
    description:
      "Gera um carrossel completo de 6 slides pro Instagram do @digitalpaisagismo. Pipeline: busca semantica no banco de 1500 imagens de paisagismo real, gera copy editorial (capa + 4 slides internos + CTA) no padrao alto padrao, e opcionalmente gera legendas virais pro post. Retorna JSON estruturado com slides editaveis.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Tema do carrossel em portugues. Ex: '7 palmeiras autorais pra entrada monumental' ou 'Como espelhar uma piscina de borda infinita com vegetacao tropical'",
        },
        withCaption: { type: "boolean", description: "Se true, gera 3 legendas virais pro post. Default: true" },
        withPng: { type: "boolean", description: "Se true, renderiza e devolve os 6 PNGs em base64. Lento (30-60s). Default: false" },
        imageCount: { type: "number", description: "Quantas candidatas trazer da busca. Default 12." },
      },
      required: ["prompt"],
    },
  },
  {
    name: "images_search",
    description:
      "Busca semantica no banco de 1498 imagens de paisagismo real (Supabase image_bank) a partir de prompt em linguagem natural. Retorna lista de imagens com metadata completa (plantas, estilo, porte, cores, mood, etc).",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Query em portugues" },
        count: { type: "number", description: "Quantidade de resultados (default 24, max ~50)" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "caption_generate",
    description:
      "Gera 3 opcoes de legenda viral pro Instagram (storytelling editorial, autoridade tecnica, pergunta provocativa) baseado em slides ja definidos.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Tema do carrossel" },
        slides: {
          type: "array",
          description: "Array de slides (formato igual ao retorno de carousel_create.slides)",
          items: { type: "object" },
        },
      },
      required: ["slides"],
    },
  },
];

function rpcOk(id: any, result: any) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}
function rpcErr(id: any, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: code === -32600 ? 400 : 200 });
}

export async function POST(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return rpcErr(null, -32700, "Parse error");
  }
  const { id = null, method, params = {} } = body || {};

  try {
    switch (method) {
      case "initialize":
        return rpcOk(id, {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "carrosel-ai", version: "1.0.0" },
          capabilities: { tools: {} },
        });

      case "tools/list":
        return rpcOk(id, { tools: TOOLS });

      case "tools/call": {
        const { name, arguments: args = {} } = params;
        if (name === "carousel_create") {
          const r = await runFullCarousel(args.prompt, {
            imageCount: args.imageCount,
            withCaption: args.withCaption ?? true,
          });
          return rpcOk(id, {
            content: [{ type: "text", text: JSON.stringify(r, null, 2) }],
            structuredContent: r,
          });
        }
        if (name === "images_search") {
          const r = await searchImages(args.prompt, args.count ?? 24);
          return rpcOk(id, {
            content: [{ type: "text", text: JSON.stringify(r, null, 2) }],
            structuredContent: r,
          });
        }
        if (name === "caption_generate") {
          const r = await generateCaption(args.prompt || "", args.slides);
          return rpcOk(id, {
            content: [{ type: "text", text: JSON.stringify(r, null, 2) }],
            structuredContent: r,
          });
        }
        return rpcErr(id, -32601, `Unknown tool: ${name}`);
      }

      default:
        return rpcErr(id, -32601, `Method not found: ${method}`);
    }
  } catch (e: any) {
    console.error(e);
    return rpcErr(id, -32603, e.message || String(e));
  }
}

// GET devolve descoberta pra clientes que fazem GET primeiro
export async function GET() {
  return NextResponse.json({
    protocol: "MCP-over-HTTP + JSON-RPC 2.0",
    endpoint: "/api/v1/mcp",
    auth: "Authorization: Bearer <CARROSEL_API_TOKEN>",
    methods: ["initialize", "tools/list", "tools/call"],
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
  });
}
