import { listImportBatches } from '../services/importService';
import { useResource } from './useResource';

/** Histórico das últimas importações de planilha. */
export function useImportBatches(limit = 20) {
  return useResource(`import-batches:${limit}`, () => listImportBatches(limit), 'carregar o histórico de importações');
}
