import { toServiceError, type ServiceError } from '../lib/errors';

export type AsyncStatus = 'loading' | 'success' | 'error';

/** Garante um `ServiceError` mesmo que algo fora dos serviços lance outro tipo de erro. */
export function asServiceError(error: unknown, context: string): ServiceError {
  return toServiceError(error, context);
}
