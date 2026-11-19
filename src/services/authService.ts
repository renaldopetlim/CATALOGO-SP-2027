import type { AuthError, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ServiceError, toServiceError } from '../lib/errors';

/** Traduz erros do Supabase Auth para mensagens em português. */
function fromAuthError(error: AuthError): ServiceError {
  const opts = { code: error.code ?? String(error.status ?? ''), details: error.message, cause: error };

  switch (error.code) {
    case 'invalid_credentials':
      return new ServiceError('auth', 'E-mail ou senha incorretos.', opts);
    case 'email_not_confirmed':
      return new ServiceError('auth', 'E-mail ainda não confirmado. Verifique sua caixa de entrada.', opts);
    case 'user_banned':
      return new ServiceError('permission', 'Este usuário está bloqueado.', opts);
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return new ServiceError('auth', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.', opts);
    default:
      break;
  }

  if (error.status === 429) {
    return new ServiceError('auth', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.', opts);
  }
  if (/fetch|network/i.test(error.message)) {
    return new ServiceError('network', 'Sem conexão com o servidor. Verifique a internet e tente novamente.', opts);
  }
  return new ServiceError('auth', 'Não foi possível entrar. Tente novamente.', opts);
}

export async function signIn(email: string, password: string): Promise<Session> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new ServiceError('validation', 'Informe e-mail e senha.');
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) throw fromAuthError(error);
    return data.session;
  } catch (error) {
    throw toServiceError(error, 'entrar');
  }
}

export async function signOut(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw fromAuthError(error);
  } catch (error) {
    throw toServiceError(error, 'sair');
  }
}

export async function getCurrentSession(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw fromAuthError(error);
    return data.session;
  } catch (error) {
    throw toServiceError(error, 'verificar a sessão');
  }
}

/** Consulta a função `is_admin()` do banco (usuário logado está em `admin_users`?). */
export async function checkIsAdmin(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_admin');
    if (error) throw error;
    return data === true;
  } catch (error) {
    throw toServiceError(error, 'verificar a permissão de administrador');
  }
}
