import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * POST /api/render/warm
 * Body: { imageUrls: string[] }
 *
 * Pre-aquece o cache de imagens na VPS antes do render real.
 * Cliente chama isso quando entra no Step 2 (selecao) pra que,
 * quando o user clicar Baixar/Postar, as fotos ja estejam em cache.
 *
 * Fire-and-forget — se der erro, nao aborta o fluxo.
 */
export async function POST(req: NextRequest) {
  const vpsUrl = process.env.RENDER_VPS_URL;
  const vpsToken = process.env.RENDER_VPS_TOKEN;
  if (!vpsUrl || !vpsToken) {
    return NextResponse.json({ warmed: false, reason: "vps_not_configured" });
  }
  try {
    const { imageUrls } = await req.json();
    if (!Array.isArray(imageUrls)) {
      return NextResponse.json({ error: "imageUrls[] required" }, { status: 400 });
    }
    const r = await fetch(`${vpsUrl.replace(/\/$/, "")}/warm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${vpsToken}`,
      },
      body: JSON.stringify({ imageUrls }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) {
      return NextResponse.json({ warmed: false, status: r.status });
    }
    const data = await r.json();
    return NextResponse.json({ warmed: true, ...data });
  } catch (e) {
    return NextResponse.json({ warmed: false, error: (e as Error).message });
  }
}
