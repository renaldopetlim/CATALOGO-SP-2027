import { useEffect, useId, useRef, useState } from 'react';
import { useAdminBrands } from '../../hooks/useAdminBrands';
import { isServiceError } from '../../lib/errors';
import { stripAccents } from '../../lib/format';
import { createBrand } from '../../services/brandService';
import { BrandLogo } from '../brand/BrandLogo';

type BrandSelectProps = {
  /** `brands.id` selecionado; '' = sem marca. */
  value: string;
  onChange: (brandId: string) => void;
  /**
   * Nome de marca vindo de fora (ex.: base do sistema na conciliação).
   * Se existir uma marca com esse nome, ela é selecionada; senão, oferece criar.
   */
  hintName?: string;
  disabled?: boolean;
};

const sameName = (a: string, b: string) => stripAccents(a).trim().toLowerCase() === stripAccents(b).trim().toLowerCase();

/** Seleção de marca cadastrada, com criação rápida sem sair do formulário de produto. */
export function BrandSelect({ value, onChange, hintName = '', disabled = false }: BrandSelectProps) {
  const selectId = useId();
  const newId = useId();
  const { brands, status, update } = useAdminBrands();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = brands.find((brand) => brand.id === value) ?? null;
  const hintMatch = hintName ? (brands.find((brand) => sameName(brand.name, hintName)) ?? null) : null;

  // Pré-seleciona a marca sugerida assim que a lista chega (uma vez só).
  const hintApplied = useRef(false);
  useEffect(() => {
    if (hintApplied.current || status !== 'success' || value || !hintMatch) return;
    hintApplied.current = true;
    onChange(hintMatch.id);
  }, [status, value, hintMatch, onChange]);

  // Ativas + a marca atual (mesmo inativa), em ordem alfabética.
  const options = brands.filter((brand) => brand.is_active || brand.id === value);

  const openCreate = (name: string) => {
    setNewName(name);
    setError(null);
    setCreating(true);
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) {
      setError('Informe o nome da marca.');
      return;
    }
    // Já existe (inclusive inativa)? Seleciona em vez de duplicar.
    const existing = brands.find((brand) => sameName(brand.name, name));
    if (existing) {
      onChange(existing.id);
      setCreating(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const brand = await createBrand({ name });
      update((prev) => [...prev, { ...brand, product_count: 0 }].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      onChange(brand.id);
      setCreating(false);
    } catch (err) {
      setError(isServiceError(err) ? err.message : 'Não foi possível criar a marca.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="brand-select">
      <label htmlFor={selectId}>Marca</label>
      <div className="brand-select-row">
        {selected && <BrandLogo name={selected.name} logoUrl={selected.logo_url} size="md" decorative />}
        <select id={selectId} value={value} disabled={disabled || status === 'loading'} onChange={(e) => onChange(e.target.value)}>
          <option value="">{status === 'loading' ? 'Carregando marcas…' : 'Sem marca'}</option>
          {options.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
              {brand.is_active ? '' : ' (inativa)'}
            </option>
          ))}
        </select>
        {!creating && (
          <button type="button" className="act" disabled={disabled} onClick={() => openCreate('')}>
            + Nova marca
          </button>
        )}
      </div>

      {!creating && hintName && !hintMatch && status === 'success' && !value && (
        <p className="hint warn brand-hint">
          A marca “{hintName}” ainda não está cadastrada.{' '}
          <button type="button" className="tb-link" onClick={() => openCreate(hintName)} disabled={disabled}>
            Criar “{hintName}”
          </button>
        </p>
      )}

      {creating && (
        <div className="brand-quick">
          <label htmlFor={newId} className="sr-only">
            Nome da nova marca
          </label>
          <input
            id={newId}
            value={newName}
            maxLength={120}
            placeholder="Nome da nova marca"
            autoFocus
            disabled={busy}
            className={error ? 'bad' : undefined}
            onChange={(e) => {
              setNewName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              // Enter cria a marca sem enviar o formulário do produto.
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              }
            }}
          />
          <button type="button" className="act act-pri" onClick={() => void create()} disabled={busy}>
            {busy ? 'Criando…' : 'Criar'}
          </button>
          <button type="button" className="act" onClick={() => setCreating(false)} disabled={busy}>
            Cancelar
          </button>
          {error && <div className="msg brand-quick-error">{error}</div>}
          <p className="hint brand-quick-hint">O logo pode ser adicionado depois em Marcas.</p>
        </div>
      )}
    </div>
  );
}
