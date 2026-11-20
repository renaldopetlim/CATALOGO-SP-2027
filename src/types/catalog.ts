import type { BrandSummary } from './brands';
import type { Json, TableRow } from './database';

/* ==========================================================================
   SELO, FICHA TÉCNICA E CÓDIGOS
   ========================================================================== */

/** Selos aceitos pelo banco (constraint `catalog_items_badge_valid`). */
export const BADGES = ['LANCAMENTO'] as const;
export type CatalogBadge = (typeof BADGES)[number];

/** Texto exibido na vitrine para cada selo. */
export const BADGE_LABELS: Record<CatalogBadge, string> = {
  LANCAMENTO: 'LANÇAMENTO',
};

export function isCatalogBadge(value: unknown): value is CatalogBadge {
  return typeof value === 'string' && (BADGES as readonly string[]).includes(value);
}

/** Linha da ficha técnica. `label` pode ser vazio (linha só com valor). */
export type Specification = {
  label: string;
  value: string;
};

/** Converte o JSON do banco em ficha técnica, descartando entradas inválidas. */
export function parseSpecifications(json: Json): Specification[] {
  if (!Array.isArray(json)) return [];
  const specs: Specification[] = [];
  for (const entry of json) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const { label, value } = entry;
      if (typeof label === 'string' && typeof value === 'string' && value.trim()) {
        specs.push({ label, value });
      }
    }
  }
  return specs;
}

/** Código (variação) do produto: tamanho, bitola, cor, voltagem… */
export type CatalogItemCode = Pick<
  TableRow<'catalog_item_codes'>,
  'id' | 'code' | 'description' | 'packaging' | 'color_name' | 'color_hex' | 'color_swatch_url' | 'sort_order'
>;

/** Código com cor visual (nome, hexadecimal e/ou imagem de amostra). */
export function hasColor(code: Pick<CatalogItemCode, 'color_name' | 'color_hex' | 'color_swatch_url'>): boolean {
  return Boolean(code.color_hex || code.color_swatch_url);
}

/** `#RRGGBB` válido (o banco grava sempre assim). */
export function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

/** Aceita "#abc", "abc", "#aabbcc" ou "aabbcc" → "#AABBCC"; `null` se inválido ou vazio. */
export function normalizeHex(value: string): string | null {
  let hex = value.trim().replace(/^#/, '').toUpperCase();
  if (/^[0-9A-F]{3}$/.test(hex)) hex = hex.replace(/./g, (char) => char + char);
  return /^[0-9A-F]{6}$/.test(hex) ? `#${hex}` : null;
}

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
 * Produto do catálogo.
 * `search_text` é interno; `price` continua no banco, mas não é usado na interface.
 */
export type CatalogItem = Omit<TableRow<'catalog_items'>, 'search_text' | 'price' | 'badge' | 'specifications'> & {
  badge: CatalogBadge | null;
  specifications: Specification[];
};

/** Resumo da categoria embutido em cada produto. */
export type CategorySummary = Pick<Category, 'id' | 'name' | 'slug' | 'is_active' | 'has_color_swatches'>;

/** Produto com categoria, marca (com logo) e códigos (ordenados por `sort_order`). */
export type CatalogItemWithCategory = CatalogItem & {
  category: CategorySummary;
  codes: CatalogItemCode[];
  /**
   * Marca vinculada. `null` sem marca ou, para o visitante, quando a marca está
   * inativa (o nome continua em `brand`, mas o logo não aparece).
   */
  brandInfo: BrandSummary | null;
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
  /** Mostra cores (swatches) nos códigos, no painel e na vitrine (ex.: Tintas). */
  has_color_swatches?: boolean;
};

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

/** Bloco Código + Descrição + Embalagem no formulário. */
export type CatalogItemCodeInput = {
  /** Presente = código já existente (edição); ausente = novo. */
  id?: string;
  code: string;
  description?: string | null;
  packaging?: string | null;
  /** Só em categorias com cores (`has_color_swatches`). */
  color_name?: string | null;
  color_hex?: string | null;
  color_swatch_url?: string | null;
};

/** Gravação completa do produto (criar ou editar), sempre com seus códigos. */
export type SaveCatalogItemInput = {
  title: string;
  category_id: string;
  /** Marca cadastrada (`brands.id`); o texto `brand` é preenchido pelo banco. */
  brand_id?: string | null;
  badge?: CatalogBadge | null;
  /** URL pública do Storage ou URL externa (http/https). */
  image_url?: string | null;
  /** Usadas na busca; não aparecem na vitrine. */
  tags?: string[];
  specifications?: Specification[];
  /** Ao menos um. A ordem da lista é a ordem de exibição. */
  codes: CatalogItemCodeInput[];
  is_featured?: boolean;
  is_active?: boolean;
};

/** Alterações rápidas na listagem (sem mexer nos códigos). */
export type UpdateCatalogItemFlagsInput = {
  is_featured?: boolean;
  is_active?: boolean;
};

/* ==========================================================================
   FILTROS E RESULTADOS
   ========================================================================== */

/** Situação do item no admin. A vitrine sempre usa apenas ativos. */
export type ItemStatusFilter = 'all' | 'active' | 'inactive';

export type CatalogSortOption = 'recent' | 'title_asc';

export type CatalogFilters = {
  /** ID da categoria. `undefined` ou `null` = todas. */
  categoryId?: string | null;
  /** `true` = apenas destaques. */
  featured?: boolean;
  /** Busca em título, marca, tags, ficha técnica e códigos (sem diferenciar acentos). */
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

/**
 * Valores iniciais de um produto novo vindos de fora do formulário
 * (ex.: um ou vários códigos da base do sistema, na aba Pendentes).
 */
export type ItemFormPrefill = {
  title?: string;
  /** Explica de onde veio o título sugerido (exibido sob o campo). */
  titleHint?: string;
  /** Marca única dos registros: selecionada se já estiver cadastrada. */
  brand?: string;
  /** Marcas diferentes entre os registros: o admin escolhe a principal. */
  brandSuggestions?: string[];
  codes?: Array<{ code: string; description?: string; packaging?: string }>;
  /** Subtítulo da gaveta (resumo da origem dos dados). */
  subtitle?: string;
};
