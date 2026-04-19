import { NextResponse } from "next/server";
import { refreshBrandVoice } from "@/lib/brand-voice";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const r = await refreshBrandVoice();
  return NextResponse.json(r);
}
export async function GET() {
  return POST();
}
