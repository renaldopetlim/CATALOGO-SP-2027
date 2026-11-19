import { distinctBrands } from '../../lib/pendingGroup';
import type { ReconciliationRow } from '../../types/systemProducts';

type PendingSelectionBarProps = {
  /** Registros marcados, na ordem em que entrarão no card. */
  rows: readonly ReconciliationRow[];
  /** Quantos marcados não aparecem na página/busca atual. */
  hiddenCount: number;
  onCreate: () => void;
  onClear: () => void;
};

const PREVIEW_CODES = 6;

/** Barra fixa no rodapé da aba Pendentes enquanto houver códigos marcados. */
export function PendingSelectionBar({ rows, hiddenCount, onCreate, onClear }: PendingSelectionBarProps) {
  const count = rows.length;
  const brands = distinctBrands(rows);
  const preview = rows.slice(0, PREVIEW_CODES).map((row) => row.code);
  const more = count - preview.length;

  return (
    <div className="selection-bar" role="region" aria-label="Códigos selecionados">
      <div className="selection-info">
        <strong aria-live="polite">{count === 1 ? '1 item selecionado' : `${count.toLocaleString('pt-BR')} itens selecionados`}</strong>
        <span className="selection-detail">
          <span className="col-mono">{preview.join(', ')}</span>
          {more > 0 && ` e mais ${more.toLocaleString('pt-BR')}`}
          {hiddenCount > 0 && ` · ${hiddenCount === 1 ? '1 fora' : `${hiddenCount.toLocaleString('pt-BR')} fora`} da lista atual`}
          {brands.length === 1 && ` · Marca: ${brands[0]}`}
          {brands.length > 1 && <span className="txt-warn">{` · ${brands.length} marcas diferentes`}</span>}
        </span>
      </div>
      <div className="selection-actions">
        <button type="button" className="sec btn-sm" onClick={onClear}>
          Limpar seleção
        </button>
        <button type="button" className="pri btn-sm" onClick={onCreate}>
          Criar card com selecionados ({count.toLocaleString('pt-BR')})
        </button>
      </div>
    </div>
  );
}
