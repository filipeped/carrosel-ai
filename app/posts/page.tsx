"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Post = {
  id: string;
  prompt: string;
  tema?: string;
  thumb_url?: string | null;
  instagram_post_id: string;
  instagram_permalink?: string | null;
  instagram_posted_at?: string | null;
  caption_options?: { legenda?: string; hashtags?: string[] }[] | null;
};

function formatRelative(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const dias = Math.floor(h / 24);
  if (dias < 30) return `${dias}d atrás`;
  return d.toLocaleDateString("pt-BR");
}

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Post | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/carrosseis?onlyPosted=1&limit=60");
        const d = await r.json();
        if (d.error) throw new Error(d.error);
        setPosts(d.data || []);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  return (
    <main className="min-h-screen px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto">
      <header className="mb-6 sm:mb-8 flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[10px] sm:text-xs tracking-[4px] uppercase opacity-60">Histórico</div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl mt-1" style={{ fontFamily: "Georgia, serif" }}>
            Posts <i>publicados</i>
          </h1>
          <div className="text-xs opacity-60 mt-1">
            {posts ? `${posts.length} carrosseis publicados no Instagram` : "Carregando..."}
          </div>
        </div>
        <Link
          href="/"
          className="text-[10px] sm:text-xs tracking-widest uppercase opacity-60 hover:opacity-100 transition-opacity border border-white/20 hover:border-white/40 rounded px-3 py-1.5"
        >
          ← Gerador
        </Link>
      </header>

      {error && (
        <div className="mb-6 border border-red-400/40 bg-red-400/10 rounded px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {posts && posts.length === 0 && (
        <div className="text-center py-16 opacity-50">
          <div className="text-sm mb-4">Nenhum post publicado ainda.</div>
          <Link
            href="/"
            className="inline-block bg-[#d6e7c4] text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs"
          >
            Criar primeiro carrossel
          </Link>
        </div>
      )}

      {posts && posts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {posts.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="group text-left border border-white/10 rounded-lg overflow-hidden bg-white/[0.02] hover:border-white/30 transition-all"
            >
              <div className="aspect-[4/5] relative bg-black">
                {p.thumb_url ? (
                  <img
                    src={p.thumb_url}
                    alt={p.tema || p.prompt}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs opacity-40">
                    sem thumb
                  </div>
                )}
                <div className="absolute top-2 right-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full">
                  {formatRelative(p.instagram_posted_at)}
                </div>
              </div>
              <div className="p-3">
                <div className="text-xs line-clamp-2 leading-snug opacity-90">
                  {p.tema || p.prompt}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-[#0f1210] border border-white/15 rounded-2xl w-full max-w-[520px] overflow-hidden my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aspect-[4/5] bg-black">
              {selected.thumb_url && (
                <img
                  src={selected.thumb_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="p-5">
              <div className="text-[10px] tracking-widest uppercase opacity-50 mb-2">
                {formatRelative(selected.instagram_posted_at)}
              </div>
              <h3 className="text-lg mb-3 leading-snug" style={{ fontFamily: "Georgia, serif" }}>
                {selected.tema || selected.prompt}
              </h3>
              {selected.caption_options?.[0]?.legenda && (
                <div className="text-sm opacity-80 whitespace-pre-wrap leading-relaxed mb-4 max-h-48 overflow-y-auto border border-white/10 rounded p-3 bg-white/[0.02]">
                  {selected.caption_options[0].legenda}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setSelected(null)}
                  className="flex-1 min-h-[44px] border border-white/20 rounded px-4 py-2 text-xs tracking-wider uppercase hover:bg-white/5"
                >
                  Fechar
                </button>
                {selected.instagram_permalink && (
                  <a
                    href={selected.instagram_permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 min-h-[44px] bg-[#d6e7c4] text-black rounded px-4 py-2 text-xs tracking-wider uppercase text-center flex items-center justify-center hover:bg-[#c9dbb4]"
                  >
                    Ver no Instagram ↗
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
