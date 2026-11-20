import { useState } from 'react';
import { notifyCleanupChanged } from '../../lib/cleanupEvents';
import { isServiceError, type ServiceError } from '../../lib/errors';
import type { AsyncStatus } from '../../hooks/asyncState';
import { deleteImportBatchRecords, undoImportBatch } from '../../services/importService';
import type { ImportBatchWithStats } from '../../types/cleanup';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ErrorState } from '../ui/StateMessage';
import { DateCell } from './DateCell';

type Action = { kind: 'undo' | 'delete'; batch: ImportBatchWithStats };

type ImportHistoryProps = {
  batches: ImportBatchWithStats[] | null;
  status: AsyncStatus;
  error: ServiceError | null;
  reload: () => void;
  /** Mensagem de resultado (sucesso/erro) para o toast da página. */
  onResult: (tone: 'ok' | 'err', message: string) => void;
};

const n = (value: number) => value.toLocaleString('pt-BR');

/**
 * Importações anteriores: desfazer a mais recente (planilha errada) ou excluir
 * os registros que uma importação criou. Produtos do catálogo não são afetados.
 */
export function ImportHistory({ batches, status, error, reload, onResult }: ImportHistoryProps) {
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === 'undo') {
        const result = await undoImportBatch(action.batch.id);
        onResult(
          'ok',
          `Importação “${action.batch.file_name}” desfeita: ${n(result.deleted)} registro(s) novo(s) excluído(s) e ${n(result.restored)} restaurado(s).`,
        );
      } else {
        const deleted = await deleteImportBatchRecords(action.batch.id);
        onResult('ok', `${n(deleted)} registro(s) criado(s) por “${action.batch.file_name}” excluído(s) da base.`);
      }
      notifyCleanupChanged();
      setAction(null);
    } catch (err) {
      onResult('err', isServiceError(err) ? err.message : 'Não foi possível concluir a operação.');
    } finally {
      setBusy(false);
      reload();
    }
  };

  return (
    <section className="card import-step" aria-labelledby="import-history-title">
      <div className="step-head">
        <h2 className="step-title" id="import-history-title">
          Importações anteriores
        </h2>
        <span className="cell-sub">Planilha errada? Desfaça a última importação ou exclua os registros que ela criou.</span>
      </div>

      {status === 'loading' && (
        <p className="state" role="status">
          Carregando histórico…
        </p>
      )}
      {status === 'error' && <ErrorState error={error} onRetry={reload} />}
      {status === 'success' && batches && batches.length === 0 && (
        <p className="hint">Nenhuma importação registrada ainda. O histórico começa na próxima planilha importada.</p>
      )}

      {status === 'success' && batches && batches.length > 0 && (
        <div className="preview-scroll">
          <table className="admin-table history-table">
            <thead>
              <tr>
                <th scope="col">Arquivo</th>
                <th scope="col">Importada em</th>
                <th scope="col" className="col-num">
                  Recebidos
                </th>
                <th scope="col" className="col-num">
                  Novos
                </th>
                <th scope="col" className="col-num">
                  Alterados
                </th>
                <th scope="col" className="col-num" title="Registros criados por esta importação que ainda estão na base">
                  Ainda na base
                </th>
                <th scope="col">Situação</th>
                <th scope="col" className="col-actions">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const undone = batch.undone_at !== null;
                return (
                  <tr key={batch.id} className={undone ? 'is-off' : undefined}>
                    <td className="col-title">
                      {batch.file_name}
                      {batch.imported_by_email && <span className="cell-sub">por {batch.imported_by_email}</span>}
                    </td>
                    <td className="col-date">
                      <DateCell iso={batch.started_at} />
                    </td>
                    <td className="col-num">{n(batch.received)}</td>
                    <td className="col-num">{n(batch.inserted)}</td>
                    <td className="col-num">{n(batch.updated)}</td>
                    <td className="col-num">{n(batch.remaining)}</td>
                    <td>
                      {undone ? (
                        <span className="pill pill-duplicate">Desfeita</span>
                      ) : batch.canUndo ? (
                        <span className="pill pill-valid">Mais recente</span>
                      ) : batch.finished_at === null ? (
                        <span className="pill pill-invalid">Sem registros</span>
                      ) : (
                        <span className="pill">Concluída</span>
                      )}
                    </td>
                    <td className="col-actions">
                      <div className="row-actions">
                        {batch.canUndo && (
                          <button type="button" className="act" onClick={() => setAction({ kind: 'undo', batch })}>
                            Desfazer
                          </button>
                        )}
                        {batch.remaining > 0 && (
                          <button type="button" className="act danger-text" onClick={() => setAction({ kind: 'delete', batch })}>
                            Excluir criados ({n(batch.remaining)})
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {action?.kind === 'undo' && (
        <ConfirmDialog
          title="Desfazer importação?"
          confirmLabel="Desfazer importação"
          tone="danger"
          busy={busy}
          onConfirm={() => void run()}
          onCancel={() => setAction(null)}
        >
          <p>
            A base volta a ficar como estava antes de <strong>{action.batch.file_name}</strong>:
          </p>
          <ul>
            <li>os {n(action.batch.inserted)} código(s) que ela incluiu são excluídos;</li>
            <li>os {n(action.batch.updated)} código(s) que ela alterou voltam à descrição e à marca anteriores.</li>
          </ul>
          <p className="hint">Produtos do catálogo não são alterados. Só a importação mais recente pode ser desfeita.</p>
        </ConfirmDialog>
      )}

      {action?.kind === 'delete' && (
        <ConfirmDialog
          title="Excluir registros desta importação?"
          confirmLabel={`Excluir ${n(action.batch.remaining)} registro(s)`}
          tone="danger"
          busy={busy}
          onConfirm={() => void run()}
          onCancel={() => setAction(null)}
        >
          <p>
            Saem da base os <strong>{n(action.batch.remaining)}</strong> código(s) que <strong>{action.batch.file_name}</strong> incluiu.
            Alterações feitas por ela em códigos que já existiam não são revertidas.
          </p>
          <p className="hint">Códigos que estão em produtos do catálogo também saem da base, mas os produtos continuam como estão.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
