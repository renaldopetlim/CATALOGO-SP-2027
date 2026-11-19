import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Assinatura única e compartilhada do Supabase Realtime para a vitrine.
 *
 * O banco incrementa `catalog_sync.version` a cada mudança em categorias ou
 * itens (ver migração 20261119020000). Aqui escutamos esse UPDATE e avisamos
 * todos os ouvintes (hooks de lista, categorias, detalhe), que recarregam os
 * dados pelas consultas normais.
 *
 * - Um único canal, independentemente de quantos componentes escutam.
 * - Avisos em sequência (ex.: reordenar 10 categorias) viram uma só recarga.
 * - Ao reconectar depois de uma queda, recarrega para recuperar o que perdeu.
 */

export type CatalogSyncStatus = 'idle' | 'connecting' | 'live' | 'offline';

type Listener = () => void;
type StatusListener = (status: CatalogSyncStatus) => void;

/** Junta avisos próximos numa única recarga. */
const DEBOUNCE_MS = 400;
/** Espera antes de fechar o canal sem ouvintes (evita reconectar ao trocar de página). */
const TEARDOWN_DELAY_MS = 2_000;

const listeners = new Set<Listener>();
const statusListeners = new Set<StatusListener>();

let channel: RealtimeChannel | null = null;
let status: CatalogSyncStatus = 'idle';
let hasBeenLive = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let teardownTimer: ReturnType<typeof setTimeout> | null = null;

function setStatus(next: CatalogSyncStatus): void {
  if (status === next) return;
  status = next;
  statusListeners.forEach((listener) => listener(next));
}

function notifyListeners(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('Erro ao processar atualização do catálogo.', error);
      }
    });
  }, DEBOUNCE_MS);
}

function connect(): void {
  if (channel) return;
  setStatus('connecting');

  channel = supabase
    .channel('catalog-sync')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'catalog_sync' }, () => notifyListeners())
    .subscribe((state, error) => {
      if (state === 'SUBSCRIBED') {
        // Reconexão: eventos podem ter sido perdidos enquanto estava fora.
        if (hasBeenLive) notifyListeners();
        hasBeenLive = true;
        setStatus('live');
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        // O cliente tenta reconectar sozinho; a recarga ao focar a aba cobre o intervalo.
        if (error) console.warn('Realtime indisponível no momento:', error.message);
        setStatus('offline');
      } else if (state === 'CLOSED') {
        setStatus(listeners.size > 0 ? 'offline' : 'idle');
      }
    });
}

function disconnect(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  const current = channel;
  channel = null;
  hasBeenLive = false;
  setStatus('idle');
  if (current) {
    supabase.removeChannel(current).catch((error: unknown) => {
      console.warn('Falha ao encerrar o canal do Realtime.', error);
    });
  }
}

/**
 * Registra um ouvinte de mudanças no catálogo.
 * @returns função para cancelar o registro.
 */
export function subscribeToCatalogChanges(listener: Listener): () => void {
  listeners.add(listener);
  if (teardownTimer) {
    clearTimeout(teardownTimer);
    teardownTimer = null;
  }
  connect();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && !teardownTimer) {
      teardownTimer = setTimeout(() => {
        teardownTimer = null;
        if (listeners.size === 0) disconnect();
      }, TEARDOWN_DELAY_MS);
    }
  };
}

/** Acompanha o estado da conexão (ex.: indicador "ao vivo"). */
export function subscribeToCatalogSyncStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function getCatalogSyncStatus(): CatalogSyncStatus {
  return status;
}
