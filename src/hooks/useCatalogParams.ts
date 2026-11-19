import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Estado da vitrine guardado na URL:
 *   ?categoria=<slug>&q=<busca>&item=<id>
 * Recarregar, voltar/avançar ou compartilhar o link preserva filtros, busca e modal.
 */
export const PARAM = {
  category: 'categoria',
  search: 'q',
  item: 'item',
} as const;

type ParamKey = (typeof PARAM)[keyof typeof PARAM];

export type CatalogParams = {
  categorySlug: string | null;
  search: string;
  itemId: string | null;
};

export type UseCatalogParamsResult = CatalogParams & {
  setCategory: (slug: string | null) => void;
  setSearch: (value: string) => void;
  /** Gera o `search` (?...) mantendo os parâmetros atuais e trocando apenas os informados. */
  buildSearch: (changes: Partial<Record<ParamKey, string | null>>) => string;
  closeItem: () => void;
};

export function useCatalogParams(): UseCatalogParamsResult {
  const [params, setParams] = useSearchParams();

  const categorySlug = params.get(PARAM.category);
  const search = params.get(PARAM.search) ?? '';
  const itemId = params.get(PARAM.item);

  const buildSearch = useCallback(
    (changes: Partial<Record<ParamKey, string | null>>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined || value === '') next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      return query ? `?${query}` : '';
    },
    [params],
  );

  const update = useCallback(
    (changes: Partial<Record<ParamKey, string | null>>, replace: boolean) => {
      setParams(new URLSearchParams(buildSearch(changes)), { replace, preventScrollReset: true });
    },
    [buildSearch, setParams],
  );

  // Trocar categoria entra no histórico (o "voltar" do navegador retorna ao filtro anterior).
  const setCategory = useCallback((slug: string | null) => update({ [PARAM.category]: slug }, false), [update]);

  // Digitação substitui a entrada atual para não poluir o histórico.
  const setSearch = useCallback((value: string) => update({ [PARAM.search]: value.trim() || null }, true), [update]);

  // Fechamento direto (link aberto de fora): substitui a entrada para não reabrir no "voltar".
  const closeItem = useCallback(() => update({ [PARAM.item]: null }, true), [update]);

  return useMemo(
    () => ({ categorySlug, search, itemId, setCategory, setSearch, buildSearch, closeItem }),
    [categorySlug, search, itemId, setCategory, setSearch, buildSearch, closeItem],
  );
}
