"use client";
import { useEffect, useRef, useState } from "react";
import type { VegetacaoRow } from "@/lib/supabase";

const MIN_PLANTAS = 6;
const MAX_PLANTAS = 6;
const PAGE_SIZE = 30;

type Props = {
  selected: VegetacaoRow[];
  onChange: (next: VegetacaoRow[]) => void;
  prompt: string;
  disabled?: boolean;
};

type Mode = "sugerir" | "buscar" | "todas";

/**
 * Galeria visual pra modo CATALOG: grid de fotos + nome.
 * Filtra automaticamente plantas nao-paisagisticas (horticolas, daninhas etc).
 * Suporta 3 modos: sugestoes pelo tema, busca por nome, ver todas paginado.
 */
export function PlantGallery({ selected, onChange, prompt, disabled }: Props) {
  const [mode, setMode] = useState<Mode>("todas");
  const [pool, setPool] = useState<VegetacaoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modo "sugerir" — quando o tema tem 6+ chars
  useEffect(() => {
    if (mode !== "sugerir") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/sugerir-plantas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt || "plantas paisagismo", count: PAGE_SIZE }),
        });
        const d = await r.json();
        const ok = (d.plantas || []).filter(
          (p: VegetacaoRow) => p.imagem_principal && p.imagem_principal.startsWith("http"),
        );
        setPool(ok);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [mode, prompt]);

  // Modo "buscar" — quando ha texto de busca
  useEffect(() => {
    if (mode !== "buscar") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/buscar-plantas?q=${encodeURIComponent(search)}&limit=50`);
        const d = await r.json();
        const ok = (d.plantas || []).filter(
          (p: VegetacaoRow) => p.imagem_principal && p.imagem_principal.startsWith("http"),
        );
        setPool(ok);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [mode, search]);

  // Modo "todas" — paginacao
  async function loadPage(pageOffset: number, replace: boolean) {
    setLoading(true);
    try {
      const r = await fetch(`/api/listar-plantas?offset=${pageOffset}&limit=${PAGE_SIZE}`);
      const d = await r.json();
      const incoming = (d.plantas || []).filter(
        (p: VegetacaoRow) => p.imagem_principal && p.imagem_principal.startsWith("http"),
      );
      setPool((prev) => (replace ? incoming : [...prev, ...incoming]));
      setHasMore(!!d.hasMore);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (mode === "todas") {
      setOffset(0);
      loadPage(0, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function handleSearchChange(v: string) {
    setSearch(v);
    if (v.trim().length >= 2) setMode("buscar");
    else setMode("todas");
  }

  function loadMore() {
    const next = offset + 1;
    setOffset(next);
    loadPage(next, false);
  }

  function toggle(p: VegetacaoRow) {
    const isSel = selected.some((s) => s.id === p.id);
    if (isSel) {
      onChange(selected.filter((s) => s.id !== p.id));
    } else if (selected.length < MAX_PLANTAS) {
      onChange([...selected, p]);
    }
  }

  // Selecionadas no topo + pool sem duplicar
  const selectedIds = new Set(selected.map((s) => s.id));
  const poolFiltered = pool.filter((p) => !selectedIds.has(p.id));
  const display = [...selected, ...poolFiltered];

  const count = selected.length;
  const ok = count === MIN_PLANTAS;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className={`text-xs ${ok ? "text-[#d6e7c4]" : "opacity-70"}`}>
          <strong>{count}</strong> de {MIN_PLANTAS} selecionadas
          {!ok && count > 0 && (
            <span className="opacity-70"> · escolha mais {MIN_PLANTAS - count}</span>
          )}
          {ok && <span> · pronto pra gerar</span>}
        </div>
        <div className="flex items-center gap-2">
          {prompt.trim().length >= 6 && (
            <button
              type="button"
              onClick={() => {
                setMode(mode === "sugerir" ? "todas" : "sugerir");
                setSearch("");
              }}
              className={`text-[10px] tracking-wider uppercase px-2.5 py-1 rounded border transition-colors ${
                mode === "sugerir"
                  ? "border-[#d6e7c4] bg-[#d6e7c4]/15 text-[#d6e7c4]"
                  : "border-white/15 hover:border-white/30 opacity-70"
              }`}
              disabled={disabled}
            >
              ✨ Pelo tema
            </button>
          )}
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar por nome..."
            className="bg-black/30 border border-white/15 rounded px-3 py-1.5 text-xs outline-none w-48"
            disabled={disabled}
          />
        </div>
      </div>

      {loading && pool.length === 0 && (
        <div className="text-xs opacity-60 animate-pulse text-center py-12">
          Carregando plantas do banco...
        </div>
      )}

      {display.length > 0 && (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {display.map((p) => {
              const isSel = selectedIds.has(p.id);
              const reachedMax = selected.length >= MAX_PLANTAS && !isSel;
              const order = isSel ? selected.findIndex((s) => s.id === p.id) + 1 : null;
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
                      ? "border-white/5 opacity-25 cursor-not-allowed"
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
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5 pt-6">
                    <div className="text-[10px] sm:text-xs leading-tight font-medium text-white truncate">
                      {p.nome_popular}
                    </div>
                  </div>
                  {isSel && order !== null && (
                    <div className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-[#d6e7c4] text-black text-xs flex items-center justify-center font-bold shadow-lg">
                      {order}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Carregar mais — so no modo todas */}
          {mode === "todas" && hasMore && (
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={loading || disabled}
                className="text-xs tracking-wider uppercase px-4 py-2 border border-white/20 hover:border-white/40 rounded disabled:opacity-40"
              >
                {loading ? "Carregando..." : "Carregar mais 30"}
              </button>
            </div>
          )}
        </>
      )}

      {!loading && display.length === 0 && (
        <div className="text-xs opacity-60 text-center py-12">
          Nenhuma planta encontrada. Limpa a busca ou tenta outro tema.
        </div>
      )}
    </div>
  );
}
