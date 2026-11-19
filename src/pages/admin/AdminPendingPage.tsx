import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminTopbar } from '../../components/admin/AdminTopbar';
import { ItemForm, type ItemFormPrefill } from '../../components/admin/ItemForm';
import { SearchBar } from '../../components/catalog/SearchBar';
import { DateCell } from '../../components/admin/DateCell';
import { EmptyState, ErrorState } from '../../components/ui/StateMessage';
import { Toast } from '../../components/ui/Toast';
import { useAdminCategories } from '../../hooks/useAdminCategories';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useReconciliation } from '../../hooks/useReconciliation';
import { useToast } from '../../hooks/useToast';
import type { ReconciliationFilter, ReconciliationRow, ReconciliationStatus } from '../../types/systemProducts';

const PAGE_SIZE = 50;

const FILTER_OPTIONS: Array<{ value: ReconciliationFilter; label: string }> = [
  { value: 'pending', label: 'Pendentes (todos)' },
  { value: 'missing', label: 'Não cadastrados' },
  { value: 'inactive', label: 'Cadastrados, fora do ar' },
  { value: 'published', label: 'Publicados' },
];

const STATUS_INFO: Record<ReconciliationStatus, { label: string; className: string; hint: string }> = {
  missing: { label: 'Não cadastrado', className: 'pill-invalid', hint: 'O código não está em nenhum produto do catálogo.' },
  inactive: {
    label: 'Fora do ar',
    className: 'pill-duplicate',
    hint: 'O código está num produto inativo ou numa categoria inativa.',
  },
  published: { label: 'Publicado', className: 'pill-valid', hint: 'Aparece na vitrine.' },
};

function isFilter(value: string | null): value is ReconciliationFilter {
  return value === 'pending' || value === 'missing' || value === 'inactive' || value === 'published';
}

/** Valores do formulário de produto a partir de um registro da base do sistema. */
function prefillFrom(row: ReconciliationRow): ItemFormPrefill {
  return {
    title: row.description,
    brand: row.brand,
    codes: [{ code: row.code, description: row.description }],
  };
}

export function AdminPendingPage() {
  useDocumentTitle('Admin · Pendentes no catálogo');

  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const filterParam = params.get('situacao');
  const filter: ReconciliationFilter = isFilter(filterParam) ? filterParam : 'pending';
  const page = Math.max(Number.parseInt(params.get('pagina') ?? '1', 10) || 1, 1);

  const updateParams = useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const setSearch = useCallback((value: string) => updateParams({ q: value.trim() || null, pagina: null }), [updateParams]);

  const { list, summary, status, error, reload } = useReconciliation({
    filter,
    search,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const categories = useAdminCategories();
  const { toast, show, dismiss } = useToast();
  const [creating, setCreating] = useState<ReconciliationRow | null>(null);

  const total = list?.total ?? 0;
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const emptyBase = summary !== null && summary.total === 0;

  return (
    <>
      <AdminTopbar
        title="Pendentes no catálogo"
        meta={
          summary ? (
            <>
              {summary.total.toLocaleString('pt-BR')} na base do sistema ·{' '}
              <strong className="txt-err">{summary.missing.toLocaleString('pt-BR')} não cadastrados</strong> ·{' '}
              <strong className="txt-warn">{summary.inactive.toLocaleString('pt-BR')} fora do ar</strong> ·{' '}
              {summary.published.toLocaleString('pt-BR')} publicados
            </>
          ) : (
            'Carregando…'
          )
        }
        tools={
          <>
            <div className="tb-search">
              <SearchBar value={search} onSearch={setSearch} label="Buscar na base" placeholder="Buscar por código, descrição ou marca" hideLabel />
            </div>
            <label className="sr-only" htmlFor="rec-filter">
              Situação
            </label>
            <select id="rec-filter" value={filter} onChange={(e) => updateParams({ situacao: e.target.value === 'pending' ? null : e.target.value, pagina: null })}>
              {FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </>
        }
        action={
          <Link to="/admin/importar" className="sec btn-link tb-btn">
            Importar planilha
          </Link>
        }
      />

      <div className="admin-content">
        {status === 'loading' && (
          <p className="admin-pad state" role="status">
            Carregando a base do sistema…
          </p>
        )}
        {status === 'error' && (
          <div className="admin-pad">
            <ErrorState error={error} onRetry={reload} />
          </div>
        )}

        {status === 'success' && emptyBase && (
          <div className="admin-pad">
            <EmptyState
              title="A base do sistema está vazia"
              action={
                <Link to="/admin/importar" className="chip">
                  Importar planilha
                </Link>
              }
            >
              Importe a planilha do sistema interno (CODIGO, DESCRICAO, MARCA) para comparar com o catálogo.
            </EmptyState>
          </div>
        )}

        {status === 'success' && !emptyBase && list && list.rows.length === 0 && (
          <div className="admin-pad">
            <EmptyState title={search ? 'Nenhum registro encontrado' : filter === 'published' ? 'Nenhum código publicado ainda' : 'Tudo em dia!'}>
              {search
                ? 'Ajuste a busca ou mude a situação.'
                : filter === 'published'
                  ? 'Cadastre os pendentes para que apareçam na vitrine.'
                  : 'Todos os códigos da base do sistema já aparecem no catálogo.'}
            </EmptyState>
          </div>
        )}

        {status === 'success' && list && list.rows.length > 0 && (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Descrição</th>
                  <th scope="col">Marca</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Atualizado no sistema</th>
                  <th scope="col" className="col-actions">
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => {
                  const info = STATUS_INFO[row.status];
                  return (
                    <tr key={row.code}>
                      <td className="col-mono col-code">{row.code}</td>
                      <td className="col-title">{row.description}</td>
                      <td>{row.brand}</td>
                      <td>
                        <span className={`pill ${info.className}`} title={info.hint}>
                          {info.label}
                        </span>
                        {row.catalogItemTitle && <span className="cell-sub">em “{row.catalogItemTitle}”</span>}
                      </td>
                      <td className="col-date">
                        <DateCell iso={row.updated_at} />
                      </td>
                      <td className="col-actions">
                        {row.status === 'missing' ? (
                          <button type="button" className="act act-pri" onClick={() => setCreating(row)}>
                            + Cadastrar no catálogo
                          </button>
                        ) : (
                          <Link to={`/admin?q=${encodeURIComponent(row.code)}`} className="act act-link">
                            Ver produto
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="admin-pad pager">
              <span className="cell-sub">
                {from.toLocaleString('pt-BR')}–{to.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}
              </span>
              <div className="row-actions">
                <button type="button" className="act" disabled={page <= 1} onClick={() => updateParams({ pagina: page - 1 > 1 ? String(page - 1) : null })}>
                  ← Anterior
                </button>
                <button type="button" className="act" disabled={page >= pages} onClick={() => updateParams({ pagina: String(page + 1) })}>
                  Próxima →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {creating && (
        <ItemForm
          mode="create"
          prefill={prefillFrom(creating)}
          categories={categories.categories}
          onCancel={() => setCreating(null)}
          onSaved={(result) => {
            setCreating(null);
            const published = result.item.is_active && result.item.category.is_active;
            show(
              result.warnings.length > 0 ? 'warn' : 'ok',
              [
                `“${result.item.title}” cadastrado com ${result.item.codes.length === 1 ? '1 código' : `${result.item.codes.length} códigos`}.`,
                published ? '' : 'Ele ainda não aparece na vitrine (produto ou categoria inativa).',
                ...result.warnings,
              ]
                .filter(Boolean)
                .join(' '),
            );
            reload();
          }}
        />
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </>
  );
}
