import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

/** Nome do bucket de imagens definido na migração. */
export const CATALOG_IMAGES_BUCKET = 'catalog-images';

type SupabaseEnv = {
  url: string;
  anonKey: string;
};

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
  } else if (anonKey.startsWith('sb_secret_') || anonKey.includes('service_role')) {
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
  },
});
