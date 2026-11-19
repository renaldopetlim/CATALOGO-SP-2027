import type { ReactNode } from 'react';
import { Modal } from './Modal';

type ConfirmDialogProps = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Desabilita os botões durante a operação. */
  busy?: boolean;
  /** `danger` destaca a ação destrutiva com a cor de erro. */
  tone?: 'default' | 'danger';
  /** Oculta o botão de confirmação (apenas aviso). */
  hideConfirm?: boolean;
  /** Ação extra (ex.: "Inativar" em vez de excluir). */
  extraAction?: ReactNode;
};

/** Confirmação no padrão do modal do Termo (título laranja, botões em largura total). */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  tone = 'default',
  hideConfirm = false,
  extraAction,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={busy ? () => undefined : onCancel} showTitle>
      <div className="confirm-body">{children}</div>
      <div className="confirm-actions">
        {!hideConfirm && (
          <button type="button" className={tone === 'danger' ? 'danger' : 'pri'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Aguarde…' : confirmLabel}
          </button>
        )}
        {extraAction}
        <button type="button" className="sec" onClick={onCancel} disabled={busy}>
          {hideConfirm ? 'Entendido' : 'Cancelar'}
        </button>
      </div>
    </Modal>
  );
}
