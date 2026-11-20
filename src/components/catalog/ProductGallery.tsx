import { useEffect, useEffectEvent, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { ItemImage } from './ItemImage';

type ProductGalleryProps = {
  images: readonly string[];
  /** Nome do produto (texto alternativo das fotos). */
  title: string;
  /** Sobreposição no canto da foto (ex.: selo "Lançamento"). */
  overlay?: ReactNode;
};

const SWIPE_PX = 40;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * Galeria dos detalhes do produto: foto grande com transição suave, setas,
 * contador, miniaturas clicáveis, teclado (← →) e deslizar no celular.
 */
export function ProductGallery({ images, title, overlay }: ProductGalleryProps) {
  const [index, setIndex] = useState(0);
  const pointerStart = useRef<number | null>(null);
  const total = images.length;
  const current = Math.min(index, Math.max(total - 1, 0));
  const multiple = total > 1;

  const go = (next: number) => setIndex(((next % total) + total) % total);

  // Setas do teclado enquanto os detalhes estão abertos (fora de campos de texto).
  const onArrow = useEffectEvent((event: KeyboardEvent) => {
    if (isTyping(event.target)) return;
    if (event.key === 'ArrowRight') go(current + 1);
    else if (event.key === 'ArrowLeft') go(current - 1);
  });
  useEffect(() => {
    if (!multiple) return undefined;
    const onKey = (event: KeyboardEvent) => onArrow(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [multiple]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') pointerStart.current = event.clientX;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (start === null || !multiple) return;
    const delta = event.clientX - start;
    if (Math.abs(delta) >= SWIPE_PX) go(current + (delta < 0 ? 1 : -1));
  };

  return (
    <div className="product-gallery" role={multiple ? 'region' : undefined} aria-label={multiple ? `Fotos de ${title}` : undefined}>
      <div className="item-media gallery-main" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <div className="gallery-frame" key={images[current] ?? 'vazio'}>
          <ItemImage src={images[current] ?? null} alt={multiple ? `${title} — foto ${current + 1} de ${total}` : title} loading="eager" />
        </div>
        {overlay}
        {multiple && (
          <>
            <button type="button" className="gallery-nav prev" aria-label="Foto anterior" onClick={() => go(current - 1)}>
              ‹
            </button>
            <button type="button" className="gallery-nav next" aria-label="Próxima foto" onClick={() => go(current + 1)}>
              ›
            </button>
            <span className="gallery-counter" aria-live="polite">
              {current + 1}/{total}
            </span>
          </>
        )}
      </div>

      {multiple && (
        <div className="gallery-thumbs" role="group" aria-label="Miniaturas">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              className={`gallery-thumb-btn${i === current ? ' on' : ''}`}
              aria-label={`Ver foto ${i + 1} de ${total}`}
              aria-current={i === current ? 'true' : undefined}
              onClick={() => setIndex(i)}
            >
              <ItemImage src={src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
