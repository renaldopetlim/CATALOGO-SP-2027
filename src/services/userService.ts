import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError, type AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ServiceError, toServiceError } from '../lib/errors';
import type { Json } from '../types/database';
import {
  isUserRole,
  parsePermissions,
  type CreateUserInput,
  type CreateUserResult,
  type ManagedUser,
  type UpdateUserPermissionsInput,
  type UserAccountStatus,
  type UserProfile,
} from '../types/users';

/**
 * Usuários do painel.
 *
 * Segurança: criar usuário, definir senha de outra pessoa e bloquear o LOGIN
 * exigem a chave secreta (service_role) do Supabase. Ela NUNCA vai para o
 * navegador: essas ações passam pela Edge Function `admin-users`
 * (`supabase/functions/admin-users`), que confere no banco se quem chama tem
 * `can_manage_users`. O resto (perfil, permissões, status) é gravado direto
 * na tabela `user_profiles`, protegida por RLS e triggers.
 */

const FUNCTION_NAME = 'admin-users';
const MIN_PASSWORD = 8;

/** Endereço público do site (para links de e-mail), ex.: https://…/CATALOGO-SP-2027/ */
export function siteBaseUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

/* ==========================================================================
   PERFIL DO USUÁRIO LOGADO
   ========================================================================== */

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  permissions: Json;
  created_at: string;
  updated_at: string;
};

function toProfile(row: ProfileRow): UserProfile {
  return {
    ...row,
    role: isUserRole(row.role) ? row.role : 'viewer',
    permissions: parsePermissions(row.permissions),
  };
}

/** Perfil de quem está logado (`null` = sem acesso ao painel). */
export async function getMyProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data ? toProfile(data) : null;
  } catch (error) {
    throw toServiceError(error, 'verificar suas permissões');
  }
}

/* ==========================================================================
   LISTAGEM
   ========================================================================== */

function toStatus(value: string): UserAccountStatus {
  return value === 'active' || value === 'blocked' || value === 'invited' ? value : 'no_access';
}

/** Usuários do Auth com perfil, sem perfil e convites pendentes. */
export async function listUsers(): Promise<ManagedUser[]> {
  try {
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) throw error;
    return data.map((row) => ({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: isUserRole(row.role) ? row.role : null,
      isActive: row.is_active,
      permissions: parsePermissions(row.permissions),
      status: toStatus(row.status),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSignInAt: row.last_sign_in_at,
      emailConfirmed: row.email_confirmed,
      banned: row.banned,
    }));
  } catch (error) {
    throw toServiceError(error, 'carregar os usuários');
  }
}

/* ==========================================================================
   EDGE FUNCTION
   ========================================================================== */

type FunctionResult = { [key: string]: Json | undefined };

/** A função não foi publicada no projeto (404) ou não responde. */
export class FunctionUnavailableError extends ServiceError {
  constructor() {
    super(
      'unknown',
      'A função "admin-users" não está publicada no Supabase. Veja docs/USUARIOS.md para publicá-la.',
      { code: 'function_unavailable' },
    );
  }
}

async function callAdminFunction(body: Record<string, Json>): Promise<FunctionResult> {
  const { data, error } = await supabase.functions.invoke<FunctionResult>(FUNCTION_NAME, { body });
  if (!error) return data ?? {};

  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    if (response.status === 404) throw new FunctionUnavailableError();
    let message = 'A operação foi recusada.';
    try {
      const payload: unknown = await response.json();
      if (typeof payload === 'object' && payload !== null && typeof (payload as { error?: unknown }).error === 'string') {
        message = (payload as { error: string }).error;
      }
    } catch {
      // corpo não é JSON: mantém a mensagem padrão
    }
    const kind = response.status === 401 ? 'auth' : response.status === 403 ? 'permission' : 'validation';
    throw new ServiceError(kind, message, { code: String(response.status) });
  }
  if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
    throw new FunctionUnavailableError();
  }
  throw toServiceError(error, 'executar a operação de usuários');
}

/* ==========================================================================
   CADASTRO E ALTERAÇÕES
   ========================================================================== */

function cleanName(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * Novo usuário:
 * 1. grava o acesso pré-cadastrado (`user_invites`: nome, papel, permissões);
 * 2. pede à Edge Function para criar o usuário no Auth (com senha ou convite
 *    por e-mail). O trigger do banco transforma o convite em perfil.
 * Sem a Edge Function, o acesso fica pré-cadastrado: ao criar o usuário em
 * Authentication → Users no Dashboard, as permissões são aplicadas sozinhas.
 */
export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ServiceError('validation', 'Informe um e-mail válido.');
  if (input.mode === 'password' && (input.password ?? '').length < MIN_PASSWORD) {
    throw new ServiceError('validation', `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  }

  try {
    const { error } = await supabase.from('user_invites').upsert({
      email,
      full_name: cleanName(input.full_name),
      role: input.role,
      is_active: input.is_active,
      permissions: input.permissions,
    });
    if (error) throw error;
  } catch (error) {
    throw toServiceError(error, 'cadastrar o acesso');
  }

  try {
    const result = await callAdminFunction({
      action: 'create',
      email,
      ...(input.mode === 'password' ? { password: input.password ?? '' } : { redirect_to: `${siteBaseUrl()}?recuperar=1` }),
    });
    const mode = result.mode === 'password' || result.mode === 'invite' || result.mode === 'existing' ? result.mode : input.mode;
    return { kind: 'created', userId: typeof result.user_id === 'string' ? result.user_id : null, mode };
  } catch (error) {
    if (error instanceof FunctionUnavailableError) return { kind: 'pending_manual' };
    throw error;
  }
}

/** Concede acesso a quem já existe no Auth, mas ainda não tem perfil. */
export async function grantAccess(userId: string, input: UpdateUserPermissionsInput): Promise<void> {
  try {
    const { error } = await supabase.from('user_profiles').insert({
      id: userId,
      full_name: cleanName(input.full_name),
      role: input.role,
      is_active: input.is_active,
      permissions: input.permissions,
    });
    if (error) throw error;
  } catch (error) {
    throw toServiceError(error, 'conceder o acesso');
  }
}

/** Altera papel, permissões, status e nome. O banco recusa mudar o próprio acesso. */
export async function updateUserPermissions(userId: string, input: UpdateUserPermissionsInput): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({
        ...(input.full_name !== undefined ? { full_name: cleanName(input.full_name) } : {}),
        role: input.role,
        permissions: input.permissions,
        is_active: input.is_active,
      })
      .eq('id', userId)
      .select('id');
    if (error) throw error;
    if (data.length === 0) throw new ServiceError('permission', 'Sem permissão para alterar este usuário.');
  } catch (error) {
    throw toServiceError(error, 'salvar as permissões');
  }
}

/** Atualiza um acesso pré-cadastrado (convite ainda sem usuário no Auth). */
export async function updateInvite(email: string, input: UpdateUserPermissionsInput): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_invites')
      .update({ full_name: cleanName(input.full_name), role: input.role, permissions: input.permissions, is_active: input.is_active })
      .eq('email', email);
    if (error) throw error;
  } catch (error) {
    throw toServiceError(error, 'salvar o convite');
  }
}

export async function cancelInvite(email: string): Promise<void> {
  try {
    const { error } = await supabase.from('user_invites').delete().eq('email', email);
    if (error) throw error;
  } catch (error) {
    throw toServiceError(error, 'cancelar o convite');
  }
}

/**
 * Salva papel, permissões, nome e status. O bloqueio no painel vale na hora
 * (todas as regras do banco exigem perfil ativo). Se o status mudou e a Edge
 * Function estiver publicada, também bloqueia/libera o LOGIN no Supabase Auth.
 * @returns `authUpdated`: `true` login atualizado, `false` função indisponível,
 *          `null` status não mudou.
 */
export async function saveUserAccess(
  userId: string,
  input: UpdateUserPermissionsInput,
  previousActive: boolean,
): Promise<{ authUpdated: boolean | null }> {
  await updateUserPermissions(userId, input);
  if (input.is_active === previousActive) return { authUpdated: null };
  try {
    await callAdminFunction({ action: 'set_banned', user_id: userId, banned: !input.is_active });
    return { authUpdated: true };
  } catch (error) {
    if (error instanceof FunctionUnavailableError) return { authUpdated: false };
    throw error;
  }
}

/** Define uma nova senha para outro usuário (via Edge Function). */
export async function setUserPassword(userId: string, password: string): Promise<void> {
  if (password.length < MIN_PASSWORD) throw new ServiceError('validation', `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  await callAdminFunction({ action: 'set_password', user_id: userId, password });
}

/** Gera um link de redefinição de senha para enviar ao usuário (via Edge Function). */
export async function createRecoveryLink(email: string): Promise<string> {
  const result = await callAdminFunction({ action: 'recovery_link', email, redirect_to: siteBaseUrl() });
  if (typeof result.link !== 'string') throw new ServiceError('unknown', 'Não foi possível gerar o link.');
  return result.link;
}

/* ==========================================================================
   SENHA DO PRÓPRIO USUÁRIO
   ========================================================================== */

function authMessage(error: AuthError, fallback: string): ServiceError {
  if (error.code === 'same_password') return new ServiceError('validation', 'A nova senha precisa ser diferente da atual.');
  if (error.code === 'weak_password') return new ServiceError('validation', 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.');
  if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
    return new ServiceError('auth', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  }
  return new ServiceError('auth', fallback, { code: error.code ?? null, details: error.message });
}

/**
 * "Esqueci minha senha": envia o e-mail de recuperação. O link volta para o
 * site com `?recuperar=1`, e o app abre a tela "Nova senha".
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!clean) throw new ServiceError('validation', 'Informe o seu e-mail.');
  const { error } = await supabase.auth.resetPasswordForEmail(clean, { redirectTo: `${siteBaseUrl()}?recuperar=1` });
  if (error) throw authMessage(error, 'Não foi possível enviar o e-mail. Tente novamente.');
}

/** Troca a senha de quem está logado (inclusive após abrir o link de recuperação). */
export async function updateOwnPassword(password: string): Promise<void> {
  if (password.length < MIN_PASSWORD) throw new ServiceError('validation', `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw authMessage(error, 'Não foi possível alterar a senha. Abra o link de recuperação de novo.');
}
