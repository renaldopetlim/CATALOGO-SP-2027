import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ItemForm } from '../../components/admin/ItemForm';
import { ItemImage } from '../../components/catalog/ItemImage';
import { SearchBar } from '../../components/catalog/SearchBar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '../../components/ui/StateMessage';
import { Toast } from '../../components/ui/Toast';
import { useAdminCategories } from '../../hooks/useAdminCategories';
import { useCatalogItems } from '../../hooks/useCatalogItems';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useToast } from '../../hooks/useToast';
import { isServiceError } from '../../lib/errors';
import { formatPrice } from '../../lib/format';
import { deleteCatalogItem, setItemActive, setItemFeatured } from '../../services/catalogService';
import type { CatalogItemWithCategory, ItemStatusFilter } from '../../types/catalog';

const STATUS_OPTIONS: Array<{ value: ItemStatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
];

function isStatus(value: string | null): value is ItemStatusFilter {
  return value === 'all' || value === 'active' || value === 'inactive';
}

type Editing = { mode: 'create' } | { mode: 'edit'; item: CatalogItemWithCategory };

export function AdminItemsPage() {
  useDocumentTitle('Admin · Itens');

  // Filtros na URL: recarregar a página ou voltar mantém a busca.
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const categoryId = params.get('categoria');
  const statusParam = params.get('status');
  const status: ItemStatusFilter = isStatus(statusParam) ? statusParam : 'all';
  const featuredOnly = params.get('destaque') === '1';

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const setSearch = useCallback((value: string) => updateParam('q', value.trim() || null), [updateParam]);

  const categories = useAdminCategories();
  const items = useCatalogItems(
    { search, categoryId, status, featured: featuredOnly, sort: 'recent' },
    { scope: 'admin', pageSize: 30, refetchOnFocus: false },
  );
  const { toast, show, dismiss } = useToast();

  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<CatalogItemWithCategory | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());

  /** Após qualquer alteração: recarrega a lista e as contagens das categorias. */
  const refresh = () => {
    items.reload();
    categories.reload();
  };

  const runRowAction = async (item: CatalogItemWithCategory, action: () => Promise<unknown>, success: string) => {
    setBusyIds((prev) => new Set(prev).add(item.id));
    try {
      await action();
      show('ok', success);
      refresh();
    } catch (err) {
      show('err', isServiceError(err) ? err.message : 'Não foi possível concluir a operação.');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const result = await deleteCatalogItem(deleting.id);
      show(
        result.imageRemoved ? 'ok' : 'warn',
        result.imageRemoved
          ? `“${deleting.title}” foi excluído.`
          : `“${deleting.title}” foi excluído, mas a imagem não pôde ser removida do armazenamento.`,
      );
      setDeleting(null);
      refresh();
    } catch (err) {
      show('err', isServiceError(err) ? err.message : 'Não foi possível excluir o item.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const hasFilters = Boolean(search || categoryId || status !== 'all' || featuredOnly);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Itens do catálogo</h1>
          <p className="sub">Crie, edite, destaque ou oculte itens. As alterações aparecem na vitrine imediatamente.</p>
        </div>
        <button
          type="button"
          className="pri"
          onClick={() => setEditing({ mode: 'create' })}
          disabled={categories.status === 'success' && categories.categories.length === 0}
        >
          + Novo item
        </button>
      </div>

      {categories.status === 'success' && categories.categories.length === 0 && (
        <EmptyState
          title="Crie uma categoria primeiro"
          action={
            <Link to="/admin/categorias" className="chip">
              Ir para categorias
            </Link>
          }
        >
          Todo item precisa pertencer a uma categoria.
        </EmptyState>
      )}

      <div className="card filters">
        <SearchBar value={search} onSearch={setSearch} label="Buscar" placeholder="Título, SKU, descrição ou tag" />
        <div className="g">
          <div>
            <label htmlFor="f-cat">Categoria</label>
            <select id="f-cat" value={categoryId ?? ''} onChange={(e) => updateParam('categoria', e.target.value || null)}>
              <option value="">Todas</option>
              {categories.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.is_active ? '' : ' (inativa)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-status">Situação</label>
            <select id="f-status" value={status} onChange={(e) => updateParam('status', e.target.value === 'all' ? null : e.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="full">
            <label className="check">
              <input type="checkbox" checked={featuredOnly} onChange={(e) => updateParam('destaque', e.target.checked ? '1' : null)} />
              Somente destaques
            </label>
          </div>
        </div>
      </div>

      {items.status === 'success' && (
        <p className="result-info">
          {items.total === 1 ? '1 item' : `${items.total.toLocaleString('pt-BR')} itens`}
          {hasFilters && (
            <>
              {' · '}
              <Link to="/admin" replace className="section-link">
                Limpar filtros
              </Link>
            </>
          )}
        </p>
      )}

      {items.status === 'loading' && (
        <p className="state" role="status">
          Carregando itens…
        </p>
      )}
      {items.status === 'error' && <ErrorState error={items.error} onRetry={items.reload} />}
      {items.status === 'success' && items.items.length === 0 && (
        <EmptyState title={hasFilters ? 'Nenhum item encontrado com esses filtros' : 'Nenhum item cadastrado'}>
          {hasFilters ? 'Ajuste a busca ou limpe os filtros.' : 'Clique em “+ Novo item” para começar.'}
        </EmptyState>
      )}

      {items.status === 'success' && items.items.length > 0 && (
        <ul className="adm-list">
          {items.items.map((item) => {
            const busy = busyIds.has(item.id);
            return (
              <li key={item.id} className={`adm-row${item.is_active ? '' : ' is-off'}`}>
                <div className="thumb">
                  <ItemImage src={item.image_url} alt="" />
                </div>
                <div className="adm-info">
                  <b>{item.title}</b>
                  <span>
                    {item.sku ? `SKU ${item.sku} · ` : ''}
                    {item.category.name}
                    {item.category.is_active ? '' : ' (categoria inativa)'} · {formatPrice(item.price)}
                  </span>
                  <span className="adm-badges">
                    {!item.is_active && <span className="badge off">Inativo</span>}
                    {item.is_featured && <span className="badge acc">Destaque</span>}
                  </span>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="sec btn-sm"
                    disabled={busy}
                    aria-pressed={item.is_featured}
                    onClick={() =>
                      void runRowAction(
                        item,
                        () => setItemFeatured(item.id, !item.is_featured),
                        item.is_featured ? 'Destaque removido.' : 'Item marcado como destaque.',
                      )
                    }
                  >
                    {item.is_featured ? '★ Destaque' : '☆ Destacar'}
                  </button>
                  <button
                    type="button"
                    className="sec btn-sm"
                    disabled={busy}
                    onClick={() =>
                      void runRowAction(
                        item,
                        () => setItemActive(item.id, !item.is_active),
                        item.is_active ? 'Item inativado (oculto da vitrine).' : 'Item ativado (visível na vitrine).',
                      )
                    }
                  >
                    {item.is_active ? 'Inativar' : 'Ativar'}
                  </button>
                  <button type="button" className="sec btn-sm" disabled={busy} onClick={() => setEditing({ mode: 'edit', item })}>
                    Editar
                  </button>
                  <button type="button" className="sec btn-sm danger-text" disabled={busy} onClick={() => setDeleting(item)}>
                    Excluir
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {items.hasMore && (
        <div className="load-more">
          <button type="button" className="sec" onClick={items.loadMore} disabled={items.loadingMore}>
            {items.loadingMore ? 'Carregando…' : `Carregar mais (${(items.total - items.items.length).toLocaleString('pt-BR')} restantes)`}
          </button>
        </div>
      )}
      {items.loadMoreError && <ErrorState error={items.loadMoreError} title="Não foi possível carregar mais" onRetry={items.loadMore} />}

      {editing && (
        <ItemForm
          item={editing.mode === 'edit' ? editing.item : null}
          categories={categories.categories}
          defaultCategoryId={categoryId}
          onCancel={() => setEditing(null)}
          onSaved={(result, mode) => {
            setEditing(null);
            const base = mode === 'created' ? `“${result.item.title}” criado.` : `“${result.item.title}” atualizado.`;
            show(result.warnings.length > 0 ? 'warn' : 'ok', [base, ...result.warnings].join(' '));
            refresh();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Excluir item?"
          confirmLabel="Excluir definitivamente"
          tone="danger"
          busy={deleteBusy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
          extraAction={
            deleting.is_active ? (
              <button
                type="button"
                className="sec"
                disabled={deleteBusy}
                onClick={() => {
                  const target = deleting;
                  setDeleting(null);
                  void runRowAction(target, () => setItemActive(target.id, false), 'Item inativado (oculto da vitrine).');
                }}
              >
                Apenas inativar
              </button>
            ) : undefined
          }
        >
          <p>
            <strong>{deleting.title}</strong>
            {deleting.sku ? ` (SKU ${deleting.sku})` : ''} será removido permanentemente, junto com a imagem enviada ao
            armazenamento. Esta ação não pode ser desfeita.
          </p>
          {deleting.is_active && <p className="hint">Para apenas ocultar da vitrine, use “Apenas inativar”.</p>}
        </ConfirmDialog>
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </>
  );
}
