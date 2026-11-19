import { ServiceError } from './errors';
import { stripAccents } from './format';
import type {
  ImportPreview,
  NormalizeOptions,
  PreviewRow,
  RawSheet,
  RequiredColumn,
  SystemProductInput,
} from '../types/systemProducts';

/* ==========================================================================
   LEITURA DO ARQUIVO (.csv / .xlsx)
   As bibliotecas são carregadas sob demanda: só quem importa as baixa.
   ========================================================================== */

export const ACCEPTED_EXTENSIONS = ['.csv', '.txt', '.xlsx'] as const;
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
export const MAX_ROWS = 50_000;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/** Converte qualquer valor de célula em texto (números sem notação científica, datas em ISO). */
function cellToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isInteger(value) ? value.toFixed(0) : String(value);
  if (typeof value === 'boolean') return value ? 'SIM' : 'NÃO';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  return String(value);
}

/**
 * Decodifica o CSV: tenta UTF-8 e, se houver bytes inválidos, usa Windows-1252
 * (padrão do Excel em português ao "Salvar como CSV").
 */
function decodeCsv(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

async function readCsv(file: File): Promise<string[][]> {
  const { default: Papa } = await import('papaparse');
  const text = decodeCsv(await file.arrayBuffer());
  // Delimitador detectado automaticamente (",", ";" ou tab).
  const result = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  const fatal = result.errors.find((error) => error.type === 'Delimiter' && result.data.length === 0);
  if (fatal) throw new ServiceError('validation', 'Não foi possível identificar as colunas do CSV.');
  return result.data;
}

async function readXlsx(file: File): Promise<string[][]> {
  const { readSheet } = await import('read-excel-file/browser');
  const data = await readSheet(file);
  return data.map((row) => row.map(cellToText));
}

/** Lê o arquivo e devolve cabeçalho + linhas (tudo como texto). */
export async function readSpreadsheet(file: File): Promise<RawSheet> {
  const extension = extensionOf(file.name);
  if (extension === '.xls') {
    throw new ServiceError('validation', 'Arquivos .xls (Excel 97–2003) não são suportados. Salve como .xlsx ou .csv e tente de novo.');
  }
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new ServiceError('validation', 'Formato não suportado. Envie um arquivo .csv ou .xlsx.');
  }
  if (file.size === 0) throw new ServiceError('validation', 'O arquivo está vazio.');
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new ServiceError('validation', 'Arquivo grande demais (máx. 15 MB). Divida a planilha em partes.');
  }

  let rows: string[][];
  try {
    rows = extension === '.xlsx' ? await readXlsx(file) : await readCsv(file);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError('validation', 'Não foi possível ler o arquivo. Confira se ele não está corrompido ou protegido por senha.', {
      cause: error,
    });
  }

  // Cabeçalho = primeira linha com algum conteúdo.
  const headerIndex = rows.findIndex((row) => row.some((cell) => cell.trim() !== ''));
  if (headerIndex < 0) throw new ServiceError('validation', 'A planilha não tem dados.');

  const headers = (rows[headerIndex] ?? []).map((cell) => cell.trim());
  const body = rows.slice(headerIndex + 1);
  if (body.length > MAX_ROWS) {
    throw new ServiceError('validation', `A planilha tem ${body.length.toLocaleString('pt-BR')} linhas. O máximo por importação é ${MAX_ROWS.toLocaleString('pt-BR')}.`);
  }

  return { fileName: file.name, headers, rows: body, headerLine: headerIndex + 1 };
}

/* ==========================================================================
   NORMALIZAÇÃO E VALIDAÇÃO
   ========================================================================== */

/** Nomes aceitos para cada coluna obrigatória (comparados sem acento, espaço ou pontuação). */
const COLUMN_ALIASES: Record<RequiredColumn, string[]> = {
  CODIGO: ['CODIGO', 'COD', 'CODPROD', 'CODPRODUTO', 'CODIGOPRODUTO', 'CODIGODOPRODUTO'],
  DESCRICAO: ['DESCRICAO', 'DESC', 'DESCRICAOPRODUTO', 'DESCRICAODOPRODUTO', 'PRODUTO'],
  MARCA: ['MARCA', 'FABRICANTE'],
};

const COLUMN_LABELS: Record<RequiredColumn, string> = { CODIGO: 'CODIGO', DESCRICAO: 'DESCRICAO', MARCA: 'MARCA' };

/** "Código do produto" → "CODIGODOPRODUTO". */
export function normalizeHeader(header: string): string {
  return stripAccents(header).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Posição de cada coluna obrigatória no cabeçalho. Lança erro listando as que faltam. */
export function mapColumns(headers: string[]): Record<RequiredColumn, number> {
  const normalized = headers.map(normalizeHeader);
  const missing: string[] = [];
  const result = {} as Record<RequiredColumn, number>;

  for (const column of Object.keys(COLUMN_ALIASES) as RequiredColumn[]) {
    const index = normalized.findIndex((header) => COLUMN_ALIASES[column].includes(header));
    if (index < 0) missing.push(COLUMN_LABELS[column]);
    else result[column] = index;
  }

  if (missing.length > 0) {
    const found = headers.filter(Boolean).join(', ') || '(nenhuma)';
    throw new ServiceError(
      'validation',
      `Coluna(s) obrigatória(s) não encontrada(s): ${missing.join(', ')}. Colunas encontradas: ${found}.`,
    );
  }
  return result;
}

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Mesma normalização aplicada pelo banco (trigger de `system_products`). */
export function normalizeRow(
  raw: SystemProductInput,
  { uppercaseDescription }: NormalizeOptions,
): SystemProductInput {
  const description = collapse(raw.description);
  return {
    code: collapse(raw.code).toUpperCase(),
    description: uppercaseDescription ? description.toUpperCase() : description,
    brand: collapse(raw.brand).toUpperCase(),
  };
}

function validate(row: SystemProductInput): string[] {
  const messages: string[] = [];
  if (!row.code) messages.push('CODIGO vazio');
  else if (row.code.length > 60) messages.push('CODIGO com mais de 60 caracteres');
  if (!row.description) messages.push('DESCRICAO vazia');
  else if (row.description.length > 500) messages.push('DESCRICAO com mais de 500 caracteres');
  if (!row.brand) messages.push('MARCA vazia');
  else if (row.brand.length > 120) messages.push('MARCA com mais de 120 caracteres');
  return messages;
}

/**
 * Monta a pré-visualização: normaliza, valida campos obrigatórios e marca
 * códigos repetidos (vale a ÚLTIMA ocorrência, como no banco).
 */
export function buildPreview(sheet: RawSheet, options: NormalizeOptions): ImportPreview {
  const columns = mapColumns(sheet.headers);
  const firstDataLine = sheet.headerLine + 1;
  const rows: PreviewRow[] = [];

  sheet.rows.forEach((cells, index) => {
    if (cells.every((cell) => cell.trim() === '')) return; // linha em branco
    const normalized = normalizeRow(
      {
        code: cells[columns.CODIGO] ?? '',
        description: cells[columns.DESCRICAO] ?? '',
        brand: cells[columns.MARCA] ?? '',
      },
      options,
    );
    const messages = validate(normalized);
    rows.push({ ...normalized, line: firstDataLine + index, status: messages.length ? 'invalid' : 'valid', messages });
  });

  // Repetidos: percorre de trás para frente; a última ocorrência válida fica.
  const lastLineByCode = new Map<string, number>();
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row || row.status !== 'valid') continue;
    const kept = lastLineByCode.get(row.code);
    if (kept === undefined) lastLineByCode.set(row.code, row.line);
    else rows[i] = { ...row, status: 'duplicate', messages: [`Código repetido; vale a linha ${kept}`] };
  }

  return {
    fileName: sheet.fileName,
    rows,
    valid: rows.filter((row) => row.status === 'valid').length,
    invalid: rows.filter((row) => row.status === 'invalid').length,
    duplicate: rows.filter((row) => row.status === 'duplicate').length,
  };
}
