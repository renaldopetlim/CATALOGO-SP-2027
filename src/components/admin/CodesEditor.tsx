import { useId } from 'react';
import { ColorFields } from './ColorFields';
import { newCodeRow, type CodeRow } from './editorRows';

type CodesEditorProps = {
  rows: CodeRow[];
  onChange: (rows: CodeRow[]) => void;
  /** Erro por linha (índice → mensagem). */
  errors?: Record<number, string>;
  disabled?: boolean;
  /** Categoria com cores (ex.: Tintas): mostra nome da cor, cor e amostra em cada código. */
  showColors?: boolean;
};

/**
 * Blocos Código + Descrição + Embalagem do produto.
 * Sempre mantém ao menos uma linha; a ordem aqui é a ordem na vitrine.
 */
export function CodesEditor({ rows, onChange, errors = {}, disabled = false, showColors = false }: CodesEditorProps) {
  const baseId = useId();

  const update = (index: number, patch: Partial<CodeRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    onChange(next);
  };

  return (
    <div className={`rows-editor codes-editor${showColors ? ' with-colors' : ''}`}>
      <div className="rows-head" aria-hidden="true">
        <span>Código *</span>
        <span>Descrição</span>
        <span>Embalagem</span>
        <span />
      </div>

      {rows.map((row, index) => {
        const id = `${baseId}-${row.key}`;
        const error = errors[index];
        return (
          <div key={row.key} className={`rows-line${error ? ' has-error' : ''}`}>
            <div>
              <label htmlFor={`${id}-code`} className="sr-only">
                Código da linha {index + 1}
              </label>
              <input
                id={`${id}-code`}
                value={row.code}
                placeholder="Ex.: PAR-6X40"
                maxLength={60}
                disabled={disabled}
                className={error ? 'bad' : undefined}
                onChange={(e) => update(index, { code: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <label htmlFor={`${id}-desc`} className="sr-only">
                Descrição da linha {index + 1}
              </label>
              <input
                id={`${id}-desc`}
                value={row.description}
                placeholder="Ex.: 6 x 40 mm, cinza, 220 V"
                maxLength={500}
                disabled={disabled}
                onChange={(e) => update(index, { description: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor={`${id}-pack`} className="sr-only">
                Embalagem da linha {index + 1}
              </label>
              <input
                id={`${id}-pack`}
                value={row.packaging}
                placeholder="Ex.: Caixa com 50"
                maxLength={120}
                disabled={disabled}
                onChange={(e) => update(index, { packaging: e.target.value })}
              />
            </div>
            <div className="rows-actions">
              <button type="button" className="act icon" aria-label={`Mover linha ${index + 1} para cima`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>
                ↑
              </button>
              <button
                type="button"
                className="act icon"
                aria-label={`Mover linha ${index + 1} para baixo`}
                disabled={disabled || index === rows.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="act icon danger-text"
                aria-label={`Remover linha ${index + 1}`}
                title={rows.length === 1 ? 'O produto precisa de ao menos um código' : 'Remover'}
                disabled={disabled || rows.length === 1}
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                ✕
              </button>
            </div>
            {error && <div className="msg rows-error">{error}</div>}
            {showColors && <ColorFields row={row} index={index} disabled={disabled} onChange={(patch) => update(index, patch)} />}
          </div>
        );
      })}

      <button type="button" className="sec btn-sm rows-add" disabled={disabled} onClick={() => onChange([...rows, newCodeRow()])}>
        + Adicionar código
      </button>
    </div>
  );
}
