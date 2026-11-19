import { listAllCategories } from '../services/categoryService';
import type { ServiceError } from '../lib/errors';
import type { CategoryWithItemCount } from '../types/catalog';
import type { AsyncStatus } from './asyncState';
import { useCatalogLive } from './useCatalogLive';
import { useResource } from './useResource';

export type UseAdminCategoriesResult = {
  categories: CategoryWithItemCount[];
  status: AsyncStatus;
  error: ServiceError | null;
  /** Recarrega em segundo plano (mantém a lista visível). */
  reload: () => void;
  /** Atualização otimista local (ex.: reordenar). */
  update: (updater: (prev: CategoryWithItemCount[]) => CategoryWithItemCount[]) => void;
};

/** Todas as categorias (ativas e inativas) com contagem de itens, em tempo real. Requer admin. */
export function useAdminCategories(): UseAdminCategoriesResult {
  const { data, status, error, reload, setData } = useResource(
    'admin-categories',
    listAllCategories,
    'carregar as categorias',
  );
  // Mudanças feitas por outro admin (ou em outra aba) aparecem sem recarregar.
  useCatalogLive(reload);
  return { categories: data ?? [], status, error, reload, update: setData };
}
