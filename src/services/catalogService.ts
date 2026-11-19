import { supabase } from '../lib/supabase';
import { ServiceError, toServiceError } from '../lib/errors';
import { emptyToNull, isHttpUrl, toSearchTerms } from '../lib/format';
import { deleteCatalogImage, isCatalogStorageUrl } from './storageService';
import type { TableInsert, TableUpdate } from '../types/database';
import type {
  CatalogFilters,
  CatalogItemWithCategory,
  CatalogListResult,
  CatalogScope,
  CreateCatalogItemInput,
  DeleteItemResult,
  UpdateCatalogItemInput,
} from '../types/catalog';

/**
 * Colunas retornadas (sem `search_text`) + categoria via JOIN.
 * `!inner` faz o item sem categoria visível não aparecer, e permite filtrar
 * pela coluna da categoria (`category.is_active`).
 */
const ITEM_SELECT =
  'id, title, sku, category_id, short_description, detailed_description, price, image_url, tags, is_featured, is_active, created_at, updated_at, category:categories!inner(id, name, slug, is_active)';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

/* ==========================================================================
   CONSULTAS
   ========================================================================== */

function buildListQuery(filters: CatalogFilters, scope: CatalogScope) {
  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(filters.offset ?? 0, 0);

  let query = supabase.from('catalog_items').select(ITEM_SELECT, { count: 'exact' });

  if (scope === 'public') {
    // A RLS já esconde inativos do visitante; o filtro explícito garante o mesmo
    // resultado quando um admin logado navega pela vitrine.
    query = query.eq('is_active', true).eq('category.is_active', true);
  } else if (filters.status === 'active') {
    query = query.eq('is_active', true);
  } else if (filters.status === 'inactive') {
    query = query.eq('is_active', false);
  }

  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.featured) query = query.eq('is_featured', true);

  // Cada termo precisa aparecer em algum campo (AND entre termos).
  for (const term of toSearchTerms(filters.search ?? '')) {
    query = query.ilike('search_text', `%${term}%`);
  }

  switch (filters.sort ?? 'recent') {
    case 'title_asc':
      query = query.order('title', { ascending: true });
      break;
    case 'price_asc':
      query = query.order('price', { ascending: true, nullsFirst: false });
      break;
    case 'price_desc':
      query = query.order('price', { ascending: false, nullsFirst: false });
      break;
    case 'recent':
      query = query.order('is_featured', { ascending: false }).order('created_at', { ascending: false });
      break;
  }

  // Desempate estável para a paginação não repetir nem pular itens.
  return query.order('id', { ascending: true }).range(offset, offset + limit - 1);
}

async function listItems(filters: CatalogFilters, scope: CatalogScope): Promise<CatalogListResult> {
  try {
    const { data, error, count } = await buildListQuery(filters, scope);
    if (error) throw error;
    return { items: data, total: count ?? data.length };
  } catch (error) {
    throw toServiceError(error, 'carregar os itens do catálogo');
  }
}

/** Itens visíveis na vitrine (ativos e de categorias ativas). */
export function listPublicItems(filters: CatalogFilters = {}): Promise<CatalogListResult> {
  return listItems(filters, 'public');
}

/** Itens para o painel admin (respeita `filters.status`). Requer admin. */
export function listAdminItems(filters: CatalogFilters = {}): Promise<CatalogListResult> {
  return listItems(filters, 'admin');
}

/** Atalho para a página inicial: itens em destaque. */
export async function listFeaturedItems(limit = 8): Promise<CatalogItemWithCategory[]> {
  const result = await listPublicItems({ featured: true, limit });
  return result.items;
}

/** Busca um item pelo ID. No escopo público, inativos retornam `not_found`. */
export async function getCatalogItemById(
  id: string,
  scope: CatalogScope = 'public',
): Promise<CatalogItemWithCategory> {
  try {
    let query = supabase.from('catalog_items').select(ITEM_SELECT).eq('id', id);
    if (scope === 'public') query = query.eq('is_active', true).eq('category.is_active', true);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) throw new ServiceError('not_found', 'Item não encontrado ou indisponível.');
    return data;
  } catch (error) {
    throw toServiceError(error, 'carregar o item');
  }
}

/* ==========================================================================
   VALIDAÇÃO
   ========================================================================== */

function validateTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) throw new ServiceError('validation', 'Informe o título do item.');
  if (trimmed.length > 200) throw new ServiceError('validation', 'O título deve ter até 200 caracteres.');
  return trimmed;
}

function validateCategoryId(categoryId: string): string {
  if (!categoryId.trim()) throw new ServiceError('validation', 'Selecione uma categoria.');
  return categoryId;
}

function validatePrice(price: number | null): number | null {
  if (price === null) return null;
  if (!Number.isFinite(price) || price < 0) {
    throw new ServiceError('validation', 'O preço deve ser um valor maior ou igual a zero.');
  }
  return Math.round(price * 100) / 100;
}

function validateImageUrl(url: string | null): string | null {
  const value = emptyToNull(url);
  if (value !== null && !isHttpUrl(value)) {
    throw new ServiceError('validation', 'A URL da imagem deve começar com http:// ou https://.');
  }
  return value;
}

/** Limpeza básica; a normalização final (minúsculas, sem duplicadas) é feita pelo trigger. */
function cleanTags(tags: string[]): string[] {
  return tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
}

/* ==========================================================================
   ESCRITA (ADMIN)
   ========================================================================== */

export async function createCatalogItem(input: CreateCatalogItemInput): Promise<CatalogItemWithCategory> {
  try {
    const payload: TableInsert<'catalog_items'> = {
      title: validateTitle(input.title),
      category_id: validateCategoryId(input.category_id),
      sku: emptyToNull(input.sku),
      short_description: emptyToNull(input.short_description),
      detailed_description: emptyToNull(input.detailed_description),
      price: validatePrice(input.price ?? null),
      image_url: validateImageUrl(input.image_url ?? null),
      tags: cleanTags(input.tags ?? []),
      is_featured: input.is_featured ?? false,
      is_active: input.is_active ?? true,
    };

    const { data, error } = await supabase.from('catalog_items').insert(payload).select(ITEM_SELECT).single();
    if (error) throw error;
    return data;
  } catch (error) {
    throw toServiceError(error, 'criar o item');
  }
}

export async function updateCatalogItem(
  id: string,
  input: UpdateCatalogItemInput,
): Promise<CatalogItemWithCategory> {
  try {
    const payload: TableUpdate<'catalog_items'> = {};
    if (input.title !== undefined) payload.title = validateTitle(input.title);
    if (input.category_id !== undefined) payload.category_id = validateCategoryId(input.category_id);
    if (input.sku !== undefined) payload.sku = emptyToNull(input.sku);
    if (input.short_description !== undefined) payload.short_description = emptyToNull(input.short_description);
    if (input.detailed_description !== undefined) {
      payload.detailed_description = emptyToNull(input.detailed_description);
    }
    if (input.price !== undefined) payload.price = validatePrice(input.price);
    if (input.image_url !== undefined) payload.image_url = validateImageUrl(input.image_url);
    if (input.tags !== undefined) payload.tags = cleanTags(input.tags);
    if (input.is_featured !== undefined) payload.is_featured = input.is_featured;
    if (input.is_active !== undefined) payload.is_active = input.is_active;

    if (Object.keys(payload).length === 0) {
      throw new ServiceError('validation', 'Nenhuma alteração informada.');
    }

    const { data, error } = await supabase
      .from('catalog_items')
      .update(payload)
      .eq('id', id)
      .select(ITEM_SELECT)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new ServiceError('not_found', 'Item não encontrado ou sem permissão para editá-lo.');
    return data;
  } catch (error) {
    throw toServiceError(error, 'salvar o item');
  }
}

export function setItemActive(id: string, isActive: boolean): Promise<CatalogItemWithCategory> {
  return updateCatalogItem(id, { is_active: isActive });
}

export function setItemFeatured(id: string, isFeatured: boolean): Promise<CatalogItemWithCategory> {
  return updateCatalogItem(id, { is_featured: isFeatured });
}

/** Desativação "suave": o item some da vitrine, mas continua no admin. */
export function deactivateCatalogItem(id: string): Promise<CatalogItemWithCategory> {
  return setItemActive(id, false);
}

/**
 * Exclui o item definitivamente e, se a imagem estiver no bucket do catálogo,
 * remove o arquivo também. URLs externas não são tocadas.
 * Se a remoção da imagem falhar, o item continua excluído e `imageRemoved` = false.
 */
export async function deleteCatalogItem(id: string): Promise<DeleteItemResult> {
  let imageUrl: string | null;

  try {
    const { data, error } = await supabase.from('catalog_items').delete().eq('id', id).select('image_url');
    if (error) throw error;

    const deleted = data[0];
    if (!deleted) throw new ServiceError('not_found', 'Item não encontrado ou sem permissão para excluí-lo.');
    imageUrl = deleted.image_url;
  } catch (error) {
    throw toServiceError(error, 'excluir o item');
  }

  if (!imageUrl || !isCatalogStorageUrl(imageUrl)) return { imageRemoved: true };

  try {
    await deleteCatalogImage(imageUrl);
    return { imageRemoved: true };
  } catch (error) {
    console.warn('Item excluído, mas a imagem não pôde ser removida do Storage.', error);
    return { imageRemoved: false };
  }
}
