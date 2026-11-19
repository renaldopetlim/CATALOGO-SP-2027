/** Linhas dos editores do formulário de produto. A `key` é local (só para o React). */

/** Bloco Código + Descrição + Embalagem. `id` existe para códigos já salvos. */
export type CodeRow = {
  key: string;
  id?: string;
  code: string;
  description: string;
  packaging: string;
};

/** Linha da ficha técnica. */
export type SpecRow = {
  key: string;
  label: string;
  value: string;
};

export function newCodeRow(values: Partial<Omit<CodeRow, 'key'>> = {}): CodeRow {
  return { key: crypto.randomUUID(), code: '', description: '', packaging: '', ...values };
}

export function newSpecRow(values: Partial<Omit<SpecRow, 'key'>> = {}): SpecRow {
  return { key: crypto.randomUUID(), label: '', value: '', ...values };
}
