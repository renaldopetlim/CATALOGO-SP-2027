import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { EmptyState, ErrorState } from './ui/StateMessage';

/** Estado enviado ao /login para voltar à página pedida após entrar. */
export type LoginRedirectState = { from: string };

type ProtectedRouteProps = {
  children: ReactNode;
};

/**
 * Libera o conteúdo para quem tem acesso ATIVO ao painel (qualquer perfil).
 * - Sem sessão → /login (lembrando a página de origem)
 * - Logado sem permissão → aviso de acesso negado
 *
 * A segurança real está na RLS do banco: esta rota apenas evita exibir uma tela inútil.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { status, isAdmin, adminError, user, profile, signOut, recheckAdmin } = useAuth();
  const location = useLocation();

  if (status === 'loading' || (status === 'signed_in' && isAdmin === null)) {
    return (
      <main>
        <p className="state" role="status">
          Verificando acesso…
        </p>
      </main>
    );
  }

  if (status === 'signed_out') {
    const state: LoginRedirectState = { from: `${location.pathname}${location.search}` };
    return <Navigate to="/login" replace state={state} />;
  }

  if (adminError) {
    return (
      <main>
        <ErrorState error={adminError} title="Não foi possível verificar seu acesso" onRetry={recheckAdmin} />
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main>
        <EmptyState
          title={profile ? 'Acesso bloqueado' : 'Acesso restrito'}
          action={
            <>
              <button type="button" className="sec btn-sm" onClick={() => void signOut()}>
                Sair e entrar com outra conta
              </button>
              <Link to="/" className="chip">
                Ir para a vitrine
              </Link>
            </>
          }
        >
          {profile
            ? `O acesso da conta ${user?.email ?? ''} ao painel está bloqueado. Fale com quem administra os usuários.`
            : `A conta ${user?.email ?? ''} não tem acesso ao painel. Peça a quem administra os usuários para liberar o acesso.`}
        </EmptyState>
      </main>
    );
  }

  return <>{children}</>;
}
