import { useCallback, useEffect, useState } from 'react';
import { getCatalogItemById } from '../services/catalogService';
import type { ServiceError } from '../lib/errors';
import type { CatalogItemWithCategory } from '../types/catalog';
import { asServiceError, type AsyncStatus } from './asyncState';

export type UseItemDetailResult = {
  item: CatalogItemWithCategory | null;
  status: AsyncStatus;
  error: ServiceError | null;
  reload: () => void;
};

type Loaded = { key: string; item: CatalogItemWithCategory | null; error: ServiceError | null };

/**
 * Carrega um item pelo ID. Se `initial` (vindo da lista já carregada) tiver o
 * mesmo ID, é exibido na hora, sem nova requisição.
 */
export function useItemDetail(
  itemId: string | null,
  initial: CatalogItemWithCategory | null = null,
): UseItemDetailResult {
  const cached = initial && initial.id === itemId ? initial : null;
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${itemId ?? ''}:${attempt}`;
  const shouldFetch = Boolean(itemId) && !cached;

  useEffect(() => {
    if (!itemId || !shouldFetch) return;
    let cancelled = false;

    getCatalogItemById(itemId, 'public')
      .then((item) => {
        if (!cancelled) setLoaded({ key, item, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoaded({ key, item: null, error: asServiceError(err, 'carregar o item') });
      });

    return () => {
      cancelled = true;
    };
  }, [itemId, shouldFetch, key]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  if (cached) return { item: cached, status: 'success', error: null, reload };

  const current = loaded?.key === key ? loaded : null;
  const status: AsyncStatus = !current ? 'loading' : current.error ? 'error' : 'success';
  return { item: current?.item ?? null, status, error: current?.error ?? null, reload };
}
