import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const userId = process.env.INSTAGRAM_USER_ID;
  if (!token || !userId) {
    return NextResponse.json({ error: "env nao setadas" }, { status: 500 });
  }
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") || 30);
  const withInsights = url.searchParams.get("insights") !== "0";

  try {
    // 1. Check permissions do token
    const permRes = await fetch(
      `https://graph.facebook.com/v21.0/me/permissions?access_token=${token}`,
    );
    const perms = await permRes.json();

    // 2. Lista posts (campos minimos)
    const fields = "id,caption,media_type,permalink,timestamp";
    const listRes = await fetch(
      `https://graph.facebook.com/v21.0/${userId}/media?fields=${fields}&limit=${limit}&access_token=${token}`,
    );
    const list = await listRes.json();
    if (list.error) {
      return NextResponse.json(
        {
          error: "ao listar posts: " + JSON.stringify(list.error),
          permissions: perms.data,
          hint: "Token precisa de scope instagram_basic (leitura). Insights precisa de instagram_manage_insights + pages_read_engagement",
        },
        { status: 500 },
      );
    }
    const posts = list.data || [];

    // 3. Opcional: insights
    if (withInsights) {
      for (let i = 0; i < posts.length; i += 5) {
        const batch = posts.slice(i, i + 5);
        await Promise.all(
          batch.map(async (p: any) => {
            try {
              const metrics = "saved,shares,reach,likes,comments";
              const mr = await fetch(
                `https://graph.facebook.com/v21.0/${p.id}/insights?metric=${metrics}&access_token=${token}`,
              );
              const m = await mr.json();
              if (!m.error) {
                const byName: Record<string, number> = {};
                for (const item of m.data || []) byName[item.name] = item.values?.[0]?.value ?? 0;
                p.insights = byName;
              } else {
                p.insights_error = m.error.message;
              }
            } catch (e: any) {
              p.insights_error = String(e);
            }
          }),
        );
      }
      posts.sort(
        (a: any, b: any) => (b.insights?.saved || 0) - (a.insights?.saved || 0),
      );
    }

    return NextResponse.json({
      permissions: perms.data,
      count: posts.length,
      posts,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
