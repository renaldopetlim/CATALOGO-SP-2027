import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ModalProps = {
  /** Título acessível (lido por leitores de tela). */
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** `wide` = 680px (detalhes); padrão = 420px (avisos/confirmações). */
  size?: 'default' | 'wide';
  /** Exibe o título visualmente no padrão h3 laranja do modal do Termo. */
  showTitle?: boolean;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal acessível: fecha com Esc e clique fora, mantém o foco dentro,
 * trava a rolagem da página e devolve o foco ao elemento de origem.
 */
export function Modal({ title, onClose, children, size = 'default', showTitle = false }: ModalProps) {
  const titleId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  // Sempre chama o `onClose` mais recente sem reinstalar os listeners.
  const handleEscape = useEffectEvent(() => onClose());

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    contentRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleEscape();
        return;
      }
      if (event.key !== 'Tab' || !contentRef.current) return;

      const focusable = Array.from(contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        className={`modal-content${size === 'wide' ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
        {showTitle ? (
          <h3 id={titleId}>{title}</h3>
        ) : (
          <span id={titleId} className="sr-only">
            {title}
          </span>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
