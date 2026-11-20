import type { ColorOption } from '../../lib/colors';
import { ColorSwatch } from './ColorSwatch';

type ColorStripProps = {
  colors: ColorOption[];
  /** Quantas amostras mostrar antes do "+N cores". */
  max?: number;
};

/** Mini paleta do card da vitrine: até `max` amostras + contador. */
export function ColorStrip({ colors, max = 7 }: ColorStripProps) {
  if (colors.length === 0) return null;
  const shown = colors.slice(0, max);
  const rest = colors.length - shown.length;
  const label = colors.length === 1 ? '1 cor disponível' : `${colors.length} cores disponíveis`;
  return (
    <span className="color-strip" role="img" aria-label={`${label}: ${colors.map((color) => color.name).join(', ')}`}>
      {shown.map((color) => (
        <ColorSwatch key={color.key} hex={color.hex} imageUrl={color.imageUrl} name={color.name} size="sm" decorative />
      ))}
      {rest > 0 && <span className="color-more">+{rest} {rest === 1 ? 'cor' : 'cores'}</span>}
    </span>
  );
}
