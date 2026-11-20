import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminTopbar } from '../../components/admin/AdminTopbar';
import { DateCell } from '../../components/admin/DateCell';
import { CategoryForm } from '../../components/admin/CategoryForm';
import { SearchBar } from '../../components/catalog/SearchBar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '../../components/ui/StateMessage';
import { Switch } from '../../components/ui/Switch';
import { Toast } from '../../components/ui/Toast';
import { useAdminCategories } from '../../hooks/useAdminCategories';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useToast } from '../../hooks/useToast';
import { ReadOnlyNotice } from '../../components/auth/RequirePermission';
import { usePermissions } from '../../hooks/usePermissions';
import { isServiceError } from '../../lib/errors';
import { stripAccents } from '../../lib/format';
import { deleteCategory, reorderCategories, setCategoryActive } from '../../services/categoryService';
import type { Category, CategoryWithItemCount, ItemStatusFilter } from '../../types/catalog';

type Editing = { mode: 'create' } | { mode: 'edit'; category: Category };

const normalize = (value: string) => stripAccents(value).toLowerCase();

export function AdminCategoriesPage() {
  useDocumentTitle('Admin · Categorias');
  const { categories, status, error, reload, update } = useAdminCategories();
  const { toast, show, dismiss } = useToast();
  const { can, restrictedTitle } = usePermissions();
  const canEdit = can('can_manage_categories');
  const lock = canEdit ? undefined : restrictedTitle('can_manage_categories');

  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<CategoryWithItemCount | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ItemStatusFilter>('all');

  const errorMessage = (err: unknown, fallback: string) => (isServiceError(err) ? err.message : fallback);

  // Filtro local (a lista de categorias é pequena e já está carregada).
  const term = normalize(search.trim());
  const visible = categories.filter(
    (category) =>
      (statusFilter === 'all' || category.is_active === (statusFilter === 'active')) &&
      (!term || normalize(`${category.name} ${category.slug} ${category.description ?? ''}`).includes(term)),
  );
  const filtering = Boolean(term) || statusFilter !== 'all';

  /** Move uma categoria para cima/baixo: atualiza a tela na hora e grava em seguida. */
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;

    const reordered = [...categories];
    const [moved] = reordered.splice(index, 1);
    if (!moved) return;
    reordered.splice(target, 0, moved);

    update(() => reordered.map((category, i) => ({ ...category, sort_order: (i + 1) * 10 })));
    setBusy(true);
    try {
      await reorderCategories(reordered.map((category) => category.id));
      show('ok', 'Ordem atualizada.');
    } catch (err) {
      show('err', errorMessage(err, 'Não foi possível reordenar.'));
    } finally {
      setBusy(false);
      reload();
    }
  };

  const toggleActive = async (category: CategoryWithItemCount, next: boolean) => {
    setBusy(true);
    try {
      await setCategoryActive(category.id, next);
      show('ok', next ? `“${category.name}” ativada.` : `“${category.name}” inativada: ela e seus itens saíram da vitrine.`);
      reload();
    } catch (err) {
      show('err', errorMessage(err, 'Não foi possível alterar a categoria.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteCategory(deleting.id);
      show('ok', `“${deleting.name}” foi excluída.`);
    } catch (err) {
      show('err', errorMessage(err, 'Não foi possível excluir a categoria.'));
    } finally {
      // Sucesso ou falha (ex.: recebeu itens desde o carregamento): atualiza a lista.
      setDeleting(null);
      setBusy(false);
      reload();
    }
  };

  return (
    <>
      <AdminTopbar
        title="Categorias"
        meta={
          status === 'success' ? (
            <>
              {categories.length === 1 ? '1 categoria' : `${categories.length} categorias`}
              {filtering && ` · exibindo ${visible.length}`}
              {filtering && (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="tb-link"
                    onClick={() => {
                      setSearch('');
                      setStatusFilter('all');
                    }}
                  >
                    Limpar filtros
                  </button>
                </>
              )}
            </>
          ) : (
            'Carregando…'
          )
        }
        tools={
          <>
            <div className="tb-search">
              <SearchBar value={search} onSearch={setSearch} label="Buscar categorias" placeholder="Buscar por nome, slug ou descrição" hideLabel />
            </div>
            <label className="sr-only" htmlFor="cat-status">
              Status
            </label>
            <select id="cat-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ItemStatusFilter)}>
              <option value="all">Todos os status</option>
              <option value="active">Ativas</option>
              <option value="inactive">Inativas</option>
            </select>
          </>
        }
        action={
          <button type="button" className="pri" onClick={() => setEditing({ mode: 'create' })} disabled={!canEdit} title={lock}>
            + Nova categoria
          </button>
        }
      />

      <div className="admin-content">
        <ReadOnlyNotice permission="can_manage_categories" />
        {status === 'loading' && (
          <p className="admin-pad state" role="status">
            Carregando categorias…
          </p>
        )}
        {status === 'error' && (
          <div className="admin-pad">
            <ErrorState error={error} onRetry={reload} />
          </div>
        )}
        {status === 'success' && visible.length === 0 && (
          <div className="admin-pad">
            <EmptyState title={filtering ? 'Nenhuma categoria encontrada com esses filtros' : 'Nenhuma categoria cadastrada'}>
              {filtering ? 'Ajuste a busca ou limpe os filtros.' : 'Clique em “+ Nova categoria” para começar.'}
            </EmptyState>
          </div>
        )}

        {status === 'success' && visible.length > 0 && (
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col" className="col-order" title={filtering ? 'Limpe os filtros para reordenar' : undefined}>
                  Ordem
                </th>
                <th scope="col">Categoria</th>
                <th scope="col">Slug</th>
                <th scope="col" className="col-num">
                  Itens
                </th>
                <th scope="col">Status</th>
                <th scope="col">Criada em</th>
                <th scope="col" className="col-actions">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((category) => {
                const index = categories.indexOf(category);
                return (
                  <tr key={category.id} className={category.is_active ? undefined : 'is-off'}>
                    <td className="col-order">
                      <div className="order-btns">
                        <span className="order-pos">{index + 1}</span>
                        <button
                          type="button"
                          className="act icon"
                          aria-label={`Mover ${category.name} para cima`}
                          disabled={busy || filtering || !canEdit || index === 0}
                          title={lock}
                          onClick={() => void move(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="act icon"
                          aria-label={`Mover ${category.name} para baixo`}
                          disabled={busy || filtering || !canEdit || index === categories.length - 1}
                          title={lock}
                          onClick={() => void move(index, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td className="col-title">
                      {canEdit ? (
                        <button type="button" className="cell-link" onClick={() => setEditing({ mode: 'edit', category })}>
                          {category.name}
                        </button>
                      ) : (
                        <span className="cell-strong">{category.name}</span>
                      )}
                      {category.description && <span className="cell-sub">{category.description}</span>}
                    </td>
                    <td className="col-mono">/{category.slug}</td>
                    <td className="col-num">
                      <Link to={`/admin?categoria=${category.id}`} className="tb-link" title="Ver os itens desta categoria">
                        {category.item_count}
                      </Link>
                    </td>
                    <td className="col-switch">
                      <Switch
                        checked={category.is_active}
                        text={category.is_active ? 'Ativa' : 'Inativa'}
                        label={`${category.is_active ? 'Inativar' : 'Ativar'} a categoria “${category.name}”`}
                        disabled={busy || !canEdit}
                        title={lock}
                        onChange={(next) => void toggleActive(category, next)}
                      />
                    </td>
                    <td className="col-date">
                      <DateCell iso={category.created_at} />
                    </td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <button type="button" className="act" disabled={busy || !canEdit} title={lock} onClick={() => setEditing({ mode: 'edit', category })}>
                          Editar
                        </button>
                        <button type="button" className="act danger-text" disabled={busy || !canEdit} title={lock} onClick={() => setDeleting(category)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {status === 'success' && filtering && visible.length > 0 && (
          <p className="admin-pad hint">A reordenação fica disponível com os filtros limpos.</p>
        )}
      </div>

      {editing && (
        <CategoryForm
          category={editing.mode === 'edit' ? editing.category : null}
          onCancel={() => setEditing(null)}
          onSaved={(saved, mode) => {
            setEditing(null);
            show('ok', mode === 'created' ? `“${saved.name}” criada.` : `“${saved.name}” atualizada.`);
            reload();
          }}
        />
      )}

      {deleting && deleting.item_count > 0 && (
        <ConfirmDialog
          title="Categoria com itens"
          confirmLabel=""
          hideConfirm
          onConfirm={() => undefined}
          onCancel={() => setDeleting(null)}
          busy={busy}
          extraAction={
            <>
              <Link to={`/admin?categoria=${deleting.id}`} className="pri btn-link">
                {deleting.item_count === 1 ? 'Ver o item' : `Ver os ${deleting.item_count} itens`}
              </Link>
              {deleting.is_active && (
                <button
                  type="button"
                  className="sec"
                  disabled={busy}
                  onClick={() => {
                    const target = deleting;
                    setDeleting(null);
                    void toggleActive(target, false);
                  }}
                >
                  Inativar categoria
                </button>
              )}
            </>
          }
        >
          <p>
            <strong>{deleting.name}</strong> possui{' '}
            <strong>{deleting.item_count === 1 ? '1 item vinculado' : `${deleting.item_count} itens vinculados`}</strong> e
            não pode ser excluída.
          </p>
          <p className="hint">Mova os itens para outra categoria ou exclua-os antes. Para apenas ocultar, inative a categoria.</p>
        </ConfirmDialog>
      )}

      {deleting && deleting.item_count === 0 && (
        <ConfirmDialog
          title="Excluir categoria?"
          confirmLabel="Excluir definitivamente"
          tone="danger"
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        >
          <p>
            <strong>{deleting.name}</strong> será removida permanentemente. Esta ação não pode ser desfeita.
          </p>
        </ConfirmDialog>
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </>
  );
}
