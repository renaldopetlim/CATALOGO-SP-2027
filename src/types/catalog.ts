import type { TableRow } from './database';

/* ==========================================================================
   ENTIDADES
   ========================================================================== */

/** Categoria do catálogo (linha de `public.categories`). */
export type Category = TableRow<'categories'>;

/** Categoria com a quantidade de itens vinculados (listagem do admin). */
export type CategoryWithItemCount = Category & {
  item_count: number;
};

/**
 * Item do catálogo (linha de `public.catalog_items`).
 * `search_text` é interno (mantido por trigger) e não é exposto ao front.
 */
export type CatalogItem = Omit<TableRow<'catalog_items'>, 'search_text'>;

/** Resumo da categoria embutido em cada item. */
export type CategorySummary = Pick<Category, 'id' | 'name' | 'slug' | 'is_active'>;

/** Item com os dados básicos da categoria (JOIN com `categories`). */
export type CatalogItemWithCategory = CatalogItem & {
  category: CategorySummary;
};

/* ==========================================================================
   ENTRADAS (CREATE / UPDATE)
   ========================================================================== */

export type CreateCategoryInput = {
  name: string;
  /** Opcional: gerado a partir de `name` quando omitido. */
  slug?: string;
  description?: string | null;
  /** Opcional: vai para o fim da lista quando omitido. */
  sort_order?: number;
  is_active?: boolean;
};

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

export type CreateCatalogItemInput = {
  title: string;
  category_id: string;
  sku?: string | null;
  short_description?: string | null;
  detailed_description?: string | null;
  /** Em reais. `null` = "sob consulta". */
  price?: number | null;
  /** URL pública do Storage ou URL externa (http/https). */
  image_url?: string | null;
  tags?: string[];
  is_featured?: boolean;
  is_active?: boolean;
};

export type UpdateCatalogItemInput = Partial<CreateCatalogItemInput>;

/* ==========================================================================
   FILTROS E RESULTADOS
   ========================================================================== */

/** Situação do item no admin. A vitrine sempre usa apenas ativos. */
export type ItemStatusFilter = 'all' | 'active' | 'inactive';

export type CatalogSortOption =
  | 'recent'
  | 'title_asc'
  | 'price_asc'
  | 'price_desc';

export type CatalogFilters = {
  /** ID da categoria. `undefined` ou `null` = todas. */
  categoryId?: string | null;
  /** `true` = apenas destaques. */
  featured?: boolean;
  /** Busca em título, SKU, descrições e tags (sem diferenciar acentos). */
  search?: string;
  /** Somente no admin; a vitrine ignora e usa sempre `active`. */
  status?: ItemStatusFilter;
  sort?: CatalogSortOption;
  /** Paginação: quantidade por página (padrão 24, máx. 100). */
  limit?: number;
  /** Paginação: quantos registros pular. */
  offset?: number;
};

export type CatalogListResult = {
  items: CatalogItemWithCategory[];
  /** Total de registros que atendem aos filtros (para paginação). */
  total: number;
};

/** Escopo da consulta: vitrine pública ou painel administrativo. */
export type CatalogScope = 'public' | 'admin';

/** Imagem enviada ao bucket `catalog-images`. */
export type UploadedImage = {
  /** Caminho dentro do bucket (ex.: `items/2026/uuid.webp`). */
  path: string;
  /** URL pública para gravar em `catalog_items.image_url`. */
  publicUrl: string;
};

export type DeleteItemResult = {
  /** `false` se o item foi excluído, mas a imagem do Storage não pôde ser removida. */
  imageRemoved: boolean;
};
