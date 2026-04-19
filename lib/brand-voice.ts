// Busca os posts de melhor performance do @digitalpaisagismo via Graph API,
// extrai top-20 por (saves + shares) e formata como referencia de estilo
// pra injetar no system prompt de geracao de legenda.

type IgPostWithInsights = {
  id: string;
  caption: string;
  permalink: string;
  timestamp: string;
  insights: { saved?: number; shares?: number; reach?: number; likes?: number; comments?: number };
};

type Cached = { block: string; posts: IgPostWithInsights[]; ts: number };
let _cached: Cached | null = null;
const TTL = 6 * 60 * 60 * 1000; // 6h

async function fetchPostsWithInsights(limit = 40): Promise<IgPostWithInsights[]> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const userId = process.env.INSTAGRAM_USER_ID;
  if (!token || !userId) return [];

  const fields = "id,caption,permalink,timestamp";
  const listRes = await fetch(
    `https://graph.facebook.com/v21.0/${userId}/media?fields=${fields}&limit=${limit}&access_token=${token}`,
  );
  const list = await listRes.json();
  if (list.error || !Array.isArray(list.data)) return [];

  const out: IgPostWithInsights[] = [];
  for (let i = 0; i < list.data.length; i += 5) {
    const batch = list.data.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (p: any) => {
        try {
          const metrics = "saved,shares,reach,likes,comments";
          const mr = await fetch(
            `https://graph.facebook.com/v21.0/${p.id}/insights?metric=${metrics}&access_token=${token}`,
          );
          const m = await mr.json();
          const insights: Record<string, number> = {};
          for (const item of m.data || []) insights[item.name] = item.values?.[0]?.value ?? 0;
          return { ...p, insights };
        } catch {
          return { ...p, insights: {} };
        }
      }),
    );
    out.push(...(results as IgPostWithInsights[]));
  }
  return out;
}

/**
 * Retorna bloco de texto com top-20 posts do perfil ordenados por
 * engajamento (saves + shares), pronto pra injetar no system prompt.
 * Cacheado por 6h in-memory.
 */
export async function getBrandVoiceReferences(force = false): Promise<string> {
  if (!force && _cached && Date.now() - _cached.ts < TTL) return _cached.block;

  try {
    const posts = await fetchPostsWithInsights(40);
    const ranked = posts
      .filter((p) => p.caption && p.caption.length >= 60)
      .sort(
        (a, b) =>
          (b.insights.saved ?? 0) + (b.insights.shares ?? 0) * 3 -
          ((a.insights.saved ?? 0) + (a.insights.shares ?? 0) * 3),
      )
      .slice(0, 20);

    if (ranked.length < 5) {
      // dados insuficientes — devolve cache antigo se tiver, ou vazio
      return _cached?.block || "";
    }

    const block = ranked
      .map(
        (p, i) =>
          `POST #${i + 1} (${p.insights.saved ?? 0} saves / ${p.insights.shares ?? 0} shares):\n${p.caption.trim()}`,
      )
      .join("\n\n---\n\n");

    _cached = {
      block:
        "EXEMPLOS DO TOM REAL DO @DIGITALPAISAGISMO — legendas dele que mais performaram. Imite ritmo, vocabulario, quebras de linha, tom emocional, jeito de começar e fechar. Nao copie trechos literais.\n\n" +
        block,
      posts: ranked,
      ts: Date.now(),
    };
    return _cached.block;
  } catch (e) {
    console.warn("[brand-voice] falhou:", e);
    return _cached?.block || "";
  }
}

/**
 * Forca refresh do cache e retorna metadata sobre os posts carregados.
 */
export async function refreshBrandVoice(): Promise<{
  ok: boolean;
  count: number;
  avg_saves?: number;
  posts?: { saves: number; shares: number; caption_preview: string }[];
}> {
  _cached = null;
  const block = await getBrandVoiceReferences(true);
  const cached = _cached as Cached | null;
  if (!block || !cached) return { ok: false, count: 0 };
  const posts = cached.posts;
  const avg = posts.reduce((s: number, p: IgPostWithInsights) => s + (p.insights.saved ?? 0), 0) / posts.length;
  return {
    ok: true,
    count: posts.length,
    avg_saves: Math.round(avg),
    posts: posts.map((p: IgPostWithInsights) => ({
      saves: p.insights.saved ?? 0,
      shares: p.insights.shares ?? 0,
      caption_preview: p.caption.slice(0, 100),
    })),
  };
}
