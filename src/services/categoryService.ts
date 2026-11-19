import { supabase } from '../lib/supabase';
import { ServiceError, toServiceError } from '../lib/errors';
import { emptyToNull, SLUG_PATTERN, slugify } from '../lib/format';
import type { TableInsert, TableUpdate } from '../types/database';
import type {
  Category,
  CategoryWithItemCount,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../types/catalog';

const CATEGORY_COLUMNS = 'id, name, slug, description, sort_order, is_active, created_at';

/* ==========================================================================
   VALIDAÇÃO
   ========================================================================== */

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new ServiceError('validation', 'Informe o nome da categoria.');
  if (trimmed.length > 120) throw new ServiceError('validation', 'O nome da categoria deve ter até 120 caracteres.');
  return trimmed;
}

function validateSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(normalized)) {
    throw new ServiceError(
      'validation',
      'Slug inválido. Use apenas letras minúsculas, números e hífens (ex.: pisos-e-revestimentos).',
    );
  }
  return normalized;
}

function validateSortOrder(value: number): number {
  if (!Number.isInteger(value)) throw new ServiceError('validation', 'A ordem deve ser um número inteiro.');
  return value;
}

/* ==========================================================================
   CONSULTAS
   ========================================================================== */

/** Categorias ativas, na ordem definida pelo admin (vitrine pública). */
export async function listPublicCategories(): Promise<Category[]> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select(CATEGORY_COLUMNS)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;
    return data;
  } catch (error) {
    throw toServiceError(error, 'carregar as categorias');
  }
}

/** Todas as categorias (ativas e inativas) com a contagem de itens. Requer admin. */
export async function listAllCategories(): Promise<CategoryWithItemCount[]> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select(`${CATEGORY_COLUMNS}, catalog_items(count)`)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;

    return data.map(({ catalog_items, ...category }) => ({
      ...category,
      item_count: catalog_items[0]?.count ?? 0,
    }));
  } catch (error) {
    throw toServiceError(error, 'carregar as categorias');
  }
}

/** Busca uma categoria ativa pelo slug (usado na URL da vitrine). */
export async function getCategoryBySlug(slug: string): Promise<Category> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select(CATEGORY_COLUMNS)
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new ServiceError('not_found', 'Categoria não encontrada.');
    return data;
  } catch (error) {
    throw toServiceError(error, 'carregar a categoria');
  }
}

/** Quantidade de itens (ativos e inativos) vinculados à categoria. Requer admin. */
export async function countItemsInCategory(categoryId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('catalog_items')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId);

    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    throw toServiceError(error, 'contar os itens da categoria');
  }
}

/* ==========================================================================
   ESCRITA (ADMIN)
   ========================================================================== */

/** Próximo `sort_order` livre (fim da lista). */
async function nextSortOrder(): Promise<number> {
  const { data, error } = await supabase
    .from('categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.sort_order ?? -10) + 10;
}

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  try {
    const name = validateName(input.name);
    const payload: TableInsert<'categories'> = {
      name,
      slug: validateSlug(input.slug?.trim() ? input.slug : slugify(name)),
      description: emptyToNull(input.description),
      sort_order: input.sort_order !== undefined ? validateSortOrder(input.sort_order) : await nextSortOrder(),
      is_active: input.is_active ?? true,
    };

    const { data, error } = await supabase
      .from('categories')
      .insert(payload)
      .select(CATEGORY_COLUMNS)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    throw toServiceError(error, 'criar a categoria');
  }
}

export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
  try {
    const payload: TableUpdate<'categories'> = {};
    if (input.name !== undefined) payload.name = validateName(input.name);
    if (input.slug !== undefined) payload.slug = validateSlug(input.slug);
    if (input.description !== undefined) payload.description = emptyToNull(input.description);
    if (input.sort_order !== undefined) payload.sort_order = validateSortOrder(input.sort_order);
    if (input.is_active !== undefined) payload.is_active = input.is_active;

    if (Object.keys(payload).length === 0) {
      throw new ServiceError('validation', 'Nenhuma alteração informada.');
    }

    const { data, error } = await supabase
      .from('categories')
      .update(payload)
      .eq('id', id)
      .select(CATEGORY_COLUMNS)
      .maybeSingle();

    if (error) throw error;
    // Sem linha retornada: id inexistente ou bloqueado pela RLS.
    if (!data) throw new ServiceError('not_found', 'Categoria não encontrada ou sem permissão para editá-la.');
    return data;
  } catch (error) {
    throw toServiceError(error, 'salvar a categoria');
  }
}

/** Ativa ou inativa a categoria. Inativa = some da vitrine junto com os seus itens. */
export function setCategoryActive(id: string, isActive: boolean): Promise<Category> {
  return updateCategory(id, { is_active: isActive });
}

/** Desativação "suave": preserva a categoria e os itens, apenas os oculta da vitrine. */
export function deactivateCategory(id: string): Promise<Category> {
  return setCategoryActive(id, false);
}

/**
 * Salva uma nova ordem. `orderedIds` é a lista completa na ordem desejada;
 * grava sort_order = 10, 20, 30… (deixa espaço para inserções futuras).
 */
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  try {
    const results = await Promise.all(
      orderedIds.map((id, index) =>
        supabase.from('categories').update({ sort_order: (index + 1) * 10 }).eq('id', id).select('id'),
      ),
    );

    const failed = results.find((result) => result.error !== null);
    if (failed?.error) throw failed.error;

    const notUpdated = results.filter((result) => (result.data?.length ?? 0) === 0).length;
    if (notUpdated > 0) {
      throw new ServiceError('not_found', `${notUpdated} categoria(s) não puderam ser reordenadas. Atualize a página.`);
    }
  } catch (error) {
    throw toServiceError(error, 'reordenar as categorias');
  }
}

/**
 * Exclui a categoria definitivamente.
 * Bloqueia (ServiceError 'in_use') se houver itens vinculados; o banco também
 * garante isso via ON DELETE RESTRICT.
 */
export async function deleteCategory(id: string): Promise<void> {
  try {
    const linkedItems = await countItemsInCategory(id);
    if (linkedItems > 0) {
      throw new ServiceError(
        'in_use',
        `Esta categoria possui ${linkedItems} item(ns) vinculado(s). Mova ou exclua os itens antes, ou apenas inative a categoria.`,
      );
    }

    const { data, error } = await supabase.from('categories').delete().eq('id', id).select('id');
    if (error) throw error;
    if (data.length === 0) {
      throw new ServiceError('not_found', 'Categoria não encontrada ou sem permissão para excluí-la.');
    }
  } catch (error) {
    throw toServiceError(error, 'excluir a categoria');
  }
}
