import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminTopbar } from '../../components/admin/AdminTopbar';
import { DateCell } from '../../components/admin/DateCell';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '../../components/ui/StateMessage';
import { Toast } from '../../components/ui/Toast';
import { useCleanupReport, useOrphanFiles, useStaleRecords } from '../../hooks/useCleanup';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useToast } from '../../hooks/useToast';
import { notifyCleanupChanged } from '../../lib/cleanupEvents';
import { isServiceError } from '../../lib/errors';
import { formatBytes, formatDateTime } from '../../lib/format';
import { deleteOrphanFiles, purgeStaleRecords } from '../../services/cleanupService';
import {
  ORPHAN_MIN_AGE_MINUTES,
  type DeleteFilesResult,
  type OrphanFile,
  type StaleCriteria,
  type StorageFolder,
} from '../../types/cleanup';

const STALE_PAGE = 50;
const DAY_OPTIONS = [30, 60, 90, 180, 365] as const;
const FOLDER_LABEL: Record<StorageFolder, string> = { items: 'Produto', brands: 'Logo de marca', other: 'Outro' };

const n = (value: number) => value.toLocaleString('pt-BR');

type FileAction = { kind: 'one'; file: OrphanFile } | { kind: 'all'; files: OrphanFile[]; bytes: number };

function filesMessage(result: DeleteFilesResult): { tone: 'ok' | 'warn'; text: string } {
  const parts = [
    result.deleted === 1 ? '1 arquivo excluído' : `${n(result.deleted)} arquivos excluídos`,
    `${formatBytes(result.freedBytes)} liberados.`,
  ];
  if (result.skipped > 0) parts.push(`${n(result.skipped)} passou(aram) a ser usado(s) e foi(ram) mantido(s).`);
  if (result.errors.length > 0) parts.push(result.errors.join(' '));
  return { tone: result.errors.length > 0 || result.skipped > 0 ? 'warn' : 'ok', text: parts.join(' · ') };
}

/** Painel "Saúde e limpeza": registros sem uso na base e arquivos sem uso no Storage. */
export function AdminCleanupPage() {
  useDocumentTitle('Admin · Saúde e limpeza');
  const { toast, show, dismiss } = useToast();

  const [criteria, setCriteria] = useState<StaleCriteria>({ mode: 'last_import', days: 90 });
  const [stalePage, setStalePage] = useState(1);
  const report = useCleanupReport(criteria.days);
  const stale = useStaleRecords(criteria, STALE_PAGE, (stalePage - 1) * STALE_PAGE);
  const orphans = useOrphanFiles();

  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);
  const [fileAction, setFileAction] = useState<FileAction | null>(null);
  const [deletingFiles, setDeletingFiles] = useState(false);

  const reloadAll = () => {
    report.reload();
    stale.reload();
    orphans.reload();
    notifyCleanupChanged();
  };

  const changeCriteria = (next: StaleCriteria) => {
    setCriteria(next);
    setStalePage(1);
  };

  const runPurge = async () => {
    setPurging(true);
    try {
      const deleted = await purgeStaleRecords(criteria);
      show('ok', deleted === 1 ? '1 registro sem uso excluído da base.' : `${n(deleted)} registros sem uso excluídos da base.`);
      setConfirmPurge(false);
      setStalePage(1);
    } catch (err) {
      show('err', isServiceError(err) ? err.message : 'Não foi possível limpar os registros.');
    } finally {
      setPurging(false);
      reloadAll();
    }
  };

  const runDeleteFiles = async () => {
    if (!fileAction) return;
    setDeletingFiles(true);
    try {
      const names = fileAction.kind === 'one' ? [fileAction.file.name] : fileAction.files.map((file) => file.name);
      const result = await deleteOrphanFiles(names);
      const message = filesMessage(result);
      show(message.tone, message.text);
      setFileAction(null);
    } catch (err) {
      show('err', isServiceError(err) ? err.message : 'Não foi possível excluir os arquivos.');
    } finally {
      setDeletingFiles(false);
      reloadAll();
    }
  };

  const data = report.data;
  const staleTotal = stale.data?.total ?? 0;
  const stalePages = Math.max(Math.ceil(staleTotal / STALE_PAGE), 1);
  const orphanFiles = orphans.data?.files ?? [];
  const orphanBytes = orphans.data?.totalBytes ?? 0;
  const noImportHistory = criteria.mode === 'last_import' && data !== null && data.base.lastImportAt === null;

  return (
    <>
      <AdminTopbar
        title="Saúde e limpeza"
        meta="Dados da planilha e arquivos de imagem que ocupam espaço no Supabase sem estar em uso."
        action={
          <button type="button" className="sec tb-btn" onClick={reloadAll} disabled={report.status === 'loading'}>
            Analisar novamente
          </button>
        }
      />

      <div className="admin-content">
        <div className="admin-pad cleanup-layout">
          {/* Resumo */}
          {report.status === 'error' && <ErrorState error={report.error} onRetry={report.reload} />}
          <div className="health-cards" aria-busy={report.status === 'loading'}>
            <HealthCard
              label="Armazenamento de imagens"
              value={data ? formatBytes(data.storage.bytes) : '…'}
              detail={data ? `${n(data.storage.files)} arquivo(s) no bucket` : 'Analisando…'}
            />
            <HealthCard
              label="Arquivos sem uso"
              tone={data && data.orphans.files > 0 ? 'warn' : 'ok'}
              value={data ? (data.orphans.files > 0 ? formatBytes(data.orphans.bytes) : 'Nenhum') : '…'}
              detail={data ? (data.orphans.files > 0 ? `${n(data.orphans.files)} arquivo(s) para liberar` : 'Todo arquivo está em uso') : 'Analisando…'}
            />
            <HealthCard
              label="Base do sistema"
              value={data ? n(data.base.total) : '…'}
              detail={data ? `${n(data.base.linked)} código(s) em produtos do catálogo` : 'Analisando…'}
            />
            <HealthCard
              label="Registros sem uso"
              tone={data && (data.base.staleLastImport > 0 || data.base.staleOlderThan > 0) ? 'warn' : 'ok'}
              value={data ? n(criteria.mode === 'last_import' ? data.base.staleLastImport : data.base.staleOlderThan) : '…'}
              detail={
                data
                  ? `${n(data.base.staleLastImport)} fora da última planilha · ${n(data.base.staleOlderThan)} há mais de ${n(data.days)} dias`
                  : 'Analisando…'
              }
            />
          </div>

          {/* Registros sem uso */}
          <section className="card cleanup-section" aria-labelledby="stale-title">
            <div className="section-head">
              <div>
                <h2 className="step-title" id="stale-title">
                  Registros sem uso na base do sistema
                </h2>
                <p className="hint">
                  Códigos importados que <strong>não estão em nenhum produto do catálogo</strong> e não vieram nas planilhas recentes. Códigos em
                  uso no catálogo nunca entram nesta lista.
                </p>
              </div>
              <button
                type="button"
                className="danger"
                disabled={staleTotal === 0 || stale.status !== 'success'}
                onClick={() => setConfirmPurge(true)}
              >
                Limpar registros não utilizados ({n(staleTotal)})
              </button>
            </div>

            <div className="criteria" role="group" aria-label="Critério">
              <label className="check">
                <input
                  type="radio"
                  name="stale-mode"
                  checked={criteria.mode === 'last_import'}
                  onChange={() => changeCriteria({ ...criteria, mode: 'last_import' })}
                />
                Não vieram na última planilha
                {data?.base.lastImportFile && (
                  <span className="cell-sub">
                    “{data.base.lastImportFile}”{data.base.lastImportAt ? `, ${formatDateTime(data.base.lastImportAt)}` : ''}
                  </span>
                )}
              </label>
              <label className="check">
                <input
                  type="radio"
                  name="stale-mode"
                  checked={criteria.mode === 'older_than'}
                  onChange={() => changeCriteria({ ...criteria, mode: 'older_than' })}
                />
                Fora das planilhas há mais de
                <select
                  aria-label="Dias"
                  value={criteria.days}
                  onChange={(e) => changeCriteria({ mode: 'older_than', days: Number(e.target.value) })}
                >
                  {DAY_OPTIONS.map((days) => (
                    <option key={days} value={days}>
                      {days} dias
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {stale.status === 'loading' && (
              <p className="state" role="status">
                Procurando registros sem uso…
              </p>
            )}
            {stale.status === 'error' && <ErrorState error={stale.error} onRetry={stale.reload} />}
            {stale.status === 'success' && staleTotal === 0 && (
              <EmptyState title={noImportHistory ? 'Nenhuma importação registrada ainda' : 'Nenhum registro sem uso'}>
                {noImportHistory ? (
                  <>
                    Este critério passa a valer a partir da próxima planilha importada em <Link to="/admin/importar">Importar planilha</Link>.
                  </>
                ) : (
                  'Todos os registros da base estão no catálogo ou vieram nas planilhas recentes.'
                )}
              </EmptyState>
            )}
            {stale.status === 'success' && stale.data && staleTotal > 0 && (
              <>
                <div className="preview-scroll">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th scope="col">Código</th>
                        <th scope="col">Descrição</th>
                        <th scope="col">Marca</th>
                        <th scope="col">Visto pela última vez</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stale.data.rows.map((row) => (
                        <tr key={row.code}>
                          <td className="col-mono col-code">{row.code}</td>
                          <td className="col-title">{row.description}</td>
                          <td>{row.brand}</td>
                          <td className="col-date">
                            <DateCell iso={row.last_seen_at} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {stalePages > 1 && (
                  <div className="pager">
                    <span className="cell-sub">
                      Página {n(stalePage)} de {n(stalePages)} · {n(staleTotal)} registros
                    </span>
                    <div className="row-actions">
                      <button type="button" className="act" disabled={stalePage <= 1} onClick={() => setStalePage(stalePage - 1)}>
                        ← Anterior
                      </button>
                      <button type="button" className="act" disabled={stalePage >= stalePages} onClick={() => setStalePage(stalePage + 1)}>
                        Próxima →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Arquivos sem uso */}
          <section className="card cleanup-section" aria-labelledby="orphans-title">
            <div className="section-head">
              <div>
                <h2 className="step-title" id="orphans-title">
                  Arquivos sem uso no Storage
                </h2>
                <p className="hint">
                  Imagens do bucket <code>catalog-images</code> que não estão em nenhum produto nem em nenhuma marca (sobras de produtos
                  excluídos, imagens substituídas ou envios interrompidos). Arquivos enviados há menos de {ORPHAN_MIN_AGE_MINUTES} minutos não
                  entram na lista.
                </p>
              </div>
              <button
                type="button"
                className="danger"
                disabled={orphanFiles.length === 0}
                onClick={() => setFileAction({ kind: 'all', files: orphanFiles, bytes: orphanBytes })}
              >
                Liberar espaço ({formatBytes(orphanBytes)})
              </button>
            </div>

            {orphans.status === 'loading' && (
              <p className="state" role="status">
                Comparando o Storage com produtos e marcas…
              </p>
            )}
            {orphans.status === 'error' && <ErrorState error={orphans.error} onRetry={orphans.reload} />}
            {orphans.status === 'success' && orphanFiles.length === 0 && (
              <EmptyState title="Nenhum arquivo sem uso">Todas as imagens do Storage estão em produtos ou marcas.</EmptyState>
            )}
            {orphans.status === 'success' && orphanFiles.length > 0 && (
              <div className="preview-scroll">
                <table className="admin-table orphan-table">
                  <thead>
                    <tr>
                      <th scope="col" className="col-thumb">
                        <span className="sr-only">Miniatura</span>
                      </th>
                      <th scope="col">Arquivo</th>
                      <th scope="col">Origem</th>
                      <th scope="col" className="col-num">
                        Tamanho
                      </th>
                      <th scope="col">Enviado em</th>
                      <th scope="col" className="col-actions">
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orphanFiles.map((file) => (
                      <tr key={file.name}>
                        <td className="col-thumb">
                          <a href={file.publicUrl} target="_blank" rel="noopener" className="orphan-thumb" title="Abrir em nova aba">
                            <img src={file.publicUrl} alt="" loading="lazy" width={48} height={48} />
                          </a>
                        </td>
                        <td className="col-mono orphan-name">{file.name}</td>
                        <td>{FOLDER_LABEL[file.folder]}</td>
                        <td className="col-num">{formatBytes(file.size)}</td>
                        <td className="col-date">
                          <DateCell iso={file.createdAt} />
                        </td>
                        <td className="col-actions">
                          <button type="button" className="act danger-text" onClick={() => setFileAction({ kind: 'one', file })}>
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      {confirmPurge && (
        <ConfirmDialog
          title="Limpar registros não utilizados?"
          confirmLabel={`Excluir ${n(staleTotal)} registro(s)`}
          tone="danger"
          busy={purging}
          onConfirm={() => void runPurge()}
          onCancel={() => setConfirmPurge(false)}
        >
          <p>
            Saem da base do sistema <strong>{n(staleTotal)}</strong> registro(s){' '}
            {criteria.mode === 'last_import' ? 'que não vieram na última planilha' : `fora das planilhas há mais de ${n(criteria.days)} dias`}.
          </p>
          <p className="hint">
            Nenhum deles está em produto do catálogo. Se algum código voltar numa próxima planilha, ele é incluído de novo.
          </p>
        </ConfirmDialog>
      )}

      {fileAction && (
        <ConfirmDialog
          title={fileAction.kind === 'one' ? 'Excluir arquivo?' : 'Liberar espaço?'}
          confirmLabel={fileAction.kind === 'one' ? 'Excluir arquivo' : `Excluir ${n(fileAction.files.length)} arquivo(s)`}
          tone="danger"
          busy={deletingFiles}
          onConfirm={() => void runDeleteFiles()}
          onCancel={() => setFileAction(null)}
        >
          {fileAction.kind === 'one' ? (
            <div className="orphan-confirm">
              <img src={fileAction.file.publicUrl} alt="" width={72} height={72} />
              <p>
                <span className="col-mono">{fileAction.file.name}</span> ({formatBytes(fileAction.file.size)}) será removido do Storage
                permanentemente.
              </p>
            </div>
          ) : (
            <p>
              <strong>{n(fileAction.files.length)}</strong> arquivo(s) sem uso, ocupando <strong>{formatBytes(fileAction.bytes)}</strong>, serão
              removidos do Storage permanentemente.
            </p>
          )}
          <p className="hint">
            Antes de excluir, o sistema confere de novo: um arquivo que passou a ser usado por um produto ou marca é mantido. Esta ação não
            pode ser desfeita.
          </p>
        </ConfirmDialog>
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </>
  );
}

function HealthCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`health-card${tone ? ` tone-${tone}` : ''}`}>
      <span className="label">{label}</span>
      <strong>{value}</strong>
      <span className="cell-sub">{detail}</span>
    </div>
  );
}

