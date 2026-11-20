import { ServiceError, toServiceError } from '../lib/errors';
import { MAX_ITEM_IMAGES, type CatalogItemWithCategory, type SaveCatalogItemInput } from '../types/catalog';
import { saveCatalogItemRecord } from './catalogService';
import { copyCatalogImage, deleteCatalogImage, getStoragePathFromUrl, uploadCatalogImage } from './storageService';

/** Uma foto da galeria no formulário: URL (já salva ou externa) ou arquivo novo. */
export type GalleryEntry = { kind: 'url'; url: string } | { kind: 'file'; file: File };

export type SaveItemParams = {
  /** Ausente = criar; presente = editar. */
  id?: string;
  input: SaveCatalogItemInput;
  /**
   * Galeria na ordem final (a 1ª é a capa), até `MAX_ITEM_IMAGES`. Arquivos são
   * enviados para a pasta `items/`; tem prioridade sobre `input.images`.
   */
  gallery?: GalleryEntry[];
  /** Fotos antes da edição: as que saírem da galeria são apagadas do Storage. */
  previousImages?: string[];
  /**
   * Duplicação: fotos do produto original. As que continuarem na galeria e
   * estiverem no nosso bucket são copiadas para arquivos próprios.
   */
  copyFromImages?: string[];
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
 * 1. envia as fotos novas (e copia as do original, ao duplicar);
 * 2. cria/atualiza o produto e seus códigos (transação única no banco);
 * 3. se o passo 2 falhar, remove os arquivos recém-enviados (evita órfãos);
 * 4. se der certo, remove do bucket as fotos que saíram da galeria.
 */
export async function saveCatalogItem({
  id,
  input,
  gallery,
  previousImages = [],
  copyFromImages = [],
  swatchFiles = [],
}: SaveItemParams): Promise<SaveItemResult> {
  const warnings: string[] = [];
  const uploaded: string[] = [];

  // Remove o que foi enviado nesta tentativa (falha ao gravar o produto).
  const discardUploads = async () => {
    for (const url of uploaded) {
      await deleteCatalogImage(url).catch((cleanupError: unknown) => {
        console.warn('Falha ao remover arquivo enviado após erro ao salvar o item.', cleanupError);
      });
    }
  };

  let images = input.images;
  if (gallery) {
    if (gallery.length > MAX_ITEM_IMAGES) {
      throw new ServiceError('validation', `Cada produto pode ter no máximo ${MAX_ITEM_IMAGES} imagens.`);
    }
    try {
      images = [];
      for (const entry of gallery) {
        if (entry.kind === 'file') {
          const result = await uploadCatalogImage(entry.file, 'items');
          uploaded.push(result.publicUrl);
          images.push(result.publicUrl);
        } else if (copyFromImages.includes(entry.url) && getStoragePathFromUrl(entry.url)) {
          const copied = await copyCatalogImage(entry.url);
          uploaded.push(copied.publicUrl);
          images.push(copied.publicUrl);
        } else {
          images.push(entry.url.trim());
        }
      }
    } catch (error) {
      await discardUploads();
      throw toServiceError(error, 'enviar as imagens');
    }
  }

  let codes = input.codes;
  if (swatchFiles.length > 0) {
    try {
      codes = [...input.codes];
      for (const { index, file } of swatchFiles) {
        const target = codes[index];
        if (!target) continue;
        const result = await uploadCatalogImage(file, 'swatches');
        uploaded.push(result.publicUrl);
        codes[index] = { ...target, color_swatch_url: result.publicUrl };
      }
    } catch (error) {
      await discardUploads();
      throw toServiceError(error, 'enviar a amostra de cor');
    }
  }

  const payload: SaveCatalogItemInput = { ...input, codes, ...(images !== undefined ? { images } : {}) };

  let item: CatalogItemWithCategory;
  try {
    // Produto + códigos numa única transação.
    item = await saveCatalogItemRecord(id ?? null, payload);
  } catch (error) {
    await discardUploads();
    throw toServiceError(error, id ? 'salvar o produto' : 'criar o produto');
  }

  // Fotos que saíram da galeria (só arquivos do nosso bucket).
  const kept = new Set(item.images);
  const removed = previousImages.filter((url) => !kept.has(url) && getStoragePathFromUrl(url));
  for (const url of removed) {
    try {
      await deleteCatalogImage(url);
    } catch {
      warnings.push('O item foi salvo, mas uma imagem removida não pôde ser apagada do armazenamento.');
      break;
    }
  }

  return { item, warnings };
}
