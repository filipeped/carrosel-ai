"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type PostRow = {
  id: string;
  prompt: string;
  tema?: string;
  thumb_url?: string | null;
  instagram_post_id?: string | null;
  instagram_permalink?: string | null;
  instagram_posted_at?: string | null;
  caption_options?: { legenda?: string; hashtags?: string[] }[] | null;
  draft_caption?: string | null;
  scheduled_for?: string | null;
  is_draft?: boolean;
  created_at?: string;
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
  const router = useRouter();
  const [tab, setTab] = useState<"posted" | "drafts">("posted");
  const [posted, setPosted] = useState<PostRow[] | null>(null);
  const [drafts, setDrafts] = useState<PostRow[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PostRow | null>(null);
  const [loadingDraft, setLoadingDraft] = useState<string | null>(null);

  async function loadPosts() {
    try {
      const r = await fetch("/api/carrosseis?onlyPosted=1&limit=60");
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setPosted(d.data || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadDrafts() {
    try {
      const r = await fetch("/api/drafts");
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setDrafts(d.data || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    loadPosts();
    loadDrafts();
  }, []);

  async function openInEditor(id: string) {
    setLoadingDraft(id);
    try {
      const r = await fetch(`/api/carrosseis/${id}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const row = d.data;
      const images: { id: number; url: string }[] = row.images || [];
      if (!images.length) throw new Error("Imagens nao encontradas");

      // Monta selection com cover/inner/cta baseado em imagens_ids
      const selection = {
        cover: images[0],
        inner: images.slice(1, 5),
        cta: images[5] || images[images.length - 1],
        alternatives: [],
        rationale: "",
      };

      // Salva no localStorage que o Home le
      localStorage.setItem(
        "carrosel:state:v1",
        JSON.stringify({
          step: 3,
          prompt: row.prompt,
          selection,
          slides: row.slides || [],
          allImages: [selection.cover, ...selection.inner, selection.cta],
          carrosselId: row.id,
        }),
      );
      if (row.draft_caption) {
        localStorage.setItem("carrosel:caption:v1", row.draft_caption);
      }
      router.push("/");
    } catch (e) {
      alert(`Erro: ${(e as Error).message}`);
      setLoadingDraft(null);
    }
  }

  async function deleteDraft(id: string) {
    if (!confirm("Apagar esse rascunho?")) return;
    try {
      const r = await fetch(`/api/drafts?id=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("falha");
      setDrafts((prev) => prev?.filter((p) => p.id !== id) || null);
    } catch (e) {
      alert(`Erro: ${(e as Error).message}`);
    }
  }

  async function republish(id: string) {
    if (!confirm("Reabrir esse post como rascunho pra repostar no Instagram?")) return;
    try {
      const r = await fetch(`/api/posts/${id}/republish`, { method: "POST" });
      if (!r.ok) throw new Error("falha");
      setSelected(null);
      // Recarrega no editor
      await openInEditor(id);
    } catch (e) {
      alert(`Erro: ${(e as Error).message}`);
    }
  }

  const list = tab === "posted" ? posted : drafts;
  const total = list?.length ?? 0;

  return (
    <main className="min-h-screen px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto">
      <header className="mb-6 sm:mb-8 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] sm:text-xs tracking-[4px] uppercase opacity-60">Biblioteca</div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl mt-1" style={{ fontFamily: "Georgia, serif" }}>
            Posts &amp; <i>rascunhos</i>
          </h1>
        </div>
        <Link
          href="/"
          className="text-[10px] sm:text-xs tracking-widest uppercase opacity-60 hover:opacity-100 transition-opacity border border-white/20 hover:border-white/40 rounded px-3 py-1.5"
        >
          ← Gerador
        </Link>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/10">
        <button
          onClick={() => setTab("posted")}
          className={`px-4 py-2.5 text-xs tracking-widest uppercase transition-colors ${
            tab === "posted"
              ? "border-b-2 border-[#d6e7c4] text-white"
              : "opacity-50 hover:opacity-80"
          }`}
        >
          Publicados {posted ? `(${posted.length})` : ""}
        </button>
        <button
          onClick={() => setTab("drafts")}
          className={`px-4 py-2.5 text-xs tracking-widest uppercase transition-colors ${
            tab === "drafts"
              ? "border-b-2 border-[#d6e7c4] text-white"
              : "opacity-50 hover:opacity-80"
          }`}
        >
          Rascunhos {drafts ? `(${drafts.length})` : ""}
        </button>
      </div>

      {error && (
        <div className="mb-6 border border-red-400/40 bg-red-400/10 rounded px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {list === null && <div className="text-center py-12 opacity-50 text-sm">Carregando...</div>}

      {list && total === 0 && tab === "posted" && (
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

      {list && total === 0 && tab === "drafts" && (
        <div className="text-center py-16 opacity-50">
          <div className="text-sm">Nenhum rascunho salvo.</div>
          <div className="text-xs mt-2">
            No editor, clica "Salvar rascunho" pra guardar aqui.
          </div>
        </div>
      )}

      {list && total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {list.map((p) => (
            <div
              key={p.id}
              className="group relative border border-white/10 rounded-lg overflow-hidden bg-white/[0.02] hover:border-white/30 transition-all"
            >
              <button
                onClick={() =>
                  tab === "posted" ? setSelected(p) : openInEditor(p.id)
                }
                disabled={loadingDraft === p.id}
                className="text-left w-full disabled:opacity-50"
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
                    {formatRelative(p.instagram_posted_at || p.created_at)}
                  </div>
                  {tab === "drafts" && (
                    <div className="absolute top-2 left-2 bg-amber-500/90 text-black text-[10px] px-2 py-0.5 rounded-full font-medium">
                      Rascunho
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="text-xs line-clamp-2 leading-snug opacity-90">
                    {p.tema || p.prompt}
                  </div>
                  {tab === "drafts" && loadingDraft === p.id && (
                    <div className="text-[10px] opacity-60 mt-1">Abrindo...</div>
                  )}
                </div>
              </button>
              {tab === "drafts" && (
                <button
                  onClick={() => deleteDraft(p.id)}
                  className="absolute bottom-3 right-3 text-[10px] uppercase tracking-wider opacity-0 group-hover:opacity-100 bg-red-500/80 hover:bg-red-500 text-white px-2 py-1 rounded transition-opacity"
                >
                  apagar
                </button>
              )}
            </div>
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
                <img src={selected.thumb_url} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="p-5">
              <div className="text-[10px] tracking-widest uppercase opacity-50 mb-2">
                {formatRelative(selected.instagram_posted_at || selected.created_at)}
              </div>
              <h3 className="text-lg mb-3 leading-snug" style={{ fontFamily: "Georgia, serif" }}>
                {selected.tema || selected.prompt}
              </h3>
              {selected.caption_options?.[0]?.legenda && (
                <div className="text-sm opacity-80 whitespace-pre-wrap leading-relaxed mb-4 max-h-48 overflow-y-auto border border-white/10 rounded p-3 bg-white/[0.02]">
                  {selected.caption_options[0].legenda}
                </div>
              )}
              <div className="flex flex-col gap-2">
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
                <button
                  onClick={() => republish(selected.id)}
                  className="w-full min-h-[44px] border border-amber-400/40 text-amber-200 rounded px-4 py-2 text-xs tracking-wider uppercase hover:bg-amber-400/10"
                  title="Se apagou o post no IG e quer repostar"
                >
                  ↻ Repostar (usar se apagou no IG)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
