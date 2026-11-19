import { useState, type FormEvent } from 'react';
import { isServiceError } from '../../lib/errors';
import { isHttpUrl, maskPriceInput, parsePriceInput, parseTagsInput, priceToInput } from '../../lib/format';
import { saveCatalogItem, type SaveItemResult } from '../../services/adminCatalogService';
import type { Category, CatalogItemWithCategory } from '../../types/catalog';
import { Modal } from '../ui/Modal';
import { ImageInput, type ImageValue } from './ImageInput';

type ItemFormProps = {
  /** Ausente = novo item. */
  item?: CatalogItemWithCategory | null;
  /** Todas as categorias (inclusive inativas). */
  categories: Category[];
  /** Categoria pré-selecionada para novos itens. */
  defaultCategoryId?: string | null;
  onSaved: (result: SaveItemResult, mode: 'created' | 'updated') => void;
  onCancel: () => void;
};

type FormState = {
  title: string;
  sku: string;
  category_id: string;
  price: string;
  short_description: string;
  detailed_description: string;
  tags: string;
  is_featured: boolean;
  is_active: boolean;
};

type FieldErrors = Partial<Record<keyof FormState | 'image', string>>;

function initialState(item: CatalogItemWithCategory | null | undefined, defaultCategoryId: string | null): FormState {
  return {
    title: item?.title ?? '',
    sku: item?.sku ?? '',
    category_id: item?.category_id ?? defaultCategoryId ?? '',
    price: priceToInput(item?.price ?? null),
    short_description: item?.short_description ?? '',
    detailed_description: item?.detailed_description ?? '',
    tags: item?.tags.join(', ') ?? '',
    is_featured: item?.is_featured ?? false,
    is_active: item?.is_active ?? true,
  };
}

function validate(form: FormState, image: ImageValue): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.title.trim()) errors.title = 'Campo obrigatório';
  else if (form.title.trim().length > 200) errors.title = 'Máximo de 200 caracteres';
  if (!form.category_id) errors.category_id = 'Selecione uma categoria';
  if (image.mode === 'url' && image.url && !isHttpUrl(image.url.trim())) {
    errors.image = 'Informe uma URL começando com http:// ou https://';
  }
  return errors;
}

/** Formulário de criação/edição de item (modal largo). */
export function ItemForm({ item, categories, defaultCategoryId = null, onSaved, onCancel }: ItemFormProps) {
  const isEdit = Boolean(item);
  const [form, setForm] = useState<FormState>(() => initialState(item, defaultCategoryId));
  const [image, setImage] = useState<ImageValue>({ mode: 'url', url: item?.image_url ?? null });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fieldErrors = validate(form, image);
    setErrors(fieldErrors);
    setSubmitError(null);
    if (Object.keys(fieldErrors).length > 0) return;

    setSaving(true);
    try {
      const result = await saveCatalogItem({
        id: item?.id,
        input: {
          title: form.title,
          sku: form.sku,
          category_id: form.category_id,
          price: parsePriceInput(form.price),
          short_description: form.short_description,
          detailed_description: form.detailed_description,
          tags: parseTagsInput(form.tags),
          is_featured: form.is_featured,
          is_active: form.is_active,
          image_url: image.mode === 'url' ? (image.url?.trim() ?? null) : null,
        },
        newImageFile: image.mode === 'file' ? image.file : null,
        previousImageUrl: item?.image_url ?? null,
      });
      onSaved(result, isEdit ? 'updated' : 'created');
    } catch (err) {
      const message = isServiceError(err) ? err.message : 'Não foi possível salvar. Tente novamente.';
      if (isServiceError(err) && err.kind === 'conflict' && /SKU/i.test(message)) {
        setErrors((prev) => ({ ...prev, sku: message }));
      }
      setSubmitError(message);
      setSaving(false);
    }
  };

  const fieldClass = (field: keyof FieldErrors) => (errors[field] ? 'bad' : undefined);

  return (
    <Modal title={isEdit ? 'Editar item' : 'Novo item'} onClose={saving ? () => undefined : onCancel} size="wide" showTitle>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <fieldset disabled={saving}>
          <legend>Dados do item</legend>
          <div className="g">
            <div className="full">
              <label htmlFor="item-title">Título *</label>
              <input id="item-title" value={form.title} maxLength={200} onChange={(e) => set('title', e.target.value)} className={fieldClass('title')} />
              {errors.title && <div className="msg">{errors.title}</div>}
            </div>
            <div>
              <label htmlFor="item-sku">SKU</label>
              <input id="item-sku" value={form.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} className={fieldClass('sku')} />
              {errors.sku && <div className="msg">{errors.sku}</div>}
            </div>
            <div>
              <label htmlFor="item-category">Categoria *</label>
              <select id="item-category" value={form.category_id} onChange={(e) => set('category_id', e.target.value)} className={fieldClass('category_id')}>
                <option value="">Selecione…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.is_active ? '' : ' (inativa)'}
                  </option>
                ))}
              </select>
              {errors.category_id && <div className="msg">{errors.category_id}</div>}
            </div>
            <div>
              <label htmlFor="item-price">Preço (R$)</label>
              <input
                id="item-price"
                inputMode="numeric"
                placeholder="Vazio = sob consulta"
                value={form.price}
                onChange={(e) => set('price', maskPriceInput(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor="item-tags">Tags (separadas por vírgula)</label>
              <input id="item-tags" placeholder="piso, área externa" value={form.tags} onChange={(e) => set('tags', e.target.value)} />
            </div>
            <div className="full">
              <label htmlFor="item-short">Descrição curta</label>
              <input id="item-short" value={form.short_description} onChange={(e) => set('short_description', e.target.value)} />
            </div>
            <div className="full">
              <label htmlFor="item-detail">Descrição detalhada</label>
              <textarea id="item-detail" rows={5} value={form.detailed_description} onChange={(e) => set('detailed_description', e.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset disabled={saving}>
          <legend>Imagem</legend>
          <ImageInput
            value={image}
            onChange={(next) => {
              setImage(next);
              setErrors((prev) => ({ ...prev, image: undefined }));
            }}
            disabled={saving}
            error={errors.image ?? null}
          />
        </fieldset>

        <fieldset disabled={saving}>
          <legend>Exibição</legend>
          <div className="checks">
            <label className="check">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
              Ativo (visível na vitrine)
            </label>
            <label className="check">
              <input type="checkbox" checked={form.is_featured} onChange={(e) => set('is_featured', e.target.checked)} />
              Destaque na página inicial
            </label>
          </div>
        </fieldset>

        <div className="bar">
          <button type="submit" className="pri" disabled={saving}>
            {saving ? (image.mode === 'file' ? 'Enviando imagem e salvando…' : 'Salvando…') : isEdit ? 'Salvar alterações' : 'Criar item'}
          </button>
          <button type="button" className="sec" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
        </div>
        {submitError && (
          <div id="st" className="is-err" role="alert">
            {submitError}
          </div>
        )}
      </form>
    </Modal>
  );
}
