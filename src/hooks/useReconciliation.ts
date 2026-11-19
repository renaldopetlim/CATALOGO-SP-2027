import { useCallback } from 'react';
import { getReconciliationSummary, listReconciliation } from '../services/systemProductsService';
import type { ServiceError } from '../lib/errors';
import type { ReconciliationFilters, ReconciliationListResult, ReconciliationSummary } from '../types/systemProducts';
import type { AsyncStatus } from './asyncState';
import { useCatalogLive } from './useCatalogLive';
import { useResource } from './useResource';

export type UseReconciliationResult = {
  list: ReconciliationListResult | null;
  summary: ReconciliationSummary | null;
  status: AsyncStatus;
  error: ServiceError | null;
  reload: () => void;
};

/**
 * Lista da conciliação + resumo. Recarrega quando o catálogo muda (Realtime):
 * ao cadastrar um código no catálogo, ele sai da lista de pendentes.
 */
export function useReconciliation(filters: Required<Pick<ReconciliationFilters, 'filter' | 'search' | 'limit' | 'offset'>>): UseReconciliationResult {
  const { filter, search, limit, offset } = filters;
  const listFetcher = useCallback(() => listReconciliation({ filter, search, limit, offset }), [filter, search, limit, offset]);
  const list = useResource(JSON.stringify(['reconciliation', filter, search, limit, offset]), listFetcher, 'carregar a conciliação');
  const summary = useResource('reconciliation-summary', getReconciliationSummary, 'carregar o resumo');

  const reload = useCallback(() => {
    list.reload();
    summary.reload();
  }, [list, summary]);

  useCatalogLive(reload);

  return { list: list.data, summary: summary.data, status: list.status, error: list.error, reload };
}
