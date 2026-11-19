import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminTopbar } from '../../components/admin/AdminTopbar';
import { BrandForm } from '../../components/admin/BrandForm';
import { DateCell } from '../../components/admin/DateCell';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { SearchBar } from '../../components/catalog/SearchBar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '../../components/ui/StateMessage';
import { Switch } from '../../components/ui/Switch';
import { Toast } from '../../components/ui/Toast';
import { useAdminBrands } from '../../hooks/useAdminBrands';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useToast } from '../../hooks/useToast';
import { isServiceError } from '../../lib/errors';
import { stripAccents } from '../../lib/format';
import { deleteBrand, setBrandActive } from '../../services/brandService';
import type { Brand, BrandWithProductCount } from '../../types/brands';
import type { ItemStatusFilter } from '../../types/catalog';

type Editing = { mode: 'create' } | { mode: 'edit'; brand: Brand };

const normalize = (value: string) => stripAccents(value).toLowerCase();

export function AdminBrandsPage() {
  useDocumentTitle('Admin · Marcas');
  const { brands, status, error, reload } = useAdminBrands();
  const { toast, show, dismiss } = useToast();

  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<BrandWithProductCount | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ItemStatusFilter>('all');

  const term = normalize(search.trim());
  const visible = brands.filter(
    (brand) =>
      (statusFilter === 'all' || brand.is_active === (statusFilter === 'active')) && (!term || normalize(brand.name).includes(term)),
  );
  const filtering = Boolean(term) || statusFilter !== 'all';
  const withoutLogo = brands.filter((brand) => !brand.logo_url).length;
  const errorMessage = (err: unknown, fallback: string) => (isServiceError(err) ? err.message : fallback);

  const toggleActive = async (brand: BrandWithProductCount, next: boolean) => {
    setBusyId(brand.id);
    try {
      await setBrandActive(brand.id, next);
      show('ok', next ? `“${brand.name}” ativada.` : `“${brand.name}” inativada: sai das listas de seleção e o logo deixa de aparecer na vitrine.`);
      reload();
    } catch (err) {
      show('err', errorMessage(err, 'Não foi possível alterar a marca.'));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      const result = await deleteBrand(deleting);
      show(result.logoRemoved ? 'ok' : 'warn', result.logoRemoved ? `“${deleting.name}” foi excluída.` : `“${deleting.name}” foi excluída, mas o logo não pôde ser removido do armazenamento.`);
    } catch (err) {
      show('err', errorMessage(err, 'Não foi possível excluir a marca.'));
    } finally {
      setDeleting(null);
      setBusyId(null);
      reload();
    }
  };

  return (
    <>
      <AdminTopbar
        title="Marcas"
        meta={
          status === 'success' ? (
            <>
              {brands.length === 1 ? '1 marca' : `${brands.length} marcas`}
              {withoutLogo > 0 && <> · <span className="txt-warn">{withoutLogo} sem logo</span></>}
              {filtering && ` · exibindo ${visible.length}`}
            </>
          ) : (
            'Carregando…'
          )
        }
        tools={
          <>
            <div className="tb-search">
              <SearchBar value={search} onSearch={setSearch} label="Buscar marcas" placeholder="Buscar marca" hideLabel />
            </div>
            <label className="sr-only" htmlFor="brand-status">
              Status
            </label>
            <select id="brand-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ItemStatusFilter)}>
              <option value="all">Todos os status</option>
              <option value="active">Ativas</option>
              <option value="inactive">Inativas</option>
            </select>
          </>
        }
        action={
          <button type="button" className="pri" onClick={() => setEditing({ mode: 'create' })}>
            + Nova marca
          </button>
        }
      />

      <div className="admin-content">
        {status === 'loading' && (
          <p className="admin-pad state" role="status">
            Carregando marcas…
          </p>
        )}
        {status === 'error' && (
          <div className="admin-pad">
            <ErrorState error={error} onRetry={reload} />
          </div>
        )}
        {status === 'success' && visible.length === 0 && (
          <div className="admin-pad">
            <EmptyState title={filtering ? 'Nenhuma marca encontrada' : 'Nenhuma marca cadastrada'}>
              {filtering ? 'Ajuste a busca ou o status.' : 'Clique em “+ Nova marca” ou crie a marca direto no formulário do produto.'}
            </EmptyState>
          </div>
        )}

        {status === 'success' && visible.length > 0 && (
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col" className="col-logo">
                  Logo
                </th>
                <th scope="col">Marca</th>
                <th scope="col">Status</th>
                <th scope="col" className="col-num">
                  Produtos
                </th>
                <th scope="col">Criada em</th>
                <th scope="col" className="col-actions">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((brand) => {
                const busy = busyId === brand.id;
                return (
                  <tr key={brand.id} className={brand.is_active ? undefined : 'is-off'} aria-busy={busy || undefined}>
                    <td className="col-logo">
                      <BrandLogo name={brand.name} logoUrl={brand.logo_url} size="md" />
                    </td>
                    <td className="col-title">
                      <button type="button" className="cell-link" onClick={() => setEditing({ mode: 'edit', brand })}>
                        {brand.name}
                      </button>
                      {!brand.logo_url && <span className="cell-sub">Sem logo</span>}
                    </td>
                    <td className="col-switch">
                      <Switch
                        checked={brand.is_active}
                        text={brand.is_active ? 'Ativa' : 'Inativa'}
                        label={`${brand.is_active ? 'Inativar' : 'Ativar'} a marca “${brand.name}”`}
                        disabled={busy}
                        onChange={(next) => void toggleActive(brand, next)}
                      />
                    </td>
                    <td className="col-num">
                      {brand.product_count > 0 ? (
                        <Link to={`/admin?q=${encodeURIComponent(brand.name)}`} className="tb-link" title="Ver os produtos desta marca">
                          {brand.product_count}
                        </Link>
                      ) : (
                        <span className="cell-sub">0</span>
                      )}
                    </td>
                    <td className="col-date">
                      <DateCell iso={brand.created_at} />
                    </td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <button type="button" className="act" disabled={busy} onClick={() => setEditing({ mode: 'edit', brand })}>
                          Editar
                        </button>
                        <button type="button" className="act danger-text" disabled={busy} onClick={() => setDeleting(brand)}>
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
      </div>

      {editing && (
        <BrandForm
          brand={editing.mode === 'edit' ? editing.brand : null}
          onCancel={() => setEditing(null)}
          onSaved={(result, mode) => {
            setEditing(null);
            const base = mode === 'created' ? `“${result.brand.name}” criada.` : `“${result.brand.name}” atualizada.`;
            show(result.warnings.length ? 'warn' : 'ok', [base, ...result.warnings].join(' '));
            reload();
          }}
        />
      )}

      {deleting && deleting.product_count > 0 && (
        <ConfirmDialog
          title="Marca com produtos"
          confirmLabel=""
          hideConfirm
          onConfirm={() => undefined}
          onCancel={() => setDeleting(null)}
          extraAction={
            <>
              <Link to={`/admin?q=${encodeURIComponent(deleting.name)}`} className="pri btn-link">
                {deleting.product_count === 1 ? 'Ver o produto' : `Ver os ${deleting.product_count} produtos`}
              </Link>
              {deleting.is_active && (
                <button
                  type="button"
                  className="sec"
                  onClick={() => {
                    const target = deleting;
                    setDeleting(null);
                    void toggleActive(target, false);
                  }}
                >
                  Inativar marca
                </button>
              )}
            </>
          }
        >
          <p>
            <strong>{deleting.name}</strong> tem{' '}
            <strong>{deleting.product_count === 1 ? '1 produto vinculado' : `${deleting.product_count} produtos vinculados`}</strong> e não pode
            ser excluída.
          </p>
          <p className="hint">Troque a marca desses produtos antes de excluir, ou apenas inative a marca.</p>
        </ConfirmDialog>
      )}

      {deleting && deleting.product_count === 0 && (
        <ConfirmDialog
          title="Excluir marca?"
          confirmLabel="Excluir definitivamente"
          tone="danger"
          busy={busyId === deleting.id}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        >
          <p>
            <strong>{deleting.name}</strong> será removida permanentemente{deleting.logo_url ? ', junto com o logo enviado' : ''}. Esta ação não
            pode ser desfeita.
          </p>
        </ConfirmDialog>
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </>
  );
}
