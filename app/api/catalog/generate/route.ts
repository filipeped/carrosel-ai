import { NextRequest, NextResponse } from "next/server";
import { runCatalogCarousel } from "@/lib/catalog-pipeline";
import { fetchVegetacoesByIds } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt: string = (body?.prompt || "").trim();
    const plantasIds: string[] = Array.isArray(body?.plantas) ? body.plantas : [];

    if (plantasIds.length < 6) {
      return NextResponse.json(
        { error: "Selecione 6 plantas pra gerar o catalogo." },
        { status: 400 },
      );
    }

    const plantas = await fetchVegetacoesByIds(plantasIds);
    const result = await runCatalogCarousel(prompt, plantas);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
