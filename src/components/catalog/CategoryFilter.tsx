import { Link } from 'react-router-dom';
import type { Category } from '../../types/catalog';

type CategoryFilterProps = {
  categories: Category[];
  /** Slug selecionado; `null` = "Todos". */
  selectedSlug: string | null;
  /** Monta o link de cada opção preservando a busca atual. */
  linkFor: (slug: string | null) => string;
};

/** Filtro por categoria em "chips". Links reais: funcionam com voltar/avançar e nova aba. */
export function CategoryFilter({ categories, selectedSlug, linkFor }: CategoryFilterProps) {
  const options: Array<{ slug: string | null; name: string }> = [
    { slug: null, name: 'Todos' },
    ...categories.map((category) => ({ slug: category.slug, name: category.name })),
  ];

  return (
    <nav aria-label="Categorias">
      <ul className="chips">
        {options.map((option) => (
          <li key={option.slug ?? '__all'}>
            <Link
              to={linkFor(option.slug)}
              className="chip"
              aria-current={option.slug === selectedSlug ? 'true' : undefined}
              preventScrollReset
            >
              {option.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
