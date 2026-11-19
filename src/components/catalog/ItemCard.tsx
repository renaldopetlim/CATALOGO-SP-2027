import { Link } from 'react-router-dom';
import { BADGE_LABELS, type CatalogItemWithCategory } from '../../types/catalog';
import { BrandLogo } from '../brand/BrandLogo';
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

  return (
    <Link to={to} state={state} preventScrollReset className="item-card" aria-label={`Ver detalhes: ${item.title}`}>
      <div className="item-media">
        <ItemImage src={item.image_url} alt="" />
        {item.badge && <span className="badge acc">{BADGE_LABELS[item.badge]}</span>}
      </div>
      <div className="item-body">
        <h3 className="item-title">{item.title}</h3>
        {item.brand && (
          <span className="item-brand">
            {item.brandInfo?.logo_url && <BrandLogo name={item.brand} logoUrl={item.brandInfo.logo_url} size="sm" decorative />}
            <span>{item.brand}</span>
          </span>
        )}
      </div>
    </Link>
  );
}
