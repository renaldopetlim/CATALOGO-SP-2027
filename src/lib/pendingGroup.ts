import type { ItemFormPrefill } from '../types/catalog';
import type { ReconciliationRow } from '../types/systemProducts';
import { stripAccents } from './format';

/** Só códigos sem nenhum produto podem entrar num card novo (códigos são únicos no catálogo). */
export function canJoinCard(row: ReconciliationRow): boolean {
  return row.status === 'missing';
}

const normalize = (value: string) => stripAccents(value).trim().replace(/\s+/g, ' ').toLowerCase();

/** Marcas distintas (ignorando maiúsculas, acentos e vazias), na ordem em que aparecem. */
export function distinctBrands(rows: readonly ReconciliationRow[]): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const name = row.brand.trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const key = normalize(name);
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()];
}

// Separadores que não devem sobrar no fim do título sugerido.
const TRAILING_SEPARATORS = /[\s\-–—,;:/|.(]+$/u;

/**
 * Início comum das descrições, palavra por palavra.
 * "PARAFUSO SEXTAVADO 6X40" + "PARAFUSO SEXTAVADO 8X50" → "PARAFUSO SEXTAVADO".
 */
export function commonTitle(descriptions: readonly string[]): string {
  const lists = descriptions.map((description) => description.trim().split(/\s+/).filter(Boolean));
  const [first, ...rest] = lists;
  if (!first) return '';
  const words: string[] = [];
  for (let index = 0; index < first.length; index += 1) {
    const word = first[index];
    if (word === undefined) break;
    if (!rest.every((list) => list[index] !== undefined && normalize(list[index] ?? '') === normalize(word))) break;
    words.push(word);
  }
  return words.join(' ').replace(TRAILING_SEPARATORS, '');
}

/** Dados do formulário de produto a partir de um ou mais registros da base do sistema. */
export function buildPrefill(rows: readonly ReconciliationRow[]): ItemFormPrefill {
  const codes = rows.map((row) => ({ code: row.code, description: row.description, packaging: '' }));
  const brands = distinctBrands(rows);
  const brandFields: Pick<ItemFormPrefill, 'brand' | 'brandSuggestions'> =
    brands.length === 1 ? { brand: brands[0] } : brands.length > 1 ? { brandSuggestions: brands } : {};

  const [only] = rows;
  if (rows.length === 1 && only) {
    return { title: only.description, ...brandFields, codes };
  }

  const title = commonTitle(rows.map((row) => row.description));
  return {
    title,
    titleHint: title
      ? 'Sugestão: início comum das descrições. Ajuste para o nome comercial do card.'
      : 'As descrições não têm um início comum. Defina o nome comercial do card.',
    ...brandFields,
    codes,
    subtitle: `${rows.length} códigos da base do sistema num único card. Revise o título e escolha a categoria.`,
  };
}
