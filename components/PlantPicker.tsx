"use client";
import { useEffect, useRef, useState } from "react";
import type { VegetacaoRow } from "@/lib/supabase";

type Props = {
  value: VegetacaoRow[];
  onChange: (next: VegetacaoRow[]) => void;
  disabled?: boolean;
  suggestionsLoading?: boolean;
  placeholder?: string;
};

export function PlantPicker({
  value,
  onChange,
  disabled,
  suggestionsLoading,
  placeholder = "Adicionar planta...",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VegetacaoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Debounce + autocomplete
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/buscar-plantas?q=${encodeURIComponent(q)}&limit=10`);
        const d = await r.json();
        const selectedIds = new Set(value.map((v) => v.id));
        const filtered = (d.plantas || []).filter((p: VegetacaoRow) => !selectedIds.has(p.id));
        setResults(filtered);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, value]);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function add(planta: VegetacaoRow) {
    if (value.some((v) => v.id === planta.id)) return;
    onChange([...value, planta]);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function remove(id: string) {
    onChange(value.filter((v) => v.id !== id));
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap gap-2 items-center min-h-[44px] p-2 bg-black/30 border border-white/15 rounded">
        {value.length === 0 && !suggestionsLoading && (
          <span className="text-xs opacity-40 px-1">
            Nenhuma planta selecionada — digite o tema acima pra ver sugestoes
          </span>
        )}
        {suggestionsLoading && value.length === 0 && (
          <span className="text-xs opacity-60 px-1 animate-pulse">
            Sugerindo plantas do banco...
          </span>
        )}
        {value.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1.5 bg-[#d6e7c4]/15 border border-[#d6e7c4]/40 text-[#d6e7c4] text-xs px-2.5 py-1 rounded-full"
          >
            <span>{p.nome_popular}</span>
            <button
              type="button"
              onClick={() => remove(p.id)}
              disabled={disabled}
              className="opacity-60 hover:opacity-100 leading-none text-sm disabled:opacity-30"
              title="Remover"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          disabled={disabled}
          placeholder={value.length === 0 ? "" : placeholder}
          className="flex-1 min-w-[140px] bg-transparent outline-none text-sm px-1 py-0.5 disabled:opacity-40"
        />
      </div>

      {open && (results.length > 0 || loading) && (
        <div className="absolute left-0 right-0 mt-1 bg-[#1a1d1a] border border-white/15 rounded shadow-lg z-20 max-h-72 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs opacity-60">Buscando...</div>
          )}
          {!loading &&
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => add(p)}
                className="w-full text-left px-3 py-2 hover:bg-white/5 border-b border-white/5 last:border-b-0"
              >
                <div className="text-sm">{p.nome_popular}</div>
                {p.nome_cientifico && (
                  <div className="text-[10px] opacity-50 italic">{p.nome_cientifico}</div>
                )}
                {p.luminosidade && (
                  <div className="text-[10px] opacity-40">{p.luminosidade}</div>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
