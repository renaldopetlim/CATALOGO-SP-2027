import { useCallback, useEffect, useState } from 'react';
import { listPublicItems } from '../services/catalogService';
import type { ServiceError } from '../lib/errors';
import type { CatalogFilters, CatalogItemWithCategory } from '../types/catalog';
import { asServiceError, type AsyncStatus } from './asyncState';

export const PAGE_SIZE = 24;

export type UseCatalogItemsResult = {
  items: CatalogItemWithCategory[];
  total: number;
  /** Status da primeira página (troca de filtro). */
  status: AsyncStatus;
  error: ServiceError | null;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: ServiceError | null;
  loadMore: () => void;
  reload: () => void;
};

type Options = {
  /** `false` adia a busca (ex.: aguardando resolver o slug da categoria). */
  enabled?: boolean;
  pageSize?: number;
};

type ListFilters = Pick<CatalogFilters, 'categoryId' | 'search' | 'featured' | 'sort'>;

/** Resultado associado à consulta que o gerou (`key`). */
type Loaded = {
  key: string;
  items: CatalogItemWithCategory[];
  total: number;
  error: ServiceError | null;
  loadingMore: boolean;
  loadMoreError: ServiceError | null;
};

/**
 * Lista paginada de itens da vitrine.
 * Cada troca de filtro recomeça da primeira página; respostas de filtros
 * anteriores são descartadas (comparação por `key`).
 */
export function useCatalogItems(
  filters: ListFilters,
  { enabled = true, pageSize = PAGE_SIZE }: Options = {},
): UseCatalogItemsResult {
  const categoryId = filters.categoryId ?? null;
  const search = filters.search ?? '';
  const featured = filters.featured ?? false;
  const sort = filters.sort ?? 'recent';

  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const key = JSON.stringify([categoryId, search, featured, sort, pageSize, attempt]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    listPublicItems({ categoryId, search, featured, sort, limit: pageSize, offset: 0 })
      .then((result) => {
        if (cancelled) return;
        setLoaded({ key, items: result.items, total: result.total, error: null, loadingMore: false, loadMoreError: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const error = asServiceError(err, 'carregar os itens do catálogo');
        setLoaded({ key, items: [], total: 0, error, loadingMore: false, loadMoreError: null });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, key, categoryId, search, featured, sort, pageSize]);

  const current = enabled && loaded?.key === key ? loaded : null;
  const status: AsyncStatus = !current ? 'loading' : current.error ? 'error' : 'success';
  const items = current?.items ?? [];
  const total = current?.total ?? 0;
  const loadingMore = current?.loadingMore ?? false;

  const loadMore = useCallback(() => {
    if (!current || current.error || current.loadingMore || current.items.length >= current.total) return;
    const offset = current.items.length;

    // Atualiza só se o resultado ainda for desta consulta.
    const patch = (fn: (prev: Loaded) => Loaded) =>
      setLoaded((prev) => (prev && prev.key === key ? fn(prev) : prev));

    patch((prev) => ({ ...prev, loadingMore: true, loadMoreError: null }));

    listPublicItems({ categoryId, search, featured, sort, limit: pageSize, offset })
      .then((result) => {
        patch((prev) => {
          const seen = new Set(prev.items.map((item) => item.id));
          return {
            ...prev,
            items: [...prev.items, ...result.items.filter((item) => !seen.has(item.id))],
            total: result.total,
            loadingMore: false,
          };
        });
      })
      .catch((err: unknown) => {
        patch((prev) => ({ ...prev, loadingMore: false, loadMoreError: asServiceError(err, 'carregar mais itens') }));
      });
  }, [current, key, categoryId, search, featured, sort, pageSize]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    items,
    total,
    status,
    error: current?.error ?? null,
    hasMore: status === 'success' && items.length < total,
    loadingMore,
    loadMoreError: current?.loadMoreError ?? null,
    loadMore,
    reload,
  };
}
