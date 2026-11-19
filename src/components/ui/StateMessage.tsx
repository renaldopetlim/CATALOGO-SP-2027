import type { ReactNode } from 'react';
import type { ServiceError } from '../../lib/errors';

type EmptyStateProps = {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
};

/** Lista vazia / nenhum resultado. */
export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className="state" role="status">
      <b>{title}</b>
      {children}
      {action && <div className="bar">{action}</div>}
    </div>
  );
}

type ErrorStateProps = {
  error: ServiceError | null;
  title?: string;
  onRetry?: () => void;
};

/** Erro com mensagem do serviço e botão "Tentar novamente". */
export function ErrorState({ error, title = 'Não foi possível carregar', onRetry }: ErrorStateProps) {
  return (
    <div className="state err" role="alert">
      <b>{title}</b>
      {error?.message ?? 'Ocorreu um erro inesperado.'}
      {onRetry && (
        <div className="bar">
          <button type="button" className="pri" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}

type SkeletonGridProps = {
  count?: number;
  label?: string;
};

/** Placeholder da grade enquanto os itens carregam. */
export function SkeletonGrid({ count = 6, label = 'Carregando itens…' }: SkeletonGridProps) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="grid" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="skeleton-card">
            <div className="skeleton skeleton-media" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        ))}
      </div>
    </div>
  );
}
