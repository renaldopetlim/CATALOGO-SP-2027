import { Link, useNavigate } from 'react-router-dom';
import { ItemDetailModal } from '../components/catalog/ItemDetailModal';
import { ItemGrid } from '../components/catalog/ItemGrid';
import { SearchBar } from '../components/catalog/SearchBar';
import { EmptyState, ErrorState, SkeletonGrid } from '../components/ui/StateMessage';
import { PARAM, useCatalogParams } from '../hooks/useCatalogParams';
import { useCatalogItems } from '../hooks/useCatalogItems';
import { useCategories } from '../hooks/useCategories';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const FEATURED_LIMIT = 6;

export function HomePage() {
  useDocumentTitle(null);
  const navigate = useNavigate();
  const { buildSearch } = useCatalogParams();
  const categories = useCategories();
  const featured = useCatalogItems({ featured: true }, { pageSize: FEATURED_LIMIT });

  const goToSearch = (value: string) => {
    const query = value.trim();
    navigate(query ? `/catalogo?${new URLSearchParams({ [PARAM.search]: query }).toString()}` : '/catalogo');
  };

  return (
    <>
      <section className="hero" aria-labelledby="home-title">
        <h1 id="home-title">Catálogo 2027</h1>
        <p className="sub">Consulte produtos, códigos e preços da Distribuidora São Paulo.</p>
        <SearchBar value="" onSearch={goToSearch} live={false} submitLabel="Buscar no catálogo" />
      </section>

      <section className="section" aria-labelledby="home-cats">
        <div className="section-head">
          <h2 id="home-cats" className="section-title">
            Categorias
          </h2>
          <Link to="/catalogo" className="section-link">
            Ver todos os itens →
          </Link>
        </div>

        {categories.status === 'loading' && (
          <p className="state" role="status">
            Carregando categorias…
          </p>
        )}
        {categories.status === 'error' && <ErrorState error={categories.error} onRetry={categories.reload} />}
        {categories.status === 'success' && categories.categories.length === 0 && (
          <EmptyState title="Nenhuma categoria disponível">As categorias aparecerão aqui em breve.</EmptyState>
        )}
        {categories.status === 'success' && categories.categories.length > 0 && (
          <div className="cat-grid">
            {categories.categories.map((category) => (
              <Link
                key={category.id}
                to={`/catalogo?${new URLSearchParams({ [PARAM.category]: category.slug }).toString()}`}
                className="cat-card"
              >
                <b>{category.name}</b>
                {category.description && <span>{category.description}</span>}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="home-featured">
        <div className="section-head">
          <h2 id="home-featured" className="section-title">
            Destaques
          </h2>
          {featured.total > FEATURED_LIMIT && (
            <Link to="/catalogo" className="section-link">
              Ver mais →
            </Link>
          )}
        </div>

        {featured.status === 'loading' && <SkeletonGrid count={FEATURED_LIMIT} label="Carregando destaques…" />}
        {featured.status === 'error' && <ErrorState error={featured.error} onRetry={featured.reload} />}
        {featured.status === 'success' && featured.items.length === 0 && (
          <EmptyState
            title="Nenhum destaque no momento"
            action={
              <Link to="/catalogo" className="chip">
                Explorar o catálogo
              </Link>
            }
          />
        )}
        {featured.status === 'success' && featured.items.length > 0 && (
          <ItemGrid items={featured.items} linkFor={(item) => `/${buildSearch({ [PARAM.item]: item.id })}`} />
        )}
      </section>

      <ItemDetailModal loadedItems={featured.items} />
    </>
  );
}
