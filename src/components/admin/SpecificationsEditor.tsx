import { useId } from 'react';
import { newSpecRow, type SpecRow } from './editorRows';

type SpecificationsEditorProps = {
  rows: SpecRow[];
  onChange: (rows: SpecRow[]) => void;
  errors?: Record<number, string>;
  disabled?: boolean;
};

/** Ficha técnica em pares Rótulo → Valor (ex.: "Material" → "Aço inox 304"). Opcional. */
export function SpecificationsEditor({ rows, onChange, errors = {}, disabled = false }: SpecificationsEditorProps) {
  const baseId = useId();
  const update = (index: number, patch: Partial<SpecRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="rows-editor specs-editor">
      {rows.length > 0 && (
        <div className="rows-head" aria-hidden="true">
          <span>Especificação</span>
          <span>Valor</span>
          <span />
        </div>
      )}

      {rows.map((row, index) => {
        const id = `${baseId}-${row.key}`;
        const error = errors[index];
        return (
          <div key={row.key} className={`rows-line${error ? ' has-error' : ''}`}>
            <div>
              <label htmlFor={`${id}-label`} className="sr-only">
                Especificação da linha {index + 1}
              </label>
              <input
                id={`${id}-label`}
                value={row.label}
                placeholder="Ex.: Material"
                disabled={disabled}
                onChange={(e) => update(index, { label: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor={`${id}-value`} className="sr-only">
                Valor da linha {index + 1}
              </label>
              <input
                id={`${id}-value`}
                value={row.value}
                placeholder="Ex.: Aço inox 304"
                disabled={disabled}
                className={error ? 'bad' : undefined}
                onChange={(e) => update(index, { value: e.target.value })}
              />
            </div>
            <div className="rows-actions">
              <button
                type="button"
                className="act icon danger-text"
                aria-label={`Remover especificação ${index + 1}`}
                disabled={disabled}
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                ✕
              </button>
            </div>
            {error && <div className="msg rows-error">{error}</div>}
          </div>
        );
      })}

      <button type="button" className="sec btn-sm rows-add" disabled={disabled} onClick={() => onChange([...rows, newSpecRow()])}>
        + Adicionar especificação
      </button>
    </div>
  );
}
