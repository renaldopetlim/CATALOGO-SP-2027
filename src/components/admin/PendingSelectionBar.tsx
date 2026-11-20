import { distinctBrands } from '../../lib/pendingGroup';
import type { ReconciliationRow } from '../../types/systemProducts';

type PendingSelectionBarProps = {
  /** Registros marcados, na ordem em que foram marcados. */
  rows: readonly ReconciliationRow[];
  /** Marcados que podem entrar num card novo (não estão em nenhum produto). */
  cardRows: readonly ReconciliationRow[];
  /** Quantos marcados não aparecem na página/busca atual. */
  hiddenCount: number;
  onCreate: () => void;
  onDelete: () => void;
  onClear: () => void;
  busy?: boolean;
};

const PREVIEW_CODES = 6;

/** Barra fixa no rodapé da aba Pendentes enquanto houver códigos marcados. */
export function PendingSelectionBar({ rows, cardRows, hiddenCount, onCreate, onDelete, onClear, busy = false }: PendingSelectionBarProps) {
  const count = rows.length;
  const cardCount = cardRows.length;
  const inCatalog = count - cardCount;
  const brands = distinctBrands(cardRows);
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
          {inCatalog > 0 && <span className="txt-warn">{` · ${inCatalog.toLocaleString('pt-BR')} já no catálogo`}</span>}
          {brands.length === 1 && ` · Marca: ${brands[0]}`}
          {brands.length > 1 && <span className="txt-warn">{` · ${brands.length} marcas diferentes`}</span>}
        </span>
      </div>
      <div className="selection-actions">
        <button type="button" className="sec btn-sm" onClick={onClear} disabled={busy}>
          Limpar seleção
        </button>
        <button type="button" className="sec btn-sm danger-outline" onClick={onDelete} disabled={busy}>
          Excluir selecionados ({count.toLocaleString('pt-BR')})
        </button>
        <button
          type="button"
          className="pri btn-sm"
          onClick={onCreate}
          disabled={busy || cardCount === 0}
          title={
            cardCount === 0
              ? 'Os códigos marcados já estão em produtos do catálogo'
              : inCatalog > 0
                ? `${inCatalog} código(s) já no catálogo ficam fora do card`
                : undefined
          }
        >
          Criar card com selecionados ({cardCount.toLocaleString('pt-BR')})
        </button>
      </div>
    </div>
  );
}
