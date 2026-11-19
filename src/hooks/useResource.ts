import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import type { ServiceError } from '../lib/errors';
import { asServiceError, type AsyncStatus } from './asyncState';

export type UseResourceResult<T> = {
  data: T | null;
  status: AsyncStatus;
  error: ServiceError | null;
  /** Busca de novo. Os dados atuais continuam visíveis até a resposta chegar. */
  reload: () => void;
  /** Substitui os dados localmente (atualização otimista). */
  setData: (updater: (prev: T) => T) => void;
};

type Loaded<T> = { key: string; attempt: number; data: T | null; error: ServiceError | null };

/**
 * Carrega um recurso assíncrono identificado por `key`.
 * - Troca de `key` → mostra "loading" e busca de novo.
 * - `reload()` com dados já exibidos → atualiza em segundo plano, sem piscar;
 *   se essa atualização falhar por rede, mantém os dados anteriores.
 * - Respostas de chaves antigas são descartadas.
 */
export function useResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  errorContext: string,
  enabled = true,
): UseResourceResult<T> {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const runFetch = useEffectEvent(() => fetcher());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    runFetch()
      .then((data) => {
        if (!cancelled) setLoaded({ key, attempt, data, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const error = asServiceError(err, errorContext);
        // Falha passageira (rede) numa recarga: mantém os dados atuais.
        // "Não encontrado"/"sem permissão" substituem (ex.: item inativado).
        const transient = error.kind === 'network' || error.kind === 'unknown';
        setLoaded((prev) =>
          transient && prev && prev.key === key && !prev.error
            ? { ...prev, attempt }
            : { key, attempt, data: null, error },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [key, attempt, enabled, errorContext]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const setData = useCallback(
    (updater: (prev: T) => T) =>
      setLoaded((prev) => (prev && prev.data !== null ? { ...prev, data: updater(prev.data) } : prev)),
    [],
  );

  const same = enabled && loaded?.key === key ? loaded : null;
  let status: AsyncStatus;
  if (!same) status = 'loading';
  else if (same.error) status = same.attempt === attempt ? 'error' : 'loading'; // "Tentar novamente" em andamento
  else status = 'success';

  return {
    data: status === 'success' ? (same?.data ?? null) : null,
    status,
    error: status === 'error' ? (same?.error ?? null) : null,
    reload,
    setData,
  };
}
