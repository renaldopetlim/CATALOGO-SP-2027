#!/usr/bin/env node
/**
 * Valida VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY antes do build.
 *
 * - No GitHub Actions: lê os secrets injetados como variáveis de ambiente e
 *   gera anotações (::error / ::warning) visíveis no resumo da execução.
 * - Localmente: `npm run check:env` (lê o .env.local, se existir).
 * - `--offline`: pula o teste de conexão com o Supabase.
 *
 * Nunca imprime o valor das chaves.
 * Sai com código 1 se algo impedir o site de funcionar.
 */
import { existsSync, readFileSync, appendFileSync } from 'node:fs';

const URL_VAR = 'VITE_SUPABASE_URL';
const KEY_VAR = 'VITE_SUPABASE_ANON_KEY';
const IN_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
const OFFLINE = process.argv.includes('--offline');
const WHERE = IN_ACTIONS
  ? 'Corrija em Settings → Secrets and variables → Actions (botão de editar do secret) e rode o workflow de novo.'
  : 'Corrija no arquivo .env.local.';

/* ------------------------------------------------------------------ */
/* Saída                                                               */
/* ------------------------------------------------------------------ */

const errors = [];
const warnings = [];
const oks = [];

const error = (title, message) => errors.push({ title, message });
const warn = (title, message) => warnings.push({ title, message });
const ok = (message) => oks.push(message);

function report() {
  const escape = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  for (const { title, message } of errors) {
    console.log(IN_ACTIONS ? `::error title=${escape(title)}::${escape(message)}` : `✖ ${title}: ${message}`);
  }
  for (const { title, message } of warnings) {
    console.log(IN_ACTIONS ? `::warning title=${escape(title)}::${escape(message)}` : `⚠ ${title}: ${message}`);
  }
  for (const message of oks) console.log(`✔ ${message}`);

  if (IN_ACTIONS && process.env.GITHUB_STEP_SUMMARY) {
    const lines = ['### Configuração do Supabase', ''];
    for (const e of errors) lines.push(`- ❌ **${e.title}:** ${e.message}`);
    for (const w of warnings) lines.push(`- ⚠️ **${w.title}:** ${w.message}`);
    for (const m of oks) lines.push(`- ✅ ${m}`);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
}

/* ------------------------------------------------------------------ */
/* Leitura das variáveis                                               */
/* ------------------------------------------------------------------ */

/** Localmente, completa process.env com o .env.local (sem sobrescrever). */
function loadDotEnvLocal() {
  if (IN_ACTIONS || !existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) continue;
    const [, name, raw] = match;
    if (process.env[name] === undefined) process.env[name] = raw.replace(/^(['"])(.*)\1$/, '$2');
  }
}

/** Decodifica o payload de um JWT (chave anon legada). */
function jwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Validação de formato                                                */
/* ------------------------------------------------------------------ */

function checkUrl(raw) {
  const value = raw.trim();
  const title = `${URL_VAR} inválida`;

  if (!value) {
    error(`${URL_VAR} ausente`, `Cadastre a Project URL do Supabase (https://<id-do-projeto>.supabase.co). ${WHERE}`);
    return null;
  }
  if (value === URL_VAR || value === KEY_VAR) {
    error(title, `O valor cadastrado é o NOME da variável ("${value}"), não a URL. Cole a Project URL (Supabase → Project Settings → API Keys / Data API). ${WHERE}`);
    return null;
  }
  if (/^(sb_|eyJ)/.test(value)) {
    error(title, `O valor parece ser uma CHAVE, não a URL. Os dois secrets podem estar trocados. ${WHERE}`);
    return null;
  }
  if (/[<>]|SEU-PROJETO|seu-projeto/.test(value)) {
    error(title, `O valor ainda é o exemplo da documentação. Use a Project URL real do seu projeto. ${WHERE}`);
    return null;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    error(title, `"${value}" não é uma URL. Formato esperado: https://<id-do-projeto>.supabase.co. ${WHERE}`);
    return null;
  }

  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) {
    error(title, `A URL precisa começar com https:// (recebido: ${url.protocol}//…). ${WHERE}`);
    return null;
  }
  if (url.pathname.replace(/\/+$/, '') !== '' || url.search || url.hash) {
    error(title, `Use só a Project URL, sem caminho (ex.: sem /rest/v1). Esperado: ${url.origin}. ${WHERE}`);
    return null;
  }
  if (!isLocal && !url.hostname.endsWith('.supabase.co')) {
    warn(`${URL_VAR} com domínio próprio`, `O host "${url.hostname}" não termina em .supabase.co. Ok se for um domínio personalizado do Supabase.`);
  }

  ok(`${URL_VAR}: URL válida (${url.hostname}).`);
  return url;
}

function checkKey(raw, url) {
  const value = raw.trim();
  const title = `${KEY_VAR} inválida`;

  if (!value) {
    error(`${KEY_VAR} ausente`, `Cadastre a chave publishable (sb_publishable_…) ou a anon legada. ${WHERE}`);
    return null;
  }
  if (value === KEY_VAR || value === URL_VAR) {
    error(title, `O valor cadastrado é o NOME da variável ("${value}"), não a chave. Cole a Publishable key (Supabase → Project Settings → API Keys). ${WHERE}`);
    return null;
  }
  if (/^https?:\/\//.test(value)) {
    error(title, `O valor parece ser uma URL, não a chave. Os dois secrets podem estar trocados. ${WHERE}`);
    return null;
  }
  if (/\s/.test(value)) {
    error(title, `A chave contém espaços ou quebras de linha no meio. Copie-a de novo, inteira. ${WHERE}`);
    return null;
  }
  if (value.startsWith('sb_secret_')) {
    error('Chave SECRETA no front-end', `${KEY_VAR} recebeu uma chave secreta (sb_secret_…), que ignora a RLS e ficaria pública no site. Use a Publishable key e, por segurança, gere uma nova chave secreta no Supabase (API Keys → Secret keys). ${WHERE}`);
    return null;
  }
  if (value.startsWith('sb_publishable_')) {
    if (value.length < 30) {
      error(title, `A chave publishable parece incompleta (curta demais). Copie-a de novo, inteira. ${WHERE}`);
      return null;
    }
    ok(`${KEY_VAR}: chave publishable (sb_publishable_…).`);
    return { kind: 'publishable', value };
  }

  const payload = jwtPayload(value);
  if (payload) {
    if (payload.role === 'service_role') {
      error('Chave SECRETA no front-end', `${KEY_VAR} recebeu a chave service_role, que ignora a RLS e ficaria pública no site. Use a chave anon e, por segurança, gere novas chaves JWT no Supabase. ${WHERE}`);
      return null;
    }
    if (payload.role !== 'anon') {
      error(title, `O token informado não é a chave anon (role: ${String(payload.role)}). ${WHERE}`);
      return null;
    }
    const expectedHost = typeof payload.ref === 'string' ? `${payload.ref}.supabase.co` : null;
    if (expectedHost && url && url.hostname.endsWith('.supabase.co') && url.hostname !== expectedHost) {
      error('Chave de outro projeto', `A chave anon pertence ao projeto "${payload.ref}", mas a URL aponta para "${url.hostname}". Use URL e chave do mesmo projeto. ${WHERE}`);
      return null;
    }
    ok(`${KEY_VAR}: chave anon (JWT) do projeto ${String(payload.ref ?? '?')}.`);
    return { kind: 'jwt', value };
  }

  error(title, `Formato não reconhecido. Esperado: sb_publishable_… ou a chave anon (JWT que começa com "eyJ"). ${WHERE}`);
  return null;
}

/* ------------------------------------------------------------------ */
/* Conexão com o projeto                                               */
/* ------------------------------------------------------------------ */

async function checkConnection(url, key) {
  const endpoint = `${url.origin}/auth/v1/settings`;
  const headers = { apikey: key.value };
  if (key.kind === 'jwt') headers.Authorization = `Bearer ${key.value}`;

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(10_000) });
      if (response.ok) {
        ok(`Conexão com o Supabase: projeto acessível e chave aceita (HTTP ${response.status}).`);
        return;
      }
      if (response.status === 401 || response.status === 403) {
        error('Chave recusada pelo Supabase', `O projeto respondeu HTTP ${response.status}: a chave não pertence a este projeto ou foi revogada. Confira URL e chave em Project Settings → API Keys. ${WHERE}`);
        return;
      }
      if (response.status === 540) {
        error('Projeto do Supabase pausado', `O projeto respondeu HTTP 540 (pausado). Reative-o no painel do Supabase (Restore project) e rode o workflow de novo.`);
        return;
      }
      if (response.status >= 500 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
        continue;
      }
      warn('Resposta inesperada do Supabase', `${endpoint} respondeu HTTP ${response.status}. O deploy continua, mas confira se o projeto está ativo.`);
      return;
    } catch (err) {
      lastError = err;
      const code = err?.cause?.code ?? err?.code ?? '';
      if (code === 'ENOTFOUND' || (code === 'EAI_AGAIN' && attempt === 3)) {
        error('Projeto do Supabase não encontrado', `O endereço ${url.hostname} não existe (DNS). A URL está errada ou o projeto foi excluído. ${WHERE}`);
        return;
      }
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
    }
  }
  const reason = lastError?.cause?.code ?? lastError?.name ?? 'erro de rede';
  error('Sem conexão com o Supabase', `Não foi possível conectar a ${url.hostname} (${reason}). Confira se o projeto está ativo no painel do Supabase.`);
}

/* ------------------------------------------------------------------ */

loadDotEnvLocal();
const url = checkUrl(process.env[URL_VAR] ?? '');
const key = checkKey(process.env[KEY_VAR] ?? '', url);

if (url && key && !OFFLINE) await checkConnection(url, key);

report();
if (errors.length > 0) {
  console.log(`\nConfiguração do Supabase com ${errors.length} problema(s). O site não seria publicado corretamente.`);
  process.exit(1);
}
