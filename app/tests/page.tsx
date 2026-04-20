"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Batch = {
  id: number;
  prompt: string;
  user_brief?: string;
  variants_count: number;
  created_at: string;
  completed_at?: string;
};

export default function TestsPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [newPrompt, setNewPrompt] = useState("");
  const [newBrief, setNewBrief] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/test-batch", { cache: "no-store" });
      const d = await r.json();
      setBatches(d.data || []);
    })();
  }, []);

  async function createBatch() {
    if (!newPrompt.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/test-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: newPrompt, userBrief: newBrief }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      router.push(`/tests/${d.batch_id}`);
    } catch (e) {
      alert(`Erro: ${(e as Error).message}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen px-4 sm:px-6 py-6 sm:py-8 max-w-5xl mx-auto">
      <header className="mb-6 sm:mb-8 flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[10px] sm:text-xs tracking-[4px] uppercase opacity-60">Calibração</div>
          <h1 className="text-2xl sm:text-3xl mt-1" style={{ fontFamily: "Georgia, serif" }}>
            A/B <i>testes</i>
          </h1>
          <div className="text-xs opacity-60 mt-1">
            Gera 10 variantes pra um tema. Tu avalia. IA aprende.
          </div>
        </div>
        <Link
          href="/"
          className="text-[10px] sm:text-xs tracking-widest uppercase opacity-60 hover:opacity-100 border border-white/20 hover:border-white/40 rounded px-3 py-1.5"
        >
          ← Gerador
        </Link>
      </header>

      <div className="border border-white/10 rounded-xl p-4 sm:p-6 mb-8 bg-white/[0.02]">
        <div className="text-[10px] tracking-[4px] uppercase opacity-60 mb-3">Novo teste</div>
        <textarea
          value={newPrompt}
          onChange={(e) => setNewPrompt(e.target.value)}
          placeholder="Tema do carrossel..."
          rows={2}
          className="w-full bg-black/30 border border-white/15 rounded p-3 text-sm mb-3"
        />
        <textarea
          value={newBrief}
          onChange={(e) => setNewBrief(e.target.value)}
          placeholder="Briefing extra (opcional) — ex: foque na Strelitzia, tom emocional, etc"
          rows={2}
          className="w-full bg-black/30 border border-white/15 rounded p-3 text-sm mb-3"
        />
        <button
          disabled={creating || !newPrompt.trim()}
          onClick={createBatch}
          className="bg-[#d6e7c4] text-black px-5 py-2.5 min-h-[44px] rounded tracking-wider uppercase text-xs disabled:opacity-40"
        >
          {creating ? "Gerando 10 variantes…" : "Rodar batch (10 variantes)"}
        </button>
        <div className="text-[10px] opacity-50 mt-2">
          Leva ~60-90s. Gera 1 busca de imagens + 10 legendas em paralelo.
        </div>
      </div>

      <div className="text-[10px] tracking-[4px] uppercase opacity-60 mb-3">Batches anteriores</div>
      {batches === null && <div className="opacity-50 text-sm">Carregando...</div>}
      {batches && batches.length === 0 && (
        <div className="opacity-50 text-sm">Nenhum batch ainda.</div>
      )}
      {batches && batches.length > 0 && (
        <div className="grid gap-3">
          {batches.map((b) => (
            <Link
              key={b.id}
              href={`/tests/${b.id}`}
              className="border border-white/10 rounded-lg p-4 hover:border-white/30 transition-colors"
            >
              <div className="text-sm font-medium leading-snug line-clamp-2">{b.prompt}</div>
              <div className="flex gap-4 text-[10px] opacity-60 mt-2 tracking-wider uppercase">
                <span>{new Date(b.created_at).toLocaleString("pt-BR")}</span>
                <span>{b.variants_count} variantes</span>
                <span>{b.completed_at ? "✓ completo" : "em andamento"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
