-- =============================================================================
-- Catálogo SP 2027 — Correção: "Não foi possível registrar a importação"
--
-- Execute no SQL Editor (depois das migrações anteriores). Idempotente.
--
-- Causa: start_import_batch() limpava o "desfazer" das importações anteriores
-- com `delete from import_batch_items;` (sem WHERE). Nas chamadas feitas pela
-- API, o Supabase ativa a extensão pg_safeupdate, que recusa DELETE/UPDATE sem
-- WHERE — então toda importação falhava ao abrir o lote. No SQL Editor (e nos
-- testes locais) a proteção não existe, por isso o erro não apareceu antes.
-- =============================================================================

create or replace function public.start_import_batch(p_file_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.has_permission('can_import_spreadsheet') then
    raise exception 'Sem permissão para importar planilhas.' using errcode = '42501';
  end if;

  -- O WHERE é obrigatório: o Supabase usa pg_safeupdate nas chamadas da API,
  -- que recusa DELETE/UPDATE sem WHERE ("DELETE requires a WHERE clause").
  delete from public.import_batch_items where batch_id is not null;

  insert into public.import_batches (file_name)
  values (left(coalesce(nullif(btrim(p_file_name), ''), 'planilha'), 255))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.start_import_batch(text) from public, anon;
grant execute on function public.start_import_batch(text) to authenticated;
