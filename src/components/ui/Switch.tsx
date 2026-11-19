type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Rótulo acessível (ex.: "Ativo: Porcelanato 60x60"). */
  label: string;
  /** Texto visível ao lado (ex.: "Ativo" / "Inativo"). */
  text?: string;
  disabled?: boolean;
  /** `featured` usa a cor de destaque (laranja). */
  tone?: 'default' | 'featured';
};

/** Alternador acessível (role="switch") para ações rápidas na tabela. */
export function Switch({ checked, onChange, label, text, disabled = false, tone = 'default' }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`switch${tone === 'featured' ? ' featured' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      {text && <span className="switch-text">{text}</span>}
    </button>
  );
}
