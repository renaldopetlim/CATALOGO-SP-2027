import { useLocation, useNavigate } from 'react-router-dom';
import { useItemDetail } from '../../hooks/useItemDetail';
import { useCatalogParams } from '../../hooks/useCatalogParams';
import { formatPrice } from '../../lib/format';
import type { CatalogItemWithCategory } from '../../types/catalog';
import { Modal } from '../ui/Modal';
import { ErrorState } from '../ui/StateMessage';
import { ItemImage } from './ItemImage';
import type { ItemLinkState } from './ItemCard';

function isItemLinkState(value: unknown): value is ItemLinkState {
  return typeof value === 'object' && value !== null && (value as Partial<ItemLinkState>).fromList === true;
}

type ItemDetailModalProps = {
  /** Itens já carregados na página, para abrir o modal sem nova requisição. */
  loadedItems?: CatalogItemWithCategory[];
};

/**
 * Modal de detalhes controlado pelo parâmetro `?item=<id>` da URL.
 * Fechar mantém categoria e busca intactas.
 */
export function ItemDetailModal({ loadedItems = [] }: ItemDetailModalProps) {
  const { itemId, closeItem } = useCatalogParams();
  const location = useLocation();
  const navigate = useNavigate();

  const initial = itemId ? (loadedItems.find((item) => item.id === itemId) ?? null) : null;
  const { item, status, error, reload } = useItemDetail(itemId, initial);

  if (!itemId) return null;

  // Aberto por clique na lista → volta no histórico (o "voltar" do navegador também fecha).
  // Aberto por link direto → remove apenas o parâmetro `item`.
  const close = () => {
    if (isItemLinkState(location.state)) navigate(-1);
    else closeItem();
  };

  return (
    <Modal title={item?.title ?? 'Detalhes do item'} onClose={close} size="wide">
      {status === 'loading' && (
        <p className="state" role="status">
          Carregando detalhes…
        </p>
      )}

      {status === 'error' && (
        <ErrorState
          error={error}
          title={error?.kind === 'not_found' ? 'Item indisponível' : 'Não foi possível carregar'}
          onRetry={error?.kind === 'not_found' ? undefined : reload}
        />
      )}

      {status === 'success' && item && (
        <article className="detail">
          <div className="item-media">
            <ItemImage src={item.image_url} alt={item.title} loading="eager" />
            {item.is_featured && <span className="badge acc">Destaque</span>}
          </div>

          <div className="detail-info">
            <span className="label">{item.category.name}</span>
            <h2 className="detail-title">{item.title}</h2>
            {item.sku && <span className="item-sku">SKU {item.sku}</span>}
            <span className={`price${item.price === null ? ' on-request' : ''}`}>{formatPrice(item.price)}</span>
            {item.short_description && <p className="detail-text">{item.short_description}</p>}
            {item.tags.length > 0 && (
              <ul className="tags" aria-label="Tags">
                {item.tags.map((tag) => (
                  <li key={tag} className="tag">
                    {tag}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {item.detailed_description && (
            <div className="detail-desc">
              <span className="label">Descrição</span>
              <p className="detail-text mut">{item.detailed_description}</p>
            </div>
          )}
        </article>
      )}
    </Modal>
  );
}
