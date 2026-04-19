// Instagram Graph API — publicacao de carrossel (ate 10 imagens).
// Requer: INSTAGRAM_ACCESS_TOKEN (long-lived), INSTAGRAM_USER_ID.
// Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing

const API_BASE = "https://graph.facebook.com/v21.0";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env ${name} nao configurada`);
  return v;
}

export type PublishCarouselInput = {
  imageUrls: string[];  // ate 10 URLs publicas (nao base64 — Instagram precisa de URL)
  caption: string;
};

export type PublishResult = {
  ok: boolean;
  permalink?: string;
  post_id?: string;
  error?: string;
};

async function igPost(path: string, body: Record<string, any>): Promise<any> {
  const token = requireEnv("INSTAGRAM_ACCESS_TOKEN");
  const url = `${API_BASE}${path}`;
  const params = new URLSearchParams({ ...body, access_token: token });
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await r.json();
  if (!r.ok || data.error) {
    throw new Error(`IG ${path}: ${JSON.stringify(data.error || data)}`);
  }
  return data;
}

async function igGet(path: string, extra: Record<string, any> = {}): Promise<any> {
  const token = requireEnv("INSTAGRAM_ACCESS_TOKEN");
  const params = new URLSearchParams({ ...extra, access_token: token });
  const r = await fetch(`${API_BASE}${path}?${params}`);
  const data = await r.json();
  if (!r.ok || data.error) {
    throw new Error(`IG GET ${path}: ${JSON.stringify(data.error || data)}`);
  }
  return data;
}

async function waitForContainer(containerId: string, timeout = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const s = await igGet(`/${containerId}`, { fields: "status_code" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR") throw new Error(`container ${containerId} ERROR`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`timeout aguardando container ${containerId}`);
}

/**
 * Publica carrossel (2-10 imagens).
 * @param input.imageUrls URLs publicas das imagens (Instagram busca por HTTP — nao aceita base64)
 * @param input.caption Texto completo do post (legenda + hashtags)
 */
export async function publishCarousel(input: PublishCarouselInput): Promise<PublishResult> {
  try {
    const userId = requireEnv("INSTAGRAM_USER_ID");
    if (!input.imageUrls?.length || input.imageUrls.length < 2) {
      throw new Error("carrossel precisa de pelo menos 2 imagens");
    }
    if (input.imageUrls.length > 10) {
      input.imageUrls = input.imageUrls.slice(0, 10);
    }

    // 1. Cria container pra cada imagem
    const itemContainers: string[] = [];
    for (const url of input.imageUrls) {
      const res = await igPost(`/${userId}/media`, {
        image_url: url,
        is_carousel_item: "true",
      });
      itemContainers.push(res.id);
    }

    // 2. Aguarda todos ficarem FINISHED (upload processado)
    await Promise.all(itemContainers.map((id) => waitForContainer(id)));

    // 3. Cria container do carrossel
    const carouselRes = await igPost(`/${userId}/media`, {
      media_type: "CAROUSEL",
      children: itemContainers.join(","),
      caption: input.caption,
    });

    // 4. Aguarda carrossel ficar pronto
    await waitForContainer(carouselRes.id);

    // 5. Publica
    const pub = await igPost(`/${userId}/media_publish`, {
      creation_id: carouselRes.id,
    });

    // 6. Busca permalink
    let permalink: string | undefined;
    try {
      const info = await igGet(`/${pub.id}`, { fields: "permalink" });
      permalink = info.permalink;
    } catch {}

    return { ok: true, post_id: pub.id, permalink };
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Busca insights de um post (saves, shares, reach, impressions).
 * Usado no learning loop pra re-ranqueamento de ideias.
 */
export async function getPostInsights(postId: string): Promise<any> {
  const metrics = "saved,shares,reach,impressions,engagement,likes,comments";
  return await igGet(`/${postId}/insights`, { metric: metrics });
}
