import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateCopy } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Gera copy pros 6 slides dado um array de imagens ja escolhidas (ex.: do /api/v1/search).
 * Request: { prompt: string, images: ImageBankRow[] }
 * Response: { slides: SlideSpec[] }
 */
export async function POST(req: NextRequest) {
  const err = requireAuth(req);
  if (err) return err;
  try {
    const { prompt, images } = await req.json();
    if (!images?.length) return NextResponse.json({ error: "images[] required" }, { status: 400 });
    const r = await generateCopy(prompt || "", images);
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
