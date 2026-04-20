"use client";
import { useEffect, useState } from "react";
import type { ProgressState } from "./types";

/**
 * Simulador de barra de progresso com fases nomeadas e ETA estimado.
 * Avanca ate 95% baseado no tempo estimado de cada fase, deixa 5% pro fim real.
 */
export function useProgressSim(
  active: boolean,
  phases: { name: string; seconds: number }[],
) {
  const [state, setState] = useState<ProgressState>(null);
  useEffect(() => {
    if (!active) {
      setState(null);
      return;
    }
    const totalSec = phases.reduce((s, p) => s + p.seconds, 0);
    const start = Date.now();
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      let acc = 0;
      let phaseName = phases[0].name;
      for (const p of phases) {
        if (elapsed < acc + p.seconds) {
          phaseName = p.name;
          break;
        }
        acc += p.seconds;
      }
      const pct = Math.min(95, (elapsed / totalSec) * 95);
      const etaSec = Math.max(0, totalSec - elapsed);
      setState({ pct, phase: phaseName, etaSec });
    };
    tick();
    const id = setInterval(tick, 300);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return state;
}
