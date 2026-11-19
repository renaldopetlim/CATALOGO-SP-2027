import { useEffect, useEffectEvent, useSyncExternalStore } from 'react';
import {
  getCatalogSyncStatus,
  subscribeToCatalogChanges,
  subscribeToCatalogSyncStatus,
  type CatalogSyncStatus,
} from '../lib/catalogSync';

/**
 * Executa `refetch` sempre que o catálogo mudar no banco (Supabase Realtime).
 * Todos os componentes compartilham uma única conexão.
 */
export function useCatalogLive(refetch: () => void, enabled = true): void {
  const onChange = useEffectEvent(() => refetch());

  useEffect(() => {
    if (!enabled) return;
    return subscribeToCatalogChanges(() => onChange());
  }, [enabled]);
}

/** Estado da conexão em tempo real: `live`, `connecting`, `offline` ou `idle`. */
export function useCatalogSyncStatus(): CatalogSyncStatus {
  return useSyncExternalStore(subscribeToCatalogSyncStatus, getCatalogSyncStatus, () => 'idle');
}
