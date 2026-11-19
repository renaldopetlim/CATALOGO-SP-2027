import { useEffect, useEffectEvent, useId, useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';

type SearchBarProps = {
  /** Valor confirmado (vindo da URL). */
  value: string;
  /** Aplica a busca. Chamado ao pressionar Enter e, se `live`, enquanto digita (com debounce). */
  onSearch: (value: string) => void;
  /** `true` = busca enquanto digita; `false` = só ao enviar (ex.: página inicial). */
  live?: boolean;
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  /** Mantém o rótulo só para leitores de tela (barras compactas). */
  hideLabel?: boolean;
};

/** Campo de busca com debounce; sincroniza com a URL (voltar/avançar). */
export function SearchBar({
  value,
  onSearch,
  live = true,
  label = 'Buscar no catálogo',
  placeholder = 'Nome, SKU, descrição ou tag',
  submitLabel,
  hideLabel = false,
}: SearchBarProps) {
  const inputId = useId();
  const [text, setText] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);
  const debounced = useDebounce(text, 350);

  // URL mudou por fora (voltar/avançar, link) → atualiza o campo durante o render.
  if (value !== syncedValue) {
    setSyncedValue(value);
    setText(value);
  }

  // Lê sempre o `value`/`onSearch` mais recentes sem reexecutar o efeito.
  const applyDebounced = useEffectEvent((next: string) => {
    if (next.trim() !== value.trim()) onSearch(next);
  });

  // Digitação parou → aplica a busca (somente quando o texto digitado muda).
  useEffect(() => {
    if (live) applyDebounced(debounced);
  }, [debounced, live]);

  return (
    <form
      className="search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(text);
      }}
    >
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </label>
      <input
        id={inputId}
        type="search"
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        onChange={(event) => setText(event.target.value)}
      />
      {text && !submitLabel && (
        <button
          type="button"
          className="search-clear"
          aria-label="Limpar busca"
          onClick={() => {
            setText('');
            onSearch('');
          }}
        >
          ✕
        </button>
      )}
      {submitLabel && (
        <div className="bar">
          <button type="submit" className="pri">
            {submitLabel}
          </button>
        </div>
      )}
    </form>
  );
}
