import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

/** Nome do bucket de imagens definido na migração. */
export const CATALOG_IMAGES_BUCKET = 'catalog-images';

type SupabaseEnv = {
  url: string;
  anonKey: string;
};

/** Detecta chaves secretas (novas `sb_secret_…` ou JWT legado com role `service_role`). */
function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return /"role"\s*:\s*"service_role"/.test(json);
  } catch {
    return false;
  }
}

/**
 * Lê e valida as variáveis de ambiente.
 * Falha cedo, com mensagem clara, em vez de gerar erros confusos nas requisições.
 */
function readSupabaseEnv(): SupabaseEnv {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
  const problems: string[] = [];

  if (!url) {
    problems.push('VITE_SUPABASE_URL não definida.');
  } else {
    try {
      const parsed = new URL(url);
      const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (parsed.protocol !== 'https:' && !isLocal) {
        problems.push('VITE_SUPABASE_URL deve usar https://.');
      }
    } catch {
      problems.push(`VITE_SUPABASE_URL inválida: "${url}".`);
    }
  }

  if (!anonKey) {
    problems.push('VITE_SUPABASE_ANON_KEY não definida.');
  } else if (isSecretKey(anonKey)) {
    // Chave secreta ignora a RLS: nunca pode ir para o navegador.
    problems.push('VITE_SUPABASE_ANON_KEY parece ser uma chave secreta. Use a chave anon/publishable.');
  }

  if (problems.length > 0) {
    throw new Error(
      `Configuração do Supabase incompleta:\n- ${problems.join('\n- ')}\n` +
        'Copie .env.example para .env.local, preencha os valores e reinicie o servidor (npm run dev).',
    );
  }

  return { url, anonKey };
}

const env = readSupabaseEnv();

/** Cliente único e tipado do Supabase para toda a aplicação. */
export const supabase: SupabaseClient<Database> = createClient<Database>(env.url, env.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE devolve `?code=` na URL (e não tokens após o `#`), o que não
    // conflita com o HashRouter caso links de e-mail (ex.: recuperar senha)
    // sejam usados no futuro.
    flowType: 'pkce',
  },
});
