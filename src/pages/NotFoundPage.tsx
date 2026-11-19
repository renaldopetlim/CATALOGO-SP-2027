import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/StateMessage';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Página não encontrada');

  return (
    <EmptyState
      title="Página não encontrada"
      action={
        <Link to="/catalogo" className="chip">
          Ir para o catálogo
        </Link>
      }
    >
      O endereço acessado não existe ou foi alterado.
    </EmptyState>
  );
}
