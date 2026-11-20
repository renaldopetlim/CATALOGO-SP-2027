import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { toServiceError, type ServiceError } from '../../lib/errors';
import { consumeRecoveryUrl, hasRecoveryParams } from '../../lib/recovery';
import * as authService from '../../services/authService';
import { getMyProfile } from '../../services/userService';
import { AuthContext, type AuthContextValue, type AuthStatus } from '../../hooks/authContext';
import type { UserProfile } from '../../types/users';

type ProfileCheck = { userId: string; profile: UserProfile | null; error: ServiceError | null };

/** Recarrega as permissões ao voltar para a aba (ex.: o gerente mudou o seu acesso). */
const REFRESH_ON_FOCUS_MS = 30_000;

/** Mantém a sessão do Supabase Auth e o perfil (permissões) para toda a aplicação. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [check, setCheck] = useState<ProfileCheck | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Sessão inicial + mudanças (login, logout, renovação de token, outra aba).
  useEffect(() => {
    let cancelled = false;

    // Link de redefinição de senha: troca o token pela sessão antes de tudo.
    const ready = hasRecoveryParams() ? consumeRecoveryUrl() : Promise.resolve();

    ready
      .then(() => authService.getCurrentSession())
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

  // Carrega o perfil quando o usuário muda (e nas recargas pedidas).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    getMyProfile(userId)
      .then((profile) => {
        if (!cancelled) setCheck({ userId, profile, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const serviceError = toServiceError(error, 'verificar suas permissões');
        // Falha de rede numa recarga: mantém o perfil que já estava na tela.
        setCheck((prev) =>
          prev && prev.userId === userId && !prev.error && serviceError.kind === 'network'
            ? prev
            : { userId, profile: null, error: serviceError },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  // Ao voltar para a aba, confere de novo (bloqueio e mudança de permissões valem logo).
  useEffect(() => {
    if (!userId) return;
    let last = Date.now();
    const onFocus = () => {
      if (Date.now() - last < REFRESH_ON_FOCUS_MS) return;
      last = Date.now();
      setAttempt((n) => n + 1);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [userId]);

  const signIn = useCallback(async (email: string, password: string) => {
    await authService.signIn(email, password);
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut();
  }, []);

  const recheckAdmin = useCallback(() => setAttempt((n) => n + 1), []);

  const current = userId && check?.userId === userId ? check : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      isAdmin: userId ? (current ? current.profile?.is_active === true : null) : false,
      profile: current?.profile ?? null,
      adminError: current?.error ?? null,
      signIn,
      signOut,
      recheckAdmin,
    }),
    [status, session, userId, current, signIn, signOut, recheckAdmin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
