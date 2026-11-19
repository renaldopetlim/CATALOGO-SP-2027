import { useId, useState, type FormEvent } from 'react';
import { isServiceError } from '../../lib/errors';
import { isHttpUrl } from '../../lib/format';
import { saveBrand, type SaveBrandResult } from '../../services/brandService';
import type { Brand } from '../../types/brands';
import { Drawer } from '../ui/Drawer';
import { ImageInput, type ImageValue } from './ImageInput';

type BrandFormProps = {
  /** Ausente = nova marca. */
  brand?: Brand | null;
  /** Nome sugerido para uma marca nova. */
  initialName?: string;
  onSaved: (result: SaveBrandResult, mode: 'created' | 'updated') => void;
  onCancel: () => void;
};

const LOGO_HINT =
  'Recomendado: PNG ou WebP com fundo transparente, formato horizontal (ex.: 400 × 160 px) e margem pequena ao redor. O logo aparece pequeno no card, então prefira versões sem textos miúdos.';

/** Cadastro/edição de marca em gaveta lateral: nome, logo (upload ou URL) e status. */
export function BrandForm({ brand, initialName = '', onSaved, onCancel }: BrandFormProps) {
  const formId = useId();
  const isEdit = Boolean(brand);
  const [name, setName] = useState(brand?.name ?? initialName);
  const [isActive, setIsActive] = useState(brand?.is_active ?? true);
  const [logo, setLogo] = useState<ImageValue>({ mode: 'url', url: brand?.logo_url ?? null });
  const [errors, setErrors] = useState<{ name?: string; logo?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: { name?: string; logo?: string } = {};
    if (!name.trim()) next.name = 'Campo obrigatório';
    else if (name.trim().length > 120) next.name = 'Máximo de 120 caracteres';
    if (logo.mode === 'url' && logo.url && !isHttpUrl(logo.url.trim())) next.logo = 'Informe uma URL começando com http:// ou https://';
    setErrors(next);
    setSubmitError(null);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const result = await saveBrand({
        id: brand?.id,
        input: { name, is_active: isActive, logo_url: logo.mode === 'url' ? (logo.url?.trim() ?? null) : null },
        newLogoFile: logo.mode === 'file' ? logo.file : null,
        previousLogoUrl: brand?.logo_url ?? null,
      });
      onSaved(result, isEdit ? 'updated' : 'created');
    } catch (err) {
      const message = isServiceError(err) ? err.message : 'Não foi possível salvar. Tente novamente.';
      if (isServiceError(err) && err.kind === 'conflict') setErrors({ name: message });
      setSubmitError(message);
      setSaving(false);
    }
  };

  return (
    <Drawer
      title={isEdit ? 'Editar marca' : 'Nova marca'}
      subtitle={isEdit && brand ? brand.name : undefined}
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
            {saving ? (logo.mode === 'file' ? 'Enviando logo e salvando…' : 'Salvando…') : isEdit ? 'Salvar alterações' : 'Criar marca'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <fieldset disabled={saving}>
          <legend>Marca</legend>
          <div className="g">
            <div className="full">
              <label htmlFor="brand-name">Nome da marca *</label>
              <input
                id="brand-name"
                value={name}
                maxLength={120}
                placeholder="Ex.: Tigre, Suvinil, Gerdau"
                className={errors.name ? 'bad' : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((prev) => ({ ...prev, name: undefined }));
                  setSubmitError(null);
                }}
              />
              {errors.name ? (
                <div className="msg">{errors.name}</div>
              ) : (
                isEdit && <p className="hint">Renomear atualiza a marca em todos os produtos vinculados.</p>
              )}
            </div>
            <div className="full">
              <label className="check">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Ativa (disponível para seleção e com logo visível na vitrine)
              </label>
            </div>
          </div>
        </fieldset>

        <fieldset disabled={saving}>
          <legend>Logo</legend>
          <ImageInput
            value={logo}
            onChange={(next) => {
              setLogo(next);
              setErrors((prev) => ({ ...prev, logo: undefined }));
              setSubmitError(null);
            }}
            disabled={saving}
            error={errors.logo ?? null}
            hint={LOGO_HINT}
            previewAlt={`Logo ${name || 'da marca'}`}
            previewClassName="logo-preview"
          />
        </fieldset>
      </form>
    </Drawer>
  );
}
