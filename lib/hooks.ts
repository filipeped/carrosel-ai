"use client";
import { useEffect, useRef, useState } from "react";
import type { ProgressState } from "./types";

/**
 * Barra de progresso simulada com fases nomeadas.
 *
 * Comportamento:
 * - Avanca proporcional ao tempo ate 90% no fim do totalSec estimado
 * - Apos 90%, continua crescendo ASSINTOTICO rumo a 99% (nunca trava)
 *   → user no mobile nao ve 95% parado pensando que travou
 * - Quando `active` vira false, snap pra 100% em 400ms e some
 */
export function useProgressSim(
  active: boolean,
  phases: { name: string; seconds: number }[],
) {
  const [state, setState] = useState<ProgressState>(null);
  const finishingRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      // Nao esta mais ativo — se tem progresso, snap pra 100% suave antes de some
      setState((prev) => {
        if (!prev) return null;
        // Marca inicio do "finish animation" pra decidir quanto tempo esperar
        finishingRef.current = Date.now();
        return { ...prev, pct: 100, phase: "Concluído", etaSec: 0 };
      });
      const t = setTimeout(() => {
        setState(null);
        finishingRef.current = null;
      }, 500);
      return () => clearTimeout(t);
    }

    finishingRef.current = null;
    const totalSec = phases.reduce((s, p) => s + p.seconds, 0);
    const start = Date.now();

    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      // Fase atual: acumula ate encontrar a faixa onde elapsed cai
      let acc = 0;
      let phaseName = phases[0].name;
      for (const p of phases) {
        if (elapsed < acc + p.seconds) {
          phaseName = p.name;
          break;
        }
        acc += p.seconds;
        phaseName = p.name;
      }

      let pct: number;
      if (elapsed <= totalSec) {
        // 0 → 90% proporcional ao tempo estimado
        pct = (elapsed / totalSec) * 90;
      } else {
        // Passou do estimado: assintota 90 → 99
        // Cada totalSec extra adiciona ~50% do gap restante ate 99
        const overshoot = elapsed - totalSec;
        const gap = 9;  // 99 - 90
        pct = 90 + gap * (1 - Math.exp(-overshoot / (totalSec || 20)));
        // Muda mensagem de fase pra sinalizar "quase la, so mais um pouco"
        phaseName = `${phases[phases.length - 1]?.name || "Finalizando"} (quase la)`;
      }

      const etaSec = Math.max(0, totalSec - elapsed);
      setState({ pct: Math.min(99, pct), phase: phaseName, etaSec });
    };

    tick();
    const id = setInterval(tick, 300);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return state;
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
