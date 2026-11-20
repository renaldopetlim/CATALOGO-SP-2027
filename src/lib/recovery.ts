import { supabase } from './supabase';

/**
 * Retorno dos links de redefinição de senha:
 * - "Esqueci minha senha" (e-mail do Supabase): `?recuperar=1&code=…` — o
 *   cliente (PKCE) troca o código pela sessão sozinho ao iniciar;
 * - link gerado no painel de usuários: `?token_hash=…&type=recovery` — trocado
 *   aqui com `verifyOtp` (funciona em qualquer navegador/aparelho).
 * Depois, limpa a URL e abre a tela "Nova senha" (#/nova-senha).
 */
export function hasRecoveryParams(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('recuperar') === '1' || (params.has('token_hash') && params.get('type') === 'recovery');
}

/** Estado do último retorno de recuperação (lido pela tela "Nova senha"). */
export type RecoveryOutcome = 'ok' | 'failed';
let lastOutcome: RecoveryOutcome | null = null;
export function recoveryOutcome(): RecoveryOutcome | null {
  return lastOutcome;
}

export async function consumeRecoveryUrl(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get('token_hash');

  try {
    if (tokenHash && params.get('type') === 'recovery') {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
      lastOutcome = error ? 'failed' : 'ok';
    } else {
      // PKCE: getSession aguarda a troca automática do `code`.
      const { data } = await supabase.auth.getSession();
      lastOutcome = data.session ? 'ok' : 'failed';
    }
  } catch {
    lastOutcome = 'failed';
  }

  // Remove os parâmetros (o token não fica no histórico) e abre a tela de nova senha.
  window.history.replaceState(null, '', window.location.pathname);
  window.location.hash = '/nova-senha';
}
