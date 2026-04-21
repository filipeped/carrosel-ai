"use client";
import { useEffect, useRef, useState } from "react";
import type { ProgressState } from "./types";

/**
 * Barra de progresso ADAPTATIVA com fases nomeadas.
 *
 * Comportamento:
 * - Primeira execucao: usa soma dos `seconds` das fases como baseline
 * - Apos cada execucao bem-sucedida, grava tempo REAL em localStorage
 * - Proximas execucoes usam media das ultimas 5 duracoes reais → acurado
 * - Curva EASE-OUT: cresce rapido no inicio, suave no fim (sensacao de "anda sempre")
 * - Se ultrapassar baseline, continua ate 99% asymptotico
 * - Snap pra 100% quando `active` vira false
 *
 * @param historyKey chave opcional pra gravar historico em localStorage.
 *                   Use a mesma chave pra mesma operacao — aprende o tempo real.
 */
export function useProgressSim(
  active: boolean,
  phases: { name: string; seconds: number }[],
  historyKey?: string,
) {
  const [state, setState] = useState<ProgressState>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      // Terminou — grava duracao real no historico se tinha comecado
      if (startRef.current > 0 && historyKey) {
        const realSec = (Date.now() - startRef.current) / 1000;
        recordDuration(historyKey, realSec);
      }
      startRef.current = 0;
      // Snap 100% suave
      setState((prev) => (prev ? { ...prev, pct: 100, phase: "Concluído", etaSec: 0 } : null));
      const t = setTimeout(() => setState(null), 500);
      return () => clearTimeout(t);
    }

    // Calcula baseline: historico (se existir) ou soma das fases * fator conservador
    const estimated = phases.reduce((s, p) => s + p.seconds, 0);
    const historical = historyKey ? getAvgDuration(historyKey) : 0;
    // Histórico sempre prefere — real > estimativa. Se não, conservador 1.3x.
    const baseline = historical > 0 ? historical : estimated * 1.3;
    const start = Date.now();
    startRef.current = start;

    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;

      // Fase atual — mapeia elapsed proporcional na escala do baseline
      // (não nas durações originais, que podem estar defasadas)
      const scale = baseline / estimated;
      let acc = 0;
      let phaseName = phases[0].name;
      for (const p of phases) {
        const adj = p.seconds * scale;
        if (elapsed < acc + adj) {
          phaseName = p.name;
          break;
        }
        acc += adj;
        phaseName = p.name;
      }

      let pct: number;
      if (elapsed <= baseline) {
        // EASE-OUT: sqrt(t) cresce rapido no inicio, desacelera no fim
        // Assim o user ve progresso constante ate o baseline, sem "travada rapida em 95"
        const t = elapsed / baseline;
        pct = Math.sqrt(t) * 92;  // vai ate 92% no baseline
      } else {
        // Passou do baseline — assintota 92 → 99
        const overshoot = elapsed - baseline;
        pct = 92 + 7 * (1 - Math.exp(-overshoot / (baseline * 0.4)));
        phaseName = `${phases[phases.length - 1]?.name || "Finalizando"} (quase la)`;
      }

      const etaSec = Math.max(0, baseline - elapsed);
      setState({ pct: Math.min(99, pct), phase: phaseName, etaSec });
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return state;
}

/**
 * Historico de duracao real em localStorage — usado pelo useProgressSim
 * pra adaptar baseline a cada execucao.
 */
function recordDuration(key: string, seconds: number): void {
  if (typeof window === "undefined") return;
  try {
    const storeKey = `carrosel:duration:${key}`;
    const raw = localStorage.getItem(storeKey);
    const list: number[] = raw ? JSON.parse(raw) : [];
    list.push(seconds);
    // mantem so as ultimas 10 — decaimento implicito
    const trimmed = list.slice(-10);
    localStorage.setItem(storeKey, JSON.stringify(trimmed));
  } catch {}
}

function getAvgDuration(key: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const storeKey = `carrosel:duration:${key}`;
    const raw = localStorage.getItem(storeKey);
    if (!raw) return 0;
    const list: number[] = JSON.parse(raw);
    if (!list.length) return 0;
    // Media das ultimas 5 (mais estavel, menos ruido)
    const recent = list.slice(-5);
    return recent.reduce((s, n) => s + n, 0) / recent.length;
  } catch {
    return 0;
  }
}

/**
 * Mantem o device acordado enquanto `active=true`.
 *
 * Quando o user minimiza o browser no mobile, iOS/Android normalmente suspendem
 * o JS apos alguns segundos. Wake Lock API mantem a tela ligada (impede sleep),
 * garantindo que fetchs longos continuem ate responderem.
 *
 * Safari iOS 16.4+ e Chrome Android ~84+ suportam. Se nao suportar, fallback
 * silencioso — user nao perde nada alem de precisar nao bloquear a tela.
 */
export function useWakeLock(active: boolean): { supported: boolean; held: boolean } {
  const [held, setHeld] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const supported =
    typeof navigator !== "undefined" && "wakeLock" in navigator;

  useEffect(() => {
    if (!active || !supported) {
      setHeld(false);
      if (sentinelRef.current) {
        sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const request = async () => {
      try {
        const sentinel = await (navigator as Navigator & {
          wakeLock: { request: (type: "screen") => Promise<WakeLockSentinel> };
        }).wakeLock.request("screen");
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        setHeld(true);
        sentinel.addEventListener("release", () => {
          setHeld(false);
          sentinelRef.current = null;
        });
      } catch {
        setHeld(false);
      }
    };
    request();

    // Re-adquire se a aba ficar visivel de novo (iOS libera wake lock no background)
    const onVisibility = () => {
      if (document.visibilityState === "visible" && active && !sentinelRef.current) {
        request();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (sentinelRef.current) {
        sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }
    };
  }, [active, supported]);

  return { supported, held };
}

/**
 * True quando a aba do browser esta visivel (foreground).
 * Falso quando user trocou de app / minimizou.
 * Util pra mostrar alertas tipo "toca pra continuar".
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

type WakeLockSentinel = {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};
