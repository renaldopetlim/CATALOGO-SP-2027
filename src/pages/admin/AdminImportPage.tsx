import { useId, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { AdminTopbar } from '../../components/admin/AdminTopbar';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { isServiceError } from '../../lib/errors';
import { ACCEPTED_EXTENSIONS, buildPreview, readSpreadsheet } from '../../lib/spreadsheet';
import { importSystemProducts } from '../../services/systemProductsService';
import type { ImportPreview, ImportProgress, ImportSummary, PreviewRowStatus, RawSheet } from '../../types/systemProducts';

type Stage =
  | { name: 'idle' }
  | { name: 'reading'; fileName: string }
  | { name: 'preview'; sheet: RawSheet; preview: ImportPreview }
  | { name: 'importing'; preview: ImportPreview; progress: ImportProgress }
  | { name: 'done'; preview: ImportPreview; summary: ImportSummary };

type RowFilter = 'all' | PreviewRowStatus;

const PREVIEW_LIMIT = 300;

const STATUS_LABEL: Record<PreviewRowStatus, string> = {
  valid: 'OK',
  invalid: 'Erro',
  duplicate: 'Repetido',
};

export function AdminImportPage() {
  useDocumentTitle('Admin · Importar planilha');
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ name: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [uppercaseDescription, setUppercaseDescription] = useState(false);
  const [rowFilter, setRowFilter] = useState<RowFilter>('all');
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setRowFilter('all');
    setStage({ name: 'reading', fileName: file.name });
    try {
      const sheet = await readSpreadsheet(file);
      const preview = buildPreview(sheet, { uppercaseDescription });
      if (preview.rows.length === 0) throw new Error('A planilha não tem linhas de dados abaixo do cabeçalho.');
      setStage({ name: 'preview', sheet, preview });
    } catch (err) {
      setError(isServiceError(err) || err instanceof Error ? err.message : 'Não foi possível ler o arquivo.');
      setStage({ name: 'idle' });
    }
  };

  const toggleUppercase = (value: boolean) => {
    setUppercaseDescription(value);
    if (stage.name === 'preview') {
      setStage({ ...stage, preview: buildPreview(stage.sheet, { uppercaseDescription: value }) });
    }
  };

  const runImport = async (preview: ImportPreview) => {
    const valid = preview.rows.filter((row) => row.status === 'valid').map(({ code, description, brand }) => ({ code, description, brand }));
    setStage({ name: 'importing', preview, progress: { sent: 0, total: valid.length } });
    const summary = await importSystemProducts(valid, {
      ignored: preview.invalid + preview.duplicate,
      onProgress: (progress) => setStage({ name: 'importing', preview, progress }),
    });
    setStage({ name: 'done', preview, summary });
  };

  const reset = () => {
    setStage({ name: 'idle' });
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const preview = stage.name === 'preview' || stage.name === 'importing' || stage.name === 'done' ? stage.preview : null;
  const visibleRows = preview ? preview.rows.filter((row) => rowFilter === 'all' || row.status === rowFilter) : [];

  return (
    <>
      <AdminTopbar
        title="Importar planilha"
        meta="Base do sistema interno: código, descrição e marca. Atualiza por código (upsert)."
        action={
          preview ? (
            <button type="button" className="sec" onClick={reset} disabled={stage.name === 'importing'}>
              Escolher outro arquivo
            </button>
          ) : undefined
        }
      />

      <div className="admin-content">
        <div className="admin-pad import-layout">
          {/* 1. Arquivo */}
          {(stage.name === 'idle' || stage.name === 'reading') && (
            <section className="card import-step">
              <h2 className="step-title">1. Escolha a planilha</h2>
              <label
                htmlFor={inputId}
                className={`dropzone${dragging ? ' over' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <strong>{stage.name === 'reading' ? `Lendo ${stage.fileName}…` : 'Arraste o arquivo aqui ou clique para escolher'}</strong>
                <span>Formatos: .csv (separado por vírgula ou ponto e vírgula) e .xlsx · até 15 MB · até 50 mil linhas</span>
              </label>
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                className="sr-only"
                accept={[...ACCEPTED_EXTENSIONS, 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].join(',')}
                disabled={stage.name === 'reading'}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              {error && (
                <div className="import-error" role="alert">
                  {error}
                </div>
              )}
              <div className="import-help">
                <p>
                  A primeira linha deve ter os títulos <code>CODIGO</code>, <code>DESCRICAO</code> e <code>MARCA</code>, em qualquer
                  ordem. Acentos e maiúsculas não importam (“Código”, “Descrição” também valem). Outras colunas são ignoradas.
                </p>
                <p>
                  Códigos e marcas são gravados em MAIÚSCULAS e os espaços extras são removidos. Se um código já existir na base,
                  descrição e marca são atualizadas.
                </p>
                <p className="hint">
                  Dica: no Excel, códigos numéricos com zeros à esquerda (ex.: 00123) só são preservados se a coluna estiver
                  formatada como Texto.
                </p>
              </div>
              <label className="check">
                <input type="checkbox" checked={uppercaseDescription} onChange={(e) => toggleUppercase(e.target.checked)} />
                Converter também a descrição para MAIÚSCULAS
              </label>
            </section>
          )}

          {/* 2. Pré-visualização */}
          {preview && (
            <section className="card import-step">
              <div className="step-head">
                <h2 className="step-title">
                  {stage.name === 'done' ? '3. Resultado' : stage.name === 'importing' ? '3. Importando…' : '2. Confira antes de importar'}
                </h2>
                <span className="cell-sub">{preview.fileName}</span>
              </div>

              <div className="import-stats" role="group" aria-label="Filtrar linhas">
                {(['all', 'valid', 'invalid', 'duplicate'] as const).map((key) => {
                  const count = key === 'all' ? preview.rows.length : preview[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`stat stat-${key}`}
                      aria-pressed={rowFilter === key}
                      onClick={() => setRowFilter(key)}
                      disabled={key !== 'all' && count === 0}
                    >
                      <b>{count.toLocaleString('pt-BR')}</b>
                      {key === 'all' ? 'linhas' : key === 'valid' ? 'válidas' : key === 'invalid' ? 'com erro' : 'repetidas'}
                    </button>
                  );
                })}
              </div>

              {stage.name === 'preview' && (
                <div className="import-actions">
                  <label className="check">
                    <input type="checkbox" checked={uppercaseDescription} onChange={(e) => toggleUppercase(e.target.checked)} />
                    Descrição em MAIÚSCULAS
                  </label>
                  <button type="button" className="pri" disabled={preview.valid === 0} onClick={() => void runImport(preview)}>
                    Importar {preview.valid.toLocaleString('pt-BR')} {preview.valid === 1 ? 'registro' : 'registros'}
                  </button>
                </div>
              )}
              {stage.name === 'preview' && preview.invalid + preview.duplicate > 0 && (
                <p className="hint">
                  {(preview.invalid + preview.duplicate).toLocaleString('pt-BR')} linha(s) com erro ou repetidas serão ignoradas.
                </p>
              )}

              {stage.name === 'importing' && (
                <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={stage.progress.total} aria-valuenow={stage.progress.sent}>
                  <div style={{ width: `${stage.progress.total ? (stage.progress.sent / stage.progress.total) * 100 : 100}%` }} />
                  <span>
                    {stage.progress.sent.toLocaleString('pt-BR')} de {stage.progress.total.toLocaleString('pt-BR')} enviados
                  </span>
                </div>
              )}

              {stage.name === 'done' && <ImportResult summary={stage.summary} />}

              <div className="preview-scroll">
                <table className="admin-table preview-table">
                  <thead>
                    <tr>
                      <th scope="col" className="col-num">
                        Linha
                      </th>
                      <th scope="col">Código</th>
                      <th scope="col">Descrição</th>
                      <th scope="col">Marca</th>
                      <th scope="col">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.slice(0, PREVIEW_LIMIT).map((row) => (
                      <tr key={row.line} className={row.status === 'valid' ? undefined : 'is-off'}>
                        <td className="col-num">{row.line}</td>
                        <td className="col-mono">{row.code || '—'}</td>
                        <td>{row.description || '—'}</td>
                        <td>{row.brand || '—'}</td>
                        <td>
                          <span className={`pill pill-${row.status}`}>{STATUS_LABEL[row.status]}</span>
                          {row.messages.length > 0 && <span className="cell-sub">{row.messages.join(' · ')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visibleRows.length > PREVIEW_LIMIT && (
                <p className="hint">
                  Mostrando {PREVIEW_LIMIT} de {visibleRows.length.toLocaleString('pt-BR')} linhas. Todas as válidas serão importadas.
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function ImportResult({ summary }: { summary: ImportSummary }) {
  const items: Array<[string, number, string]> = [
    ['Inseridos', summary.inserted, 'ok'],
    ['Atualizados', summary.updated, 'ok'],
    ['Sem mudança', summary.unchanged, 'mut'],
    ['Ignorados (erro na planilha)', summary.ignored, summary.ignored ? 'warn' : 'mut'],
    ['Falharam no envio', summary.failed, summary.failed ? 'err' : 'mut'],
  ];
  return (
    <div className="import-result" role="status">
      <dl>
        {items.map(([label, value, tone]) => (
          <div key={label} className={`result-${tone}`}>
            <dt>{label}</dt>
            <dd>{value.toLocaleString('pt-BR')}</dd>
          </div>
        ))}
      </dl>
      {summary.errors.length > 0 && (
        <ul className="import-error">
          {summary.errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      <Link to="/admin/pendentes" className="pri btn-link result-link">
        Ver pendentes no catálogo →
      </Link>
    </div>
  );
}
