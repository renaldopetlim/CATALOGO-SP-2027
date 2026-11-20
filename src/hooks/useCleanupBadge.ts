import { useEffect, useState } from 'react';
import { onCleanupChanged } from '../lib/cleanupEvents';
import { getCleanupReport } from '../services/cleanupService';
import { useResource } from './useResource';

/**
 * Quantidade de itens que pedem limpeza (arquivos sem uso + registros que não
 * vieram na última planilha), para o contador do menu. Atualiza ao receber
 * `notifyCleanupChanged()` (exclusões, importações, limpezas).
 */
export function useCleanupBadge(enabled = true): number {
  const [version, setVersion] = useState(0);
  useEffect(() => onCleanupChanged(() => setVersion((v) => v + 1)), []);
  // Só consulta para quem tem a permissão de limpeza (a função recusa os demais).
  const report = useResource(`cleanup-badge:${version}`, () => getCleanupReport(), 'analisar a limpeza', enabled);
  // Mantém o último número durante a recarga, para o contador não piscar.
  const [last, setLast] = useState(0);
  const current = report.data ? report.data.orphans.files + report.data.base.staleLastImport : null;
  if (current !== null && current !== last) setLast(current);
  if (!enabled) return 0;
  return current ?? last;
}
