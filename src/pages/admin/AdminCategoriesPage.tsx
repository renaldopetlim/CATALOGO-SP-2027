import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CategoryForm } from '../../components/admin/CategoryForm';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { LiveIndicator } from '../../components/ui/LiveIndicator';
import { EmptyState, ErrorState } from '../../components/ui/StateMessage';
import { Toast } from '../../components/ui/Toast';
import { useAdminCategories } from '../../hooks/useAdminCategories';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useToast } from '../../hooks/useToast';
import { isServiceError } from '../../lib/errors';
import { deleteCategory, reorderCategories, setCategoryActive } from '../../services/categoryService';
import type { Category, CategoryWithItemCount } from '../../types/catalog';

type Editing = { mode: 'create' } | { mode: 'edit'; category: Category };

export function AdminCategoriesPage() {
  useDocumentTitle('Admin · Categorias');
  const { categories, status, error, reload, update } = useAdminCategories();
  const { toast, show, dismiss } = useToast();

  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<CategoryWithItemCount | null>(null);
  const [busy, setBusy] = useState(false);

  const errorMessage = (err: unknown, fallback: string) => (isServiceError(err) ? err.message : fallback);

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

  const toggleActive = async (category: CategoryWithItemCount) => {
    setBusy(true);
    try {
      await setCategoryActive(category.id, !category.is_active);
      show(
        'ok',
        category.is_active
          ? `“${category.name}” inativada: ela e seus itens saíram da vitrine.`
          : `“${category.name}” ativada.`,
      );
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
      setDeleting(null);
      reload();
    } catch (err) {
      show('err', errorMessage(err, 'Não foi possível excluir a categoria.'));
      // Pode ter recebido itens desde o carregamento: atualiza a contagem.
      reload();
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Categorias</h1>
          <p className="sub">Organize a vitrine. Categorias inativas ficam ocultas junto com seus itens.</p>
        </div>
        <button type="button" className="pri" onClick={() => setEditing({ mode: 'create' })}>
          + Nova categoria
        </button>
      </div>

      {status === 'loading' && (
        <p className="state" role="status">
          Carregando categorias…
        </p>
      )}
      {status === 'error' && <ErrorState error={error} onRetry={reload} />}
      {status === 'success' && categories.length === 0 && (
        <EmptyState title="Nenhuma categoria cadastrada">Clique em “+ Nova categoria” para começar.</EmptyState>
      )}

      {status === 'success' && categories.length > 0 && (
        <p className="result-info">
          {categories.length === 1 ? '1 categoria' : `${categories.length} categorias`}
          <LiveIndicator showOffline />
        </p>
      )}

      {status === 'success' && categories.length > 0 && (
        <ol className="adm-list">
          {categories.map((category, index) => (
            <li key={category.id} className={`adm-row${category.is_active ? '' : ' is-off'}`}>
              <div className="order-btns" aria-label={`Posição ${index + 1}`}>
                <button
                  type="button"
                  className="sec btn-icon"
                  aria-label={`Mover ${category.name} para cima`}
                  disabled={busy || index === 0}
                  onClick={() => void move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="sec btn-icon"
                  aria-label={`Mover ${category.name} para baixo`}
                  disabled={busy || index === categories.length - 1}
                  onClick={() => void move(index, 1)}
                >
                  ↓
                </button>
              </div>
              <div className="adm-info">
                <b>{category.name}</b>
                <span>
                  /{category.slug} ·{' '}
                  <Link to={`/admin?categoria=${category.id}`} className="section-link">
                    {category.item_count === 1 ? '1 item' : `${category.item_count} itens`}
                  </Link>
                </span>
                {category.description && <span>{category.description}</span>}
                <span className="adm-badges">{!category.is_active && <span className="badge off">Inativa</span>}</span>
              </div>
              <div className="row-actions">
                <button type="button" className="sec btn-sm" disabled={busy} onClick={() => void toggleActive(category)}>
                  {category.is_active ? 'Inativar' : 'Ativar'}
                </button>
                <button type="button" className="sec btn-sm" disabled={busy} onClick={() => setEditing({ mode: 'edit', category })}>
                  Editar
                </button>
                <button type="button" className="sec btn-sm danger-text" disabled={busy} onClick={() => setDeleting(category)}>
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

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
                    void toggleActive(target);
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
