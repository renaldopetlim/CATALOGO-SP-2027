import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { ServiceError } from '../lib/errors';
import type { UserProfile } from '../types/users';

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in';

export type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /**
   * Acesso ATIVO ao painel (tem perfil e não está bloqueado).
   * `null` enquanto o perfil está sendo carregado.
   */
  isAdmin: boolean | null;
  /** Perfil do usuário logado (`null` = sem perfil ou ainda carregando). */
  profile: UserProfile | null;
  /** Falha ao carregar o perfil (ex.: rede). */
  adminError: ServiceError | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Recarrega o perfil (permissões) sem esconder a tela atual. */
  recheckAdmin: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
