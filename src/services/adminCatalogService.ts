import { toServiceError } from '../lib/errors';
import type { CatalogItemWithCategory, CreateCatalogItemInput } from '../types/catalog';
import { createCatalogItem, updateCatalogItem } from './catalogService';
import { deleteCatalogImage, getStoragePathFromUrl, uploadCatalogImage } from './storageService';

export type SaveItemParams = {
  /** Ausente = criar; presente = editar. */
  id?: string;
  input: CreateCatalogItemInput;
  /** Arquivo novo escolhido no formulário (tem prioridade sobre `input.image_url`). */
  newImageFile?: File | null;
  /** `image_url` antes da edição, para remover a imagem antiga do Storage. */
  previousImageUrl?: string | null;
};

export type SaveItemResult = {
  item: CatalogItemWithCategory;
  /** Avisos não bloqueantes (ex.: imagem antiga não removida). */
  warnings: string[];
};

/**
 * Salva um item coordenando o Storage:
 * 1. envia a imagem nova (se houver);
 * 2. cria/atualiza o item;
 * 3. se o passo 2 falhar, remove a imagem recém-enviada (evita arquivos órfãos);
 * 4. se der certo e a imagem mudou, remove a antiga do bucket.
 */
export async function saveCatalogItem({
  id,
  input,
  newImageFile = null,
  previousImageUrl = null,
}: SaveItemParams): Promise<SaveItemResult> {
  const warnings: string[] = [];
  let uploadedUrl: string | null = null;

  if (newImageFile) {
    const uploaded = await uploadCatalogImage(newImageFile);
    uploadedUrl = uploaded.publicUrl;
  }

  const payload: CreateCatalogItemInput = uploadedUrl ? { ...input, image_url: uploadedUrl } : input;

  let item: CatalogItemWithCategory;
  try {
    item = id ? await updateCatalogItem(id, payload) : await createCatalogItem(payload);
  } catch (error) {
    if (uploadedUrl) {
      await deleteCatalogImage(uploadedUrl).catch((cleanupError: unknown) => {
        console.warn('Falha ao remover imagem enviada após erro ao salvar o item.', cleanupError);
      });
    }
    throw toServiceError(error, id ? 'salvar o item' : 'criar o item');
  }

  const previousPath = getStoragePathFromUrl(previousImageUrl);
  if (previousPath && previousImageUrl !== item.image_url) {
    try {
      await deleteCatalogImage(previousPath);
    } catch {
      warnings.push('O item foi salvo, mas a imagem antiga não pôde ser removida do armazenamento.');
    }
  }

  return { item, warnings };
}
