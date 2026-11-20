import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { isServiceError } from '../lib/errors';
import { recoveryOutcome } from '../lib/recovery';
import { updateOwnPassword } from '../services/userService';

const MIN = 8;

/**
 * Definir nova senha: aberta pelo link de recuperação (e-mail ou link gerado
 * pelo painel) ou por quem está logado e quer trocar a própria senha.
 */
export function NewPasswordPage() {
  useDocumentTitle('Nova senha');
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (status === 'loading') {
    return (
      <div className="narrow">
        <p className="state" role="status">
          Verificando o link…
        </p>
      </div>
    );
  }

  if (status === 'signed_out') {
    const failed = recoveryOutcome() === 'failed';
    return (
      <div className="narrow">
        <h1>{failed ? 'Link inválido ou expirado' : 'Nova senha'}</h1>
        <p className="sub">
          {failed
            ? 'O link de redefinição já foi usado, expirou ou foi aberto num navegador diferente de onde foi pedido. Peça um novo.'
            : 'Para definir uma nova senha, abra o link de redefinição recebido ou peça um novo na tela de login.'}
        </p>
        <div className="bar">
          <Link to="/login" state={{ forgot: true }} className="pri btn-link">
            Pedir um novo link
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (password.length < MIN) {
      setError(`A senha precisa ter pelo menos ${MIN} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError('As duas senhas não são iguais.');
      return;
    }
    setSaving(true);
    try {
      await updateOwnPassword(password);
      setDone(true);
    } catch (err) {
      setError(isServiceError(err) ? err.message : 'Não foi possível alterar a senha.');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="narrow">
        <h1>Senha alterada</h1>
        <p className="sub">A nova senha já vale para os próximos acessos.</p>
        <div className="bar">
          <button type="button" className="pri" onClick={() => navigate('/admin', { replace: true })}>
            Ir para o painel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="narrow">
      <h1>Nova senha</h1>
      <p className="sub">Defina a nova senha da conta {user?.email}.</p>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <fieldset disabled={saving}>
          <legend>Senha</legend>
          <div className="g">
            <div className="full">
              <label htmlFor="new-password">Nova senha</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={MIN}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={error ? 'bad' : undefined}
              />
              <p className="hint">Pelo menos {MIN} caracteres. Misture letras e números.</p>
            </div>
            <div className="full">
              <label htmlFor="confirm-password">Repita a nova senha</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className={error ? 'bad' : undefined}
              />
            </div>
          </div>
        </fieldset>
        <div className="bar">
          <button type="submit" className="pri" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </div>
        <div id="st" role="status" className={error ? 'is-err' : undefined}>
          {error}
        </div>
      </form>
    </div>
  );
}
