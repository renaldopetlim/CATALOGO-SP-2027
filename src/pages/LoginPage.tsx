import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { LoginRedirectState } from '../components/ProtectedRoute';
import { useAuth } from '../hooks/useAuth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { isServiceError } from '../lib/errors';
import { requestPasswordReset } from '../services/userService';

function redirectTarget(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const from = (state as LoginRedirectState).from;
    // Só aceita caminhos internos do admin.
    if (typeof from === 'string' && from.startsWith('/admin')) return from;
  }
  return '/admin';
}

function wantsForgot(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { forgot?: unknown }).forgot === true;
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
  const [forgot, setForgot] = useState(() => wantsForgot(location.state));
  const [resetSent, setResetSent] = useState(false);

  if (status === 'signed_in' && !submitting) return <Navigate to={target} replace />;

  const handleReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setResetSent(true);
    } catch (err) {
      setError(isServiceError(err) ? err.message : 'Não foi possível enviar o e-mail.');
    } finally {
      setSubmitting(false);
    }
  };

  if (forgot) {
    return (
      <div className="narrow">
        <h1>Esqueci minha senha</h1>
        <p className="sub">Informe o e-mail da sua conta. Enviaremos um link para definir uma nova senha.</p>
        {resetSent ? (
          <div className="state" role="status">
            <b>Verifique sua caixa de entrada</b>
            Se houver uma conta com {email.trim().toLowerCase()}, o link chega em alguns minutos. Abra-o neste mesmo navegador.
          </div>
        ) : (
          <form onSubmit={(event) => void handleReset(event)} noValidate>
            <fieldset disabled={submitting}>
              <legend>Recuperar acesso</legend>
              <div className="g">
                <div className="full">
                  <label htmlFor="reset-email">E-mail</label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="username"
                    inputMode="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={error ? 'bad' : undefined}
                  />
                </div>
              </div>
            </fieldset>
            <div className="bar">
              <button type="submit" className="pri" disabled={submitting}>
                {submitting ? 'Enviando…' : 'Enviar link'}
              </button>
            </div>
            <div id="st" role="status" className={error ? 'is-err' : undefined}>
              {error}
            </div>
          </form>
        )}
        <p className="login-alt">
          <button type="button" className="tb-link" onClick={() => { setForgot(false); setResetSent(false); setError(null); }}>
            ← Voltar para o login
          </button>
        </p>
      </div>
    );
  }

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
      <p className="sub">Entre com a sua conta para acessar o painel do catálogo.</p>

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
      <p className="login-alt">
        <button type="button" className="tb-link" onClick={() => { setForgot(true); setError(null); }}>
          Esqueci minha senha
        </button>
      </p>
    </div>
  );
}
