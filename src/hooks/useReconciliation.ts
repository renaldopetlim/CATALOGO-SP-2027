import { useCallback } from 'react';
import { getReconciliationSummary, listReconciliation } from '../services/systemProductsService';
import type { ServiceError } from '../lib/errors';
import type {
  ReconciliationFilters,
  ReconciliationListResult,
  ReconciliationRow,
  ReconciliationStatus,
  ReconciliationSummary,
} from '../types/systemProducts';
import type { AsyncStatus } from './asyncState';
import { useCatalogLive } from './useCatalogLive';
import { useResource } from './useResource';

export type UseReconciliationResult = {
  list: ReconciliationListResult | null;
  summary: ReconciliationSummary | null;
  status: AsyncStatus;
  error: ServiceError | null;
  reload: () => void;
  /**
   * Tira da lista, na hora, códigos que acabaram de ser cadastrados num produto
   * (`published` = produto e categoria ativos). A recarga confirma em seguida.
   */
  markCataloged: (codes: readonly string[], published: boolean) => void;
  /** Tira da lista e dos contadores, na hora, registros excluídos da base. */
  markDeleted: (rows: ReadonlyArray<Pick<ReconciliationRow, 'code' | 'status'>>) => void;
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

  const { setData: setList } = list;
  const { setData: setSummary } = summary;
  const markCataloged = useCallback(
    (codes: readonly string[], published: boolean) => {
      const done = new Set(codes);
      const newStatus = published ? 'published' : 'inactive';
      setList((prev) => {
        const changed = prev.rows.filter((row) => done.has(row.code) && row.status === 'missing');
        if (changed.length === 0) return prev;
        // Some da lista quando a situação nova não faz parte do filtro atual.
        const keep = filter === newStatus || (filter === 'pending' && newStatus === 'inactive');
        return keep
          ? { ...prev, rows: prev.rows.map((row) => (done.has(row.code) ? { ...row, status: newStatus } : row)) }
          : { rows: prev.rows.filter((row) => !done.has(row.code)), total: Math.max(prev.total - changed.length, 0) };
      });
      setSummary((prev) => {
        const moved = Math.min(codes.length, prev.missing);
        return { ...prev, missing: prev.missing - moved, [newStatus]: prev[newStatus] + moved };
      });
      reload();
    },
    [filter, setList, setSummary, reload],
  );

  const markDeleted = useCallback(
    (rows: ReadonlyArray<Pick<ReconciliationRow, 'code' | 'status'>>) => {
      const gone = new Set(rows.map((row) => row.code));
      setList((prev) => {
        const kept = prev.rows.filter((row) => !gone.has(row.code));
        return { rows: kept, total: Math.max(prev.total - (prev.rows.length - kept.length), 0) };
      });
      setSummary((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          const status: ReconciliationStatus = row.status;
          next[status] = Math.max(next[status] - 1, 0);
        }
        next.total = next.missing + next.inactive + next.published;
        return next;
      });
      reload();
    },
    [setList, setSummary, reload],
  );

  return { list: list.data, summary: summary.data, status: list.status, error: list.error, reload, markCataloged, markDeleted };
}
