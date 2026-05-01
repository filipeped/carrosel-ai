"use client";
import { useEffect, useRef, useState } from "react";
import type { VegetacaoRow } from "@/lib/supabase";

const MIN_PLANTAS = 6;
const MAX_PLANTAS = 6;

type Props = {
  selected: VegetacaoRow[];
  onChange: (next: VegetacaoRow[]) => void;
  prompt: string;
  disabled?: boolean;
};

/**
 * Galeria visual pra modo CATALOG: grid 3-4 cols com foto + nome.
 * Usuario seleciona EXATAMENTE 6 plantas pra gerar o carrossel.
 */
export function PlantGallery({ selected, onChange, prompt, disabled }: Props) {
  const [pool, setPool] = useState<VegetacaoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carrega pool inicial baseado no prompt (ou amostra random se vazio)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/sugerir-plantas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt || "plantas para paisagismo", count: 20 }),
        });
        const d = await res.json();
        if (Array.isArray(d.plantas)) {
          // Filtra so com imagem_principal valida
          const validas = d.plantas.filter(
            (p: VegetacaoRow) => p.imagem_principal && p.imagem_principal.startsWith("http"),
          );
          setPool(validas);
        }
      } catch {
        /* silencioso */
      } finally {
        setLoading(false);
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [prompt]);

  // Busca por nome via autocomplete
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/buscar-plantas?q=${encodeURIComponent(q)}&limit=20`);
        const d = await res.json();
        if (Array.isArray(d.plantas)) {
          const validas = d.plantas.filter(
            (p: VegetacaoRow) => p.imagem_principal && p.imagem_principal.startsWith("http"),
          );
          setPool(validas);
        }
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  function toggle(p: VegetacaoRow) {
    const isSel = selected.some((s) => s.id === p.id);
    if (isSel) {
      onChange(selected.filter((s) => s.id !== p.id));
    } else if (selected.length < MAX_PLANTAS) {
      onChange([...selected, p]);
    }
  }

  // Mostra selecionadas no topo + pool abaixo (sem duplicar)
  const selectedIds = new Set(selected.map((s) => s.id));
  const poolFiltered = pool.filter((p) => !selectedIds.has(p.id));
  const display = [...selected, ...poolFiltered];

  const count = selected.length;
  const ok = count === MIN_PLANTAS;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className={`text-xs ${ok ? "text-[#d6e7c4]" : "opacity-60"}`}>
          <strong>{count}</strong> de {MIN_PLANTAS} selecionadas
          {!ok && count > 0 && (
            <span className="opacity-70"> · escolha mais {MIN_PLANTAS - count}</span>
          )}
          {ok && <span> · pronto pra gerar</span>}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar planta por nome..."
          className="bg-black/30 border border-white/15 rounded px-3 py-1.5 text-xs outline-none w-56"
          disabled={disabled}
        />
      </div>

      {loading && pool.length === 0 && (
        <div className="text-xs opacity-60 animate-pulse text-center py-8">
          Carregando plantas do banco...
        </div>
      )}

      {display.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {display.map((p) => {
            const isSel = selectedIds.has(p.id);
            const reachedMax = selected.length >= MAX_PLANTAS && !isSel;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p)}
                disabled={disabled || reachedMax}
                className={`relative aspect-square rounded overflow-hidden border-2 transition-all ${
                  isSel
                    ? "border-[#d6e7c4] scale-[0.97]"
                    : reachedMax
                    ? "border-white/5 opacity-30 cursor-not-allowed"
                    : "border-white/10 hover:border-white/40"
                }`}
                title={p.nome_cientifico || p.nome_popular}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.imagem_principal}
                  alt={p.nome_popular}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {/* Overlay com nome */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-1.5 pt-6">
                  <div className="text-[10px] sm:text-xs leading-tight font-medium text-white truncate">
                    {p.nome_popular}
                  </div>
                </div>
                {/* Badge de selecao */}
                {isSel && (
                  <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[#d6e7c4] text-black text-xs flex items-center justify-center font-bold">
                    {selected.findIndex((s) => s.id === p.id) + 1}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!loading && display.length === 0 && (
        <div className="text-xs opacity-60 text-center py-8">
          Nenhuma planta com foto encontrada. Tenta ajustar o tema ou buscar pelo nome.
        </div>
      )}
    </div>
  );
}
