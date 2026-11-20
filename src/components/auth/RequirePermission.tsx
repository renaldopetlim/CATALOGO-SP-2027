import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSION_INFO, type PermissionKey } from '../../types/users';
import { AdminTopbar } from '../admin/AdminTopbar';
import { EmptyState } from '../ui/StateMessage';

type RequirePermissionProps = {
  permission: PermissionKey;
  /** Título da página (mantém o cabeçalho do painel no aviso). */
  title: string;
  children: ReactNode;
};

/** Página inteira restrita a uma permissão (ex.: Usuários, Importar, Limpeza). */
export function RequirePermission({ permission, title, children }: RequirePermissionProps) {
  const { can, isLoading } = usePermissions();
  if (isLoading) return null;
  if (can(permission)) return <>{children}</>;

  return (
    <>
      <AdminTopbar title={title} meta="Acesso restrito" />
      <div className="admin-content">
        <div className="admin-pad">
          <EmptyState
            title="Acesso restrito"
            action={
              <Link to="/admin" className="chip">
                Voltar aos itens do catálogo
              </Link>
            }
          >
            Seu perfil não tem a permissão “{PERMISSION_INFO[permission].label}”. Peça a quem administra os usuários
            para liberar, se precisar.
          </EmptyState>
        </div>
      </div>
    </>
  );
}

/** Faixa discreta no topo de telas em que o usuário só pode consultar. */
export function ReadOnlyNotice({ permission }: { permission: PermissionKey }) {
  const { can, isLoading } = usePermissions();
  if (isLoading || can(permission)) return null;
  return (
    <p className="readonly-notice" role="note">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      Modo consulta: seu perfil não tem a permissão “{PERMISSION_INFO[permission].label}”. Os botões de
      alteração ficam desabilitados.
    </p>
  );
}
