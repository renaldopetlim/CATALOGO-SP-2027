/**
 * Aviso interno "a base ou o armazenamento mudou" (exclusões, importações,
 * limpezas). O contador do menu "Saúde e limpeza" se atualiza ao receber.
 */
const EVENT = 'catalog:cleanup-changed';

export function notifyCleanupChanged(): void {
  window.dispatchEvent(new Event(EVENT));
}

export function onCleanupChanged(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
