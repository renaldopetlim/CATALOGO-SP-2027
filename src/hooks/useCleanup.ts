import { useCallback } from 'react';
import { getCleanupReport, listOrphanFiles, listStaleRecords } from '../services/cleanupService';
import type { StaleCriteria } from '../types/cleanup';
import { useResource } from './useResource';

/** Números gerais (Storage, arquivos sem uso, base). */
export function useCleanupReport(days: number) {
  const fetcher = useCallback(() => getCleanupReport(days), [days]);
  return useResource(`cleanup-report:${days}`, fetcher, 'analisar a base e o armazenamento');
}

/** Página de registros sem uso na base, conforme o critério. */
export function useStaleRecords(criteria: StaleCriteria, limit: number, offset: number) {
  const { mode, days } = criteria;
  const fetcher = useCallback(() => listStaleRecords({ mode, days }, { limit, offset }), [mode, days, limit, offset]);
  return useResource(JSON.stringify(['stale', mode, days, limit, offset]), fetcher, 'listar os registros sem uso');
}

/** Arquivos do bucket sem produto nem marca. */
export function useOrphanFiles() {
  return useResource('orphan-files', listOrphanFiles, 'listar os arquivos sem uso');
}
