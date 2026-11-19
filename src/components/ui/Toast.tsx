import type { ToastMessage } from '../../hooks/useToast';

type ToastProps = {
  toast: ToastMessage | null;
  onDismiss: () => void;
};

/** Aviso flutuante no rodapé da tela. `aria-live` anuncia para leitores de tela. */
export function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <div className="toast-region" aria-live="polite" role="status">
      {toast && (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          <span>{toast.text}</span>
          <button type="button" className="toast-close" onClick={onDismiss} aria-label="Fechar aviso">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
