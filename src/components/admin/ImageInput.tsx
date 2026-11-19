import { useEffect, useId, useState } from 'react';
import { isServiceError } from '../../lib/errors';
import { ALLOWED_IMAGE_TYPES, isCatalogStorageUrl, validateImageFile } from '../../services/storageService';
import { ItemImage } from '../catalog/ItemImage';

export type ImageValue =
  /** Mantém/usa uma URL (Storage ou externa). `null` = sem imagem. */
  | { mode: 'url'; url: string | null }
  /** Novo arquivo escolhido (enviado ao salvar). */
  | { mode: 'file'; file: File };

type ImageInputProps = {
  value: ImageValue;
  onChange: (value: ImageValue) => void;
  disabled?: boolean;
  error?: string | null;
  /** Recomendação exibida abaixo dos controles (ex.: proporção do logo). */
  hint?: string;
  /** Texto da pré-visualização para leitores de tela. */
  previewAlt?: string;
  /** Classe extra na pré-visualização (ex.: fundo neutro para logos). */
  previewClassName?: string;
};

const ACCEPT = Object.keys(ALLOWED_IMAGE_TYPES).join(',');

/** Escolha da imagem do item: upload de arquivo ou URL externa, com pré-visualização. */
export function ImageInput({
  value,
  onChange,
  disabled = false,
  error = null,
  hint,
  previewAlt = 'Pré-visualização',
  previewClassName,
}: ImageInputProps) {
  const fileId = useId();
  const urlId = useId();
  const [tab, setTab] = useState<'file' | 'url'>(
    value.mode === 'url' && value.url && !isCatalogStorageUrl(value.url) ? 'url' : 'file',
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<{ file: File; dataUrl: string } | null>(null);
  const selectedFile = value.mode === 'file' ? value.file : null;

  // Pré-visualização local do arquivo escolhido (lida de forma assíncrona).
  useEffect(() => {
    if (!selectedFile) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setFilePreview({ file: selectedFile, dataUrl: reader.result });
    };
    reader.readAsDataURL(selectedFile);
    return () => reader.abort();
  }, [selectedFile]);

  const preview =
    value.mode === 'file' ? (filePreview?.file === value.file ? filePreview.dataUrl : null) : value.url;
  const shownError = fileError ?? error;

  return (
    <div className="image-input">
      <div className={`img-preview${previewClassName ? ` ${previewClassName}` : ''}`}>
        <ItemImage src={preview} alt={previewAlt} loading="eager" />
      </div>

      <div className="image-controls">
        <div className="tabs" role="tablist" aria-label="Origem da imagem">
          <button type="button" role="tab" aria-selected={tab === 'file'} className="chip" onClick={() => setTab('file')} disabled={disabled}>
            Enviar arquivo
          </button>
          <button type="button" role="tab" aria-selected={tab === 'url'} className="chip" onClick={() => setTab('url')} disabled={disabled}>
            URL externa
          </button>
        </div>

        {tab === 'file' ? (
          <div>
            <label htmlFor={fileId}>Arquivo (JPEG, PNG, WebP ou AVIF · até 5 MB)</label>
            <input
              key="file"
              id={fileId}
              type="file"
              accept={ACCEPT}
              disabled={disabled}
              className={shownError ? 'bad' : undefined}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                try {
                  validateImageFile(file);
                  setFileError(null);
                  onChange({ mode: 'file', file });
                } catch (err) {
                  setFileError(isServiceError(err) ? err.message : 'Arquivo inválido.');
                }
              }}
            />
            {value.mode === 'file' && <p className="hint">Selecionado: {value.file.name} (enviado ao salvar)</p>}
          </div>
        ) : (
          <div>
            <label htmlFor={urlId}>URL da imagem</label>
            <input
              key="url"
              id={urlId}
              type="url"
              inputMode="url"
              placeholder="https://…"
              disabled={disabled}
              className={shownError ? 'bad' : undefined}
              value={value.mode === 'url' ? (value.url ?? '') : ''}
              onChange={(event) => {
                setFileError(null);
                onChange({ mode: 'url', url: event.target.value || null });
              }}
            />
          </div>
        )}

        {shownError && <div className="msg">{shownError}</div>}
        {hint && <p className="hint">{hint}</p>}

        {(value.mode === 'file' || value.url) && (
          <button
            type="button"
            className="sec btn-sm"
            disabled={disabled}
            onClick={() => {
              setFileError(null);
              onChange({ mode: 'url', url: null });
            }}
          >
            Remover imagem
          </button>
        )}
      </div>
    </div>
  );
}
