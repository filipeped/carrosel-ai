import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { runFullCarousel, searchImages, generateCaption, generateCopy } from "@/lib/pipeline";
import { renderHtmlToPng } from "@/lib/renderer";
import { renderCover } from "@/templates/cover";
import { renderPlantDetail } from "@/templates/plantDetail";
import { renderInspiration } from "@/templates/inspiration";
import { renderCta } from "@/templates/cta";
import { getAi, MODEL } from "@/lib/claude";
import { extractJson } from "@/lib/utils";

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
  {
    name: "ideas_generate",
    description:
      "Gera 8 ideias de tema pra carrosseis virais de paisagismo alto padrao. Usa formulas comprovadas (N plantas pra X, erros, antes/depois, bastidores, etc) com contextos diversificados. Retorna titulo + hook (por que viraliza).",
    inputSchema: {
      type: "object",
      properties: {
        nicho: {
          type: "string",
          description:
            "Opcional. Interesse inicial do usuario — so 1 das 8 ideias vai tocar nele, 7 exploram outros contextos.",
        },
      },
    },
  },
  {
    name: "copy_generate",
    description:
      "Gera o copy dos 6 slides (capa + 4 plantDetail/inspiration + CTA) dado tema + array de imagens escolhidas do image_bank. Use quando quiser controlar a selecao de imagens antes de gerar a copy (fluxo granular).",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Tema do carrossel" },
        images: {
          type: "array",
          description: "Array de imagens (formato igual ao retornado por images_search.imagens)",
          items: { type: "object" },
        },
      },
      required: ["images"],
    },
  },
  {
    name: "slide_render",
    description:
      "Renderiza 1 slide em PNG 1080x1350. Retorna PNG em base64. Use pra gerar as imagens finais do carrossel apos editar a copy.",
    inputSchema: {
      type: "object",
      properties: {
        slide: {
          type: "object",
          description: "SlideSpec: { type, topLabel?, numeral?, title?, subtitle?, italicWords?, nomePopular?, nomeCientifico?, pergunta? }",
        },
        imageUrl: { type: "string", description: "URL da imagem de fundo (tipicamente do Supabase image-bank)" },
      },
      required: ["slide", "imageUrl"],
    },
  },
];

async function generateIdeas(nicho?: string) {
  const SYS = `Voce e estrategista de Instagram pra @digitalpaisagismo. Gere 8 ideias em 8 contextos DIFERENTES, com numeros 3/4/5 apenas (carrossel tem 4 slides internos). Autoridade sutil via termos tecnicos. BANIDO: "alto padrao", "mansao", "condominio fechado", emojis, numeros > 5. JSON puro: { ideias: [{ titulo, contexto, hook }] }`;
  const user = nicho
    ? `Interesse: "${nicho}". 8 ideias em 8 contextos diferentes — so 1 toca nisso.`
    : "8 ideias em 8 contextos diferentes.";
  const r = await getAi().chat.completions.create({
    model: MODEL,
    max_tokens: 1400,
    messages: [
      { role: "system", content: SYS },
      { role: "user", content: user },
    ],
  });
  const raw = r.choices[0]?.message?.content || "";
  let p: any = extractJson(raw);
  if (Array.isArray(p)) p = { ideias: p };
  return p;
}

async function renderSlide(slide: any, imageUrl: string) {
  const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  let html: string;
  if (slide.type === "cover") {
    html = renderCover({ imageUrl, topLabel: slide.topLabel, numeral: slide.numeral ?? undefined, title: slide.title || "", italicWords: slide.italicWords || [], edition: slide.edition }, origin);
  } else if (slide.type === "plantDetail") {
    html = renderPlantDetail({ imageUrl, nomePopular: slide.nomePopular || slide.title || "", nomeCientifico: slide.nomeCientifico || slide.subtitle || "" }, origin);
  } else if (slide.type === "cta") {
    html = renderCta({ imageUrl, pergunta: slide.pergunta || slide.title || "", italicWords: slide.italicWords || [] }, origin);
  } else {
    html = renderInspiration({ imageUrl, title: slide.title || "", subtitle: slide.subtitle || "", topLabel: slide.topLabel || "" }, origin);
  }
  const buf = await renderHtmlToPng(html);
  return { png: buf.toString("base64"), bytes: buf.length };
}

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
        if (name === "ideas_generate") {
          const r = await generateIdeas(args.nicho);
          return rpcOk(id, {
            content: [{ type: "text", text: JSON.stringify(r, null, 2) }],
            structuredContent: r,
          });
        }
        if (name === "copy_generate") {
          const r = await generateCopy(args.prompt || "", args.images);
          return rpcOk(id, {
            content: [{ type: "text", text: JSON.stringify(r, null, 2) }],
            structuredContent: r,
          });
        }
        if (name === "slide_render") {
          const r = await renderSlide(args.slide, args.imageUrl);
          return rpcOk(id, {
            content: [{ type: "text", text: `PNG gerado: ${r.bytes} bytes` }],
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
