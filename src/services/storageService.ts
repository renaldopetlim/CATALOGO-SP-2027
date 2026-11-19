import { CATALOG_IMAGES_BUCKET, supabase } from '../lib/supabase';
import { ServiceError, toServiceError } from '../lib/errors';
import type { UploadedImage } from '../types/catalog';

/* Mesmos limites configurados no bucket (migração SQL). */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
} as const;

type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

function isAllowedImageType(type: string): type is AllowedImageType {
  return Object.hasOwn(ALLOWED_IMAGE_TYPES, type);
}

/** Valida o arquivo antes do envio. Lança `ServiceError('validation')`. */
export function validateImageFile(file: File): AllowedImageType {
  if (!isAllowedImageType(file.type)) {
    throw new ServiceError('validation', 'Formato de imagem não permitido. Use JPEG, PNG, WebP ou AVIF.');
  }
  if (file.size === 0) {
    throw new ServiceError('validation', 'O arquivo de imagem está vazio.');
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    const sizeMb = (file.size / 1024 / 1024).toFixed(1).replace('.', ',');
    throw new ServiceError('validation', `A imagem tem ${sizeMb} MB. O máximo permitido é 5 MB.`);
  }
  return file.type;
}

/** URL pública de um arquivo do bucket. */
export function getPublicImageUrl(path: string): string {
  return supabase.storage.from(CATALOG_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Prefixo das URLs públicas do bucket: `<url>/storage/v1/object/public/catalog-images/`. */
function publicUrlPrefix(): string {
  return getPublicImageUrl('');
}

/**
 * Extrai o caminho interno do bucket a partir de uma URL pública.
 * Retorna `null` para URLs externas (que não devem ser removidas do Storage).
 */
export function getStoragePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const prefix = publicUrlPrefix();
  if (!url.startsWith(prefix)) return null;

  const path = decodeURIComponent(url.slice(prefix.length).split(/[?#]/)[0] ?? '');
  return path.length > 0 ? path : null;
}

/** `true` se a URL aponta para uma imagem hospedada no bucket do catálogo. */
export function isCatalogStorageUrl(url: string | null | undefined): boolean {
  return getStoragePathFromUrl(url) !== null;
}

/**
 * Envia uma imagem ao bucket `catalog-images`.
 * Caminho gerado: `<pasta>/AAAA/<uuid>.<ext>` (pasta `items` ou `brands`). O nome aleatório evita colisões e
 * cache desatualizado, então o arquivo pode ter cache longo.
 */
/** Pastas do bucket: fotos de produtos e logos de marcas. */
export type ImageFolder = 'items' | 'brands';

export async function uploadCatalogImage(file: File, folder: ImageFolder = 'items'): Promise<UploadedImage> {
  const contentType = validateImageFile(file);
  const extension = ALLOWED_IMAGE_TYPES[contentType];
  const year = new Date().getFullYear();
  const path = `${folder}/${year}/${crypto.randomUUID()}.${extension}`;

  try {
    const { data, error } = await supabase.storage
      .from(CATALOG_IMAGES_BUCKET)
      .upload(path, file, {
        contentType,
        cacheControl: '31536000',
        upsert: false,
      });

    if (error) throw error;

    return { path: data.path, publicUrl: getPublicImageUrl(data.path) };
  } catch (error) {
    throw toServiceError(error, 'enviar a imagem');
  }
}

/**
 * Copia uma imagem do bucket para um novo arquivo (usado ao duplicar um item:
 * cada item precisa do próprio arquivo, senão excluir um apagaria a foto do outro).
 * URLs externas não são copiadas: retorna a própria URL.
 */
export async function copyCatalogImage(url: string): Promise<UploadedImage> {
  const fromPath = getStoragePathFromUrl(url);
  if (!fromPath) return { path: '', publicUrl: url };

  const extension = fromPath.split('.').pop() ?? 'img';
  const toPath = `items/${new Date().getFullYear()}/${crypto.randomUUID()}.${extension}`;

  try {
    const { error } = await supabase.storage.from(CATALOG_IMAGES_BUCKET).copy(fromPath, toPath);
    if (error) throw error;
    // `copy()` devolve o Key com o nome do bucket na frente ("catalog-images/items/…");
    // a URL pública precisa só do caminho dentro do bucket, que é o `toPath`.
    return { path: toPath, publicUrl: getPublicImageUrl(toPath) };
  } catch (error) {
    throw toServiceError(error, 'copiar a imagem');
  }
}

/**
 * Remove uma imagem do bucket. Aceita o caminho interno ou a URL pública.
 * URLs externas são ignoradas (retorna `false`, nada é removido).
 * Lança `ServiceError('not_found')` se o arquivo não existir ou não puder ser removido.
 */
export async function deleteCatalogImage(pathOrUrl: string): Promise<boolean> {
  const path = pathOrUrl.startsWith('http') ? getStoragePathFromUrl(pathOrUrl) : pathOrUrl;
  if (!path) return false;

  try {
    const { data, error } = await supabase.storage.from(CATALOG_IMAGES_BUCKET).remove([path]);
    if (error) throw error;

    // O Storage não acusa erro quando nada é removido (arquivo inexistente ou sem permissão).
    if (data.length === 0) {
      throw new ServiceError('not_found', 'Imagem não encontrada no armazenamento ou sem permissão para removê-la.');
    }
    return true;
  } catch (error) {
    throw toServiceError(error, 'remover a imagem');
  }
}
