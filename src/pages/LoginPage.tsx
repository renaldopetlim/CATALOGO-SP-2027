import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { LoginRedirectState } from '../components/ProtectedRoute';
import { useAuth } from '../hooks/useAuth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { isServiceError } from '../lib/errors';

function redirectTarget(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const from = (state as LoginRedirectState).from;
    // Só aceita caminhos internos do admin.
    if (typeof from === 'string' && from.startsWith('/admin')) return from;
  }
  return '/admin';
}

export function LoginPage() {
  useDocumentTitle('Entrar');
  const { status, signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const target = redirectTarget(location.state);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'signed_in' && !submitting) return <Navigate to={target} replace />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(isServiceError(err) ? err.message : 'Não foi possível entrar. Tente novamente.');
      setSubmitting(false);
    }
  };

  return (
    <div className="narrow">
      <h1>Área administrativa</h1>
      <p className="sub">Entre com sua conta de administrador para gerenciar o catálogo.</p>

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <fieldset disabled={submitting}>
          <legend>Acesso</legend>
          <div className="g">
            <div className="full">
              <label htmlFor="login-email">E-mail</label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={error ? 'bad' : undefined}
              />
            </div>
            <div className="full">
              <label htmlFor="login-password">Senha</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={error ? 'bad' : undefined}
              />
            </div>
          </div>
        </fieldset>

        <div className="bar">
          <button type="submit" className="pri" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
        <div id="st" role="status" className={error ? 'is-err' : undefined}>
          {error}
        </div>
      </form>
    </div>
  );
}
