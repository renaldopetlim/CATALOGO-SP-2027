import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';

type DrawerProps = {
  title: string;
  /** Texto curto abaixo do título (ex.: "Cód. SP-0001 · Pisos"). */
  subtitle?: string;
  onClose: () => void;
  /** Conteúdo rolável. */
  children: ReactNode;
  /** Rodapé fixo (botões de ação). */
  footer?: ReactNode;
  /** Bloqueia fechar por Esc/clique fora (ex.: durante o salvamento). */
  locked?: boolean;
};

/**
 * Gaveta lateral (slide-over) à direita, 640px no desktop.
 * Sobrepõe a listagem sem tirar o administrador do contexto.
 */
export function Drawer({ title, subtitle, onClose, children, footer, locked = false }: DrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const close = () => {
    if (!locked) onClose();
  };
  useDialogBehavior(panelRef, close);

  return createPortal(
    <div
      className="drawer-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <aside ref={panelRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="drawer-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <button type="button" className="drawer-close" onClick={close} aria-label="Fechar" disabled={locked}>
            ✕
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}
