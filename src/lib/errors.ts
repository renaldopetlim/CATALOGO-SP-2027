/**
 * Erros padronizados da camada de serviços.
 *
 * Todo serviço lança apenas `ServiceError`. A UI pode exibir `error.message`
 * direto ao usuário (sempre em português) e decidir o comportamento por `error.kind`.
 */

export type ServiceErrorKind =
  | 'validation' //  dado inválido antes de chegar ao banco
  | 'not_found' //   registro inexistente ou sem permissão de leitura
  | 'conflict' //    valor único duplicado (slug, SKU)
  | 'in_use' //      registro referenciado por outro (categoria com itens)
  | 'permission' //  bloqueado pela RLS / usuário não é admin
  | 'auth' //        sessão ausente ou expirada
  | 'network' //     falha de conexão
  | 'unknown';

export class ServiceError extends Error {
  readonly kind: ServiceErrorKind;
  /** Código técnico original (Postgres, PostgREST ou Storage), quando houver. */
  readonly code: string | null;
  /** Detalhe técnico original, para log. */
  readonly details: string | null;

  constructor(
    kind: ServiceErrorKind,
    message: string,
    options: { code?: string | null; details?: string | null; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ServiceError';
    this.kind = kind;
    this.code = options.code ?? null;
    this.details = options.details ?? null;
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

/** Formato comum dos erros retornados pelo PostgREST (`PostgrestError`). */
type PostgrestLikeError = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

/** Formato comum dos erros do Storage. */
type StorageLikeError = {
  message: string;
  statusCode?: string | number;
  status?: number;
};

function hasMessage(value: unknown): value is { message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message: unknown }).message === 'string'
  );
}

function readString(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || !(key in value)) return null;
  const field = (value as Record<string, unknown>)[key];
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  return null;
}

function isNetworkFailure(message: string): boolean {
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message);
}

/** Extrai o nome da constraint violada, para mensagens mais específicas. */
function constraintName(error: PostgrestLikeError): string {
  const text = `${error.message} ${error.details ?? ''}`;
  const match = /constraint "([^"]+)"/.exec(text);
  return match?.[1] ?? '';
}

function fromPostgrest(error: PostgrestLikeError, context: string): ServiceError {
  const code = error.code ?? null;
  const details = [error.details, error.hint].filter(Boolean).join(' | ') || null;
  const opts = { code, details, cause: error };

  if (isNetworkFailure(error.message)) {
    return new ServiceError('network', 'Sem conexão com o servidor. Verifique a internet e tente novamente.', opts);
  }

  switch (code) {
    case '23505': {
      const constraint = constraintName(error);
      if (constraint.includes('slug')) {
        return new ServiceError('conflict', 'Já existe uma categoria com este slug.', opts);
      }
      if (constraint.includes('code')) {
        return new ServiceError('conflict', 'Um dos códigos informados já está cadastrado em outro produto.', opts);
      }
      return new ServiceError('conflict', 'Já existe um registro com estes dados.', opts);
    }
    case '23503':
      return new ServiceError(
        'in_use',
        context.includes('categoria')
          ? 'Esta categoria possui itens vinculados. Mova ou exclua os itens antes, ou apenas inative a categoria.'
          : 'A categoria selecionada não existe mais. Atualize a página e escolha outra.',
        opts,
      );
    case '23514':
    case '23502':
    case '22P02':
      return new ServiceError('validation', `Dados inválidos ao ${context}. Revise os campos.`, opts);
    case '42501':
      return new ServiceError('permission', 'Você não tem permissão para esta operação. Entre com uma conta de administrador.', opts);
    case 'P0001':
      // RAISE EXCEPTION das funções do banco: a mensagem já é para o usuário.
      return new ServiceError('validation', error.message || `Não foi possível ${context}.`, opts);
    case 'P0002':
      return new ServiceError('not_found', error.message || 'Registro não encontrado.', opts);
    case 'PGRST116':
      return new ServiceError('not_found', 'Registro não encontrado.', opts);
    case 'PGRST301':
    case 'PGRST302':
      return new ServiceError('auth', 'Sua sessão expirou. Entre novamente.', opts);
    case 'PGRST303':
      // Token recusado como vencido: sessão antiga ou relógio do computador errado.
      return new ServiceError(
        'auth',
        'Sua sessão expirou. Confira se a data e a hora do computador estão corretas e entre novamente.',
        opts,
      );
    default:
      return new ServiceError('unknown', `Não foi possível ${context}. Tente novamente.`, opts);
  }
}

function fromStorage(error: StorageLikeError, context: string): ServiceError {
  const status = Number(error.statusCode ?? error.status ?? NaN);
  const opts = { code: Number.isNaN(status) ? null : String(status), details: error.message, cause: error };

  if (isNetworkFailure(error.message)) {
    return new ServiceError('network', 'Sem conexão com o servidor. Verifique a internet e tente novamente.', opts);
  }
  if (status === 401) {
    return new ServiceError('auth', 'Sua sessão expirou. Entre novamente.', opts);
  }
  if (status === 403 || /row-level security|unauthorized/i.test(error.message)) {
    return new ServiceError('permission', 'Você não tem permissão para gerenciar imagens.', opts);
  }
  if (status === 404 || /not found/i.test(error.message)) {
    return new ServiceError('not_found', 'Imagem não encontrada no armazenamento.', opts);
  }
  if (status === 409 || /already exists/i.test(error.message)) {
    return new ServiceError('conflict', 'Já existe uma imagem com este nome.', opts);
  }
  if (status === 413 || /maximum allowed size|too large/i.test(error.message)) {
    return new ServiceError('validation', 'A imagem excede o tamanho máximo permitido (5 MB).', opts);
  }
  if (status === 415 || /mime type/i.test(error.message)) {
    return new ServiceError('validation', 'Formato de imagem não permitido. Use JPEG, PNG, WebP ou AVIF.', opts);
  }
  return new ServiceError('unknown', `Não foi possível ${context}. Tente novamente.`, opts);
}

/**
 * Converte qualquer erro (PostgREST, Storage, rede ou desconhecido) em `ServiceError`.
 * @param context ação em português, no infinitivo (ex.: "salvar a categoria").
 */
export function toServiceError(error: unknown, context: string): ServiceError {
  if (error instanceof ServiceError) return error;

  if (hasMessage(error)) {
    const isStorage =
      readString(error, 'name') === 'StorageApiError' ||
      readString(error, 'name') === 'StorageUnknownError' ||
      readString(error, 'statusCode') !== null;

    return isStorage
      ? fromStorage(error as StorageLikeError, context)
      : fromPostgrest(error as PostgrestLikeError, context);
  }

  return new ServiceError('unknown', `Não foi possível ${context}. Tente novamente.`, { cause: error });
}
