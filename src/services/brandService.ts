import { supabase } from '../lib/supabase';
import { ServiceError, toServiceError } from '../lib/errors';
import { emptyToNull, isHttpUrl } from '../lib/format';
import { deleteCatalogImage, getStoragePathFromUrl, uploadCatalogImage } from './storageService';
import type { TableInsert, TableUpdate } from '../types/database';
import type { Brand, BrandWithProductCount, CreateBrandInput, UpdateBrandInput } from '../types/brands';

const BRAND_COLUMNS = 'id, name, logo_url, is_active, created_at';

/* ==========================================================================
   VALIDAÇÃO
   ========================================================================== */

function validateName(name: string): string {
  const value = name.replace(/\s+/g, ' ').trim();
  if (!value) throw new ServiceError('validation', 'Informe o nome da marca.');
  if (value.length > 120) throw new ServiceError('validation', 'O nome da marca deve ter até 120 caracteres.');
  return value;
}

function validateLogoUrl(url: string | null | undefined): string | null {
  const value = emptyToNull(url);
  if (value !== null && !isHttpUrl(value)) {
    throw new ServiceError('validation', 'A URL do logo deve começar com http:// ou https://.');
  }
  return value;
}

/** Mensagem específica para nome repetido (índice único sem diferenciar maiúsculas). */
function brandError(error: unknown, context: string): ServiceError {
  const serviceError = toServiceError(error, context);
  if (serviceError.kind === 'conflict') {
    return new ServiceError('conflict', 'Já existe uma marca com este nome.', { code: serviceError.code, cause: error });
  }
  if (serviceError.kind === 'in_use') {
    return new ServiceError('in_use', 'Esta marca tem produtos vinculados. Troque a marca desses produtos ou apenas inative a marca.', {
      code: serviceError.code,
      cause: error,
    });
  }
  return serviceError;
}

/* ==========================================================================
   CONSULTAS
   ========================================================================== */

/** Marcas ativas em ordem alfabética (vitrine e seleção rápida). */
export async function listActiveBrands(): Promise<Brand[]> {
  try {
    const { data, error } = await supabase.from('brands').select(BRAND_COLUMNS).eq('is_active', true).order('name');
    if (error) throw error;
    return data;
  } catch (error) {
    throw toServiceError(error, 'carregar as marcas');
  }
}

/** Todas as marcas (ativas e inativas) com a quantidade de produtos. Requer admin. */
export async function listAllBrands(): Promise<BrandWithProductCount[]> {
  try {
    const { data, error } = await supabase.from('brands').select(`${BRAND_COLUMNS}, catalog_items(count)`).order('name');
    if (error) throw error;
    return data.map(({ catalog_items, ...brand }) => ({ ...brand, product_count: catalog_items[0]?.count ?? 0 }));
  } catch (error) {
    throw toServiceError(error, 'carregar as marcas');
  }
}

/** Quantidade de produtos (ativos e inativos) vinculados à marca. Requer admin. */
export async function countProductsForBrand(brandId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('catalog_items')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId);
    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    throw toServiceError(error, 'contar os produtos da marca');
  }
}

/* ==========================================================================
   ESCRITA (ADMIN)
   ========================================================================== */

export async function createBrand(input: CreateBrandInput): Promise<Brand> {
  try {
    const payload: TableInsert<'brands'> = {
      name: validateName(input.name),
      logo_url: validateLogoUrl(input.logo_url),
      is_active: input.is_active ?? true,
    };
    const { data, error } = await supabase.from('brands').insert(payload).select(BRAND_COLUMNS).single();
    if (error) throw error;
    return data;
  } catch (error) {
    throw brandError(error, 'criar a marca');
  }
}

export async function updateBrand(id: string, input: UpdateBrandInput): Promise<Brand> {
  try {
    const payload: TableUpdate<'brands'> = {};
    if (input.name !== undefined) payload.name = validateName(input.name);
    if (input.logo_url !== undefined) payload.logo_url = validateLogoUrl(input.logo_url);
    if (input.is_active !== undefined) payload.is_active = input.is_active;
    if (Object.keys(payload).length === 0) throw new ServiceError('validation', 'Nenhuma alteração informada.');

    const { data, error } = await supabase.from('brands').update(payload).eq('id', id).select(BRAND_COLUMNS).maybeSingle();
    if (error) throw error;
    if (!data) throw new ServiceError('not_found', 'Marca não encontrada ou sem permissão para editá-la.');
    return data;
  } catch (error) {
    throw brandError(error, 'salvar a marca');
  }
}

/** Ativa/inativa. Marca inativa sai das listas de seleção e o logo deixa de aparecer na vitrine. */
export function setBrandActive(id: string, isActive: boolean): Promise<Brand> {
  return updateBrand(id, { is_active: isActive });
}

export type SaveBrandParams = {
  /** Ausente = criar; presente = editar. */
  id?: string;
  input: CreateBrandInput;
  /** Arquivo de logo escolhido (tem prioridade sobre `input.logo_url`). */
  newLogoFile?: File | null;
  /** Logo antes da edição, para remover o arquivo antigo do Storage. */
  previousLogoUrl?: string | null;
};

export type SaveBrandResult = {
  brand: Brand;
  warnings: string[];
};

/**
 * Salva a marca coordenando o Storage (pasta `brands/`):
 * envia o logo novo; se salvar falhar, apaga o arquivo enviado;
 * se der certo e o logo mudou, remove o antigo do bucket.
 */
export async function saveBrand({ id, input, newLogoFile = null, previousLogoUrl = null }: SaveBrandParams): Promise<SaveBrandResult> {
  const warnings: string[] = [];
  let uploadedUrl: string | null = null;

  if (newLogoFile) {
    const uploaded = await uploadCatalogImage(newLogoFile, 'brands');
    uploadedUrl = uploaded.publicUrl;
  }
  const payload: CreateBrandInput = uploadedUrl ? { ...input, logo_url: uploadedUrl } : input;

  let brand: Brand;
  try {
    brand = id ? await updateBrand(id, payload) : await createBrand(payload);
  } catch (error) {
    if (uploadedUrl) {
      await deleteCatalogImage(uploadedUrl).catch((cleanupError: unknown) => {
        console.warn('Falha ao remover o logo enviado após erro ao salvar a marca.', cleanupError);
      });
    }
    throw error;
  }

  const previousPath = getStoragePathFromUrl(previousLogoUrl);
  if (previousPath && previousLogoUrl !== brand.logo_url) {
    try {
      await deleteCatalogImage(previousPath);
    } catch {
      warnings.push('A marca foi salva, mas o logo antigo não pôde ser removido do armazenamento.');
    }
  }
  return { brand, warnings };
}

/**
 * Exclui a marca. Bloqueia (ServiceError 'in_use') se houver produtos
 * vinculados; o banco também garante isso (ON DELETE RESTRICT).
 * Remove o logo do Storage quando ele está no bucket do catálogo.
 */
export async function deleteBrand(brand: Pick<Brand, 'id' | 'logo_url'>): Promise<{ logoRemoved: boolean }> {
  try {
    const linked = await countProductsForBrand(brand.id);
    if (linked > 0) {
      throw new ServiceError(
        'in_use',
        `Esta marca tem ${linked} produto(s) vinculado(s). Troque a marca desses produtos ou apenas inative a marca.`,
      );
    }
    const { data, error } = await supabase.from('brands').delete().eq('id', brand.id).select('id');
    if (error) throw error;
    if (data.length === 0) throw new ServiceError('not_found', 'Marca não encontrada ou sem permissão para excluí-la.');
  } catch (error) {
    throw brandError(error, 'excluir a marca');
  }

  if (!getStoragePathFromUrl(brand.logo_url)) return { logoRemoved: true };
  try {
    await deleteCatalogImage(brand.logo_url ?? '');
    return { logoRemoved: true };
  } catch {
    return { logoRemoved: false };
  }
}
