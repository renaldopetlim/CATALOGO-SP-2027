import type { TableRow } from './database';

/* ==========================================================================
   BASE DO SISTEMA INTERNO
   ========================================================================== */

/** Registro importado do sistema interno (um por código). */
export type SystemProduct = Omit<TableRow<'system_products'>, 'search_text'>;

/** Linha enviada ao banco na importação. */
export type SystemProductInput = Pick<SystemProduct, 'code' | 'description' | 'brand'>;

/* ==========================================================================
   PLANILHA
   ========================================================================== */

/** Colunas obrigatórias da planilha (cabeçalho, sem diferenciar acento/maiúsculas). */
export const REQUIRED_COLUMNS = ['CODIGO', 'DESCRICAO', 'MARCA'] as const;
export type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];

/** Conteúdo bruto lido do arquivo: cabeçalho + linhas, tudo como texto. */
export type RawSheet = {
  fileName: string;
  headers: string[];
  /** Linhas de dados (sem o cabeçalho). */
  rows: string[][];
  /** Número da linha do cabeçalho na planilha (1 = primeira). */
  headerLine: number;
};

export type PreviewRowStatus = 'valid' | 'invalid' | 'duplicate';

/** Linha da pré-visualização, já normalizada e validada. */
export type PreviewRow = SystemProductInput & {
  /** Número da linha na planilha (1 = cabeçalho). */
  line: number;
  status: PreviewRowStatus;
  /** Motivos de erro ou aviso (vazio quando válida). */
  messages: string[];
};

export type ImportPreview = {
  fileName: string;
  rows: PreviewRow[];
  valid: number;
  invalid: number;
  duplicate: number;
};

export type NormalizeOptions = {
  /** Converte também a descrição para MAIÚSCULAS (código e marca sempre são). */
  uppercaseDescription: boolean;
};

/** Resultado de um lote/importação, conforme `import_system_products`. */
export type ImportBatchResult = {
  received: number;
  inserted: number;
  updated: number;
  unchanged: number;
};

export type ImportSummary = ImportBatchResult & {
  /** Linhas não enviadas: erro de validação ou código repetido na planilha. */
  ignored: number;
  /** Linhas de lotes que o banco recusou. */
  failed: number;
  /** Mensagens de erro dos lotes recusados. */
  errors: string[];
};

export type ImportProgress = {
  sent: number;
  total: number;
};

/* ==========================================================================
   CONCILIAÇÃO
   ========================================================================== */

/**
 * Situação de um código da base no catálogo:
 * - `missing`: não está em nenhum produto
 * - `inactive`: cadastrado, mas o produto ou a categoria está inativo
 * - `published`: aparece na vitrine
 */
export const RECONCILIATION_STATUSES = ['missing', 'inactive', 'published'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export function isReconciliationStatus(value: unknown): value is ReconciliationStatus {
  return typeof value === 'string' && (RECONCILIATION_STATUSES as readonly string[]).includes(value);
}

export type ReconciliationRow = Pick<SystemProduct, 'code' | 'description' | 'brand' | 'updated_at' | 'last_seen_at'> & {
  catalogItemId: string | null;
  catalogItemTitle: string | null;
  status: ReconciliationStatus;
};

/** `pending` = `missing` + `inactive` (não aparecem na vitrine); `all` = base inteira. */
export type ReconciliationFilter = 'pending' | 'all' | ReconciliationStatus;

export type ReconciliationFilters = {
  filter: ReconciliationFilter;
  search?: string;
  limit?: number;
  offset?: number;
};

export type ReconciliationListResult = {
  rows: ReconciliationRow[];
  total: number;
};

export type ReconciliationSummary = Record<ReconciliationStatus, number> & { total: number };

/**
 * Seleção na aba Pendentes, indexada pelo código (único na base do sistema).
 * Guarda o registro inteiro para montar o card mesmo que a linha saia da
 * página ou da busca atual.
 */
export type PendingSelection = ReadonlyMap<string, ReconciliationRow>;
