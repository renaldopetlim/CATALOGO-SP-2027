import type { ColorOption } from '../../lib/colors';
import { ColorSwatch } from './ColorSwatch';

type ColorPickerProps = {
  colors: ColorOption[];
  /** `key` da cor escolhida, ou `null`. */
  selected: string | null;
  onSelect: (key: string | null) => void;
};

/**
 * Seletor de cores dos detalhes do produto: amostras com borda na escolhida,
 * nome no hover/foco e, abaixo, o(s) código(s) correspondente(s).
 */
export function ColorPicker({ colors, selected, onSelect }: ColorPickerProps) {
  const current = colors.find((color) => color.key === selected) ?? null;

  return (
    <div className="color-picker">
      <span className="label">
        {colors.length === 1 ? 'Cor disponível' : `Cores disponíveis (${colors.length})`}
      </span>
      <div className="color-grid" role="group" aria-label="Escolha uma cor">
        {colors.map((color) => {
          const on = color.key === selected;
          return (
            <button
              key={color.key}
              type="button"
              className={`color-option${on ? ' on' : ''}`}
              aria-pressed={on}
              title={color.name}
              onClick={() => onSelect(on ? null : color.key)}
            >
              <ColorSwatch hex={color.hex} imageUrl={color.imageUrl} name={color.name} size="lg" decorative />
              <span className="color-option-name">{color.name}</span>
            </button>
          );
        })}
      </div>

      {current ? (
        <div className="color-selected" aria-live="polite">
          <ColorSwatch hex={current.hex} imageUrl={current.imageUrl} name={current.name} size="md" decorative />
          <div>
            <strong>{current.name}</strong>
            {current.hex && <span className="cell-sub">{current.hex}</span>}
            <ul>
              {current.codes.map((code) => (
                <li key={code.id}>
                  <span className="code-cell">{code.code}</span>
                  {code.description && <span> · {code.description}</span>}
                  {code.packaging && <span> · {code.packaging}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="hint" aria-live="polite">
          Toque numa cor para ver o código e a embalagem.
        </p>
      )}
    </div>
  );
}
