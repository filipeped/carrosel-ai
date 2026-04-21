import type { ProgressState } from "@/lib/types";

export function ProgressBar({ progress }: { progress: ProgressState }) {
  if (!progress) return null;
  return (
    <div className="mt-4 border border-white/10 rounded-lg bg-white/[0.03] p-4">
      {/* flex-wrap: se phase + pct/eta nao caberem, pct/eta vai pra linha debaixo
          inteiro (nunca quebra entre N% e Ns). min-w-0 permite truncar a phase. */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2 text-xs">
        <span className="opacity-85 min-w-0 break-words">{progress.phase}</span>
        <span className="tabular-nums opacity-70 whitespace-nowrap shrink-0">
          {Math.round(progress.pct)}%&nbsp;·&nbsp;{Math.ceil(progress.etaSec)}s
        </span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#d6e7c4] transition-all duration-300 ease-out"
          style={{ width: `${progress.pct}%` }}
        />
      </div>
    </div>
  );
}
