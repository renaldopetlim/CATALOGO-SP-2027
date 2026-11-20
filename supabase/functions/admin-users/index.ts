// =============================================================================
// Edge Function "admin-users" — operações do Supabase Auth que exigem a chave
// secreta (service_role). A chave fica SÓ aqui, no servidor do Supabase: o
// navegador nunca a recebe.
//
// Quem chama precisa estar logado, ATIVO e com a permissão can_manage_users
// (conferido no banco a cada chamada).
//
// Ações (POST JSON):
//   { action: "create", email, password?, redirect_to? }
//       Cria o usuário no Auth. O painel grava antes o convite (user_invites)
//       com nome, papel e permissões; o trigger do banco transforma o convite
//       em perfil assim que o usuário nasce. Sem senha → envia convite por e-mail.
//   { action: "set_password", user_id, password }
//   { action: "set_banned", user_id, banned }   bloqueia/libera o LOGIN no Auth
//   { action: "recovery_link", email, redirect_to }
//       Gera um link de redefinição de senha (para enviar por WhatsApp/e-mail).
//
// Publicação: Supabase Dashboard → Edge Functions → Deploy a new function →
// nome "admin-users" → cole este arquivo → Deploy. As variáveis SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY já existem em toda Edge Function.
// Opcional: secret SITE_URL (ex.: https://renaldopetlim.github.io/CATALOGO-SP-2027/)
// para limitar os links de redefinição a esse endereço.
// =============================================================================
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BAN_FOREVER = '876000h'; // ~100 anos
const MIN_PASSWORD = 8;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Body = { [key: string]: Json | undefined };

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function reply(status: number, payload: Record<string, Json>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function text(body: Body, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'E-mail inválido.');
  return email;
}

function checkPassword(password: string): void {
  if (password.length < MIN_PASSWORD) throw new HttpError(400, `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
}

/** Aceita só https (ou localhost) e, se SITE_URL estiver definido, apenas esse endereço. */
function safeRedirect(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, 'Endereço de retorno inválido.');
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !local) throw new HttpError(400, 'O endereço de retorno precisa usar https.');
  const site = Deno.env.get('SITE_URL');
  if (site && !value.startsWith(site)) throw new HttpError(400, 'Endereço de retorno não permitido.');
  url.hash = '';
  url.search = '';
  return url.toString();
}

/** Confere o token de quem chama e se ele pode gerenciar usuários. Retorna o id. */
async function requireManager(admin: SupabaseClient, req: Request): Promise<string> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Faça login novamente.');

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new HttpError(401, 'Sessão inválida ou expirada. Faça login novamente.');

  const { data: profile, error } = await admin
    .from('user_profiles')
    .select('is_active, permissions')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (error) throw new HttpError(500, 'Não foi possível verificar suas permissões.');

  const permissions = profile?.permissions as Record<string, Json> | null | undefined;
  if (!profile?.is_active || permissions?.can_manage_users !== true) {
    throw new HttpError(403, 'Sem permissão para gerenciar usuários.');
  }
  return userData.user.id;
}

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new HttpError(500, 'Não foi possível consultar os usuários.');
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function createUser(admin: SupabaseClient, body: Body): Promise<Record<string, Json>> {
  const email = normalizeEmail(text(body, 'email'));
  const password = text(body, 'password');
  if (password) checkPassword(password);

  // O painel grava o convite antes; sem ele o usuário nasceria sem permissões.
  const { data: invite, error: inviteError } = await admin
    .from('user_invites')
    .select('email, full_name, role, is_active, permissions')
    .eq('email', email)
    .maybeSingle();
  if (inviteError) throw new HttpError(500, 'Não foi possível ler o cadastro de acesso.');
  if (!invite) throw new HttpError(400, 'Cadastre as permissões do usuário no painel antes de criá-lo.');

  const created = password
    ? await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: invite.full_name } })
    : await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: invite.full_name },
        ...(text(body, 'redirect_to') ? { redirectTo: safeRedirect(text(body, 'redirect_to')) } : {}),
      });

  if (created.error) {
    // Já existe no Auth (ex.: criado pelo Dashboard): aplica o convite ao usuário existente.
    if (/already|registered|exists/i.test(created.error.message)) {
      const existingId = await findUserIdByEmail(admin, email);
      if (!existingId) throw new HttpError(409, 'Este e-mail já está cadastrado.');
      const { error } = await admin.from('user_profiles').upsert({
        id: existingId,
        email,
        full_name: invite.full_name,
        role: invite.role,
        is_active: invite.is_active,
        permissions: invite.permissions,
      });
      if (error) throw new HttpError(400, error.message);
      await admin.from('user_invites').delete().eq('email', email);
      return { user_id: existingId, mode: 'existing' };
    }
    throw new HttpError(400, created.error.message);
  }

  return { user_id: created.data.user?.id ?? null, mode: password ? 'password' : 'invite' };
}

async function setPassword(admin: SupabaseClient, body: Body): Promise<Record<string, Json>> {
  const userId = text(body, 'user_id');
  const password = text(body, 'password');
  if (!userId) throw new HttpError(400, 'Usuário não informado.');
  checkPassword(password);
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw new HttpError(400, error.message);
  return { user_id: userId };
}

async function setBanned(admin: SupabaseClient, body: Body, callerId: string): Promise<Record<string, Json>> {
  const userId = text(body, 'user_id');
  const banned = body.banned === true;
  if (!userId) throw new HttpError(400, 'Usuário não informado.');
  if (userId === callerId) throw new HttpError(400, 'Você não pode bloquear o seu próprio acesso.');

  if (banned) {
    // Coerência: só bloqueia o login de quem já está bloqueado no painel.
    const { data: profile } = await admin.from('user_profiles').select('is_active').eq('id', userId).maybeSingle();
    if (profile?.is_active) throw new HttpError(400, 'Bloqueie o usuário no painel antes de bloquear o login.');
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: banned ? BAN_FOREVER : 'none' });
  if (error) throw new HttpError(400, error.message);
  return { user_id: userId, banned };
}

async function recoveryLink(admin: SupabaseClient, body: Body): Promise<Record<string, Json>> {
  const email = normalizeEmail(text(body, 'email'));
  const base = safeRedirect(text(body, 'redirect_to'));
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
  if (error) throw new HttpError(400, error.message);
  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) throw new HttpError(500, 'Não foi possível gerar o link.');
  // O app troca o token_hash por uma sessão (verifyOtp) e abre "Nova senha".
  const link = `${base}?token_hash=${encodeURIComponent(tokenHash)}&type=recovery#/nova-senha`;
  return { link };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return reply(405, { error: 'Método não permitido.' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return reply(500, { error: 'Função sem configuração do Supabase.' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const callerId = await requireManager(admin, req);
    const parsed: Json = await req.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(400, 'Requisição inválida.');
    const body: Body = parsed;

    switch (text(body, 'action')) {
      case 'create':
        return reply(200, await createUser(admin, body));
      case 'set_password':
        return reply(200, await setPassword(admin, body));
      case 'set_banned':
        return reply(200, await setBanned(admin, body, callerId));
      case 'recovery_link':
        return reply(200, await recoveryLink(admin, body));
      default:
        throw new HttpError(400, 'Ação desconhecida.');
    }
  } catch (error) {
    if (error instanceof HttpError) return reply(error.status, { error: error.message });
    console.error(error);
    return reply(500, { error: 'Erro inesperado na função.' });
  }
});
