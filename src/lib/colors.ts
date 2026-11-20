import { hasColor, type CatalogItemCode } from '../types/catalog';

/** Uma cor do produto e os códigos (embalagens/tamanhos) que a usam. */
export type ColorOption = {
  /** Chave estável da cor (hex + amostra + nome). */
  key: string;
  name: string;
  hex: string | null;
  imageUrl: string | null;
  codes: CatalogItemCode[];
};

/**
 * Agrupa os códigos com cor por cor (o mesmo "Branco Neve" em 3,6 L e 18 L vira
 * uma amostra só), na ordem dos códigos.
 */
export function colorOptions(codes: readonly CatalogItemCode[]): ColorOption[] {
  const byKey = new Map<string, ColorOption>();
  for (const code of codes) {
    if (!hasColor(code)) continue;
    const name = code.color_name?.trim() || code.color_hex || 'Cor';
    const key = [code.color_hex ?? '', code.color_swatch_url ?? '', name.toLowerCase()].join('|');
    const existing = byKey.get(key);
    if (existing) existing.codes.push(code);
    else byKey.set(key, { key, name, hex: code.color_hex, imageUrl: code.color_swatch_url, codes: [code] });
  }
  return [...byKey.values()];
}
