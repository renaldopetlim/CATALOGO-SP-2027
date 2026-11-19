import { listAllBrands } from '../services/brandService';
import type { ServiceError } from '../lib/errors';
import type { BrandWithProductCount } from '../types/brands';
import type { AsyncStatus } from './asyncState';
import { useCatalogLive } from './useCatalogLive';
import { useResource } from './useResource';

export type UseAdminBrandsResult = {
  brands: BrandWithProductCount[];
  status: AsyncStatus;
  error: ServiceError | null;
  reload: () => void;
  /** Atualização local imediata (ex.: marca criada no formulário de produto). */
  update: (updater: (prev: BrandWithProductCount[]) => BrandWithProductCount[]) => void;
};

/** Todas as marcas com contagem de produtos, em tempo real. Requer admin. */
export function useAdminBrands(): UseAdminBrandsResult {
  const { data, status, error, reload, setData } = useResource('admin-brands', listAllBrands, 'carregar as marcas');
  useCatalogLive(reload);
  return { brands: data ?? [], status, error, reload, update: setData };
}
