import { useEffect, useEffectEvent } from 'react';

/** Intervalo mínimo entre recargas automáticas, para não sobrecarregar o servidor. */
const MIN_INTERVAL_MS = 15_000;

/**
 * Executa `refetch` quando a aba volta a ficar visível (ex.: o admin editou
 * o catálogo em outra aba e voltou para a vitrine).
 */
export function useRefetchOnFocus(refetch: () => void, enabled = true): void {
  const onVisible = useEffectEvent(() => refetch());

  useEffect(() => {
    if (!enabled) return;
    let lastRun = Date.now();

    const handle = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRun < MIN_INTERVAL_MS) return;
      lastRun = Date.now();
      onVisible();
    };

    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [enabled]);
}
