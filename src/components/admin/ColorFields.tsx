import { useEffect, useId, useMemo } from 'react';
import { isHttpUrl } from '../../lib/format';
import { ALLOWED_IMAGE_TYPES } from '../../services/storageService';
import { normalizeHex } from '../../types/catalog';
import { ColorSwatch } from '../catalog/ColorSwatch';
import type { CodeRow } from './editorRows';

type ColorFieldsProps = {
  row: CodeRow;
  index: number;
  onChange: (patch: Partial<CodeRow>) => void;
  disabled?: boolean;
};

const ACCEPT = Object.keys(ALLOWED_IMAGE_TYPES).join(',');

/** URL temporária do arquivo escolhido, liberada ao trocar/desmontar. */
function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

/**
 * Campos de cor de um código (categorias com cores, ex.: Tintas):
 * nome da cor, seletor + hexadecimal com prévia e amostra opcional (upload ou URL).
 */
export function ColorFields({ row, index, onChange, disabled = false }: ColorFieldsProps) {
  const baseId = useId();
  const filePreview = useObjectUrl(row.swatchFile);
  const hex = normalizeHex(row.colorHex);
  const hexInvalid = row.colorHex.trim() !== '' && !hex;
  const urlInvalid = !row.swatchFile && row.swatchUrl.trim() !== '' && !isHttpUrl(row.swatchUrl.trim());
  const swatchPreview = filePreview ?? (row.swatchUrl.trim() && !urlInvalid ? row.swatchUrl.trim() : null);

  return (
    <div className="color-fields" role="group" aria-label={`Cor da linha ${index + 1}`}>
      <ColorSwatch hex={hex} imageUrl={swatchPreview} name={row.colorName || 'Prévia da cor'} size="lg" />

      <div className="cf-name">
        <label htmlFor={`${baseId}-name`}>Nome da cor</label>
        <input
          id={`${baseId}-name`}
          value={row.colorName}
          maxLength={80}
          placeholder="Ex.: Branco Neve"
          disabled={disabled}
          onChange={(e) => onChange({ colorName: e.target.value })}
        />
      </div>

      <div className="cf-hex">
        <label htmlFor={`${baseId}-hex`}>Cor</label>
        <div className="cf-hex-row">
          <input
            type="color"
            aria-label={`Escolher a cor da linha ${index + 1}`}
            value={hex ?? '#FFFFFF'}
            disabled={disabled}
            onChange={(e) => onChange({ colorHex: e.target.value.toUpperCase() })}
          />
          <input
            id={`${baseId}-hex`}
            value={row.colorHex}
            maxLength={7}
            placeholder="#F5F5F5"
            spellCheck={false}
            className={hexInvalid ? 'bad' : undefined}
            disabled={disabled}
            onChange={(e) => onChange({ colorHex: e.target.value })}
            onBlur={() => hex && hex !== row.colorHex && onChange({ colorHex: hex })}
          />
          {row.colorHex && (
            <button type="button" className="act icon" aria-label="Remover a cor" title="Remover a cor" disabled={disabled} onClick={() => onChange({ colorHex: '' })}>
              ✕
            </button>
          )}
        </div>
        {hexInvalid && <div className="msg">Use o formato #RRGGBB.</div>}
      </div>

      <div className="cf-swatch">
        <label htmlFor={`${baseId}-url`}>Amostra / textura (opcional)</label>
        <div className="cf-swatch-row">
          {row.swatchFile ? (
            <span className="cf-file" title={row.swatchFile.name}>
              {row.swatchFile.name}
            </span>
          ) : (
            <input
              id={`${baseId}-url`}
              value={row.swatchUrl}
              placeholder="https://… ou envie um arquivo"
              className={urlInvalid ? 'bad' : undefined}
              disabled={disabled}
              onChange={(e) => onChange({ swatchUrl: e.target.value })}
            />
          )}
          <label className={`act cf-upload${disabled ? ' off' : ''}`}>
            Enviar
            <input
              type="file"
              accept={ACCEPT}
              className="sr-only"
              disabled={disabled}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = '';
                if (file) onChange({ swatchFile: file });
              }}
            />
          </label>
          {(row.swatchFile || row.swatchUrl) && (
            <button
              type="button"
              className="act icon danger-text"
              aria-label="Remover a amostra"
              title="Remover a amostra"
              disabled={disabled}
              onClick={() => onChange({ swatchFile: null, swatchUrl: '' })}
            >
              ✕
            </button>
          )}
        </div>
        {urlInvalid && <div className="msg">Informe um endereço começando com http:// ou https://.</div>}
      </div>
    </div>
  );
}
