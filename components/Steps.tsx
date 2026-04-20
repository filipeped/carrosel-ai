export function Steps({ current }: { current: number }) {
  const names = ["Tema", "Curadoria", "Editor"];
  return (
    <div className="flex items-center gap-2 text-[10px] sm:text-xs tracking-widest uppercase">
      {names.map((n, i) => {
        const idx = i + 1;
        return (
          <div key={n} className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                idx === current ? "bg-white text-black" : idx < current ? "bg-white/30" : "bg-white/10"
              }`}
            >
              {idx}
            </span>
            <span className={idx === current ? "" : "opacity-50"}>{n}</span>
            {idx < 3 && <span className="opacity-20 mx-1 sm:mx-2">—</span>}
          </div>
        );
      })}
    </div>
  );
}
