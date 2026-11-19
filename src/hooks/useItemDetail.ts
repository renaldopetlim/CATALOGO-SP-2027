import { useCallback } from 'react';
import { getCatalogItemById } from '../services/catalogService';
import type { ServiceError } from '../lib/errors';
import type { CatalogItemWithCategory } from '../types/catalog';
import type { AsyncStatus } from './asyncState';
import { useResource } from './useResource';

export type UseItemDetailResult = {
  item: CatalogItemWithCategory | null;
  status: AsyncStatus;
  error: ServiceError | null;
  reload: () => void;
};

/**
 * Carrega um item pelo ID. Se `initial` (vindo da lista já carregada) tiver o
 * mesmo ID, é exibido na hora, sem nova requisição.
 */
export function useItemDetail(
  itemId: string | null,
  initial: CatalogItemWithCategory | null = null,
): UseItemDetailResult {
  const cached = initial && initial.id === itemId ? initial : null;
  const fetcher = useCallback(() => getCatalogItemById(itemId ?? '', 'public'), [itemId]);
  const { data, status, error, reload } = useResource(
    `item:${itemId ?? ''}`,
    fetcher,
    'carregar o item',
    Boolean(itemId) && !cached,
  );

  if (cached) return { item: cached, status: 'success', error: null, reload };
  return { item: data, status, error, reload };
}
