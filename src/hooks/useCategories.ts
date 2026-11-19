import { listPublicCategories } from '../services/categoryService';
import type { ServiceError } from '../lib/errors';
import type { Category } from '../types/catalog';
import type { AsyncStatus } from './asyncState';
import { useCatalogLive } from './useCatalogLive';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { useResource } from './useResource';

export type UseCategoriesResult = {
  categories: Category[];
  status: AsyncStatus;
  error: ServiceError | null;
  reload: () => void;
};

/** Categorias ativas para a vitrine (tempo real + recarga ao voltar para a aba). */
export function useCategories(): UseCategoriesResult {
  const { data, status, error, reload } = useResource('public-categories', listPublicCategories, 'carregar as categorias');
  useRefetchOnFocus(reload);
  useCatalogLive(reload);
  return { categories: data ?? [], status, error, reload };
}
