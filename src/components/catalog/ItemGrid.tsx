import type { CatalogItemWithCategory } from '../../types/catalog';
import { ItemCard } from './ItemCard';

type ItemGridProps = {
  items: CatalogItemWithCategory[];
  /** Monta o link de cada item preservando os parâmetros da página atual. */
  linkFor: (item: CatalogItemWithCategory) => string;
};

export function ItemGrid({ items, linkFor }: ItemGridProps) {
  return (
    <div className="grid">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} to={linkFor(item)} />
      ))}
    </div>
  );
}
