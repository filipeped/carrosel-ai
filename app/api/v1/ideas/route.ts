// Proxy autenticado pra /api/ideas — mesma logica
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { POST as ideasHandler } from "../../ideas/route";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  const err = requireAuth(req);
  if (err) return err;
  // reutiliza o handler interno — apenas adiciona auth
  return ideasHandler(req);
}
