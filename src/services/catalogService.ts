import { supabase } from '../lib/supabase';
import { ServiceError, toServiceError } from '../lib/errors';
import { emptyToNull, isHttpUrl, toSearchTerms } from '../lib/format';
import { deleteCatalogImage, isCatalogStorageUrl } from './storageService';
import type { BrandSummary } from '../types/brands';
import type { Json, TableUpdate } from '../types/database';
import {
  isCatalogBadge,
  normalizeHex,
  parseSpecifications,
  type CatalogFilters,
  type CatalogItemCodeInput,
  type CatalogItemWithCategory,
  type CatalogListResult,
  type CatalogScope,
  type DeleteItemResult,
  type SaveCatalogItemInput,
  type Specification,
  type UpdateCatalogItemFlagsInput,
} from '../types/catalog';

/**
 * Colunas do produto (sem `search_text` e `price`) + categoria + códigos.
 * `!inner` faz o item sem categoria visível não aparecer, e permite filtrar
 * pela coluna da categoria (`category.is_active`).
 */
const ITEM_SELECT =
  'id, title, brand, brand_id, badge, category_id, image_url, tags, specifications, is_featured, is_active, created_at, updated_at, category:categories!inner(id, name, slug, is_active, has_color_swatches), codes:catalog_item_codes(id, code, description, packaging, color_name, color_hex, color_swatch_url, sort_order), brand_ref:brands(id, name, logo_url)';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

/** Linha como vem do banco (badge texto livre, ficha técnica em JSON, marca embutida). */
type ItemRow = Omit<CatalogItemWithCategory, 'badge' | 'specifications' | 'brandInfo'> & {
  badge: string | null;
  specifications: Json;
  brand_ref: BrandSummary | null;
};

/** Converte a linha do banco no tipo de domínio (selo validado, ficha técnica tipada, códigos ordenados). */
function toItem({ brand_ref, ...row }: ItemRow): CatalogItemWithCategory {
  return {
    ...row,
    brandInfo: brand_ref,
    badge: isCatalogBadge(row.badge) ? row.badge : null,
    specifications: parseSpecifications(row.specifications),
    codes: [...row.codes].sort((a, b) => a.sort_order - b.sort_order),
  };
}

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

  // Cada termo precisa aparecer em algum campo (título, marca, tags, ficha
  // técnica ou qualquer código do produto). AND entre termos.
  for (const term of toSearchTerms(filters.search ?? '')) {
    query = query.ilike('search_text', `%${term}%`);
  }

  switch (filters.sort ?? 'recent') {
    case 'title_asc':
      query = query.order('title', { ascending: true });
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
    return { items: data.map(toItem), total: count ?? data.length };
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
    return toItem(data);
  } catch (error) {
    throw toServiceError(error, 'carregar o item');
  }
}

/* ==========================================================================
   VALIDAÇÃO
   ========================================================================== */

function validateTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) throw new ServiceError('validation', 'Informe o título do produto.');
  if (trimmed.length > 200) throw new ServiceError('validation', 'O título deve ter até 200 caracteres.');
  return trimmed;
}

function validateCategoryId(categoryId: string): string {
  if (!categoryId.trim()) throw new ServiceError('validation', 'Selecione uma categoria.');
  return categoryId;
}

function validateImageUrl(url: string | null | undefined): string | null {
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

/** Remove linhas vazias; mantém linhas só com valor (rótulo vazio). */
function cleanSpecifications(specs: Specification[]): Specification[] {
  return specs
    .map((spec) => ({ label: spec.label.trim(), value: spec.value.trim() }))
    .filter((spec) => spec.value.length > 0);
}

/** Valida os blocos Código + Descrição + Embalagem (ao menos um; códigos únicos no produto). */
function cleanCodes(codes: CatalogItemCodeInput[]): CatalogItemCodeInput[] {
  const cleaned = codes
    .map((entry) => ({
      ...(entry.id ? { id: entry.id } : {}),
      code: entry.code.trim().toUpperCase(),
      description: emptyToNull(entry.description),
      packaging: emptyToNull(entry.packaging),
      color_name: emptyToNull(entry.color_name),
      color_hex: entry.color_hex ? normalizeHex(entry.color_hex) : null,
      color_swatch_url: emptyToNull(entry.color_swatch_url),
      invalidHex: Boolean(entry.color_hex?.trim()) && !normalizeHex(entry.color_hex ?? ''),
    }))
    .filter((entry) => entry.code || entry.description || entry.packaging || entry.color_name || entry.color_hex || entry.color_swatch_url);

  if (cleaned.length === 0) {
    throw new ServiceError('validation', 'Informe ao menos um código para o produto.');
  }
  const missing = cleaned.findIndex((entry) => !entry.code);
  if (missing >= 0) {
    throw new ServiceError('validation', `Preencha o código da linha ${missing + 1}.`);
  }
  const badHex = cleaned.find((entry) => entry.invalidHex);
  if (badHex) {
    throw new ServiceError('validation', `Cor inválida no código ${badHex.code}. Use o formato #RRGGBB.`);
  }
  const badUrl = cleaned.find((entry) => entry.color_swatch_url && !isHttpUrl(entry.color_swatch_url));
  if (badUrl) {
    throw new ServiceError('validation', `A amostra do código ${badUrl.code} precisa ser um endereço http:// ou https://.`);
  }
  const seen = new Set<string>();
  for (const entry of cleaned) {
    if (seen.has(entry.code)) {
      throw new ServiceError('validation', `O código ${entry.code} aparece mais de uma vez neste produto.`);
    }
    seen.add(entry.code);
  }
  return cleaned.map(({ invalidHex: _invalid, ...entry }) => entry);
}

/* ==========================================================================
   ESCRITA (ADMIN)
   ========================================================================== */

/**
 * Cria (id ausente) ou edita um produto junto com todos os seus códigos,
 * numa única transação no banco (`save_catalog_item`). Códigos que não
 * vierem na lista são removidos.
 */
export async function saveCatalogItemRecord(
  id: string | null,
  input: SaveCatalogItemInput,
): Promise<CatalogItemWithCategory> {
  try {
    const item = {
      title: validateTitle(input.title),
      brand_id: input.brand_id || null,
      category_id: validateCategoryId(input.category_id),
      badge: input.badge ?? null,
      image_url: validateImageUrl(input.image_url),
      tags: cleanTags(input.tags ?? []),
      specifications: cleanSpecifications(input.specifications ?? []),
      is_featured: input.is_featured ?? false,
      is_active: input.is_active ?? true,
    };
    const codes = cleanCodes(input.codes);

    const { data: savedId, error } = await supabase.rpc('save_catalog_item', {
      p_id: id,
      p_item: item,
      p_codes: codes,
    });
    if (error) throw error;

    return await getCatalogItemById(savedId, 'admin');
  } catch (error) {
    throw toServiceError(error, id ? 'salvar o produto' : 'criar o produto');
  }
}

/** Alterações rápidas da listagem (destaque / ativo), sem tocar nos códigos. */
export async function updateCatalogItemFlags(
  id: string,
  input: UpdateCatalogItemFlagsInput,
): Promise<CatalogItemWithCategory> {
  try {
    const payload: TableUpdate<'catalog_items'> = {};
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
    if (!data) throw new ServiceError('not_found', 'Produto não encontrado ou sem permissão para editá-lo.');
    return toItem(data);
  } catch (error) {
    throw toServiceError(error, 'salvar o produto');
  }
}

export function setItemActive(id: string, isActive: boolean): Promise<CatalogItemWithCategory> {
  return updateCatalogItemFlags(id, { is_active: isActive });
}

export function setItemFeatured(id: string, isFeatured: boolean): Promise<CatalogItemWithCategory> {
  return updateCatalogItemFlags(id, { is_featured: isFeatured });
}

/** Desativação "suave": o item some da vitrine, mas continua no admin. */
export function deactivateCatalogItem(id: string): Promise<CatalogItemWithCategory> {
  return setItemActive(id, false);
}

/**
 * Exclui o produto (e, em cascata, seus códigos). Se a imagem estiver no
 * bucket do catálogo, remove o arquivo também. URLs externas não são tocadas.
 * Se a remoção da imagem falhar, o item continua excluído e `imageRemoved` = false.
 */
export async function deleteCatalogItem(id: string): Promise<DeleteItemResult> {
  let imageUrl: string | null;

  try {
    const { data, error } = await supabase.from('catalog_items').delete().eq('id', id).select('image_url');
    if (error) throw error;

    const deleted = data[0];
    if (!deleted) throw new ServiceError('not_found', 'Produto não encontrado ou sem permissão para excluí-lo.');
    imageUrl = deleted.image_url;
  } catch (error) {
    throw toServiceError(error, 'excluir o produto');
  }

  if (!imageUrl || !isCatalogStorageUrl(imageUrl)) return { imageRemoved: true };

  try {
    await deleteCatalogImage(imageUrl);
    return { imageRemoved: true };
  } catch (error) {
    console.warn('Produto excluído, mas a imagem não pôde ser removida do Storage.', error);
    return { imageRemoved: false };
  }
}
