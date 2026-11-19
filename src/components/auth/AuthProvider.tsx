import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { toServiceError, type ServiceError } from '../../lib/errors';
import * as authService from '../../services/authService';
import { AuthContext, type AuthContextValue, type AuthStatus } from '../../hooks/authContext';

type AdminCheck = { key: string; isAdmin: boolean; error: ServiceError | null };

/** Mantém a sessão do Supabase Auth e a verificação de admin para toda a aplicação. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [adminCheck, setAdminCheck] = useState<AdminCheck | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Sessão inicial + mudanças (login, logout, renovação de token, outra aba).
  useEffect(() => {
    let cancelled = false;

    authService
      .getCurrentSession()
      .then((current) => {
        if (cancelled) return;
        setSession(current);
        setStatus(current ? 'signed_in' : 'signed_out');
      })
      .catch(() => {
        if (!cancelled) setStatus('signed_out');
      });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      // Não chamar o Supabase aqui dentro (pode travar); apenas atualizar estado.
      setSession(next);
      setStatus(next ? 'signed_in' : 'signed_out');
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;
  const checkKey = `${userId ?? ''}:${attempt}`;

  // Verifica admin sempre que o usuário muda.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    authService
      .checkIsAdmin()
      .then((isAdmin) => {
        if (!cancelled) setAdminCheck({ key: checkKey, isAdmin, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAdminCheck({ key: checkKey, isAdmin: false, error: toServiceError(error, 'verificar a permissão') });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId, checkKey]);

  const signIn = useCallback(async (email: string, password: string) => {
    await authService.signIn(email, password);
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut();
  }, []);

  const recheckAdmin = useCallback(() => setAttempt((n) => n + 1), []);

  const current = userId && adminCheck?.key === checkKey ? adminCheck : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      isAdmin: userId ? (current ? current.isAdmin : null) : false,
      adminError: current?.error ?? null,
      signIn,
      signOut,
      recheckAdmin,
    }),
    [status, session, userId, current, signIn, signOut, recheckAdmin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
