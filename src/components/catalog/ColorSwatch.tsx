import type { CSSProperties } from 'react';

type ColorSwatchProps = {
  /** `#RRGGBB` ou `null`. */
  hex: string | null;
  /** Amostra/textura: tem prioridade sobre a cor lisa. */
  imageUrl?: string | null;
  /** Nome da cor (rótulo acessível e dica). */
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Decorativa: o nome já aparece em texto ao lado. */
  decorative?: boolean;
};

/** Amostra circular de cor (lisa ou com imagem de textura). */
export function ColorSwatch({ hex, imageUrl = null, name, size = 'md', decorative = false }: ColorSwatchProps) {
  const style: CSSProperties = imageUrl
    ? { backgroundImage: `url("${imageUrl.replace(/"/g, '%22')}")`, backgroundColor: hex ?? undefined }
    : { backgroundColor: hex ?? undefined };
  const empty = !hex && !imageUrl;
  return (
    <span
      className={`swatch swatch-${size}${empty ? ' empty' : ''}`}
      style={style}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name, title: name })}
    />
  );
}
