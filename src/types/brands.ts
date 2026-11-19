import type { TableRow } from './database';

/** Marca do catálogo (linha de `public.brands`). */
export type Brand = TableRow<'brands'>;

/** Marca com a quantidade de produtos vinculados (listagem do admin). */
export type BrandWithProductCount = Brand & {
  product_count: number;
};

/** Dados da marca embutidos no produto (vitrine e admin). */
export type BrandSummary = Pick<Brand, 'id' | 'name' | 'logo_url'>;

export type CreateBrandInput = {
  name: string;
  /** URL pública do Storage (pasta `brands/`) ou URL externa (http/https). */
  logo_url?: string | null;
  is_active?: boolean;
};

export type UpdateBrandInput = Partial<CreateBrandInput>;
