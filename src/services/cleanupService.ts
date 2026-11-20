import { CATALOG_IMAGES_BUCKET, supabase } from '../lib/supabase';
import { toServiceError } from '../lib/errors';
import type { Json } from '../types/database';
import {
  ORPHAN_MIN_AGE_MINUTES,
  type CleanupReport,
  type DeleteFilesResult,
  type OrphanFile,
  type OrphanFilesResult,
  type StaleCriteria,
  type StaleListResult,
  type StorageFolder,
} from '../types/cleanup';

/** Arquivos por chamada de exclusão no Storage. */
const REMOVE_CHUNK = 100;

/* ==========================================================================
   RELATÓRIO
   ========================================================================== */

type JsonObject = { [key: string]: Json | undefined };

function asObject(value: Json | undefined): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function num(value: Json | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function str(value: Json | undefined): string | null {
  return typeof value === 'string' && value ? value : null;
}

/** Converte o JSON de `cleanup_report` (campos ausentes viram 0/nulo). */
export function parseCleanupReport(json: Json, days: number): CleanupReport {
  const root = asObject(json);
  const storage = asObject(root.storage);
  const orphans = asObject(root.orphans);
  const base = asObject(root.base);
  return {
    storage: { files: num(storage.files), bytes: num(storage.bytes) },
    orphans: { files: num(orphans.files), bytes: num(orphans.bytes) },
    base: {
      total: num(base.total),
      linked: num(base.linked),
      staleLastImport: num(base.stale_last_import),
      staleOlderThan: num(base.stale_older_than),
      lastImportAt: str(base.last_import_at),
      lastImportFile: str(base.last_import_file),
    },
    days: num(root.days) || days,
  };
}

/** Números do painel "Saúde e limpeza": Storage, arquivos sem uso e base do sistema. */
export async function getCleanupReport(days = 90): Promise<CleanupReport> {
  try {
    const { data, error } = await supabase.rpc('cleanup_report', { p_days: days });
    if (error) throw error;
    return parseCleanupReport(data, days);
  } catch (error) {
    throw toServiceError(error, 'analisar a base e o armazenamento');
  }
}

/* ==========================================================================
   REGISTROS SEM USO NA BASE
   ========================================================================== */

/** Registros da base fora do catálogo e sem atualização, conforme o critério. */
export async function listStaleRecords(
  criteria: StaleCriteria,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<StaleListResult> {
  try {
    const { data, error, count } = await supabase
      .rpc('stale_system_products', { p_mode: criteria.mode, p_days: criteria.days }, { count: 'exact' })
      .range(offset, offset + Math.max(limit, 1) - 1);
    if (error) throw error;
    return { rows: data, total: count ?? data.length };
  } catch (error) {
    throw toServiceError(error, 'listar os registros sem uso');
  }
}

/** Exclui todos os registros sem uso do critério. Retorna quantos foram excluídos. */
export async function purgeStaleRecords(criteria: StaleCriteria): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('purge_stale_system_products', { p_mode: criteria.mode, p_days: criteria.days });
    if (error) throw error;
    return data;
  } catch (error) {
    throw toServiceError(error, 'limpar os registros sem uso');
  }
}

/* ==========================================================================
   ARQUIVOS SEM USO NO STORAGE
   ========================================================================== */

function folderOf(name: string): StorageFolder {
  if (name.startsWith('items/')) return 'items';
  if (name.startsWith('brands/')) return 'brands';
  return 'other';
}

/** Arquivos do bucket que não estão em nenhum produto nem marca (mais antigos que 1 hora). */
export async function listOrphanFiles(): Promise<OrphanFilesResult> {
  try {
    const { data, error } = await supabase.rpc('storage_orphan_files', { p_min_age_minutes: ORPHAN_MIN_AGE_MINUTES });
    if (error) throw error;
    const bucket = supabase.storage.from(CATALOG_IMAGES_BUCKET);
    const files: OrphanFile[] = data.map((row) => ({
      name: row.name,
      folder: folderOf(row.name),
      size: Number(row.size) || 0,
      mimetype: row.mimetype,
      createdAt: row.created_at,
      publicUrl: bucket.getPublicUrl(row.name).data.publicUrl,
    }));
    return { files, totalBytes: files.reduce((sum, file) => sum + file.size, 0) };
  } catch (error) {
    throw toServiceError(error, 'listar os arquivos sem uso');
  }
}

/**
 * Exclui arquivos sem uso. Antes, confere de novo no banco quais continuam sem
 * vínculo (um produto pode ter passado a usar a imagem desde a análise).
 */
export async function deleteOrphanFiles(names: readonly string[]): Promise<DeleteFilesResult> {
  const unique = [...new Set(names)];
  if (unique.length === 0) return { deleted: 0, freedBytes: 0, skipped: 0, errors: [] };

  let confirmed: Array<{ name: string; size: number }>;
  try {
    const { data, error } = await supabase.rpc('storage_orphan_files', {
      p_min_age_minutes: ORPHAN_MIN_AGE_MINUTES,
      p_names: unique,
    });
    if (error) throw error;
    confirmed = data.map((row) => ({ name: row.name, size: Number(row.size) || 0 }));
  } catch (error) {
    throw toServiceError(error, 'conferir os arquivos antes de excluir');
  }

  const sizes = new Map(confirmed.map((file) => [file.name, file.size]));
  const result: DeleteFilesResult = { deleted: 0, freedBytes: 0, skipped: unique.length - confirmed.length, errors: [] };
  const bucket = supabase.storage.from(CATALOG_IMAGES_BUCKET);

  for (let start = 0; start < confirmed.length; start += REMOVE_CHUNK) {
    const chunk = confirmed.slice(start, start + REMOVE_CHUNK).map((file) => file.name);
    const { data, error } = await bucket.remove(chunk);
    if (error) {
      result.errors.push(toServiceError(error, 'excluir os arquivos').message);
      continue;
    }
    for (const removed of data) {
      result.deleted += 1;
      result.freedBytes += sizes.get(removed.name) ?? 0;
    }
  }

  return result;
}
