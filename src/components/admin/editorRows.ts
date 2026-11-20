/** Linhas dos editores do formulário de produto. A `key` é local (só para o React). */

/** Bloco Código + Descrição + Embalagem. `id` existe para códigos já salvos. */
export type CodeRow = {
  key: string;
  id?: string;
  code: string;
  description: string;
  packaging: string;
  /** Cor (só em categorias com cores; ignorada nas demais). */
  colorName: string;
  /** `#RRGGBB` ou '' (sem cor). Pode estar sendo digitado (inválido) no formulário. */
  colorHex: string;
  /** URL da amostra (textura) já salva ou digitada. */
  swatchUrl: string;
  /** Arquivo de amostra escolhido agora (enviado ao salvar; tem prioridade sobre a URL). */
  swatchFile: File | null;
};

/** Linha da ficha técnica. */
export type SpecRow = {
  key: string;
  label: string;
  value: string;
};

export function newCodeRow(values: Partial<Omit<CodeRow, 'key'>> = {}): CodeRow {
  return {
    key: crypto.randomUUID(),
    code: '',
    description: '',
    packaging: '',
    colorName: '',
    colorHex: '',
    swatchUrl: '',
    swatchFile: null,
    ...values,
  };
}

export function newSpecRow(values: Partial<Omit<SpecRow, 'key'>> = {}): SpecRow {
  return { key: crypto.randomUUID(), label: '', value: '', ...values };
}
