import { useCallback, useEffect, useState } from 'react';

export type ToastKind = 'ok' | 'err' | 'warn';
export type ToastMessage = { id: number; kind: ToastKind; text: string };

const DURATION_MS: Record<ToastKind, number> = { ok: 3500, warn: 6000, err: 7000 };

/** Mensagem de retorno temporária ("Item salvo", "Erro ao excluir"…). */
export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), DURATION_MS[toast.kind]);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const show = useCallback((kind: ToastKind, text: string) => setToast({ id: Date.now(), kind, text }), []);
  const dismiss = useCallback(() => setToast(null), []);

  return { toast, show, dismiss };
}
