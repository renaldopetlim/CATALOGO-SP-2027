/** Utilitários de texto e formatação compartilhados entre serviços e UI. */

/** Remove acentos: "Cerâmica" → "Ceramica". */
export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Gera um slug compatível com a constraint do banco: "Pisos & Revestimentos" → "pisos-revestimentos". */
export function slugify(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Mesmo padrão da constraint `categories.slug` no banco. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Converte o texto digitado na busca em termos para `ILIKE` sobre `search_text`
 * (que está em minúsculas e sem acento).
 * Remove curingas (% _ * \) e separadores do PostgREST (, ( ) ") para evitar
 * buscas acidentais ou malformadas.
 */
export function toSearchTerms(value: string): string[] {
  const normalized = stripAccents(value)
    .toLowerCase()
    .replace(/[%_*\\,()"]/g, ' ');

  const terms = normalized.split(/\s+/).filter((term) => term.length > 0);
  // Remove repetidos e limita a quantidade para não gerar URLs enormes.
  return [...new Set(terms)].slice(0, 8);
}

/** Texto opcional: string vazia/só espaços vira `null`. */
export function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 1234.5 → "R$ 1.234,50"; `null` → "Sob consulta". */
export function formatPrice(value: number | null): string {
  return value === null ? 'Sob consulta' : BRL.format(value);
}

/** Valida se a string é uma URL http(s) absoluta. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
