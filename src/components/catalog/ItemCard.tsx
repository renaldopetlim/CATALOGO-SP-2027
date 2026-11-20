import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { BADGE_LABELS, itemImages, type CatalogItemWithCategory } from '../../types/catalog';
import { colorOptions } from '../../lib/colors';
import { BrandLogo } from '../brand/BrandLogo';
import { ColorStrip } from './ColorStrip';
import { ItemImage } from './ItemImage';

/** Estado enviado ao abrir o modal a partir de uma lista (permite fechar com "voltar"). */
export type ItemLinkState = { fromList: true };

type ItemCardProps = {
  item: CatalogItemWithCategory;
  /** Link para abrir o modal, preservando os filtros atuais (ex.: `?categoria=x&item=id`). */
  to: string;
};

/**
 * Card da vitrine: imagem, selo opcional, título e marca (com logo, quando houver).
 * Códigos, ficha técnica e categoria ficam nos detalhes; tags nunca aparecem.
 */
export function ItemCard({ item, to }: ItemCardProps) {
  const state: ItemLinkState = { fromList: true };
  const images = itemImages(item);
  const multiple = images.length > 1;
  // Folhear no hover: a posição do mouse na foto escolhe a imagem (capa ao sair).
  const [shown, setShown] = useState(0);
  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / Math.max(rect.width, 1);
    setShown(Math.min(images.length - 1, Math.max(0, Math.floor(ratio * images.length))));
  };
  const current = Math.min(shown, Math.max(images.length - 1, 0));
  // Paleta só nas categorias com cores (ex.: Tintas e Complementos).
  const colors = item.category.has_color_swatches ? colorOptions(item.codes) : [];

  return (
    <Link to={to} state={state} preventScrollReset className="item-card" aria-label={`Ver detalhes: ${item.title}`}>
      <div className="item-media" onMouseMove={multiple ? onMove : undefined} onMouseLeave={multiple ? () => setShown(0) : undefined}>
        <ItemImage src={images[current] ?? null} alt="" />
        {item.badge && <span className="badge acc">{BADGE_LABELS[item.badge]}</span>}
        {multiple && (
          <>
            <span className="photo-count">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M4 7h3l2-3h6l2 3h3v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
              </svg>
              <span aria-hidden="true">
                {current + 1}/{images.length}
              </span>
              <span className="sr-only">{images.length} fotos</span>
            </span>
            <span className="photo-dots" aria-hidden="true">
              {images.map((src, i) => (
                <span key={src} className={i === current ? 'on' : undefined} />
              ))}
            </span>
          </>
        )}
      </div>
      <div className="item-body">
        <h3 className="item-title">{item.title}</h3>
        {item.brand && (
          <span className="item-brand">
            {item.brandInfo?.logo_url && <BrandLogo name={item.brand} logoUrl={item.brandInfo.logo_url} size="sm" decorative />}
            <span>{item.brand}</span>
          </span>
        )}
        {colors.length > 0 && <ColorStrip colors={colors} />}
      </div>
    </Link>
  );
}
