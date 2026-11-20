/* ==========================================================================
   USUÁRIOS DO PAINEL E PERMISSÕES
   ========================================================================== */

/** Permissões granulares (chaves de `user_profiles.permissions`). */
export const PERMISSION_KEYS = [
  'can_manage_products',
  'can_manage_categories',
  'can_manage_brands',
  'can_import_spreadsheet',
  'can_cleanup_storage',
  'can_manage_users',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type UserPermissions = Record<PermissionKey, boolean>;

export const USER_ROLES = ['admin', 'editor', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/** Perfil de quem usa o painel (`public.user_profiles`). */
export type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  permissions: UserPermissions;
  created_at: string;
  updated_at: string;
};

/**
 * Situação da conta na listagem:
 * - `active` / `blocked`: tem perfil (ativo ou bloqueado)
 * - `no_access`: existe no Supabase Auth, mas sem perfil (não entra no painel)
 * - `invited`: acesso pré-cadastrado, aguardando o usuário ser criado no Auth
 */
export type UserAccountStatus = 'active' | 'blocked' | 'no_access' | 'invited';

/** Linha do painel de usuários (`admin_list_users()`). */
export type ManagedUser = {
  /** `null` para convites ainda sem usuário no Auth. */
  id: string | null;
  email: string;
  fullName: string;
  role: UserRole | null;
  isActive: boolean;
  permissions: UserPermissions;
  status: UserAccountStatus;
  createdAt: string;
  updatedAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  /** Login bloqueado no Supabase Auth (além do bloqueio no painel). */
  banned: boolean;
};

/** Como o novo usuário recebe o acesso. */
export type CreateUserMode = 'password' | 'invite';

export type CreateUserInput = {
  email: string;
  full_name: string;
  role: UserRole;
  permissions: UserPermissions;
  is_active: boolean;
  mode: CreateUserMode;
  /** Obrigatória com `mode: 'password'` (mínimo 8 caracteres). */
  password?: string;
};

export type UpdateUserPermissionsInput = {
  full_name?: string;
  role: UserRole;
  permissions: UserPermissions;
  is_active: boolean;
};

/** Resultado do cadastro de um novo usuário. */
export type CreateUserResult =
  | { kind: 'created'; userId: string | null; mode: CreateUserMode | 'existing' }
  /** A Edge Function não está publicada: o acesso ficou pré-cadastrado. */
  | { kind: 'pending_manual' };

/* ==========================================================================
   RÓTULOS E PRESETS
   ========================================================================== */

export const PERMISSION_INFO: Record<PermissionKey, { label: string; short: string; description: string }> = {
  can_manage_products: {
    label: 'Produtos e códigos',
    short: 'Produtos',
    description: 'Criar, editar, duplicar e excluir produtos, códigos e imagens de produto.',
  },
  can_manage_categories: {
    label: 'Categorias',
    short: 'Categorias',
    description: 'Criar, editar, reordenar e excluir categorias.',
  },
  can_manage_brands: {
    label: 'Marcas e logos',
    short: 'Marcas',
    description: 'Criar, editar e excluir marcas e enviar logos.',
  },
  can_import_spreadsheet: {
    label: 'Importar planilha',
    short: 'Planilha',
    description: 'Importar a planilha do sistema, desfazer importações e excluir registros da base.',
  },
  can_cleanup_storage: {
    label: 'Saúde e limpeza',
    short: 'Limpeza',
    description: 'Ver e excluir registros sem uso e arquivos órfãos do Storage.',
  },
  can_manage_users: {
    label: 'Usuários e permissões',
    short: 'Usuários',
    description: 'Acessar este painel, cadastrar acessos e alterar permissões e status.',
  },
};

export const ROLE_INFO: Record<UserRole, { label: string; description: string }> = {
  admin: { label: 'Administrador', description: 'Todas as permissões, inclusive usuários.' },
  editor: { label: 'Editor de catálogo', description: 'Permissões escolhidas uma a uma.' },
  viewer: { label: 'Apenas consulta', description: 'Vê o painel, sem alterar nada.' },
};

export function emptyPermissions(): UserPermissions {
  return {
    can_manage_products: false,
    can_manage_categories: false,
    can_manage_brands: false,
    can_import_spreadsheet: false,
    can_cleanup_storage: false,
    can_manage_users: false,
  };
}

/** Permissões de cada preset. O banco aplica a mesma regra (admin = tudo, viewer = nada). */
export function presetPermissions(role: UserRole): UserPermissions {
  if (role === 'admin') {
    return {
      can_manage_products: true,
      can_manage_categories: true,
      can_manage_brands: true,
      can_import_spreadsheet: true,
      can_cleanup_storage: true,
      can_manage_users: true,
    };
  }
  if (role === 'viewer') return emptyPermissions();
  // Editor de catálogo: o dia a dia do catálogo, sem usuários nem limpeza.
  return {
    can_manage_products: true,
    can_manage_categories: true,
    can_manage_brands: true,
    can_import_spreadsheet: true,
    can_cleanup_storage: false,
    can_manage_users: false,
  };
}

/** Lê o jsonb do banco garantindo as 6 chaves booleanas. */
export function parsePermissions(value: unknown): UserPermissions {
  const result = emptyPermissions();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return result;
  for (const key of PERMISSION_KEYS) {
    result[key] = (value as Record<string, unknown>)[key] === true;
  }
  return result;
}

/** Papel coerente com as permissões marcadas (todas → admin, nenhuma → viewer). */
export function roleForPermissions(permissions: UserPermissions): UserRole {
  const values = PERMISSION_KEYS.map((key) => permissions[key]);
  if (values.every(Boolean)) return 'admin';
  if (!values.some(Boolean)) return 'viewer';
  return 'editor';
}
