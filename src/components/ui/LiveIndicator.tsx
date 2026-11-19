import { useCatalogSyncStatus } from '../../hooks/useCatalogLive';

type LiveIndicatorProps = {
  /**
   * Também mostra quando a conexão em tempo real não está ativa
   * (útil no admin, para saber se a lista pode estar desatualizada).
   */
  showOffline?: boolean;
};

/** Indicador discreto da atualização em tempo real (Supabase Realtime). */
export function LiveIndicator({ showOffline = false }: LiveIndicatorProps) {
  const status = useCatalogSyncStatus();

  if (status === 'live') {
    return (
      <span className="live" title="A lista se atualiza sozinha quando o catálogo muda">
        ao vivo
      </span>
    );
  }

  if (!showOffline || status === 'idle') return null;

  return (
    <span
      className="live off"
      title="Sem conexão em tempo real. A lista atualiza após suas alterações ou ao recarregar a página."
    >
      {status === 'connecting' ? 'conectando…' : 'reconectando…'}
    </span>
  );
}
