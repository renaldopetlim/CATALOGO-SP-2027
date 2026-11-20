import { toServiceError } from '../lib/errors';
import type { CatalogItemWithCategory, SaveCatalogItemInput } from '../types/catalog';
import { saveCatalogItemRecord } from './catalogService';
import { copyCatalogImage, deleteCatalogImage, getStoragePathFromUrl, uploadCatalogImage } from './storageService';

export type SaveItemParams = {
  /** Ausente = criar; presente = editar. */
  id?: string;
  input: SaveCatalogItemInput;
  /** Arquivo novo escolhido no formulário (tem prioridade sobre `input.image_url`). */
  newImageFile?: File | null;
  /** `image_url` antes da edição, para remover a imagem antiga do Storage. */
  previousImageUrl?: string | null;
  /**
   * Duplicação: URL da imagem do item original. Se o novo item mantiver essa
   * mesma imagem do bucket, ela é copiada para um arquivo próprio.
   */
  copyImageFromUrl?: string | null;
  /**
   * Amostras de cor escolhidas agora (categorias com cores): `index` é a posição
   * do código em `input.codes`. Enviadas para a pasta `swatches/` antes de gravar.
   */
  swatchFiles?: Array<{ index: number; file: File }>;
};

export type SaveItemResult = {
  item: CatalogItemWithCategory;
  /** Avisos não bloqueantes (ex.: imagem antiga não removida). */
  warnings: string[];
};

/**
 * Salva um item coordenando o Storage:
 * 1. envia a imagem nova (se houver);
 * 2. cria/atualiza o produto e seus códigos (transação única no banco);
 * 3. se o passo 2 falhar, remove a imagem recém-enviada (evita arquivos órfãos);
 * 4. se der certo e a imagem mudou, remove a antiga do bucket.
 */
export async function saveCatalogItem({
  id,
  input,
  newImageFile = null,
  previousImageUrl = null,
  copyImageFromUrl = null,
  swatchFiles = [],
}: SaveItemParams): Promise<SaveItemResult> {
  const warnings: string[] = [];
  let uploadedUrl: string | null = null;
  const uploadedSwatches: string[] = [];

  // Remove o que foi enviado nesta tentativa (falha ao gravar o produto).
  const discardUploads = async () => {
    for (const url of [uploadedUrl, ...uploadedSwatches]) {
      if (!url) continue;
      await deleteCatalogImage(url).catch((cleanupError: unknown) => {
        console.warn('Falha ao remover arquivo enviado após erro ao salvar o item.', cleanupError);
      });
    }
  };

  let codes = input.codes;
  if (swatchFiles.length > 0) {
    try {
      codes = [...input.codes];
      for (const { index, file } of swatchFiles) {
        const target = codes[index];
        if (!target) continue;
        const uploaded = await uploadCatalogImage(file, 'swatches');
        uploadedSwatches.push(uploaded.publicUrl);
        codes[index] = { ...target, color_swatch_url: uploaded.publicUrl };
      }
    } catch (error) {
      await discardUploads();
      throw toServiceError(error, 'enviar a amostra de cor');
    }
  }

  if (newImageFile) {
    const uploaded = await uploadCatalogImage(newImageFile);
    uploadedUrl = uploaded.publicUrl;
  } else if (
    copyImageFromUrl &&
    input.image_url === copyImageFromUrl &&
    getStoragePathFromUrl(copyImageFromUrl)
  ) {
    const copied = await copyCatalogImage(copyImageFromUrl);
    uploadedUrl = copied.publicUrl;
  }

  const payload: SaveCatalogItemInput = { ...input, codes, ...(uploadedUrl ? { image_url: uploadedUrl } : {}) };

  let item: CatalogItemWithCategory;
  try {
    // Produto + códigos numa única transação.
    item = await saveCatalogItemRecord(id ?? null, payload);
  } catch (error) {
    await discardUploads();
    throw toServiceError(error, id ? 'salvar o produto' : 'criar o produto');
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
