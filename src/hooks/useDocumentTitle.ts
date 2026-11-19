import { useEffect } from 'react';

const SUFFIX = 'Catálogo 2027 · Distribuidora São Paulo';

/** Atualiza o título da aba. `null` = só o sufixo. */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
  }, [title]);
}
