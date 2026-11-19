import { Link } from 'react-router-dom';
import { formatPrice } from '../../lib/format';
import type { CatalogItemWithCategory } from '../../types/catalog';
import { ItemImage } from './ItemImage';

/** Estado enviado ao abrir o modal a partir de uma lista (permite fechar com "voltar"). */
export type ItemLinkState = { fromList: true };

type ItemCardProps = {
  item: CatalogItemWithCategory;
  /** Link para abrir o modal, preservando os filtros atuais (ex.: `?categoria=x&item=id`). */
  to: string;
};

export function ItemCard({ item, to }: ItemCardProps) {
  const state: ItemLinkState = { fromList: true };

  return (
    <Link to={to} state={state} preventScrollReset className="item-card" aria-label={`Ver detalhes: ${item.title}`}>
      <div className="item-media">
        <ItemImage src={item.image_url} alt="" />
        {item.is_featured && <span className="badge acc">Destaque</span>}
      </div>
      <div className="item-body">
        <span className="label">{item.category.name}</span>
        <h3 className="item-title">{item.title}</h3>
        {item.sku && <span className="item-sku">SKU {item.sku}</span>}
        <span className={`price${item.price === null ? ' on-request' : ''}`}>{formatPrice(item.price)}</span>
      </div>
    </Link>
  );
}
