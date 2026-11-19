import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';

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

/**
 * Modal acessível: fecha com Esc e clique fora, mantém o foco dentro,
 * trava a rolagem da página e devolve o foco ao elemento de origem.
 */
export function Modal({ title, onClose, children, size = 'default', showTitle = false }: ModalProps) {
  const titleId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  useDialogBehavior(contentRef, onClose);

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
