import { useCallback, useRef, useState } from 'react';
import { isSelectable } from '../lib/pendingGroup';
import type { PendingSelection, ReconciliationRow } from '../types/systemProducts';

export type HeaderCheckState = 'none' | 'some' | 'all';

export type UsePendingSelectionResult = {
  /** Registros marcados, na ordem em que foram marcados. */
  selected: PendingSelection;
  /** Registros marcados que não estão na página/busca atual. */
  hiddenCount: number;
  isSelected: (code: string) => boolean;
  /**
   * Marca/desmarca um registro. Com `range` (Shift+clique), aplica o mesmo
   * estado a todos os registros selecionáveis entre o último clicado e este.
   */
  toggle: (row: ReconciliationRow, options?: { range?: boolean }) => void;
  /** Estado do checkbox "Selecionar todos os visíveis". */
  headerState: HeaderCheckState;
  /** Marca todos os visíveis selecionáveis ou, se já estão todos marcados, desmarca-os. */
  toggleVisible: () => void;
  /** Remove códigos da seleção (ex.: acabaram de ser cadastrados). */
  remove: (codes: Iterable<string>) => void;
  clear: () => void;
};

/**
 * Seleção múltipla da aba Pendentes, controlada pelo `code` do registro.
 * Sobrevive a troca de página, busca e filtro (o admin pode juntar códigos de
 * buscas diferentes num só card). Registros visíveis que deixaram de ser
 * selecionáveis (cadastrados por outra pessoa, via tempo real) saem da seleção.
 */
export function usePendingSelection(visibleRows: readonly ReconciliationRow[]): UsePendingSelectionResult {
  const [stored, setStored] = useState<PendingSelection>(() => new Map());
  const lastClicked = useRef<string | null>(null);

  // Atualiza a seleção com a versão mais recente das linhas visíveis e
  // descarta as que já não podem entrar num card novo.
  const visibleByCode = new Map(visibleRows.map((row) => [row.code, row]));
  let selected: PendingSelection = stored;
  if ([...stored.keys()].some((code) => visibleByCode.has(code))) {
    const next = new Map<string, ReconciliationRow>();
    for (const [code, row] of stored) {
      const fresh = visibleByCode.get(code);
      if (!fresh) next.set(code, row);
      else if (isSelectable(fresh)) next.set(code, fresh);
    }
    selected = next;
  }

  const selectableVisible = visibleRows.filter(isSelectable);
  const visibleSelected = selectableVisible.filter((row) => selected.has(row.code)).length;
  const headerState: HeaderCheckState =
    visibleSelected === 0 ? 'none' : visibleSelected === selectableVisible.length ? 'all' : 'some';
  const hiddenCount = [...selected.keys()].filter((code) => !visibleByCode.has(code)).length;

  const toggle = (row: ReconciliationRow, options: { range?: boolean } = {}) => {
    if (!isSelectable(row)) return;
    const willSelect = !selected.has(row.code);
    let targets: ReconciliationRow[] = [row];

    const anchor = lastClicked.current;
    if (options.range && anchor && anchor !== row.code) {
      const from = selectableVisible.findIndex((r) => r.code === anchor);
      const to = selectableVisible.findIndex((r) => r.code === row.code);
      if (from >= 0 && to >= 0) targets = selectableVisible.slice(Math.min(from, to), Math.max(from, to) + 1);
    }
    lastClicked.current = row.code;

    const next = new Map(selected);
    for (const target of targets) {
      if (willSelect) next.set(target.code, target);
      else next.delete(target.code);
    }
    setStored(next);
  };

  const toggleVisible = () => {
    const next = new Map(selected);
    if (headerState === 'all') for (const row of selectableVisible) next.delete(row.code);
    else for (const row of selectableVisible) next.set(row.code, row);
    setStored(next);
  };

  const remove = useCallback((codes: Iterable<string>) => {
    const drop = new Set(codes);
    setStored((prev) => new Map([...prev].filter(([code]) => !drop.has(code))));
  }, []);

  const clear = useCallback(() => {
    lastClicked.current = null;
    setStored(new Map());
  }, []);

  return {
    selected,
    hiddenCount,
    isSelected: (code) => selected.has(code),
    toggle,
    headerState,
    toggleVisible,
    remove,
    clear,
  };
}
