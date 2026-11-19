-- =============================================================================
-- Catálogo SP 2027 — Base do sistema interno + conciliação com o catálogo
--
-- Execute no SQL Editor DEPOIS das migrações anteriores (…000000, …020000, …030000).
-- Idempotente: pode ser executado mais de uma vez.
--
--   system_products                  registros importados da planilha do sistema
--                                    (código, descrição, marca), um por código
--   import_system_products(rows)     upsert em lote; devolve inseridos/atualizados/sem mudança
--   system_products_reconciliation   view: cada código da base + situação no catálogo
--                                    ('missing' | 'inactive' | 'published')
--
-- Acesso: somente administradores (is_admin()). Dados internos não ficam
-- visíveis para visitantes nem para usuários logados sem permissão.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. TABELA
-- -----------------------------------------------------------------------------
create table if not exists public.system_products (
  -- Mesmo formato dos códigos do catálogo: sem espaços nas pontas, MAIÚSCULO.
  code        text primary key check (char_length(code) between 1 and 60),
  description text not null check (char_length(btrim(description)) between 1 and 500),
  brand       text not null check (char_length(btrim(brand)) between 1 and 120),
  -- Texto normalizado (minúsculo, sem acento) para a busca da conciliação.
  search_text text not null default '',
  created_at  timestamptz not null default now(),
  -- Só muda quando descrição ou marca realmente mudam (ver trigger).
  updated_at  timestamptz not null default now(),
  -- Última importação em que o código apareceu na planilha.
  last_seen_at timestamptz not null default now()
);

create index if not exists system_products_search_trgm_idx
  on public.system_products using gin (search_text extensions.gin_trgm_ops);

create or replace function public.system_products_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.code        := upper(btrim(regexp_replace(new.code, '\s+', ' ', 'g')));
  new.description := btrim(regexp_replace(new.description, '\s+', ' ', 'g'));
  new.brand       := upper(btrim(regexp_replace(new.brand, '\s+', ' ', 'g')));
  new.search_text := lower(extensions.unaccent(concat_ws(' ', new.code, new.description, new.brand)));

  if tg_op = 'UPDATE' then
    if (new.description, new.brand) is distinct from (old.description, old.brand) then
      new.updated_at := now();
    else
      new.updated_at := old.updated_at;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists system_products_prepare on public.system_products;
create trigger system_products_prepare
  before insert or update on public.system_products
  for each row
  execute function public.system_products_prepare();


-- -----------------------------------------------------------------------------
-- 2. RLS — somente administradores
-- -----------------------------------------------------------------------------
alter table public.system_products enable row level security;

drop policy if exists "system_products: admin lê" on public.system_products;
create policy "system_products: admin lê"
  on public.system_products for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "system_products: admin cria" on public.system_products;
create policy "system_products: admin cria"
  on public.system_products for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "system_products: admin edita" on public.system_products;
create policy "system_products: admin edita"
  on public.system_products for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "system_products: admin exclui" on public.system_products;
create policy "system_products: admin exclui"
  on public.system_products for delete
  to authenticated
  using ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- 3. IMPORTAÇÃO EM LOTE (upsert por código)
--    p_rows: [{"code": "...", "description": "...", "brand": "..."}]
--    Retorna: {"received": n, "inserted": n, "updated": n, "unchanged": n}
--    SECURITY INVOKER: a RLS continua valendo (só admin consegue gravar).
--    Códigos repetidos no mesmo lote: vale a última ocorrência.
-- -----------------------------------------------------------------------------
create or replace function public.import_system_products(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_received  integer;
  v_inserted  integer := 0;
  v_updated   integer := 0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Formato inválido: era esperada uma lista de registros.' using errcode = '22023';
  end if;

  with input as (
    select distinct on (code) code, description, brand
    from (
      select upper(btrim(regexp_replace(r ->> 'code', '\s+', ' ', 'g'))) as code,
             r ->> 'description' as description,
             r ->> 'brand' as brand,
             ord
      from jsonb_array_elements(p_rows) with ordinality as t(r, ord)
    ) raw
    order by code, ord desc
  ),
  upserted as (
    insert into public.system_products as sp (code, description, brand, last_seen_at)
    select code, description, brand, now() from input
    on conflict (code) do update
      set description  = excluded.description,
          brand        = excluded.brand,
          last_seen_at = now()
    -- xmax = 0 → linha nova; caso contrário, já existia.
    returning (xmax = 0) as is_new,
              sp.updated_at
  )
  select count(*) filter (where is_new),
         count(*) filter (where not is_new and updated_at >= now()),
         (select count(*) from input)
    into v_inserted, v_updated, v_received
  from upserted;

  return jsonb_build_object(
    'received',  v_received,
    'inserted',  v_inserted,
    'updated',   v_updated,
    'unchanged', v_received - v_inserted - v_updated
  );
end;
$$;

revoke all on function public.import_system_products(jsonb) from public, anon;
grant execute on function public.import_system_products(jsonb) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. CONCILIAÇÃO: base do sistema × códigos do catálogo
--    catalog_status:
--      'published' → código em produto ATIVO de categoria ATIVA (aparece na vitrine)
--      'inactive'  → código cadastrado, mas o produto ou a categoria está inativo
--      'missing'   → código não está em nenhum produto do catálogo
--    security_invoker: a view respeita a RLS de quem consulta (só admin vê a base).
-- -----------------------------------------------------------------------------
drop view if exists public.system_products_reconciliation;
create view public.system_products_reconciliation
with (security_invoker = true)
as
select
  sp.code,
  sp.description,
  sp.brand,
  sp.search_text,
  sp.updated_at,
  sp.last_seen_at,
  match.item_id    as catalog_item_id,
  match.item_title as catalog_item_title,
  case
    when match.item_id is null then 'missing'
    when match.published then 'published'
    else 'inactive'
  end as catalog_status
from public.system_products sp
left join lateral (
  select c.item_id,
         i.title as item_title,
         (i.is_active and cat.is_active) as published
  from public.catalog_item_codes c
  join public.catalog_items i on i.id = c.item_id
  join public.categories cat on cat.id = i.category_id
  where c.code = sp.code
  limit 1
) match on true;

grant select on public.system_products_reconciliation to authenticated;
