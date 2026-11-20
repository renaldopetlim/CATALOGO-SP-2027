import type { TableRow } from './database';

/* ==========================================================================
   HISTÓRICO DE IMPORTAÇÕES
   ========================================================================== */

/** Uma planilha importada (lote). */
export type ImportBatch = TableRow<'import_batches'>;

/** Lote com a quantidade de registros que ele criou e que ainda estão na base. */
export type ImportBatchWithStats = ImportBatch & {
  /** Registros criados por este lote ainda presentes na base. */
  remaining: number;
  /** Só a importação mais recente (não desfeita) pode ser desfeita por completo. */
  canUndo: boolean;
};

/** Resultado de `undo_import_batch`. */
export type UndoImportResult = {
  /** Códigos que a importação criou e foram excluídos. */
  deleted: number;
  /** Códigos que ela alterou e voltaram ao estado anterior. */
  restored: number;
};

/** Resultado da exclusão de registros da base. */
export type DeleteSystemProductsResult = {
  deleted: number;
  /** Quantos estavam em algum produto do catálogo (o produto não é afetado). */
  inCatalog: number;
};

/* ==========================================================================
   REGISTROS SEM USO
   ========================================================================== */

/**
 * - `last_import`: não vieram na última planilha importada
 * - `older_than`: não aparecem em nenhuma planilha há mais de N dias
 * Nos dois casos, só códigos que não estão em nenhum produto do catálogo.
 */
export const STALE_MODES = ['last_import', 'older_than'] as const;
export type StaleMode = (typeof STALE_MODES)[number];

export function isStaleMode(value: unknown): value is StaleMode {
  return typeof value === 'string' && (STALE_MODES as readonly string[]).includes(value);
}

export type StaleCriteria = { mode: StaleMode; days: number };

export type StaleRecord = {
  code: string;
  description: string;
  brand: string;
  last_seen_at: string;
  created_at: string;
};

export type StaleListResult = { rows: StaleRecord[]; total: number };

/* ==========================================================================
   ARQUIVOS SEM USO NO STORAGE
   ========================================================================== */

export type StorageFolder = 'items' | 'brands' | 'other';

/** Arquivo do bucket que não está em nenhum produto (`image_url`) nem marca (`logo_url`). */
export type OrphanFile = {
  /** Caminho no bucket (ex.: `items/abc.webp`). */
  name: string;
  folder: StorageFolder;
  /** Tamanho em bytes. */
  size: number;
  mimetype: string | null;
  createdAt: string;
  /** URL pública, para a miniatura. */
  publicUrl: string;
};

export type OrphanFilesResult = {
  files: OrphanFile[];
  totalBytes: number;
};

export type DeleteFilesResult = {
  deleted: number;
  freedBytes: number;
  /** Arquivos que passaram a ser usados desde a análise e foram preservados. */
  skipped: number;
  /** Falhas da API do Storage (os demais foram excluídos). */
  errors: string[];
};

/* ==========================================================================
   RELATÓRIO
   ========================================================================== */

export type CleanupReport = {
  storage: { files: number; bytes: number };
  orphans: { files: number; bytes: number };
  base: {
    total: number;
    /** Códigos da base que estão em algum produto do catálogo. */
    linked: number;
    staleLastImport: number;
    staleOlderThan: number;
    lastImportAt: string | null;
    lastImportFile: string | null;
  };
  /** Dias usados em `staleOlderThan`. */
  days: number;
};

/** Arquivos enviados há menos que isto não são considerados sem uso (envio em andamento). */
export const ORPHAN_MIN_AGE_MINUTES = 60;
