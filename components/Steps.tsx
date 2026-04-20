export function Steps({
  current,
  enabled,
  onNavigate,
}: {
  current: number;
  enabled: { 1: boolean; 2: boolean; 3: boolean };
  onNavigate?: (step: 1 | 2 | 3) => void;
}) {
  const names = ["Tema", "Curadoria", "Editor"];
  return (
    <div className="flex items-center gap-2 text-[10px] sm:text-xs tracking-widest uppercase">
      {names.map((n, i) => {
        const idx = (i + 1) as 1 | 2 | 3;
        const isEnabled = enabled[idx];
        const isCurrent = idx === current;
        const clickable = isEnabled && !isCurrent && onNavigate;
        const content = (
          <>
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                isCurrent
                  ? "bg-white text-black"
                  : isEnabled
                    ? "bg-white/30"
                    : "bg-white/10"
              }`}
            >
              {idx}
            </span>
            <span className={isCurrent ? "" : isEnabled ? "opacity-80" : "opacity-40"}>{n}</span>
          </>
        );
        return (
          <div key={n} className="flex items-center gap-1.5 sm:gap-2">
            {clickable ? (
              <button
                onClick={() => onNavigate(idx)}
                className="flex items-center gap-1.5 sm:gap-2 hover:opacity-100 transition-opacity cursor-pointer"
                title={`Ir para ${n}`}
              >
                {content}
              </button>
            ) : (
              <div
                className="flex items-center gap-1.5 sm:gap-2"
                title={isEnabled ? n : "Etapa anterior ainda nao foi preenchida"}
              >
                {content}
              </div>
            )}
            {idx < 3 && <span className="opacity-20 mx-1 sm:mx-2">—</span>}
          </div>
        );
      })}
    </div>
  );
}
