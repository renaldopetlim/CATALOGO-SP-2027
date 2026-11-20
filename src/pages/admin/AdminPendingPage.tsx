import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminTopbar } from '../../components/admin/AdminTopbar';
import { ItemForm } from '../../components/admin/ItemForm';
import { PendingSelectionBar } from '../../components/admin/PendingSelectionBar';
import { SearchBar } from '../../components/catalog/SearchBar';
import { DateCell } from '../../components/admin/DateCell';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '../../components/ui/StateMessage';
import { Toast } from '../../components/ui/Toast';
import { useAdminCategories } from '../../hooks/useAdminCategories';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useReconciliation } from '../../hooks/useReconciliation';
import { usePendingSelection, type HeaderCheckState } from '../../hooks/usePendingSelection';
import { useToast } from '../../hooks/useToast';
import { notifyCleanupChanged } from '../../lib/cleanupEvents';
import { isServiceError } from '../../lib/errors';
import { buildPrefill } from '../../lib/pendingGroup';
import { deleteSystemProducts } from '../../services/importService';
import type { ReconciliationFilter, ReconciliationRow, ReconciliationStatus } from '../../types/systemProducts';

const PAGE_SIZE = 50;

const FILTER_OPTIONS: Array<{ value: ReconciliationFilter; label: string }> = [
  { value: 'pending', label: 'Pendentes (todos)' },
  { value: 'missing', label: 'Não cadastrados' },
  { value: 'inactive', label: 'Cadastrados, fora do ar' },
  { value: 'published', label: 'Publicados' },
  { value: 'all', label: 'Toda a base' },
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
  return value === 'pending' || value === 'all' || value === 'missing' || value === 'inactive' || value === 'published';
}

/** Card a criar: um registro (ação da linha) ou a seleção inteira. */
type Creating = { source: 'row' | 'selection'; rows: ReconciliationRow[] };

/** Registros a excluir da base: uma linha ou a seleção inteira. */
type Deleting = { source: 'row' | 'selection'; rows: ReconciliationRow[] };

/** Checkbox "Selecionar todos os visíveis", com o estado intermediário (alguns marcados). */
function HeaderCheckbox({ state, disabled, onToggle }: { state: HeaderCheckState; disabled: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="row-check"
      checked={state === 'all'}
      disabled={disabled}
      onChange={onToggle}
      aria-label="Selecionar todos os visíveis"
      title="Selecionar todos os visíveis"
    />
  );
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

  const { list, summary, status, error, reload, markCataloged, markDeleted } = useReconciliation({
    filter,
    search,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const categories = useAdminCategories();
  const { toast, show, dismiss } = useToast();
  const [creating, setCreating] = useState<Creating | null>(null);
  const visibleRows = list?.rows ?? [];
  const selection = usePendingSelection(visibleRows);
  const selectedRows = [...selection.selected.values()];
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      const result = await deleteSystemProducts(deleting.rows);
      selection.remove(deleting.rows.map((row) => row.code));
      markDeleted(deleting.rows);
      notifyCleanupChanged();
      show(
        'ok',
        [
          result.deleted === 1 ? '1 registro excluído da base.' : `${result.deleted.toLocaleString('pt-BR')} registros excluídos da base.`,
          result.inCatalog > 0 ? 'Os produtos do catálogo continuam como estavam.' : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
      setDeleting(null);
    } catch (err) {
      show('err', isServiceError(err) ? err.message : 'Não foi possível excluir os registros.');
      reload();
    } finally {
      setDeletingBusy(false);
    }
  };

  const onCheckClick = (row: ReconciliationRow) => (event: MouseEvent<HTMLInputElement>) => {
    selection.toggle(row, { range: event.shiftKey });
  };

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
            <table className="admin-table pending-table">
              <thead>
                <tr>
                  <th scope="col" className="col-check">
                    <HeaderCheckbox state={selection.headerState} disabled={visibleRows.length === 0} onToggle={selection.toggleVisible} />
                  </th>
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
                  const checked = selection.isSelected(row.code);
                  return (
                    <tr key={row.code} className={checked ? 'is-selected' : undefined} aria-selected={checked}>
                      <td className="col-check">
                        <input
                          type="checkbox"
                          className="row-check"
                          checked={checked}
                          // onClick (e não onChange) para ler o Shift: marca um intervalo.
                          onClick={onCheckClick(row)}
                          onChange={() => undefined}
                          aria-label={`Selecionar ${row.code}`}
                          title="Shift+clique seleciona um intervalo"
                        />
                      </td>
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
                        <div className="row-actions">
                          {row.status === 'missing' ? (
                            <button type="button" className="act act-pri" onClick={() => setCreating({ source: 'row', rows: [row] })}>
                              + Cadastrar no catálogo
                            </button>
                          ) : (
                            <Link to={`/admin?q=${encodeURIComponent(row.code)}`} className="act act-link">
                              Ver produto
                            </Link>
                          )}
                          <button
                            type="button"
                            className="act icon danger-text"
                            aria-label={`Excluir ${row.code} da base`}
                            title="Excluir da base do sistema"
                            onClick={() => setDeleting({ source: 'row', rows: [row] })}
                          >
                            <TrashIcon />
                          </button>
                        </div>
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

      {selectedRows.length > 0 && (
        <PendingSelectionBar
          rows={selectedRows}
          cardRows={selection.cardRows}
          hiddenCount={selection.hiddenCount}
          busy={deletingBusy}
          onCreate={() => setCreating({ source: 'selection', rows: selection.cardRows })}
          onDelete={() => setDeleting({ source: 'selection', rows: selectedRows })}
          onClear={selection.clear}
        />
      )}

      {creating && (
        <ItemForm
          mode="create"
          prefill={buildPrefill(creating.rows)}
          categories={categories.categories}
          onCancel={() => setCreating(null)}
          onSaved={(result) => {
            const published = result.item.is_active && result.item.category.is_active;
            const savedCodes = result.item.codes.map((code) => code.code);
            // Os códigos oferecidos ao card saem da seleção; os cadastrados saem da lista na hora.
            selection.remove([...creating.rows.map((row) => row.code), ...savedCodes]);
            markCataloged(savedCodes, published);
            setCreating(null);
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
          }}
        />
      )}

      {deleting && (
        <DeleteRecordsDialog
          rows={deleting.rows}
          busy={deletingBusy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
    </svg>
  );
}

/** Confirmação de exclusão da base, com aviso para códigos que estão no catálogo. */
function DeleteRecordsDialog({
  rows,
  busy,
  onConfirm,
  onCancel,
}: {
  rows: readonly ReconciliationRow[];
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const inCatalog = rows.filter((row) => row.status !== 'missing');
  const [only] = rows;
  const single = rows.length === 1 && only;
  return (
    <ConfirmDialog
      title={single ? 'Excluir da base do sistema?' : `Excluir ${rows.length.toLocaleString('pt-BR')} registros da base?`}
      confirmLabel={single ? 'Excluir registro' : `Excluir ${rows.length.toLocaleString('pt-BR')} registros`}
      tone="danger"
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {single ? (
        <p>
          <strong className="col-mono">{only.code}</strong> · {only.description} sai da base importada da planilha.
        </p>
      ) : (
        <p>Os registros selecionados saem da base importada da planilha.</p>
      )}
      {inCatalog.length > 0 && (
        <div className="in-use-note" role="note">
          <span className="pill pill-valid">Em uso no catálogo</span>
          <p>
            {inCatalog.length === 1
              ? `O código ${inCatalog[0]?.code ?? ''} está no produto “${inCatalog[0]?.catalogItemTitle ?? ''}”.`
              : `${inCatalog.length.toLocaleString('pt-BR')} códigos estão em produtos do catálogo.`}{' '}
            <strong>O produto não é alterado nem excluído</strong>: ele continua no catálogo com os mesmos códigos. Só o
            registro da planilha é removido.
          </p>
        </div>
      )}
      <p className="hint">Se o código vier de novo numa próxima importação, ele volta para a base.</p>
    </ConfirmDialog>
  );
}
