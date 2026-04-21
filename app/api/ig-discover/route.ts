import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Descobre o Instagram Business User ID ligado ao access token.
 * Lista as pages do usuario e, pra cada page, o instagram_business_account.
 * Uso: GET /api/ig-discover  (dev local apenas)
 */
export async function GET() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "INSTAGRAM_ACCESS_TOKEN nao configurado" }, { status: 500 });
  }

  try {
    // 1. Quem sou eu?
    const meRes = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${token}`,
    );
    const me = await meRes.json();
    if (me.error) throw new Error(JSON.stringify(me.error));

    // 2. Pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account{id,username,name}&access_token=${token}`,
    );
    const pages = await pagesRes.json();
    if (pages.error) throw new Error(JSON.stringify(pages.error));

    const candidates: any[] = [];
    for (const p of pages.data || []) {
      if (p.instagram_business_account) {
        candidates.push({
          page_id: p.id,
          page_name: p.name,
          instagram_user_id: p.instagram_business_account.id,
          instagram_username: p.instagram_business_account.username,
        });
      }
    }

    return NextResponse.json({
      me,
      instagram_accounts: candidates,
      hint:
        candidates.length === 1
          ? `Adicione no .env.local: INSTAGRAM_USER_ID=${candidates[0].instagram_user_id}`
          : "Escolha o id certo e adicione como INSTAGRAM_USER_ID no .env.local",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
