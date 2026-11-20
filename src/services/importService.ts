import { supabase } from '../lib/supabase';
import { toServiceError } from '../lib/errors';
import type { Json } from '../types/database';
import type { DeleteSystemProductsResult, ImportBatchWithStats, UndoImportResult } from '../types/cleanup';
import type { ReconciliationRow } from '../types/systemProducts';

/** Códigos por requisição de exclusão (mantém a URL do filtro `in` curta). */
const DELETE_CHUNK = 200;

function readCount(json: Json, key: string): number {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return 0;
  const value = json[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Abre um lote de importação (histórico). Descarta o "desfazer" das importações anteriores. */
export async function startImportBatch(fileName: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('start_import_batch', { p_file_name: fileName });
    if (error) throw error;
    return data;
  } catch (error) {
    throw toServiceError(error, 'registrar a importação');
  }
}

/** Importações mais recentes primeiro, com quantos registros criados ainda estão na base. */
export async function listImportBatches(limit = 20): Promise<ImportBatchWithStats[]> {
  try {
    const { data, error } = await supabase
      .from('import_batches')
      .select('*, system_products(count)')
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    // Só a importação mais nova de todas pode ser desfeita: ao abrir um lote, o
    // estado anterior guardado pelos lotes antigos é descartado.
    return data.map(({ system_products: created, ...batch }, index) => ({
      ...batch,
      remaining: created[0]?.count ?? 0,
      canUndo: index === 0 && batch.undone_at === null && batch.finished_at !== null,
    }));
  } catch (error) {
    throw toServiceError(error, 'carregar o histórico de importações');
  }
}

/**
 * Desfaz a importação mais recente: exclui os códigos que ela criou e devolve
 * descrição/marca dos que ela alterou. Produtos do catálogo não são afetados.
 */
export async function undoImportBatch(batchId: string): Promise<UndoImportResult> {
  try {
    const { data, error } = await supabase.rpc('undo_import_batch', { p_batch_id: batchId });
    if (error) throw error;
    return { deleted: readCount(data, 'deleted'), restored: readCount(data, 'restored') };
  } catch (error) {
    throw toServiceError(error, 'desfazer a importação');
  }
}

/** Exclui da base os registros que uma importação criou (sem restaurar alterações). */
export async function deleteImportBatchRecords(batchId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('delete_import_batch_records', { p_batch_id: batchId });
    if (error) throw error;
    return data;
  } catch (error) {
    throw toServiceError(error, 'excluir os registros da importação');
  }
}

/**
 * Exclui registros da base do sistema (tabela auxiliar da planilha).
 * Códigos que estão em produtos do catálogo também podem ser excluídos daqui:
 * o produto continua publicado, só o registro da planilha sai da base.
 */
export async function deleteSystemProducts(
  rows: ReadonlyArray<Pick<ReconciliationRow, 'code' | 'status'>>,
): Promise<DeleteSystemProductsResult> {
  const codes = [...new Set(rows.map((row) => row.code))];
  let deleted = 0;
  try {
    for (let start = 0; start < codes.length; start += DELETE_CHUNK) {
      const chunk = codes.slice(start, start + DELETE_CHUNK);
      const { data, error } = await supabase.from('system_products').delete().in('code', chunk).select('code');
      if (error) throw error;
      deleted += data.length;
    }
  } catch (error) {
    const serviceError = toServiceError(error, 'excluir os registros da base');
    if (deleted > 0) serviceError.message = `${deleted} excluído(s) antes do erro. ${serviceError.message}`;
    throw serviceError;
  }
  return { deleted, inCatalog: rows.filter((row) => row.status !== 'missing').length };
}
