import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { ServiceError } from '../lib/errors';

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in';

export type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /** `null` enquanto a permissão está sendo verificada. */
  isAdmin: boolean | null;
  /** Falha ao verificar a permissão (ex.: rede). */
  adminError: ServiceError | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  recheckAdmin: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
