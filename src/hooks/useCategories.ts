import { useCallback, useEffect, useState } from 'react';
import { listPublicCategories } from '../services/categoryService';
import type { ServiceError } from '../lib/errors';
import type { Category } from '../types/catalog';
import { asServiceError, type AsyncStatus } from './asyncState';

export type UseCategoriesResult = {
  categories: Category[];
  status: AsyncStatus;
  error: ServiceError | null;
  reload: () => void;
};

type Loaded = { attempt: number; categories: Category[]; error: ServiceError | null };

/** Categorias ativas para a vitrine. */
export function useCategories(): UseCategoriesResult {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;

    listPublicCategories()
      .then((categories) => {
        if (!cancelled) setLoaded({ attempt, categories, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoaded({ attempt, categories: [], error: asServiceError(err, 'carregar as categorias') });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // Resultado de uma tentativa anterior = ainda carregando a atual.
  const current = loaded?.attempt === attempt ? loaded : null;
  const status: AsyncStatus = !current ? 'loading' : current.error ? 'error' : 'success';

  return { categories: current?.categories ?? [], status, error: current?.error ?? null, reload };
}
