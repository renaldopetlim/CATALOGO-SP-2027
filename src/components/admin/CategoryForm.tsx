import { useId, useState, type FormEvent } from 'react';
import { isServiceError } from '../../lib/errors';
import { SLUG_PATTERN, slugify } from '../../lib/format';
import { createCategory, updateCategory } from '../../services/categoryService';
import type { Category } from '../../types/catalog';
import { Drawer } from '../ui/Drawer';

type CategoryFormProps = {
  /** Ausente = nova categoria. */
  category?: Category | null;
  onSaved: (category: Category, mode: 'created' | 'updated') => void;
  onCancel: () => void;
};

type FieldErrors = Partial<Record<'name' | 'slug', string>>;

/** Formulário de categoria em gaveta lateral. O slug acompanha o nome até ser editado manualmente. */
export function CategoryForm({ category, onSaved, onCancel }: CategoryFormProps) {
  const formId = useId();
  const isEdit = Boolean(category);
  const [name, setName] = useState(category?.name ?? '');
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [description, setDescription] = useState(category?.description ?? '');
  const [isActive, setIsActive] = useState(category?.is_active ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fieldErrors: FieldErrors = {};
    if (!name.trim()) fieldErrors.name = 'Campo obrigatório';
    if (!SLUG_PATTERN.test(effectiveSlug)) fieldErrors.slug = 'Use letras minúsculas, números e hífens (ex.: pisos-e-revestimentos)';
    setErrors(fieldErrors);
    setSubmitError(null);
    if (Object.keys(fieldErrors).length > 0) return;

    setSaving(true);
    try {
      const input = { name, slug: effectiveSlug, description, is_active: isActive };
      const saved = category ? await updateCategory(category.id, input) : await createCategory(input);
      onSaved(saved, isEdit ? 'updated' : 'created');
    } catch (err) {
      const message = isServiceError(err) ? err.message : 'Não foi possível salvar. Tente novamente.';
      if (isServiceError(err) && err.kind === 'conflict') setErrors({ slug: message });
      setSubmitError(message);
      setSaving(false);
    }
  };

  return (
    <Drawer
      title={isEdit ? 'Editar categoria' : 'Nova categoria'}
      subtitle={category ? `/${category.slug}` : undefined}
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
            {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar categoria'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <fieldset disabled={saving}>
          <legend>Dados da categoria</legend>
          <div className="g">
            <div>
              <label htmlFor="cat-name">Nome *</label>
              <input
                id="cat-name"
                value={name}
                maxLength={120}
                className={errors.name ? 'bad' : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((prev) => ({ ...prev, name: undefined }));
                }}
              />
              {errors.name && <div className="msg">{errors.name}</div>}
            </div>
            <div>
              <label htmlFor="cat-slug">Slug (endereço) *</label>
              <input
                id="cat-slug"
                value={effectiveSlug}
                className={errors.slug ? 'bad' : undefined}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                  setErrors((prev) => ({ ...prev, slug: undefined }));
                }}
              />
              {errors.slug ? (
                <div className="msg">{errors.slug}</div>
              ) : (
                <p className="hint">#/catalogo?categoria={effectiveSlug || '…'}</p>
              )}
            </div>
            <div className="full">
              <label htmlFor="cat-desc">Descrição</label>
              <textarea id="cat-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="full">
              <label className="check">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Ativa (visível na vitrine, junto com seus itens)
              </label>
            </div>
          </div>
        </fieldset>

        {isEdit && category && slug !== category.slug && (
          <p className="hint warn">Alterar o slug muda o endereço da categoria; links antigos deixarão de funcionar.</p>
        )}
      </form>
    </Drawer>
  );
}
