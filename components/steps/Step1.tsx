"use client";
import { useEffect, useState } from "react";
import { useProgressSim } from "@/lib/hooks";
import { ProgressBar } from "../ProgressBar";

const IDEAS_KEY = "carrosel:ideas:v1";

type Idea = { titulo: string; hook: string; gatilho?: string };

function loadStoredIdeas(): Idea[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(IDEAS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function Step1({
  prompt,
  setPrompt,
  loading,
  onSearch,
}: {
  prompt: string;
  setPrompt: (s: string) => void;
  loading: boolean;
  onSearch: (overridePrompt?: string) => void;
}) {
  // Lazy init — lê localStorage antes do primeiro render (evita flash)
  const stored = typeof window !== "undefined" ? loadStoredIdeas() : null;

  const [ideas, setIdeas] = useState<Idea[] | null>(stored);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasErr, setIdeasErr] = useState("");
  const [autoLoading, setAutoLoading] = useState(false);
  // Para gerar em paralelo: set de titulos selecionados + jobs em background
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bgJobs, setBgJobs] = useState<Record<string, "running" | "done" | "error">>({});
  const [bgSummary, setBgSummary] = useState<string | null>(null);

  // Persiste ideias no localStorage — somem so quando "Recomecar"
  useEffect(() => {
    try {
      if (ideas && ideas.length) {
        localStorage.setItem(IDEAS_KEY, JSON.stringify(ideas));
      }
    } catch {}
  }, [ideas]);

  const ideasProgress = useProgressSim(ideasLoading || autoLoading, [
    { name: "Gerando 12 ideias de curador", seconds: 18 },
    { name: "Filtrando por gatilhos virais (revelacao/sensorial/historia)", seconds: 8 },
  ]);

  async function generateIdeas() {
    setIdeasLoading(true);
    setIdeasErr("");
    try {
      let used: string[] = [];
      try {
        used = JSON.parse(localStorage.getItem("carrosel:usedIdeas") || "[]");
      } catch {}

      const r = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nicho: prompt || undefined,
          seed: Date.now(),
          exclude: used.slice(-30),
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const fresh = (d.ideias || []).filter(
        (i: { titulo: string }) => !used.includes(i.titulo),
      );
      const finalIdeas = fresh.length >= 4 ? fresh : d.ideias || [];
      setIdeas(finalIdeas);

      const newUsed = [...used, ...finalIdeas.map((i: { titulo: string }) => i.titulo)].slice(-30);
      try {
        localStorage.setItem("carrosel:usedIdeas", JSON.stringify(newUsed));
      } catch {}
    } catch (e) {
      setIdeasErr((e as Error).message);
    } finally {
      setIdeasLoading(false);
    }
  }

  async function autoViral() {
    setAutoLoading(true);
    setIdeasErr("");
    try {
      let used: string[] = [];
      try {
        used = JSON.parse(localStorage.getItem("carrosel:usedIdeas") || "[]");
      } catch {}

      const r = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nicho: prompt || undefined,
          seed: Date.now(),
          exclude: used.slice(-30),
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (!Array.isArray(d.ideias) || !d.ideias.length) throw new Error("Sem ideia retornada");

      const fresh = d.ideias.filter((i: { titulo: string }) => !used.includes(i.titulo));
      const pool = fresh.length > 0 ? fresh : d.ideias;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (!pick?.titulo) throw new Error("Sem ideia retornada");

      used.push(pick.titulo);
      if (used.length > 30) used = used.slice(-30);
      try {
        localStorage.setItem("carrosel:usedIdeas", JSON.stringify(used));
      } catch {}

      // Preserva as ideias atuais pro user voltar
      setIdeas(d.ideias);
      onSearch(pick.titulo);
    } catch (e) {
      setIdeasErr((e as Error).message);
    } finally {
      setAutoLoading(false);
    }
  }

  function toggleSelected(titulo: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(titulo)) next.delete(titulo);
      else next.add(titulo);
      return next;
    });
  }

  /**
   * Gera 1 carrossel completo em background (search + copy + caption).
   * Salva direto como rascunho em carrosseis_gerados. Nao navega — user continua na tela.
   */
  async function generateOneInBackground(titulo: string): Promise<"done" | "error"> {
    try {
      // 1. search-smart
      const s = await fetch("/api/search-smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: titulo, candidateCount: 24 }),
      });
      const sData = await s.json();
      if (sData.error) throw new Error(sData.error);
      const sel = sData.selection;
      const ordered = [sel.cover, ...sel.inner, sel.cta];

      // 2. copy
      const c = await fetch("/api/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: titulo, images: ordered }),
      });
      const cData = await c.json();
      if (cData.error) throw new Error(cData.error);
      const slidesArr = (cData.slides || []).slice(0, 10);

      // 3. salva como rascunho
      await fetch("/api/carrosseis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: titulo,
          slides: slidesArr,
          imagens_ids: ordered.map((im: { id: number }) => im.id),
        }),
      });

      // 4. gera legendas em background (fire-and-forget)
      fetch("/api/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: titulo,
          slides: slidesArr,
          imageUrls: ordered.map((im: { url: string }) => im.url).filter(Boolean).slice(0, 10),
        }),
      })
        .then((res) => res.json())
        .then((cap) => {
          if (cap.options?.length) {
            fetch("/api/captions-history", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt: titulo, options: cap.options }),
            }).catch(() => {});
          }
        })
        .catch(() => {});

      return "done";
    } catch (e) {
      console.error("bg job falhou:", (e as Error).message);
      return "error";
    }
  }

  async function generateSelectedInParallel() {
    if (selected.size === 0) return;
    setBgSummary(null);
    const titulos = [...selected];
    // Marca todos como running
    const initJobs: Record<string, "running" | "done" | "error"> = {};
    for (const t of titulos) initJobs[t] = "running";
    setBgJobs((prev) => ({ ...prev, ...initJobs }));

    // Dispara em paralelo
    const results = await Promise.all(
      titulos.map(async (t) => {
        const r = await generateOneInBackground(t);
        setBgJobs((prev) => ({ ...prev, [t]: r }));
        return { t, r };
      }),
    );

    const ok = results.filter((x) => x.r === "done").length;
    const err = results.filter((x) => x.r === "error").length;
    setBgSummary(
      `${ok} gerado(s) ${err > 0 ? `· ${err} falhou(ram)` : ""} — abre "Posts" pra editar.`,
    );
    setSelected(new Set());
  }

  const anyLoading = loading || autoLoading;
  const bgRunning = Object.values(bgJobs).some((s) => s === "running");

  return (
    <div className="max-w-3xl">
      <label className="block mb-2 text-sm opacity-80">Tema do carrossel</label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder="Ex: entradas monumentais em condominios fechados..."
        className="w-full bg-black/30 border border-white/15 rounded p-3 text-sm"
      />
      <div className="mt-4 grid grid-cols-1 sm:flex sm:flex-wrap gap-2">
        <button
          disabled={anyLoading}
          onClick={autoViral}
          className="bg-[color:var(--color-accent,#d6e7c4)] text-black px-5 py-2.5 min-h-[44px] rounded tracking-wider uppercase text-xs disabled:opacity-40"
          style={{ background: "#d6e7c4" }}
        >
          {autoLoading ? "Processando..." : "Sugerir + gerar carrossel viral"}
        </button>
        <button
          disabled={anyLoading}
          onClick={() => {
            if (!prompt.trim()) {
              setIdeasErr("Digite um tema antes de gerar.");
              return;
            }
            setIdeasErr("");
            onSearch();
          }}
          className="bg-white text-black px-5 py-2.5 min-h-[44px] rounded tracking-wider uppercase text-xs disabled:opacity-40"
        >
          {loading ? "Processando..." : "Gerar carrossel smart"}
        </button>
        <button
          type="button"
          disabled={ideasLoading || autoLoading}
          onClick={generateIdeas}
          className="border border-white/20 px-5 py-2.5 min-h-[44px] rounded tracking-wider uppercase text-xs hover:bg-white/5 disabled:opacity-40"
        >
          {ideasLoading ? "Pensando..." : ideas ? "Gerar mais ideias" : "Sugerir temas virais"}
        </button>
      </div>
      <ProgressBar progress={ideasProgress} />
      {ideasErr && <div className="mt-4 text-red-300 text-sm">Erro: {ideasErr}</div>}

      {/* Barra de acao em massa — so aparece quando tem ideias selecionadas */}
      {ideas && ideas.length > 0 && (selected.size > 0 || bgRunning || bgSummary) && (
        <div className="mt-5 border border-[#d6e7c4]/30 bg-[#d6e7c4]/5 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs opacity-80">
            {bgRunning && (
              <>
                Gerando {Object.values(bgJobs).filter((s) => s === "running").length} carrossel(s) em paralelo...
              </>
            )}
            {!bgRunning && selected.size > 0 && (
              <>
                <strong>{selected.size}</strong> idéia(s) selecionada(s) —
                cada uma vira um rascunho em <code>/posts</code>
              </>
            )}
            {!bgRunning && !selected.size && bgSummary && <>{bgSummary}</>}
          </div>
          {!bgRunning && selected.size > 0 && (
            <button
              onClick={generateSelectedInParallel}
              className="bg-[#d6e7c4] text-black px-4 py-2 min-h-[40px] rounded tracking-wider uppercase text-xs"
            >
              Gerar {selected.size} em paralelo →
            </button>
          )}
        </div>
      )}

      {ideas && ideas.length > 0 && (
        <div className="mt-6">
          <div className="text-xs tracking-widest uppercase opacity-60 mb-3 flex items-center justify-between">
            <span>Temas sugeridos (ficam salvos até &quot;Recomeçar&quot;)</span>
            <span className="opacity-60 normal-case tracking-normal text-[10px]">
              clica no card pra usar · ☐ pra marcar multiplas
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ideas.map((idea, i) => {
              const jobState = bgJobs[idea.titulo];
              const isSelected = selected.has(idea.titulo);
              return (
                <div
                  key={i}
                  className={`border rounded-lg p-4 transition-colors relative ${
                    prompt === idea.titulo
                      ? "border-white bg-white/10"
                      : isSelected
                      ? "border-[#d6e7c4] bg-[#d6e7c4]/10"
                      : "border-white/10 bg-white/[0.02] hover:border-white/30"
                  }`}
                >
                  {/* Checkbox pra multi-select */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelected(idea.titulo);
                    }}
                    disabled={jobState === "running"}
                    className={`absolute top-3 right-3 w-5 h-5 border rounded flex items-center justify-center text-[10px] ${
                      isSelected
                        ? "bg-[#d6e7c4] border-[#d6e7c4] text-black"
                        : "border-white/30 hover:border-white/60"
                    }`}
                    title={isSelected ? "Remover da selecao" : "Marcar pra gerar em paralelo"}
                  >
                    {isSelected ? "✓" : ""}
                  </button>

                  {/* Badge de status do bg job */}
                  {jobState && (
                    <div
                      className={`absolute top-3 right-11 text-[9px] uppercase tracking-widest px-2 py-0.5 rounded ${
                        jobState === "done"
                          ? "bg-green-500/20 text-green-200 border border-green-400/30"
                          : jobState === "error"
                          ? "bg-red-500/20 text-red-200 border border-red-400/30"
                          : "bg-yellow-500/20 text-yellow-200 border border-yellow-400/30 animate-pulse"
                      }`}
                    >
                      {jobState === "done" ? "pronto" : jobState === "error" ? "falhou" : "gerando..."}
                    </div>
                  )}

                  {/* Conteudo clicavel */}
                  <button
                    type="button"
                    onClick={() => setPrompt(idea.titulo)}
                    className="text-left w-full pr-8"
                  >
                    <div className="font-medium text-sm leading-snug mb-2">{idea.titulo}</div>
                    <div className="text-xs opacity-60 leading-snug">{idea.hook}</div>
                    {idea.gatilho && (
                      <div className="text-[9px] uppercase tracking-widest opacity-40 mt-2">
                        {idea.gatilho}
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
