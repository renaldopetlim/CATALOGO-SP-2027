import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminTopbar } from '../../components/admin/AdminTopbar';
import { DateCell } from '../../components/admin/DateCell';
import { ItemForm, type ItemFormMode } from '../../components/admin/ItemForm';
import { ItemImage } from '../../components/catalog/ItemImage';
import { SearchBar } from '../../components/catalog/SearchBar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '../../components/ui/StateMessage';
import { Switch } from '../../components/ui/Switch';
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
  { value: 'all', label: 'Todos os status' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
];

function isStatus(value: string | null): value is ItemStatusFilter {
  return value === 'all' || value === 'active' || value === 'inactive';
}

type Editing = { mode: ItemFormMode; item: CatalogItemWithCategory | null };

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
    { scope: 'admin', pageSize: 50, refetchOnFocus: false, live: true },
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
  const noCategories = categories.status === 'success' && categories.categories.length === 0;

  return (
    <>
      <AdminTopbar
        title="Itens do catálogo"
        meta={
          items.status === 'success' ? (
            <>
              {items.total === 1 ? '1 item' : `${items.total.toLocaleString('pt-BR')} itens`}
              {items.items.length < items.total && ` · exibindo ${items.items.length}`}
              {hasFilters && (
                <>
                  {' · '}
                  <Link to="/admin" replace className="tb-link">
                    Limpar filtros
                  </Link>
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
              <SearchBar value={search} onSearch={setSearch} label="Buscar itens" placeholder="Buscar por título, SKU, descrição ou tag" hideLabel />
            </div>
            <label className="sr-only" htmlFor="f-cat">
              Categoria
            </label>
            <select id="f-cat" value={categoryId ?? ''} onChange={(e) => updateParam('categoria', e.target.value || null)}>
              <option value="">Todas as categorias</option>
              {categories.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.is_active ? '' : ' (inativa)'}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="f-status">
              Status
            </label>
            <select id="f-status" value={status} onChange={(e) => updateParam('status', e.target.value === 'all' ? null : e.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="tb-toggle"
              aria-pressed={featuredOnly}
              onClick={() => updateParam('destaque', featuredOnly ? null : '1')}
            >
              ★ Destaques
            </button>
          </>
        }
        action={
          <button type="button" className="pri" onClick={() => setEditing({ mode: 'create', item: null })} disabled={noCategories}>
            + Novo item
          </button>
        }
      />

      <div className="admin-content">
        {noCategories && (
          <div className="admin-pad">
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
          </div>
        )}

        {items.status === 'loading' && (
          <p className="admin-pad state" role="status">
            Carregando itens…
          </p>
        )}
        {items.status === 'error' && (
          <div className="admin-pad">
            <ErrorState error={items.error} onRetry={items.reload} />
          </div>
        )}
        {items.status === 'success' && items.items.length === 0 && !noCategories && (
          <div className="admin-pad">
            <EmptyState title={hasFilters ? 'Nenhum item encontrado com esses filtros' : 'Nenhum item cadastrado'}>
              {hasFilters ? 'Ajuste a busca ou limpe os filtros.' : 'Clique em “+ Novo item” para começar.'}
            </EmptyState>
          </div>
        )}

        {items.status === 'success' && items.items.length > 0 && (
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col" className="col-thumb">
                  <span className="sr-only">Imagem</span>
                </th>
                <th scope="col">Item</th>
                <th scope="col">Categoria</th>
                <th scope="col" className="col-num">
                  Preço
                </th>
                <th scope="col">Status</th>
                <th scope="col">Destaque</th>
                <th scope="col">Atualizado em</th>
                <th scope="col" className="col-actions">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {items.items.map((item) => {
                const busy = busyIds.has(item.id);
                return (
                  <tr key={item.id} className={item.is_active ? undefined : 'is-off'} aria-busy={busy || undefined}>
                    <td className="col-thumb">
                      <div className="thumb">
                        <ItemImage src={item.image_url} alt="" />
                      </div>
                    </td>
                    <td className="col-title">
                      <button type="button" className="cell-link" onClick={() => setEditing({ mode: 'edit', item })}>
                        {item.title}
                      </button>
                      <span className="cell-sub">{item.sku ? `SKU ${item.sku}` : 'Sem SKU'}</span>
                    </td>
                    <td className="col-cat">
                      <span className={`badge${item.category.is_active ? '' : ' off'}`} title={item.category.is_active ? undefined : 'Categoria inativa'}>
                        {item.category.name}
                      </span>
                    </td>
                    <td className={`col-num${item.price === null ? ' mut' : ''}`}>{formatPrice(item.price)}</td>
                    <td className="col-switch">
                      <Switch
                        checked={item.is_active}
                        text={item.is_active ? 'Ativo' : 'Inativo'}
                        label={`${item.is_active ? 'Inativar' : 'Ativar'} “${item.title}”`}
                        disabled={busy}
                        onChange={(next) =>
                          void runRowAction(
                            item,
                            () => setItemActive(item.id, next),
                            next ? 'Item ativado (visível na vitrine).' : 'Item inativado (oculto da vitrine).',
                          )
                        }
                      />
                    </td>
                    <td className="col-switch">
                      <Switch
                        tone="featured"
                        checked={item.is_featured}
                        text={item.is_featured ? 'Sim' : 'Não'}
                        label={`${item.is_featured ? 'Remover destaque de' : 'Destacar'} “${item.title}”`}
                        disabled={busy}
                        onChange={(next) =>
                          void runRowAction(
                            item,
                            () => setItemFeatured(item.id, next),
                            next ? 'Item marcado como destaque.' : 'Destaque removido.',
                          )
                        }
                      />
                    </td>
                    <td className="col-date">
                      <DateCell iso={item.updated_at} />
                    </td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <button type="button" className="act" disabled={busy} onClick={() => setEditing({ mode: 'edit', item })}>
                          Editar
                        </button>
                        <button type="button" className="act" disabled={busy} onClick={() => setEditing({ mode: 'duplicate', item })}>
                          Duplicar
                        </button>
                        <button type="button" className="act danger-text" disabled={busy} onClick={() => setDeleting(item)}>
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

        {items.loadMoreError && (
          <div className="admin-pad">
            <ErrorState error={items.loadMoreError} title="Não foi possível carregar mais" onRetry={items.loadMore} />
          </div>
        )}
        {items.hasMore && !items.loadMoreError && (
          <div className="admin-pad table-more">
            <button type="button" className="sec" onClick={items.loadMore} disabled={items.loadingMore}>
              {items.loadingMore ? 'Carregando…' : `Carregar mais (${(items.total - items.items.length).toLocaleString('pt-BR')} restantes)`}
            </button>
          </div>
        )}
      </div>

      {editing && (
        <ItemForm
          mode={editing.mode}
          item={editing.item}
          categories={categories.categories}
          defaultCategoryId={categoryId}
          onCancel={() => setEditing(null)}
          onSaved={(result, mode) => {
            setEditing(null);
            const base =
              mode === 'edit'
                ? `“${result.item.title}” atualizado.`
                : mode === 'duplicate'
                  ? `Cópia criada como inativa: “${result.item.title}”.`
                  : `“${result.item.title}” criado.`;
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
