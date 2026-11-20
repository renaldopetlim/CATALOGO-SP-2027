import { useCallback } from 'react';
import { PERMISSION_INFO, type PermissionKey, type UserPermissions, type UserProfile, type UserRole } from '../types/users';
import { useAuth } from './useAuth';

export type UsePermissionsResult = {
  profile: UserProfile | null;
  role: UserRole | null;
  permissions: UserPermissions | null;
  /** O usuário logado (ativo) tem a permissão? */
  can: (permission: PermissionKey) => boolean;
  /** Papel "Administrador" (todas as permissões). */
  isAdmin: boolean;
  /** Perfil ativo (não bloqueado). */
  isActive: boolean;
  isLoading: boolean;
  /** Texto padrão para botões desabilitados por falta de permissão. */
  restrictedTitle: (permission: PermissionKey) => string;
};

/**
 * Permissões de quem está logado, para esconder/desabilitar ações na tela.
 * A regra que vale de verdade está no banco (RLS + has_permission): isto só
 * evita mostrar botões que dariam erro.
 */
export function usePermissions(): UsePermissionsResult {
  const { profile, isAdmin: hasPanelAccess, status } = useAuth();
  const active = profile?.is_active === true;

  const can = useCallback((permission: PermissionKey) => active && profile?.permissions[permission] === true, [active, profile]);
  const restrictedTitle = useCallback(
    (permission: PermissionKey) => `Acesso restrito: seu perfil não tem a permissão “${PERMISSION_INFO[permission].label}”.`,
    [],
  );

  return {
    profile,
    role: profile?.role ?? null,
    permissions: profile?.permissions ?? null,
    can,
    isAdmin: active && profile?.role === 'admin',
    isActive: active,
    isLoading: status === 'loading' || (status === 'signed_in' && hasPanelAccess === null),
    restrictedTitle,
  };
}
