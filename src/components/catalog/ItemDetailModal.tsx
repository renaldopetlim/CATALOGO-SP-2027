import { useLocation, useNavigate } from 'react-router-dom';
import { useItemDetail } from '../../hooks/useItemDetail';
import { useCatalogParams } from '../../hooks/useCatalogParams';
import { BADGE_LABELS, type CatalogItemWithCategory } from '../../types/catalog';
import { Modal } from '../ui/Modal';
import { ErrorState } from '../ui/StateMessage';
import { BrandLogo } from '../brand/BrandLogo';
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
 * Mostra imagem, selo, título, marca, ficha técnica e o bloco de códigos
 * (Código · Descrição · Embalagem). As tags de busca não são exibidas.
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
    <Modal title={item?.title ?? 'Detalhes do produto'} onClose={close} size="wide">
      {status === 'loading' && (
        <p className="state" role="status">
          Carregando detalhes…
        </p>
      )}

      {status === 'error' && (
        <ErrorState
          error={error}
          title={error?.kind === 'not_found' ? 'Produto indisponível' : 'Não foi possível carregar'}
          onRetry={error?.kind === 'not_found' ? undefined : reload}
        />
      )}

      {status === 'success' && item && (
        <article className="detail">
          <div className="item-media">
            <ItemImage src={item.image_url} alt={item.title} loading="eager" />
            {item.badge && <span className="badge acc">{BADGE_LABELS[item.badge]}</span>}
          </div>

          <div className="detail-info">
            <span className="label">{item.category.name}</span>
            <h2 className="detail-title">{item.title}</h2>
            {item.brand && (
              <span className="detail-brand">
                {item.brandInfo?.logo_url && <BrandLogo name={item.brand} logoUrl={item.brandInfo.logo_url} size="md" decorative />}
                <span>
                  Marca: <strong>{item.brand}</strong>
                </span>
              </span>
            )}

            {item.specifications.length > 0 && (
              <div className="specs">
                <span className="label">Ficha técnica</span>
                <dl>
                  {item.specifications.map((spec, index) => (
                    <div key={`${spec.label}-${index}`} className={spec.label ? undefined : 'no-label'}>
                      {spec.label && <dt>{spec.label}</dt>}
                      <dd>{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          {item.codes.length > 0 && (
            <div className="detail-codes">
              <span className="label">
                {item.codes.length === 1 ? 'Código' : `Códigos disponíveis (${item.codes.length})`}
              </span>
              <div className="codes-scroll">
                <table className="codes-table">
                  <thead>
                    <tr>
                      <th scope="col">Código</th>
                      <th scope="col">Descrição</th>
                      <th scope="col">Embalagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.codes.map((code) => (
                      <tr key={code.id}>
                        <td className="code-cell">{code.code}</td>
                        <td>{code.description ?? '—'}</td>
                        <td>{code.packaging ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </article>
      )}
    </Modal>
  );
}
