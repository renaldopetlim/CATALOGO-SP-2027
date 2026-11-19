import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { listAdminItems, listPublicItems } from '../services/catalogService';
import type { ServiceError } from '../lib/errors';
import type { CatalogFilters, CatalogItemWithCategory, CatalogScope } from '../types/catalog';
import { asServiceError, type AsyncStatus } from './asyncState';
import { useCatalogLive } from './useCatalogLive';
import { useRefetchOnFocus } from './useRefetchOnFocus';

export const PAGE_SIZE = 24;
const MAX_RELOAD = 100;

export type UseCatalogItemsResult = {
  items: CatalogItemWithCategory[];
  total: number;
  /** Status da primeira página (troca de filtro). Recargas não voltam para "loading". */
  status: AsyncStatus;
  error: ServiceError | null;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: ServiceError | null;
  loadMore: () => void;
  /** Recarrega mantendo a lista visível e a quantidade já carregada. */
  reload: () => void;
};

type Options = {
  /** `false` adia a busca (ex.: aguardando resolver o slug da categoria). */
  enabled?: boolean;
  pageSize?: number;
  /** `admin` lista também inativos (respeitando `status`). Padrão: `public`. */
  scope?: CatalogScope;
  /** Recarrega quando a aba volta a ficar visível. Padrão: `true`. */
  refetchOnFocus?: boolean;
  /** Recarrega quando o catálogo muda no banco (Realtime). Padrão: só na vitrine. */
  live?: boolean;
};

type ListFilters = Pick<CatalogFilters, 'categoryId' | 'search' | 'featured' | 'sort' | 'status'>;

/** Resultado associado aos filtros que o geraram (`key`). */
type Loaded = {
  key: string;
  attempt: number;
  items: CatalogItemWithCategory[];
  total: number;
  error: ServiceError | null;
  loadingMore: boolean;
  loadMoreError: ServiceError | null;
};

/**
 * Lista paginada de itens (vitrine ou admin).
 * Troca de filtro → recomeça da primeira página; respostas de filtros
 * anteriores são descartadas. `reload()` atualiza em segundo plano.
 */
export function useCatalogItems(
  filters: ListFilters,
  { enabled = true, pageSize = PAGE_SIZE, scope = 'public', refetchOnFocus = true, live = scope === 'public' }: Options = {},
): UseCatalogItemsResult {
  const categoryId = filters.categoryId ?? null;
  const search = filters.search ?? '';
  const featured = filters.featured ?? false;
  const sort = filters.sort ?? 'recent';
  const statusFilter = filters.status ?? 'all';
  const fetchList = scope === 'admin' ? listAdminItems : listPublicItems;

  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const key = JSON.stringify([scope, categoryId, search, featured, sort, statusFilter, pageSize]);
  const same = enabled && loaded?.key === key ? loaded : null;

  // Quantos itens buscar numa recarga: o que já está na tela (mín. 1 página).
  const loadedCount = useEffectEvent(() => (same && !same.error ? same.items.length : 0));

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const limit = Math.min(Math.max(pageSize, loadedCount()), MAX_RELOAD);

    fetchList({ categoryId, search, featured, sort, status: statusFilter, limit, offset: 0 })
      .then((result) => {
        if (cancelled) return;
        setLoaded({ key, attempt, items: result.items, total: result.total, error: null, loadingMore: false, loadMoreError: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const error = asServiceError(err, 'carregar os itens do catálogo');
        // Falha numa recarga em segundo plano: mantém a lista atual.
        setLoaded((prev) =>
          prev && prev.key === key && !prev.error
            ? { ...prev, attempt }
            : { key, attempt, items: [], total: 0, error, loadingMore: false, loadMoreError: null },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, key, attempt, fetchList, categoryId, search, featured, sort, statusFilter, pageSize]);

  let status: AsyncStatus;
  if (!same) status = 'loading';
  else if (same.error) status = same.attempt === attempt ? 'error' : 'loading';
  else status = 'success';

  const items = status === 'success' && same ? same.items : [];
  const total = status === 'success' && same ? same.total : 0;

  const loadMore = useCallback(() => {
    if (!same || same.error || same.loadingMore || same.items.length >= same.total) return;
    const offset = same.items.length;

    const patch = (fn: (prev: Loaded) => Loaded) => setLoaded((prev) => (prev && prev.key === key ? fn(prev) : prev));
    patch((prev) => ({ ...prev, loadingMore: true, loadMoreError: null }));

    fetchList({ categoryId, search, featured, sort, status: statusFilter, limit: pageSize, offset })
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
  }, [same, key, fetchList, categoryId, search, featured, sort, statusFilter, pageSize]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useRefetchOnFocus(reload, enabled && refetchOnFocus);
  useCatalogLive(reload, enabled && live);

  return {
    items,
    total,
    status,
    error: status === 'error' ? (same?.error ?? null) : null,
    hasMore: status === 'success' && items.length < total,
    loadingMore: same?.loadingMore ?? false,
    loadMoreError: same?.loadMoreError ?? null,
    loadMore,
    reload,
  };
}
