import { useCallback, useId, useState, type FormEvent } from 'react';
import { isServiceError } from '../../lib/errors';
import { isHttpUrl, parseTagsInput } from '../../lib/format';
import { saveCatalogItem, type SaveItemResult } from '../../services/adminCatalogService';
import {
  BADGE_LABELS,
  BADGES,
  isCatalogBadge,
  type CatalogBadge,
  type Category,
  type CatalogItemWithCategory,
  type ItemFormPrefill,
} from '../../types/catalog';
import { Drawer } from '../ui/Drawer';
import { BrandSelect } from './BrandSelect';
import { CodesEditor } from './CodesEditor';
import { newCodeRow, newSpecRow, type CodeRow, type SpecRow } from './editorRows';
import { ImageInput, type ImageValue } from './ImageInput';
import { SpecificationsEditor } from './SpecificationsEditor';

export type ItemFormMode = 'create' | 'edit' | 'duplicate';

export type { ItemFormPrefill };

type ItemFormProps = {
  mode: ItemFormMode;
  /** Produto a editar ou a duplicar (ausente ao criar). */
  item?: CatalogItemWithCategory | null;
  /** Todas as categorias (inclusive inativas). */
  categories: Category[];
  /** Categoria pré-selecionada para novos produtos. */
  defaultCategoryId?: string | null;
  /** Só no modo `create`: título, marca e códigos já preenchidos. */
  prefill?: ItemFormPrefill | null;
  onSaved: (result: SaveItemResult, mode: ItemFormMode) => void;
  onCancel: () => void;
};

type FormState = {
  title: string;
  /** `brands.id`; '' = sem marca. */
  brand_id: string;
  category_id: string;
  badge: CatalogBadge | '';
  tags: string;
  is_featured: boolean;
  is_active: boolean;
};

type FieldErrors = Partial<Record<'title' | 'category_id' | 'image' | 'codes', string>>;

function initialState(
  mode: ItemFormMode,
  item: CatalogItemWithCategory | null | undefined,
  defaultCategoryId: string | null,
  prefill: ItemFormPrefill | null,
): FormState {
  const duplicate = mode === 'duplicate';
  return {
    title: item ? (duplicate ? `${item.title} (cópia)` : item.title) : (prefill?.title ?? ''),
    brand_id: item?.brand_id ?? '',
    category_id: item?.category_id ?? defaultCategoryId ?? '',
    badge: item?.badge ?? '',
    tags: item?.tags.join(', ') ?? '',
    // A cópia nasce inativa e sem destaque, para revisão antes de aparecer na vitrine.
    is_featured: duplicate ? false : (item?.is_featured ?? false),
    is_active: duplicate ? false : (item?.is_active ?? true),
  };
}

function initialCodes(
  mode: ItemFormMode,
  item: CatalogItemWithCategory | null | undefined,
  prefill: ItemFormPrefill | null,
): CodeRow[] {
  if (!item && prefill?.codes?.length) {
    return prefill.codes.map((code) =>
      newCodeRow({ code: code.code, description: code.description ?? '', packaging: code.packaging ?? '' }),
    );
  }
  if (!item || item.codes.length === 0) return [newCodeRow()];
  return item.codes.map((code) =>
    mode === 'duplicate'
      ? // Códigos são únicos: a cópia mantém descrição e embalagem, com o código em branco.
        newCodeRow({ description: code.description ?? '', packaging: code.packaging ?? '' })
      : newCodeRow({ id: code.id, code: code.code, description: code.description ?? '', packaging: code.packaging ?? '' }),
  );
}

/** Validação local das linhas de código: obrigatório e sem repetição no mesmo produto. */
function validateCodes(rows: CodeRow[]): Record<number, string> {
  const errors: Record<number, string> = {};
  const seen = new Map<string, number>();
  rows.forEach((row, index) => {
    const code = row.code.trim().toUpperCase();
    const filled = code || row.description.trim() || row.packaging.trim();
    if (!filled && rows.length > 1) return; // linha totalmente vazia é ignorada
    if (!code) {
      errors[index] = 'Informe o código.';
      return;
    }
    const first = seen.get(code);
    if (first !== undefined) errors[index] = `Código repetido (linha ${first + 1}).`;
    else seen.set(code, index);
  });
  return errors;
}

function validateSpecs(rows: SpecRow[]): Record<number, string> {
  const errors: Record<number, string> = {};
  rows.forEach((row, index) => {
    if (row.label.trim() && !row.value.trim()) errors[index] = 'Informe o valor ou remova a linha.';
  });
  return errors;
}

const TITLES: Record<ItemFormMode, string> = {
  create: 'Novo produto',
  edit: 'Editar produto',
  duplicate: 'Duplicar produto',
};

/** Formulário de produto em gaveta lateral (criar, editar ou duplicar). */
export function ItemForm({ mode, item, categories, defaultCategoryId = null, prefill = null, onSaved, onCancel }: ItemFormProps) {
  const formId = useId();
  const usePrefill = mode === 'create' ? prefill : null;
  const [form, setForm] = useState<FormState>(() => initialState(mode, item, defaultCategoryId, usePrefill));
  const [codes, setCodes] = useState<CodeRow[]>(() => initialCodes(mode, item, usePrefill));
  const [specs, setSpecs] = useState<SpecRow[]>(() => (item?.specifications ?? []).map((spec) => newSpecRow(spec)));
  const [image, setImage] = useState<ImageValue>({ mode: 'url', url: item?.image_url ?? null });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [codeErrors, setCodeErrors] = useState<Record<number, string>>({});
  const [specErrors, setSpecErrors] = useState<Record<number, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setBrandId = useCallback((brandId: string) => {
    setForm((prev) => ({ ...prev, brand_id: brandId }));
    setSubmitError(null);
  }, []);

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSubmitError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fieldErrors: FieldErrors = {};
    if (!form.title.trim()) fieldErrors.title = 'Campo obrigatório';
    else if (form.title.trim().length > 200) fieldErrors.title = 'Máximo de 200 caracteres';
    if (!form.category_id) fieldErrors.category_id = 'Selecione uma categoria';
    if (image.mode === 'url' && image.url && !isHttpUrl(image.url.trim())) {
      fieldErrors.image = 'Informe uma URL começando com http:// ou https://';
    }
    const nextCodeErrors = validateCodes(codes);
    const nextSpecErrors = validateSpecs(specs);
    if (Object.keys(nextCodeErrors).length > 0) fieldErrors.codes = 'Revise os códigos destacados.';

    setErrors(fieldErrors);
    setCodeErrors(nextCodeErrors);
    setSpecErrors(nextSpecErrors);
    setSubmitError(null);
    if (Object.keys(fieldErrors).length > 0 || Object.keys(nextSpecErrors).length > 0) {
      setSubmitError('Revise os campos destacados.');
      return;
    }

    setSaving(true);
    try {
      const result = await saveCatalogItem({
        id: mode === 'edit' ? item?.id : undefined,
        input: {
          title: form.title,
          brand_id: form.brand_id || null,
          category_id: form.category_id,
          badge: form.badge || null,
          tags: parseTagsInput(form.tags),
          specifications: specs.map(({ label, value }) => ({ label, value })),
          codes: codes.map(({ id, code, description, packaging }) => ({ ...(id ? { id } : {}), code, description, packaging })),
          is_featured: form.is_featured,
          is_active: form.is_active,
          image_url: image.mode === 'url' ? (image.url?.trim() ?? null) : null,
        },
        newImageFile: image.mode === 'file' ? image.file : null,
        // Só na edição a imagem anterior pertence a este produto e pode ser removida.
        previousImageUrl: mode === 'edit' ? (item?.image_url ?? null) : null,
        copyImageFromUrl: mode === 'duplicate' ? (item?.image_url ?? null) : null,
      });
      onSaved(result, mode);
    } catch (err) {
      const message = isServiceError(err) ? err.message : 'Não foi possível salvar. Tente novamente.';
      if (isServiceError(err) && err.kind === 'conflict') setErrors((prev) => ({ ...prev, codes: message }));
      setSubmitError(message);
      setSaving(false);
    }
  };

  const fieldClass = (field: keyof FieldErrors) => (errors[field] ? 'bad' : undefined);
  const firstCode = item?.codes[0]?.code;
  const subtitle =
    mode === 'edit' && item
      ? [firstCode ? `Cód. ${firstCode}${item.codes.length > 1 ? ` +${item.codes.length - 1}` : ''}` : null, item.category.name]
          .filter(Boolean)
          .join(' · ')
      : mode === 'duplicate' && item
        ? `Cópia de “${item.title}”, criada inativa. Informe códigos novos.`
        : usePrefill
          ? usePrefill.subtitle ?? 'Pré-preenchido com os dados do sistema. Revise o título e escolha a categoria.'
          : undefined;

  const submitLabel = saving
    ? image.mode === 'file'
      ? 'Enviando imagem e salvando…'
      : 'Salvando…'
    : mode === 'edit'
      ? 'Salvar alterações'
      : mode === 'duplicate'
        ? 'Criar cópia'
        : 'Criar produto';

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
          <legend>Produto</legend>
          <div className="g">
            <div className="full">
              <label htmlFor="item-title">Título do produto *</label>
              <input id="item-title" value={form.title} maxLength={200} onChange={(e) => set('title', e.target.value)} className={fieldClass('title')} />
              {errors.title && <div className="msg">{errors.title}</div>}
              {!errors.title && usePrefill?.titleHint && <p className="hint">{usePrefill.titleHint}</p>}
            </div>
            <div className="full">
              <BrandSelect
                value={form.brand_id}
                onChange={setBrandId}
                // Base do sistema (Pendentes) ou produto antigo ainda sem marca vinculada.
                hintName={usePrefill?.brand ?? (item && !item.brand_id ? (item.brand ?? '') : '')}
                // Registros com marcas diferentes: o admin escolhe a principal.
                suggestions={usePrefill?.brandSuggestions}
                disabled={saving}
              />
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
              <label htmlFor="item-badge">Selo (opcional)</label>
              <select id="item-badge" value={form.badge} onChange={(e) => set('badge', isCatalogBadge(e.target.value) ? e.target.value : '')}>
                <option value="">Nenhum</option>
                {BADGES.map((badge) => (
                  <option key={badge} value={badge}>
                    {BADGE_LABELS[badge]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset disabled={saving}>
          <legend>Códigos, descrição e embalagem</legend>
          <p className="hint fieldset-hint">
            Um produto pode ter vários códigos (tamanho, bitola, cor, voltagem…). Cada código é único no catálogo e também
            é encontrado pela busca.
          </p>
          <CodesEditor
            rows={codes}
            onChange={(next) => {
              setCodes(next);
              setCodeErrors({});
              setSubmitError(null);
              setErrors((prev) => ({ ...prev, codes: undefined }));
            }}
            errors={codeErrors}
            disabled={saving}
          />
          {errors.codes && <div className="msg">{errors.codes}</div>}
        </fieldset>

        <fieldset disabled={saving}>
          <legend>Imagem e busca</legend>
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
            <div>
              <label htmlFor="item-tags">Tags de busca</label>
              <textarea
                id="item-tags"
                rows={4}
                placeholder="parafuso, fixação, inox"
                value={form.tags}
                onChange={(e) => set('tags', e.target.value)}
              />
              <p className="hint">Separadas por vírgula. Ajudam a busca e não aparecem na vitrine.</p>
            </div>
          </div>
        </fieldset>

        <fieldset disabled={saving}>
          <legend>Especificações / Ficha técnica (opcional)</legend>
          <SpecificationsEditor
            rows={specs}
            onChange={(next) => {
              setSpecs(next);
              setSpecErrors({});
              setSubmitError(null);
            }}
            errors={specErrors}
            disabled={saving}
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
      </form>
    </Drawer>
  );
}
