import { useId, useState, type DragEvent } from 'react';
import { useObjectUrl } from '../../hooks/useObjectUrl';
import { isServiceError } from '../../lib/errors';
import { isHttpUrl } from '../../lib/format';
import { ALLOWED_IMAGE_TYPES, validateImageFile } from '../../services/storageService';
import { MAX_ITEM_IMAGES } from '../../types/catalog';
import { ItemImage } from '../catalog/ItemImage';
import type { GalleryItem } from './editorRows';

type GalleryInputProps = {
  value: GalleryItem[];
  onChange: (value: GalleryItem[]) => void;
  disabled?: boolean;
  error?: string | null;
};

const ACCEPT = Object.keys(ALLOWED_IMAGE_TYPES).join(',');

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

/**
 * Galeria do produto: até 5 fotos (upload de vários arquivos de uma vez ou URL),
 * com capa, reordenação e remoção. Os arquivos só são enviados ao salvar; fotos
 * removidas do nosso bucket são apagadas do Storage depois de salvar.
 */
export function GalleryInput({ value, onChange, disabled = false, error = null }: GalleryInputProps) {
  const fileId = useId();
  const urlId = useId();
  const [url, setUrl] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const count = value.length;
  const free = MAX_ITEM_IMAGES - count;
  const full = free <= 0;

  const addFiles = (files: File[]) => {
    const problems: string[] = [];
    const valid: GalleryItem[] = [];
    for (const file of files) {
      try {
        validateImageFile(file);
        valid.push({ key: crypto.randomUUID(), kind: 'file', file });
      } catch (err) {
        problems.push(`${file.name}: ${isServiceError(err) ? err.message : 'arquivo inválido.'}`);
      }
    }
    const accepted = valid.slice(0, Math.max(free, 0));
    if (valid.length > accepted.length) {
      problems.push(
        `Limite de ${MAX_ITEM_IMAGES} imagens: ${accepted.length === 0 ? 'nenhuma foi adicionada' : `só ${accepted.length} ${accepted.length === 1 ? 'foi adicionada' : 'foram adicionadas'}`}.`,
      );
    }
    if (accepted.length > 0) onChange([...value, ...accepted]);
    setNotice(problems.length > 0 ? problems.join(' ') : null);
  };

  const addUrl = () => {
    const clean = url.trim();
    if (!clean) return;
    if (!isHttpUrl(clean)) {
      setNotice('Informe uma URL começando com http:// ou https://.');
      return;
    }
    if (value.some((entry) => entry.kind === 'url' && entry.url === clean)) {
      setNotice('Esta imagem já está na galeria.');
      return;
    }
    if (full) return;
    onChange([...value, { key: crypto.randomUUID(), kind: 'url', url: clean }]);
    setUrl('');
    setNotice(null);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled || full) return;
    addFiles([...event.dataTransfer.files]);
  };

  return (
    <div className="gallery-input">
      <div className="gallery-head">
        <span className="label">Fotos do produto</span>
        <span className={`gallery-count${full ? ' full' : ''}`} aria-live="polite">
          {count} de {MAX_ITEM_IMAGES} imagens adicionadas
        </span>
      </div>

      {count > 0 && (
        <ol className="gallery-grid">
          {value.map((entry, index) => (
            <GalleryThumb
              key={entry.key}
              entry={entry}
              index={index}
              total={count}
              disabled={disabled}
              onMakeCover={() => onChange(move(value, index, 0))}
              onMove={(direction) => onChange(move(value, index, index + direction))}
              onRemove={() => {
                onChange(value.filter((_, i) => i !== index));
                setNotice(null);
              }}
            />
          ))}
        </ol>
      )}

      {full ? (
        <p className="hint">Limite de {MAX_ITEM_IMAGES} imagens atingido. Remova uma foto para adicionar outra.</p>
      ) : (
        <div className="gallery-add">
          <label
            htmlFor={fileId}
            className={`gallery-drop${dragging ? ' over' : ''}${disabled ? ' off' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!disabled) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <strong>+ Adicionar fotos</strong>
            <span>
              Arraste ou clique · até {free} {free === 1 ? 'foto' : 'fotos'} · JPEG, PNG, WebP ou AVIF até 5 MB
            </span>
          </label>
          <input
            id={fileId}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              addFiles([...(event.target.files ?? [])]);
              event.target.value = '';
            }}
          />
          <div className="gallery-url">
            <label htmlFor={urlId} className="sr-only">
              URL da imagem
            </label>
            <input
              id={urlId}
              value={url}
              placeholder="Ou cole a URL de uma imagem (https://…)"
              disabled={disabled}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addUrl();
                }
              }}
            />
            <button type="button" className="sec btn-sm" disabled={disabled || !url.trim()} onClick={addUrl}>
              Adicionar URL
            </button>
          </div>
        </div>
      )}

      {(notice ?? error) && (
        <div className="msg" role="alert">
          {notice ?? error}
        </div>
      )}
      <p className="hint">A primeira foto é a capa do card na vitrine. Proporção quadrada (1:1) fica melhor.</p>
    </div>
  );
}

type GalleryThumbProps = {
  entry: GalleryItem;
  index: number;
  total: number;
  disabled: boolean;
  onMakeCover: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
};

function GalleryThumb({ entry, index, total, disabled, onMakeCover, onMove, onRemove }: GalleryThumbProps) {
  const filePreview = useObjectUrl(entry.kind === 'file' ? entry.file : null);
  const src = entry.kind === 'file' ? filePreview : entry.url;
  const position = `Foto ${index + 1} de ${total}`;

  return (
    <li className={`gallery-thumb${index === 0 ? ' cover' : ''}`} aria-label={index === 0 ? `${position} (capa)` : position}>
      <div className="gallery-img">
        <ItemImage src={src} alt="" />
        {index === 0 && <span className="badge acc gallery-badge">Capa / Principal</span>}
        {entry.kind === 'file' && <span className="gallery-new">Nova</span>}
      </div>
      <div className="gallery-actions">
        <button type="button" className="act icon" aria-label={`Mover ${position} para a esquerda`} disabled={disabled || index === 0} onClick={() => onMove(-1)}>
          ←
        </button>
        <button
          type="button"
          className="act icon"
          aria-label={`Mover ${position} para a direita`}
          disabled={disabled || index === total - 1}
          onClick={() => onMove(1)}
        >
          →
        </button>
        <button type="button" className="act icon danger-text" aria-label={`Remover ${position}`} title="Remover" disabled={disabled} onClick={onRemove}>
          ✕
        </button>
      </div>
      {index > 0 && (
        <button type="button" className="act gallery-cover-btn" disabled={disabled} onClick={onMakeCover}>
          Definir como capa
        </button>
      )}
    </li>
  );
}
