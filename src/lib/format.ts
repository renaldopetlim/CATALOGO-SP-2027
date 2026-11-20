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

/* ==========================================================================
   Campos de formulário
   ========================================================================== */

/** Máscara de moeda enquanto digita (mesmo comportamento do Termo): "123456" → "1.234,56". */
export function maskPriceInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12);
  if (!digits) return '';
  return (Number.parseInt(digits, 10) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "1.234,56" → 1234.56; vazio → `null` (sob consulta). */
export function parsePriceInput(value: string): number | null {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return Number.parseInt(digits, 10) / 100;
}

/** 1234.56 → "1.234,56"; `null` → "". */
export function priceToInput(value: number | null): string {
  if (value === null) return '';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "piso, Área externa ,, piso" → ["piso", "área externa"]. */
export function parseTagsInput(value: string): string[] {
  const tags = value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
  return [...new Set(tags)];
}

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** ISO → "19/11/2026 02:53" (fuso do navegador). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE_TIME.format(date).replace(',', '');
}

/** Tamanho legível em pt-BR: "850 B", "12,4 KB", "3,2 MB", "1,05 GB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const digits = exponent === 0 ? 0 : value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: digits })} ${units[exponent] ?? 'B'}`;
}
