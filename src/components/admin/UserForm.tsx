import { useId, useState, type FormEvent } from 'react';
import { isServiceError } from '../../lib/errors';
import {
  createRecoveryLink,
  createUser,
  grantAccess,
  saveUserAccess,
  setUserPassword,
  updateInvite,
} from '../../services/userService';
import { ROLE_INFO, presetPermissions, type CreateUserMode, type ManagedUser, type UserPermissions, type UserRole } from '../../types/users';
import { Drawer } from '../ui/Drawer';
import { PermissionEditor } from './PermissionEditor';

/** Mensagem de resultado para o toast da página. */
export type UserFormResult = { tone: 'ok' | 'warn'; message: string };

type UserFormProps = {
  /** `null` = novo usuário. */
  user: ManagedUser | null;
  /** id de quem está logado (não pode alterar o próprio acesso). */
  currentUserId: string | null;
  onSaved: (result: UserFormResult) => void;
  onCancel: () => void;
};

const MIN_PASSWORD = 8;

/** Cadastro de novo usuário e edição de permissões/status (gaveta lateral). */
export function UserForm({ user, currentUserId, onSaved, onCancel }: UserFormProps) {
  const formId = useId();
  const isNew = user === null;
  const isSelf = !!user?.id && user.id === currentUserId;

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<UserRole>(user?.role ?? 'editor');
  const [permissions, setPermissions] = useState<UserPermissions>(user?.role ? user.permissions : presetPermissions('editor'));
  const [isActive, setIsActive] = useState(user ? user.status !== 'blocked' : true);
  const [mode, setMode] = useState<CreateUserMode>('password');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = isNew
    ? 'Novo usuário'
    : user.status === 'no_access'
      ? 'Conceder acesso'
      : user.status === 'invited'
        ? 'Acesso pré-cadastrado'
        : 'Editar permissões';
  const subtitle = isNew
    ? 'Cadastre o acesso e escolha o que a pessoa pode fazer no painel.'
    : user.status === 'no_access'
      ? `${user.email} existe no Supabase Auth, mas ainda não tem acesso ao painel.`
      : user.status === 'invited'
        ? `${user.email} ainda não foi criado no Auth. As permissões são aplicadas quando a conta for criada.`
        : user.email;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (isNew && mode === 'password' && password.length < MIN_PASSWORD) {
      setError(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    setSaving(true);
    const access = { full_name: fullName, role, permissions, is_active: isActive };
    try {
      if (isNew) {
        const result = await createUser({ ...access, email, mode, password });
        if (result.kind === 'pending_manual') {
          onSaved({
            tone: 'warn',
            message: `Acesso de ${email.trim().toLowerCase()} pré-cadastrado. A função “admin-users” não está publicada: crie o usuário em Supabase → Authentication → Users → Add user com este e-mail; as permissões serão aplicadas automaticamente.`,
          });
        } else {
          onSaved({
            tone: 'ok',
            message:
              result.mode === 'invite'
                ? `Convite enviado para ${email.trim().toLowerCase()}. A pessoa define a senha pelo link do e-mail.`
                : result.mode === 'existing'
                  ? `${email.trim().toLowerCase()} já existia no Auth: o acesso foi aplicado à conta.`
                  : `Usuário ${email.trim().toLowerCase()} criado. Informe a senha à pessoa por um canal seguro.`,
          });
        }
      } else if (user.status === 'invited') {
        await updateInvite(user.email, access);
        onSaved({ tone: 'ok', message: `Acesso pré-cadastrado de ${user.email} atualizado.` });
      } else if (user.status === 'no_access' && user.id) {
        await grantAccess(user.id, access);
        onSaved({ tone: 'ok', message: `Acesso concedido a ${user.email}.` });
      } else if (user.id) {
        const result = await saveUserAccess(user.id, access, user.status === 'active');
        const statusText = result.authUpdated === null ? '' : isActive ? ' Acesso reativado.' : ' Acesso bloqueado.';
        const warn = result.authUpdated === false;
        onSaved({
          tone: warn ? 'warn' : 'ok',
          message: `Permissões de ${user.email} salvas.${statusText}${
            warn ? ' (O login no Supabase Auth não foi alterado: a função “admin-users” não está publicada. O painel já respeita o bloqueio.)' : ''
          }`,
        });
      }
    } catch (err) {
      setError(isServiceError(err) ? err.message : 'Não foi possível salvar.');
      setSaving(false);
    }
  };

  return (
    <Drawer
      title={title}
      subtitle={subtitle}
      onClose={onCancel}
      locked={saving}
      footer={
        <>
          {error && (
            <div className="drawer-error" role="alert">
              {error}
            </div>
          )}
          <button type="button" className="sec" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form={formId} className="pri" disabled={saving}>
            {saving ? 'Salvando…' : isNew ? 'Cadastrar usuário' : user.status === 'no_access' ? 'Conceder acesso' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void submit(event)} noValidate>
        <fieldset disabled={saving}>
          <legend>Pessoa</legend>
          <div className="g">
            <div className={isNew ? undefined : 'full'}>
              <label htmlFor="user-name">Nome</label>
              <input id="user-name" value={fullName} maxLength={120} autoComplete="off" onChange={(e) => setFullName(e.target.value)} />
            </div>
            {isNew && (
              <div>
                <label htmlFor="user-email">E-mail *</label>
                <input id="user-email" type="email" value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} />
              </div>
            )}
          </div>

          {isNew && (
            <div className="access-mode" role="radiogroup" aria-label="Como a pessoa entra">
              <label className="check">
                <input type="radio" name="mode" checked={mode === 'password'} onChange={() => setMode('password')} />
                Definir a senha agora
              </label>
              <label className="check">
                <input type="radio" name="mode" checked={mode === 'invite'} onChange={() => setMode('invite')} />
                Enviar convite por e-mail (a pessoa cria a senha)
              </label>
              {mode === 'password' && (
                <div className="access-password">
                  <label htmlFor="user-password">Senha inicial *</label>
                  <input
                    id="user-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    minLength={MIN_PASSWORD}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p className="hint">Pelo menos {MIN_PASSWORD} caracteres. A pessoa pode trocá-la depois em “Alterar minha senha”.</p>
                </div>
              )}
            </div>
          )}
        </fieldset>

        <fieldset disabled={saving}>
          <legend>Permissões</legend>
          {isSelf && (
            <p className="hint warn">Você não pode alterar o seu próprio perfil, permissões ou status. Peça a outro usuário com acesso a Usuários.</p>
          )}
          <PermissionEditor
            role={role}
            permissions={permissions}
            disabled={isSelf}
            onChange={(nextRole, nextPermissions) => {
              setRole(nextRole);
              setPermissions(nextPermissions);
              setError(null);
            }}
          />
          <p className="hint">
            Perfil atual: <strong>{ROLE_INFO[role].label}</strong>. Todos podem consultar o painel; as permissões liberam as alterações.
          </p>
        </fieldset>

        <fieldset disabled={saving || isSelf}>
          <legend>Status</legend>
          <label className="check access-toggle">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span>
              <b>{isActive ? 'Acesso ativo' : 'Acesso bloqueado'}</b>
              <span className="hint">
                {isActive
                  ? 'A pessoa entra no painel com as permissões acima.'
                  : 'Bloqueio imediato: a pessoa não vê nem altera nada no painel, mesmo com a sessão aberta.'}
              </span>
            </span>
          </label>
        </fieldset>
      </form>

      {!isNew && user.id && user.status !== 'invited' && <PasswordTools user={user} disabled={saving} />}
    </Drawer>
  );
}

/** Senha de outro usuário: definir uma nova ou gerar link de redefinição. */
function PasswordTools({ user, disabled }: { user: ManagedUser; disabled: boolean }) {
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'link' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const definePassword = async () => {
    if (!user.id) return;
    setBusy('password');
    setMessage(null);
    try {
      await setUserPassword(user.id, newPassword);
      setNewPassword('');
      setMessage({ tone: 'ok', text: 'Senha alterada. Informe a nova senha à pessoa por um canal seguro.' });
    } catch (err) {
      setMessage({ tone: 'err', text: isServiceError(err) ? err.message : 'Não foi possível alterar a senha.' });
    } finally {
      setBusy(null);
    }
  };

  const generateLink = async () => {
    setBusy('link');
    setMessage(null);
    setLink(null);
    try {
      setLink(await createRecoveryLink(user.email));
    } catch (err) {
      setMessage({ tone: 'err', text: isServiceError(err) ? err.message : 'Não foi possível gerar o link.' });
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setMessage({ tone: 'ok', text: 'Link copiado. Envie à pessoa; ele vale por tempo limitado e só uma vez.' });
    } catch {
      setMessage({ tone: 'err', text: 'Não foi possível copiar. Selecione o link e copie manualmente.' });
    }
  };

  return (
    <fieldset className="password-tools" disabled={disabled || busy !== null}>
      <legend>Senha</legend>
      <div className="password-row">
        <div>
          <label htmlFor="user-new-password">Definir nova senha</label>
          <input
            id="user-new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            minLength={MIN_PASSWORD}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <button type="button" className="sec" disabled={newPassword.length < MIN_PASSWORD} onClick={() => void definePassword()}>
          {busy === 'password' ? 'Salvando…' : 'Definir senha'}
        </button>
      </div>
      <div className="password-row">
        <p className="hint">Ou gere um link para a própria pessoa criar a senha (envie por WhatsApp ou e-mail).</p>
        <button type="button" className="sec" onClick={() => void generateLink()}>
          {busy === 'link' ? 'Gerando…' : 'Gerar link de redefinição'}
        </button>
      </div>
      {link && (
        <div className="recovery-link">
          <input readOnly value={link} aria-label="Link de redefinição" onFocus={(e) => e.target.select()} />
          <button type="button" className="pri btn-sm" onClick={() => void copy()}>
            Copiar
          </button>
        </div>
      )}
      {message && (
        <p className={message.tone === 'ok' ? 'hint txt-ok' : 'msg'} role="status">
          {message.text}
        </p>
      )}
    </fieldset>
  );
}
