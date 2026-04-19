import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Auth por API token. Ler via:
 *   Authorization: Bearer <token>
 *   X-API-Key: <token>
 *
 * Configurar em env: CARROSEL_API_TOKEN (ou CLAWDBOT_API_TOKEN, aceita ambas).
 */
function getExpectedToken(): string | null {
  return process.env.CARROSEL_API_TOKEN || process.env.CLAWDBOT_API_TOKEN || null;
}

function readToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  const k = req.headers.get("x-api-key");
  return k ? k.trim() : null;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function requireAuth(req: NextRequest): NextResponse | null {
  const expected = getExpectedToken();
  if (!expected) {
    return NextResponse.json(
      { error: "Server misconfigured: CARROSEL_API_TOKEN nao configurado" },
      { status: 500 },
    );
  }
  const got = readToken(req);
  if (!got || !safeEqual(got, expected)) {
    return NextResponse.json(
      { error: "Unauthorized. Use header 'Authorization: Bearer <token>' ou 'X-API-Key: <token>'" },
      { status: 401 },
    );
  }
  return null; // ok
}
