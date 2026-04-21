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
  const currentName = names[current - 1];
  return (
    <div className="flex items-center gap-2 sm:gap-2 text-[10px] sm:text-xs tracking-widest uppercase">
      {/* Mobile: apenas bolinhas compactas + nome do step atual */}
      <div className="flex sm:hidden items-center gap-1.5">
        {names.map((n, i) => {
          const idx = (i + 1) as 1 | 2 | 3;
          const isEnabled = enabled[idx];
          const isCurrent = idx === current;
          const clickable = isEnabled && !isCurrent && onNavigate;
          const circle = (
            <span
              className={`w-2 h-2 rounded-full shrink-0 transition-all ${
                isCurrent
                  ? "bg-[#d6e7c4] w-6"
                  : isEnabled
                    ? "bg-white/50"
                    : "bg-white/15"
              }`}
            />
          );
          return clickable ? (
            <button
              key={n}
              onClick={() => onNavigate(idx)}
              className="p-1 -m-1"
              aria-label={`Ir para ${n}`}
            >
              {circle}
            </button>
          ) : (
            <div key={n} className="p-1 -m-1">{circle}</div>
          );
        })}
        <span className="ml-2 opacity-80">
          {current}/3 · {currentName}
        </span>
      </div>

      {/* Desktop: stepper completo com texto */}
      <div className="hidden sm:flex items-center gap-2">
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
            <div key={n} className="flex items-center gap-2">
              {clickable ? (
                <button
                  onClick={() => onNavigate(idx)}
                  className="flex items-center gap-2 hover:opacity-100 transition-opacity cursor-pointer"
                  title={`Ir para ${n}`}
                >
                  {content}
                </button>
              ) : (
                <div
                  className="flex items-center gap-2"
                  title={isEnabled ? n : "Etapa anterior ainda nao foi preenchida"}
                >
                  {content}
                </div>
              )}
              {idx < 3 && <span className="opacity-20 mx-2">—</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
