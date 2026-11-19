import { Link } from 'react-router-dom';
import { CategoryFilter } from '../components/catalog/CategoryFilter';
import { ItemDetailModal } from '../components/catalog/ItemDetailModal';
import { ItemGrid } from '../components/catalog/ItemGrid';
import { SearchBar } from '../components/catalog/SearchBar';
import { LiveIndicator } from '../components/ui/LiveIndicator';
import { EmptyState, ErrorState, SkeletonGrid } from '../components/ui/StateMessage';
import { PARAM, useCatalogParams } from '../hooks/useCatalogParams';
import { useCatalogItems } from '../hooks/useCatalogItems';
import { useCategories } from '../hooks/useCategories';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const PATH = '/catalogo';

export function CatalogPage() {
  const { categorySlug, search, setSearch, buildSearch } = useCatalogParams();
  const categories = useCategories();

  // Resolve o slug da URL para o ID da categoria.
  const selectedCategory = categorySlug
    ? (categories.categories.find((category) => category.slug === categorySlug) ?? null)
    : null;
  const categoryResolved = !categorySlug || categories.status === 'success';
  const categoryNotFound = Boolean(categorySlug) && categories.status === 'success' && !selectedCategory;

  const items = useCatalogItems(
    { categoryId: selectedCategory?.id ?? null, search },
    { enabled: categoryResolved && !categoryNotFound },
  );

  useDocumentTitle(selectedCategory ? selectedCategory.name : 'Catálogo');

  const linkForCategory = (slug: string | null) =>
    `${PATH}${buildSearch({ [PARAM.category]: slug, [PARAM.item]: null })}`;
  const linkForItem = (id: string) => `${PATH}${buildSearch({ [PARAM.item]: id })}`;
  const clearSearchLink = `${PATH}${buildSearch({ [PARAM.search]: null, [PARAM.item]: null })}`;

  // Mensagem da lista vazia conforme o contexto (busca, categoria ou catálogo inteiro).
  const emptyState = search
    ? { title: 'Nenhum item encontrado', text: 'Tente outras palavras ou verifique a grafia.' }
    : selectedCategory
      ? { title: 'Nenhum item nesta categoria', text: 'Esta categoria ainda não possui itens.' }
      : { title: 'Nenhum item disponível', text: 'O catálogo ainda não possui itens. Volte em breve.' };

  const waitingCategory = Boolean(categorySlug) && categories.status === 'loading';

  return (
    <>
      <h1>{selectedCategory ? selectedCategory.name : 'Catálogo'}</h1>
      <p className="sub">
        {selectedCategory?.description ?? 'Filtre por categoria ou busque por nome, SKU, descrição ou tag.'}
      </p>

      <SearchBar value={search} onSearch={setSearch} />

      {categories.status === 'success' && (
        <CategoryFilter
          categories={categories.categories}
          selectedSlug={selectedCategory ? selectedCategory.slug : null}
          linkFor={linkForCategory}
        />
      )}
      {categories.status === 'error' && (
        <div className="section">
          <ErrorState error={categories.error} title="Não foi possível carregar as categorias" onRetry={categories.reload} />
        </div>
      )}

      <div aria-live="polite">
        {items.status === 'success' && !categoryNotFound && (
          <p className="result-info">
            {items.total === 1 ? '1 item encontrado' : `${items.total.toLocaleString('pt-BR')} itens encontrados`}
            {search && <> para “{search}”</>}
            <LiveIndicator />
          </p>
        )}
      </div>

      <section className={items.status === 'success' && !categoryNotFound ? undefined : 'section'}>
        {categoryNotFound && (
          <EmptyState
            title="Categoria não encontrada"
            action={
              <Link to={linkForCategory(null)} className="chip">
                Ver todas as categorias
              </Link>
            }
          >
            Ela pode ter sido removida ou estar indisponível.
          </EmptyState>
        )}

        {!categoryNotFound && (waitingCategory || items.status === 'loading') && <SkeletonGrid />}

        {!categoryNotFound && !waitingCategory && items.status === 'error' && (
          <ErrorState error={items.error} onRetry={items.reload} />
        )}

        {!categoryNotFound && items.status === 'success' && items.items.length === 0 && (
          <EmptyState
            title={emptyState.title}
            action={
              <>
                {search && (
                  <Link to={clearSearchLink} className="chip">
                    Limpar busca
                  </Link>
                )}
                {selectedCategory && (
                  <Link to={linkForCategory(null)} className="chip">
                    Ver todas as categorias
                  </Link>
                )}
              </>
            }
          >
            {emptyState.text}
          </EmptyState>
        )}

        {!categoryNotFound && items.status === 'success' && items.items.length > 0 && (
          <>
            <ItemGrid items={items.items} linkFor={(item) => linkForItem(item.id)} />

            {items.loadMoreError && (
              <div className="section">
                <ErrorState error={items.loadMoreError} title="Não foi possível carregar mais itens" onRetry={items.loadMore} />
              </div>
            )}

            {items.hasMore && !items.loadMoreError && (
              <div className="load-more">
                <button type="button" className="sec" onClick={items.loadMore} disabled={items.loadingMore}>
                  {items.loadingMore
                    ? 'Carregando…'
                    : `Carregar mais (${(items.total - items.items.length).toLocaleString('pt-BR')} restantes)`}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <ItemDetailModal loadedItems={items.items} />
    </>
  );
}
