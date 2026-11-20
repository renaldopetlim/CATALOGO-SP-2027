import { supabase } from '../lib/supabase';
import { toServiceError } from '../lib/errors';
import { toSearchTerms } from '../lib/format';
import type { Json } from '../types/database';
import {
  isReconciliationStatus,
  type ImportBatchResult,
  type ImportProgress,
  type ImportSummary,
  type ReconciliationFilters,
  type ReconciliationListResult,
  type ReconciliationRow,
  type ReconciliationStatus,
  type ReconciliationSummary,
  type SystemProductInput,
} from '../types/systemProducts';

/** Registros por chamada (cada lote é uma transação no banco). */
export const IMPORT_BATCH_SIZE = 500;

/* ==========================================================================
   IMPORTAÇÃO
   ========================================================================== */

function toCount(value: Json | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Converte o JSON devolvido por `import_system_products` (valores ausentes = 0). */
function parseBatchResult(json: Json): ImportBatchResult {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { received: 0, inserted: 0, updated: 0, unchanged: 0 };
  }
  return {
    received: toCount(json.received),
    inserted: toCount(json.inserted),
    updated: toCount(json.updated),
    unchanged: toCount(json.unchanged),
  };
}

/**
 * Envia os registros em lotes (upsert por código).
 * Um lote recusado não interrompe os demais: suas linhas entram em `failed`.
 * @param ignored linhas descartadas antes do envio (inválidas/repetidas), só para o resumo.
 */
export async function importSystemProducts(
  rows: SystemProductInput[],
  {
    ignored = 0,
    batchId = null,
    onProgress,
  }: {
    ignored?: number;
    /** Lote aberto com `startImportBatch`: registra o histórico e permite desfazer. */
    batchId?: string | null;
    onProgress?: (progress: ImportProgress) => void;
  } = {},
): Promise<ImportSummary> {
  const summary: ImportSummary = { received: 0, inserted: 0, updated: 0, unchanged: 0, ignored, failed: 0, errors: [] };
  onProgress?.({ sent: 0, total: rows.length });

  for (let start = 0; start < rows.length; start += IMPORT_BATCH_SIZE) {
    const batch = rows.slice(start, start + IMPORT_BATCH_SIZE);
    try {
      const { data, error } = await supabase.rpc('import_system_products', { p_rows: batch, p_batch_id: batchId });
      if (error) throw error;
      const result = parseBatchResult(data);
      summary.received += result.received;
      summary.inserted += result.inserted;
      summary.updated += result.updated;
      summary.unchanged += result.unchanged;
    } catch (error) {
      const serviceError = toServiceError(error, 'importar o lote');
      summary.failed += batch.length;
      const first = start + 1;
      const last = start + batch.length;
      summary.errors.push(`Registros ${first}–${last}: ${serviceError.message}`);
      // Sem permissão ou sessão expirada: os próximos lotes falhariam igual.
      if (serviceError.kind === 'permission' || serviceError.kind === 'auth') {
        summary.failed += rows.length - last;
        break;
      }
    }
    onProgress?.({ sent: Math.min(start + IMPORT_BATCH_SIZE, rows.length), total: rows.length });
  }

  return summary;
}

/* ==========================================================================
   CONCILIAÇÃO
   ========================================================================== */

const RECONCILIATION_SELECT =
  'code, description, brand, updated_at, last_seen_at, catalog_item_id, catalog_item_title, catalog_status';

type ReconciliationDbRow = {
  code: string;
  description: string;
  brand: string;
  updated_at: string;
  last_seen_at: string;
  catalog_item_id: string | null;
  catalog_item_title: string | null;
  catalog_status: string;
};

function toReconciliationRow(row: ReconciliationDbRow): ReconciliationRow {
  return {
    code: row.code,
    description: row.description,
    brand: row.brand,
    updated_at: row.updated_at,
    last_seen_at: row.last_seen_at,
    catalogItemId: row.catalog_item_id,
    catalogItemTitle: row.catalog_item_title,
    status: isReconciliationStatus(row.catalog_status) ? row.catalog_status : 'missing',
  };
}

/** Lista a base do sistema com a situação de cada código no catálogo. */
export async function listReconciliation({
  filter,
  search = '',
  limit = 50,
  offset = 0,
}: ReconciliationFilters): Promise<ReconciliationListResult> {
  try {
    let query = supabase.from('system_products_reconciliation').select(RECONCILIATION_SELECT, { count: 'exact' });

    if (filter === 'pending') query = query.neq('catalog_status', 'published');
    else if (filter !== 'all') query = query.eq('catalog_status', filter);

    // Cada termo precisa aparecer no código, na descrição ou na marca (sem acento).
    for (const term of toSearchTerms(search)) {
      query = query.ilike('search_text', `%${term}%`);
    }

    const { data, error, count } = await query
      .order('catalog_status', { ascending: true }) // inactive antes de missing
      .order('code', { ascending: true })
      .range(offset, offset + Math.max(limit, 1) - 1);

    if (error) throw error;
    return { rows: data.map(toReconciliationRow), total: count ?? data.length };
  } catch (error) {
    throw toServiceError(error, 'carregar a conciliação');
  }
}

/** Quantidades por situação (para os indicadores do topo). */
export async function getReconciliationSummary(): Promise<ReconciliationSummary> {
  const countFor = async (status: ReconciliationStatus): Promise<number> => {
    const { count, error } = await supabase
      .from('system_products_reconciliation')
      .select('code', { count: 'exact', head: true })
      .eq('catalog_status', status);
    if (error) throw error;
    return count ?? 0;
  };

  try {
    const [missing, inactive, published] = await Promise.all([countFor('missing'), countFor('inactive'), countFor('published')]);
    return { missing, inactive, published, total: missing + inactive + published };
  } catch (error) {
    throw toServiceError(error, 'carregar o resumo da conciliação');
  }
}
