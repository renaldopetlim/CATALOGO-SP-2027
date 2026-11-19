-- =============================================================================
-- Catálogo SP 2027 — Marcas e logos
--
-- Execute no SQL Editor DEPOIS das migrações anteriores (…000000 a …040000).
-- Idempotente: pode ser executado mais de uma vez.
--
--   brands                    marcas (nome único, logo opcional, ativa/inativa)
--   catalog_items.brand_id    FK para brands (ON DELETE RESTRICT)
--   catalog_items.brand       MANTIDO por compatibilidade: preenchido
--                             automaticamente com o nome da marca vinculada
--                             (busca, conciliação e telas antigas continuam ok)
--   Logos: bucket público `catalog-images`, pasta `brands/` (as políticas do
--          bucket já permitem leitura pública e envio só por administradores).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. TABELA brands
-- -----------------------------------------------------------------------------
create table if not exists public.brands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  logo_url   text check (logo_url is null or logo_url ~ '^https?://'),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Nome único sem diferenciar maiúsculas ("Tigre" = "TIGRE").
create unique index if not exists brands_name_unique_idx on public.brands (lower(name));
create index if not exists brands_active_name_idx on public.brands (is_active, name);

create or replace function public.brands_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name     := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.logo_url := nullif(btrim(coalesce(new.logo_url, '')), '');
  return new;
end;
$$;

drop trigger if exists brands_prepare on public.brands;
create trigger brands_prepare
  before insert or update on public.brands
  for each row
  execute function public.brands_prepare();


-- -----------------------------------------------------------------------------
-- 2. RLS — visitante lê marcas ativas; admin lê e grava tudo
-- -----------------------------------------------------------------------------
alter table public.brands enable row level security;

drop policy if exists "brands: leitura pública de ativas" on public.brands;
create policy "brands: leitura pública de ativas"
  on public.brands for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "brands: admin lê tudo" on public.brands;
create policy "brands: admin lê tudo"
  on public.brands for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "brands: admin cria" on public.brands;
create policy "brands: admin cria"
  on public.brands for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "brands: admin edita" on public.brands;
create policy "brands: admin edita"
  on public.brands for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "brands: admin exclui" on public.brands;
create policy "brands: admin exclui"
  on public.brands for delete
  to authenticated
  using ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- 3. VÍNCULO PRODUTO → MARCA
-- -----------------------------------------------------------------------------
alter table public.catalog_items
  add column if not exists brand_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_brand_id_fkey') then
    alter table public.catalog_items
      add constraint catalog_items_brand_id_fkey
      foreign key (brand_id) references public.brands (id)
      on update cascade on delete restrict;
  end if;
end;
$$;

create index if not exists catalog_items_brand_idx on public.catalog_items (brand_id);


-- -----------------------------------------------------------------------------
-- 4. MIGRAÇÃO: cria marcas a partir do texto `brand` existente e vincula
-- -----------------------------------------------------------------------------
insert into public.brands (name)
select distinct on (lower(btrim(regexp_replace(brand, '\s+', ' ', 'g'))))
       btrim(regexp_replace(brand, '\s+', ' ', 'g'))
from public.catalog_items
where nullif(btrim(coalesce(brand, '')), '') is not null
on conflict do nothing;

update public.catalog_items ci
   set brand_id = b.id
  from public.brands b
 where ci.brand_id is null
   and nullif(btrim(coalesce(ci.brand, '')), '') is not null
   and lower(btrim(regexp_replace(ci.brand, '\s+', ' ', 'g'))) = lower(b.name);


-- -----------------------------------------------------------------------------
-- 5. SINCRONIA DO TEXTO `brand` (compatibilidade)
--    Produto com brand_id → `brand` recebe o nome da marca.
--    (substitui a função das migrações anteriores, mantendo o resto igual)
-- -----------------------------------------------------------------------------
create or replace function public.catalog_items_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);

  if new.brand_id is not null then
    select b.name into new.brand from public.brands b where b.id = new.brand_id;
  else
    new.brand := nullif(btrim(coalesce(new.brand, '')), '');
  end if;

  -- Tags: minúsculas, sem espaços nas pontas, sem vazias e sem duplicadas.
  new.tags := coalesce(
    (
      select array_agg(distinct t order by t)
      from (select lower(btrim(x)) as t from unnest(coalesce(new.tags, '{}')) as x) s
      where t <> ''
    ),
    '{}'
  );

  new.search_text := lower(extensions.unaccent(concat_ws(' ',
    new.title,
    new.brand,
    array_to_string(new.tags, ' '),
    (select string_agg(concat_ws(' ', s ->> 'label', s ->> 'value'), ' ')
       from jsonb_array_elements(coalesce(new.specifications, '[]'::jsonb)) as s),
    (select string_agg(concat_ws(' ', c.code, c.description, c.packaging), ' ')
       from public.catalog_item_codes as c
      where c.item_id = new.id)
  )));

  return new;
end;
$$;

-- Marca renomeada → atualiza o texto `brand` (e a busca) de todos os seus produtos.
create or replace function public.brands_touch_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    update public.catalog_items set updated_at = now() where brand_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function public.brands_touch_items() from public, anon, authenticated;

drop trigger if exists brands_touch_items on public.brands;
create trigger brands_touch_items
  after update on public.brands
  for each row
  execute function public.brands_touch_items();

-- Mudanças em marcas (logo, nome, ativa) avisam a vitrine em tempo real.
drop trigger if exists brands_bump_catalog_sync on public.brands;
create trigger brands_bump_catalog_sync
  after insert or update or delete on public.brands
  for each statement
  execute function public.bump_catalog_sync();

-- Recalcula `brand` e a busca dos produtos já vinculados.
update public.catalog_items set title = title where brand_id is not null;


-- -----------------------------------------------------------------------------
-- 6. GRAVAÇÃO ATÔMICA DO PRODUTO: agora com brand_id
--    p_item.brand_id (uuid ou null). `brand` (texto) só é usado quando não há
--    brand_id, para compatibilidade com chamadas antigas.
-- -----------------------------------------------------------------------------
create or replace function public.save_catalog_item(p_id uuid, p_item jsonb, p_codes jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_code jsonb;
  v_pos integer := 0;
  v_keep uuid[] := '{}';
  v_code_id uuid;
  v_brand_id uuid := nullif(p_item ->> 'brand_id', '')::uuid;
begin
  if jsonb_typeof(p_codes) is distinct from 'array' or jsonb_array_length(p_codes) = 0 then
    raise exception 'Informe ao menos um código para o produto.' using errcode = '23514';
  end if;

  if v_id is null then
    insert into public.catalog_items
      (title, brand_id, brand, category_id, badge, image_url, tags, specifications, is_featured, is_active)
    values (
      p_item ->> 'title',
      v_brand_id,
      case when v_brand_id is null then p_item ->> 'brand' end,
      (p_item ->> 'category_id')::uuid,
      p_item ->> 'badge',
      p_item ->> 'image_url',
      coalesce(array(select jsonb_array_elements_text(p_item -> 'tags')), '{}'),
      coalesce(p_item -> 'specifications', '[]'::jsonb),
      coalesce((p_item ->> 'is_featured')::boolean, false),
      coalesce((p_item ->> 'is_active')::boolean, true)
    )
    returning id into v_id;
  else
    update public.catalog_items set
      title          = p_item ->> 'title',
      brand_id       = v_brand_id,
      brand          = case when v_brand_id is null then p_item ->> 'brand' end,
      category_id    = (p_item ->> 'category_id')::uuid,
      badge          = p_item ->> 'badge',
      image_url      = p_item ->> 'image_url',
      tags           = coalesce(array(select jsonb_array_elements_text(p_item -> 'tags')), '{}'),
      specifications = coalesce(p_item -> 'specifications', '[]'::jsonb),
      is_featured    = coalesce((p_item ->> 'is_featured')::boolean, false),
      is_active      = coalesce((p_item ->> 'is_active')::boolean, true)
    where id = v_id;

    if not found then
      raise exception 'Produto não encontrado ou sem permissão para editá-lo.' using errcode = 'P0002';
    end if;
  end if;

  select coalesce(array_agg((c ->> 'id')::uuid), '{}')
    into v_keep
    from jsonb_array_elements(p_codes) as c
   where nullif(c ->> 'id', '') is not null;

  delete from public.catalog_item_codes
   where item_id = v_id and not (id = any (v_keep));

  for v_code in select value from jsonb_array_elements(p_codes) loop
    v_code_id := nullif(v_code ->> 'id', '')::uuid;

    if v_code_id is not null then
      update public.catalog_item_codes set
        code        = v_code ->> 'code',
        description = v_code ->> 'description',
        packaging   = v_code ->> 'packaging',
        sort_order  = v_pos
      where id = v_code_id and item_id = v_id;

      if not found then
        raise exception 'Código não pertence a este produto.' using errcode = 'P0002';
      end if;
    else
      insert into public.catalog_item_codes (item_id, code, description, packaging, sort_order)
      values (v_id, v_code ->> 'code', v_code ->> 'description', v_code ->> 'packaging', v_pos);
    end if;

    v_pos := v_pos + 1;
  end loop;

  update public.catalog_items set updated_at = now() where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.save_catalog_item(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_catalog_item(uuid, jsonb, jsonb) to authenticated;
