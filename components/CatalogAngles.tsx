"use client";
import { CATALOG_ANGLES, type CatalogAngle } from "@/lib/catalog-angles";

type Props = {
  selectedId: string | null;
  onSelect: (angle: CatalogAngle) => void;
  disabled?: boolean;
};

/**
 * Grid de angulos virais pre-validados pro formato CATALOG.
 * Click num angulo: seta o tema (titulo) + framework + filtro.
 */
export function CatalogAngles({ selectedId, onSelect, disabled }: Props) {
  return (
    <div>
      <div className="text-xs tracking-widest uppercase opacity-60 mb-3">
        Angulos virais (escolha 1 ou crie tema custom no campo abaixo)
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CATALOG_ANGLES.map((a) => {
          const isSel = selectedId === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a)}
              disabled={disabled}
              className={`text-left rounded p-3 border transition-colors ${
                isSel
                  ? "border-[#d6e7c4] bg-[#d6e7c4]/10"
                  : "border-white/10 hover:border-white/30 bg-white/[0.02]"
              } disabled:opacity-40`}
            >
              <div className="text-sm leading-snug font-medium">
                <span className="mr-1.5">{a.emoji}</span>
                {a.titulo}
              </div>
              <div className="text-[11px] opacity-60 leading-snug mt-1">{a.hint}</div>
              <div className="text-[9px] uppercase tracking-widest opacity-40 mt-1.5">
                {a.framework.replace(/_/g, " ")}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
