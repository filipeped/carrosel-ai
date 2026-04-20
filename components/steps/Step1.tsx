"use client";
import { useState } from "react";
import { useProgressSim } from "@/lib/hooks";
import { ProgressBar } from "../ProgressBar";

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
  const [ideas, setIdeas] = useState<{ titulo: string; hook: string }[] | null>(null);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasErr, setIdeasErr] = useState("");
  const [autoLoading, setAutoLoading] = useState(false);

  const ideasProgress = useProgressSim(ideasLoading || autoLoading, [
    { name: "Gerando 16 ideias virais (fase 1)", seconds: 20 },
    { name: "Filtrando as 8 mais fortes (curadoria IA)", seconds: 18 },
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

      // Registra as exibidas no historico (max 30)
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
      // usedIdeas guardadas no localStorage — evita sugerir a mesma toda vez
      let used: string[] = [];
      try {
        used = JSON.parse(localStorage.getItem("carrosel:usedIdeas") || "[]");
      } catch {}

      const r = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nicho: prompt || undefined,
          seed: Date.now(), // quebra cache
          exclude: used.slice(-30),
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (!Array.isArray(d.ideias) || !d.ideias.length) throw new Error("Sem ideia retornada");

      // Pega ideia aleatoria que nao foi usada recentemente
      const fresh = d.ideias.filter((i: { titulo: string }) => !used.includes(i.titulo));
      const pool = fresh.length > 0 ? fresh : d.ideias;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (!pick?.titulo) throw new Error("Sem ideia retornada");

      // Grava usada (max 30 historico)
      used.push(pick.titulo);
      if (used.length > 30) used = used.slice(-30);
      try {
        localStorage.setItem("carrosel:usedIdeas", JSON.stringify(used));
      } catch {}

      onSearch(pick.titulo);
    } catch (e) {
      setIdeasErr((e as Error).message);
    } finally {
      setAutoLoading(false);
    }
  }

  const anyLoading = loading || autoLoading;

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
      {ideas && ideas.length > 0 && (
        <div className="mt-6">
          <div className="text-xs tracking-widest uppercase opacity-60 mb-3">Temas sugeridos</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ideas.map((idea, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPrompt(idea.titulo)}
                className={`text-left border rounded-lg p-4 transition-colors ${
                  prompt === idea.titulo
                    ? "border-white bg-white/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/30"
                }`}
              >
                <div className="font-medium text-sm leading-snug mb-2">{idea.titulo}</div>
                <div className="text-xs opacity-60 leading-snug">{idea.hook}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
