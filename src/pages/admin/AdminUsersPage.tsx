import { useState } from 'react';
import { AdminTopbar } from '../../components/admin/AdminTopbar';
import { DateCell } from '../../components/admin/DateCell';
import { UserForm } from '../../components/admin/UserForm';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '../../components/ui/StateMessage';
import { Toast } from '../../components/ui/Toast';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useToast } from '../../hooks/useToast';
import { useUsers } from '../../hooks/useUsers';
import { isServiceError } from '../../lib/errors';
import { stripAccents } from '../../lib/format';
import { cancelInvite } from '../../services/userService';
import { PERMISSION_INFO, PERMISSION_KEYS, ROLE_INFO, type ManagedUser, type UserAccountStatus } from '../../types/users';

type Editing = { user: ManagedUser | null };
type StatusFilter = 'all' | UserAccountStatus;

const STATUS_INFO: Record<UserAccountStatus, { label: string; className: string; hint: string }> = {
  active: { label: 'Ativo', className: 'pill-valid', hint: 'Entra no painel com as permissões do perfil.' },
  blocked: { label: 'Bloqueado', className: 'pill-invalid', hint: 'Não vê nem altera nada no painel.' },
  no_access: { label: 'Sem acesso', className: 'pill', hint: 'Existe no Supabase Auth, mas não tem perfil no painel.' },
  invited: { label: 'Pré-cadastrado', className: 'pill-duplicate', hint: 'Aguardando a conta ser criada no Supabase Auth.' },
};

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'blocked', label: 'Bloqueados' },
  { value: 'no_access', label: 'Sem acesso' },
  { value: 'invited', label: 'Pré-cadastrados' },
];

const norm = (value: string) => stripAccents(value).toLowerCase();

/** Painel "Usuários e permissões" (só para quem tem can_manage_users). */
export function AdminUsersPage() {
  useDocumentTitle('Admin · Usuários e permissões');
  const { user: me } = useAuth();
  const users = useUsers();
  const { toast, show, dismiss } = useToast();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [cancelling, setCancelling] = useState<ManagedUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');

  const all = users.data ?? [];
  const counts = {
    active: all.filter((u) => u.status === 'active').length,
    blocked: all.filter((u) => u.status === 'blocked').length,
    pending: all.filter((u) => u.status === 'no_access' || u.status === 'invited').length,
  };
  const terms = norm(search.trim());
  const visible = all.filter(
    (u) => (filter === 'all' || u.status === filter) && (!terms || norm(`${u.fullName} ${u.email}`).includes(terms)),
  );

  const confirmCancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    try {
      await cancelInvite(cancelling.email);
      show('ok', `Pré-cadastro de ${cancelling.email} cancelado.`);
      setCancelling(null);
      users.reload();
    } catch (err) {
      show('err', isServiceError(err) ? err.message : 'Não foi possível cancelar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AdminTopbar
        title="Usuários e permissões"
        meta={
          users.data
            ? `${counts.active} ativo(s) · ${counts.blocked} bloqueado(s)${counts.pending ? ` · ${counts.pending} sem acesso ou pré-cadastrado(s)` : ''}`
            : 'Carregando…'
        }
        tools={
          <>
            <div className="tb-search">
              <label className="sr-only" htmlFor="users-search">
                Buscar usuário
              </label>
              <input id="users-search" type="search" placeholder="Buscar por nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <label className="sr-only" htmlFor="users-filter">
              Situação
            </label>
            <select id="users-filter" value={filter} onChange={(e) => setFilter(e.target.value as StatusFilter)}>
              {FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </>
        }
        action={
          <button type="button" className="pri" onClick={() => setEditing({ user: null })}>
            + Novo usuário
          </button>
        }
      />

      <div className="admin-content">
        {users.status === 'loading' && (
          <p className="admin-pad state" role="status">
            Carregando usuários…
          </p>
        )}
        {users.status === 'error' && (
          <div className="admin-pad">
            <ErrorState error={users.error} onRetry={users.reload} />
          </div>
        )}
        {users.status === 'success' && visible.length === 0 && (
          <div className="admin-pad">
            <EmptyState title="Nenhum usuário encontrado">Ajuste a busca ou a situação.</EmptyState>
          </div>
        )}

        {users.status === 'success' && visible.length > 0 && (
          <table className="admin-table users-table">
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">E-mail</th>
                <th scope="col">Perfil</th>
                <th scope="col">Permissões</th>
                <th scope="col">Status</th>
                <th scope="col">Último acesso</th>
                <th scope="col" className="col-actions">
                  Ação
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => {
                const status = STATUS_INFO[user.status];
                const isMe = !!user.id && user.id === me?.id;
                const active = PERMISSION_KEYS.filter((key) => user.permissions[key]);
                return (
                  <tr key={user.id ?? `invite:${user.email}`} className={user.status === 'blocked' ? 'is-off' : undefined}>
                    <td className="col-title">
                      {user.fullName || <span className="cell-sub">Sem nome</span>}
                      {isMe && <span className="badge-me">você</span>}
                    </td>
                    <td className="user-email">{user.email}</td>
                    <td>{user.role ? ROLE_INFO[user.role].label : <span className="cell-sub">—</span>}</td>
                    <td>
                      {user.status === 'no_access' ? (
                        <span className="cell-sub">Sem acesso ao painel</span>
                      ) : active.length === 0 ? (
                        <span className="cell-sub">Só consulta</span>
                      ) : active.length === PERMISSION_KEYS.length ? (
                        <span className="perm-chip all">Todas</span>
                      ) : (
                        <span className="perm-chips">
                          {active.map((key) => (
                            <span key={key} className="perm-chip" title={PERMISSION_INFO[key].description}>
                              {PERMISSION_INFO[key].short}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`pill ${status.className}`} title={status.hint}>
                        {status.label}
                      </span>
                      {user.banned && <span className="cell-sub">login bloqueado</span>}
                    </td>
                    <td className="col-date">
                      {user.lastSignInAt ? <DateCell iso={user.lastSignInAt} /> : <span className="cell-sub">{user.status === 'invited' ? '—' : 'Nunca'}</span>}
                    </td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <button type="button" className={user.status === 'no_access' ? 'act act-pri' : 'act'} onClick={() => setEditing({ user })}>
                          {user.status === 'no_access' ? 'Conceder acesso' : isMe ? 'Ver permissões' : 'Editar permissões'}
                        </button>
                        {user.status === 'invited' && (
                          <button type="button" className="act danger-text" onClick={() => setCancelling(user)}>
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <UserForm
          user={editing.user}
          currentUserId={me?.id ?? null}
          onCancel={() => setEditing(null)}
          onSaved={(result) => {
            setEditing(null);
            show(result.tone, result.message);
            users.reload();
          }}
        />
      )}

      {cancelling && (
        <ConfirmDialog
          title="Cancelar pré-cadastro?"
          confirmLabel="Cancelar pré-cadastro"
          tone="danger"
          busy={busy}
          onConfirm={() => void confirmCancel()}
          onCancel={() => setCancelling(null)}
        >
          <p>
            O acesso pré-cadastrado de <strong>{cancelling.email}</strong> será removido. Se a conta for criada depois no Supabase Auth, ela
            não terá acesso ao painel.
          </p>
        </ConfirmDialog>
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </>
  );
}
