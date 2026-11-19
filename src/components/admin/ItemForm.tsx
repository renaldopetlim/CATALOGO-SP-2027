import { useId, useState, type FormEvent } from 'react';
import { isServiceError } from '../../lib/errors';
import { isHttpUrl, maskPriceInput, parsePriceInput, parseTagsInput, priceToInput } from '../../lib/format';
import { saveCatalogItem, type SaveItemResult } from '../../services/adminCatalogService';
import type { Category, CatalogItemWithCategory } from '../../types/catalog';
import { Drawer } from '../ui/Drawer';
import { ImageInput, type ImageValue } from './ImageInput';

export type ItemFormMode = 'create' | 'edit' | 'duplicate';

type ItemFormProps = {
  mode: ItemFormMode;
  /** Item a editar ou a duplicar (ausente ao criar). */
  item?: CatalogItemWithCategory | null;
  /** Todas as categorias (inclusive inativas). */
  categories: Category[];
  /** Categoria pré-selecionada para novos itens. */
  defaultCategoryId?: string | null;
  onSaved: (result: SaveItemResult, mode: ItemFormMode) => void;
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

function initialState(mode: ItemFormMode, item: CatalogItemWithCategory | null | undefined, defaultCategoryId: string | null): FormState {
  const duplicate = mode === 'duplicate';
  return {
    title: item ? (duplicate ? `${item.title} (cópia)` : item.title) : '',
    // SKU é único: a cópia começa sem SKU.
    sku: item && !duplicate ? (item.sku ?? '') : '',
    category_id: item?.category_id ?? defaultCategoryId ?? '',
    price: priceToInput(item?.price ?? null),
    short_description: item?.short_description ?? '',
    detailed_description: item?.detailed_description ?? '',
    tags: item?.tags.join(', ') ?? '',
    // A cópia nasce inativa e sem destaque, para revisão antes de aparecer na vitrine.
    is_featured: duplicate ? false : (item?.is_featured ?? false),
    is_active: duplicate ? false : (item?.is_active ?? true),
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

const TITLES: Record<ItemFormMode, string> = {
  create: 'Novo item',
  edit: 'Editar item',
  duplicate: 'Duplicar item',
};

/** Formulário de item em gaveta lateral (criar, editar ou duplicar). */
export function ItemForm({ mode, item, categories, defaultCategoryId = null, onSaved, onCancel }: ItemFormProps) {
  const formId = useId();
  const [form, setForm] = useState<FormState>(() => initialState(mode, item, defaultCategoryId));
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
        id: mode === 'edit' ? item?.id : undefined,
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
        // Só na edição a imagem anterior pertence a este item e pode ser removida.
        previousImageUrl: mode === 'edit' ? (item?.image_url ?? null) : null,
        copyImageFromUrl: mode === 'duplicate' ? (item?.image_url ?? null) : null,
      });
      onSaved(result, mode);
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
  const subtitle =
    mode === 'edit' && item
      ? [item.sku ? `SKU ${item.sku}` : null, item.category.name].filter(Boolean).join(' · ')
      : mode === 'duplicate' && item
        ? `Cópia de “${item.title}”, criada inativa para revisão`
        : undefined;

  const submitLabel = saving
    ? image.mode === 'file'
      ? 'Enviando imagem e salvando…'
      : 'Salvando…'
    : mode === 'edit'
      ? 'Salvar alterações'
      : mode === 'duplicate'
        ? 'Criar cópia'
        : 'Criar item';

  return (
    <Drawer
      title={TITLES[mode]}
      subtitle={subtitle}
      onClose={onCancel}
      locked={saving}
      footer={
        <>
          {submitError && (
            <div className="drawer-error" role="alert">
              {submitError}
            </div>
          )}
          <button type="button" className="sec" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form={formId} className="pri" disabled={saving}>
            {submitLabel}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <fieldset disabled={saving}>
          <legend>Identificação</legend>
          <div className="g">
            <div>
              <label htmlFor="item-title">Título *</label>
              <input id="item-title" value={form.title} maxLength={200} onChange={(e) => set('title', e.target.value)} className={fieldClass('title')} />
              {errors.title && <div className="msg">{errors.title}</div>}
            </div>
            <div>
              <label htmlFor="item-sku">SKU / Código</label>
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
            <div className="full">
              <label htmlFor="item-tags">Tags (separadas por vírgula)</label>
              <input id="item-tags" placeholder="piso, área externa" value={form.tags} onChange={(e) => set('tags', e.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset disabled={saving}>
          <legend>Imagem e descrição</legend>
          <div className="g">
            <div>
              <ImageInput
                value={image}
                onChange={(next) => {
                  setImage(next);
                  setErrors((prev) => ({ ...prev, image: undefined }));
                }}
                disabled={saving}
                error={errors.image ?? null}
              />
            </div>
            <div className="desc-col">
              <div>
                <label htmlFor="item-short">Descrição curta</label>
                <input id="item-short" value={form.short_description} onChange={(e) => set('short_description', e.target.value)} />
              </div>
              <div>
                <label htmlFor="item-detail">Descrição detalhada</label>
                <textarea id="item-detail" rows={8} value={form.detailed_description} onChange={(e) => set('detailed_description', e.target.value)} />
              </div>
            </div>
          </div>
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
      </form>
    </Drawer>
  );
}
