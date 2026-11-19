-- =============================================================================
-- Catálogo SP 2027 — Produtos com marca, selo, ficha técnica e MÚLTIPLOS CÓDIGOS
--
-- Execute no SQL Editor DEPOIS das migrações 20261119000000 e 20261119020000.
-- Idempotente: pode ser executado mais de uma vez.
--
-- O que muda
--   catalog_items (produto):
--     + brand           marca (opcional)
--     + badge           selo opcional; hoje só 'LANCAMENTO' (exibido "LANÇAMENTO")
--     + specifications  ficha técnica: [{"label": "...", "value": "..."}]
--     - sku, short_description, detailed_description  (migrados, ver item 3)
--     = tags            continuam: usadas na busca, ocultas na vitrine
--     = price           mantida no banco, sem uso na interface (não perde dados)
--   catalog_item_codes (nova, filha): vários códigos por produto, cada um com
--     código (único no catálogo), descrição e embalagem.
--   save_catalog_item(): grava produto + códigos numa única transação.
--   A busca (search_text) passa a incluir marca, tags, ficha técnica e códigos.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. NOVAS COLUNAS DO PRODUTO
-- -----------------------------------------------------------------------------
alter table public.catalog_items
  add column if not exists brand text,
  add column if not exists badge text,
  add column if not exists specifications jsonb not null default '[]'::jsonb;

-- Ficha técnica válida: array de objetos {label: texto, value: texto não vazio}.
create or replace function public.is_valid_specifications(specs jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(specs) = 'array'
     and not exists (
       select 1
       from jsonb_array_elements(specs) as s
       where jsonb_typeof(s) <> 'object'
          or jsonb_typeof(s -> 'label') is distinct from 'string'
          or jsonb_typeof(s -> 'value') is distinct from 'string'
          or btrim(s ->> 'value') = ''
     );
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_brand_len') then
    alter table public.catalog_items
      add constraint catalog_items_brand_len check (brand is null or char_length(brand) <= 120);
  end if;
  -- Para criar novos selos no futuro: troque esta lista (ex.: 'LANCAMENTO','PROMOCAO').
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_badge_valid') then
    alter table public.catalog_items
      add constraint catalog_items_badge_valid check (badge is null or badge in ('LANCAMENTO'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_specifications_valid') then
    alter table public.catalog_items
      add constraint catalog_items_specifications_valid check (public.is_valid_specifications(specifications));
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 2. TABELA FILHA: CÓDIGOS DO PRODUTO
-- -----------------------------------------------------------------------------
create table if not exists public.catalog_item_codes (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.catalog_items (id) on delete cascade,
  code        text not null check (char_length(code) between 1 and 60),
  description text check (description is null or char_length(description) <= 500),
  packaging   text check (packaging is null or char_length(packaging) <= 120),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Código único no catálogo inteiro (gravado em MAIÚSCULAS pelo trigger).
-- DEFERRABLE: permite trocar códigos entre duas linhas na mesma gravação.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalog_item_codes_code_key') then
    alter table public.catalog_item_codes
      add constraint catalog_item_codes_code_key unique (code) deferrable initially deferred;
  end if;
end;
$$;

create index if not exists catalog_item_codes_item_idx
  on public.catalog_item_codes (item_id, sort_order);

-- Normaliza e atualiza updated_at.
create or replace function public.catalog_item_codes_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.code        := upper(btrim(new.code));
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  new.packaging   := nullif(btrim(coalesce(new.packaging, '')), '');
  new.updated_at  := now();
  return new;
end;
$$;

drop trigger if exists catalog_item_codes_prepare on public.catalog_item_codes;
create trigger catalog_item_codes_prepare
  before insert or update on public.catalog_item_codes
  for each row
  execute function public.catalog_item_codes_prepare();

-- Mudou um código → "toca" o produto: recalcula a busca, atualiza updated_at
-- e dispara o aviso de tempo real (trigger de catalog_sync no produto).
create or replace function public.catalog_item_codes_touch_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.catalog_items
     set updated_at = now()
   where id in (
     select (case when tg_op = 'DELETE' then old.item_id else new.item_id end)
     union
     select old.item_id where tg_op = 'UPDATE' and old.item_id is distinct from new.item_id
   );
  return null;
end;
$$;

revoke all on function public.catalog_item_codes_touch_item() from public, anon, authenticated;

drop trigger if exists catalog_item_codes_touch_item on public.catalog_item_codes;
create trigger catalog_item_codes_touch_item
  after insert or update or delete on public.catalog_item_codes
  for each row
  execute function public.catalog_item_codes_touch_item();


-- -----------------------------------------------------------------------------
-- 3. MIGRAÇÃO DOS DADOS EXISTENTES (só roda enquanto as colunas antigas existem)
--    sku                  → primeiro código (descrição = short_description)
--    short_description    → ficha técnica "Descrição", se o item não tinha SKU
--    detailed_description → ficha técnica, uma linha por item ("Rótulo: valor")
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'catalog_items' and column_name = 'sku'
  ) then
    -- Evita disparar o trigger de "toque" para cada linha migrada.
    alter table public.catalog_item_codes disable trigger catalog_item_codes_touch_item;

    insert into public.catalog_item_codes (item_id, code, description, sort_order)
    select ci.id, ci.sku, ci.short_description, 0
    from public.catalog_items ci
    where ci.sku is not null
      and not exists (select 1 from public.catalog_item_codes c where c.item_id = ci.id);

    alter table public.catalog_item_codes enable trigger catalog_item_codes_touch_item;

    update public.catalog_items ci
       set specifications = coalesce((
         select jsonb_agg(spec order by ord)
         from (
           select 0 as ord,
                  jsonb_build_object('label', 'Descrição', 'value', btrim(ci.short_description)) as spec
           where ci.sku is null and nullif(btrim(coalesce(ci.short_description, '')), '') is not null
           union all
           select l.ord,
                  case
                    when strpos(l.line, ':') > 1 then jsonb_build_object(
                      'label', btrim(split_part(l.line, ':', 1)),
                      'value', btrim(substr(l.line, strpos(l.line, ':') + 1)))
                    else jsonb_build_object('label', '', 'value', l.line)
                  end
           from (
             select ord, btrim(regexp_replace(raw, '^\s*[•\-\*]\s*', '')) as line
             from regexp_split_to_table(coalesce(ci.detailed_description, ''), E'\\n') with ordinality as t(raw, ord)
           ) l
           where l.line <> ''
             and btrim(substr(l.line, strpos(l.line, ':') + 1)) <> ''
         ) specs
       ), '[]'::jsonb)
     where ci.specifications = '[]'::jsonb;

    alter table public.catalog_items
      drop column sku,
      drop column short_description,
      drop column detailed_description;
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. BUSCA: título, marca, tags, ficha técnica e TODOS os códigos do produto
--    (substitui a função da migração inicial)
-- -----------------------------------------------------------------------------
create or replace function public.catalog_items_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.brand := nullif(btrim(coalesce(new.brand, '')), '');

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

-- Recalcula a busca de todos os produtos já existentes.
update public.catalog_items set title = title;


-- -----------------------------------------------------------------------------
-- 5. RLS DOS CÓDIGOS
--    Visitante: só códigos de produtos visíveis (a subconsulta passa pela RLS
--    de catalog_items, que já exige produto e categoria ativos).
--    Admin: leitura total e escrita.
-- -----------------------------------------------------------------------------
alter table public.catalog_item_codes enable row level security;

drop policy if exists "catalog_item_codes: leitura pública de produtos visíveis" on public.catalog_item_codes;
create policy "catalog_item_codes: leitura pública de produtos visíveis"
  on public.catalog_item_codes for select
  to anon, authenticated
  using (exists (select 1 from public.catalog_items i where i.id = catalog_item_codes.item_id));

drop policy if exists "catalog_item_codes: admin lê tudo" on public.catalog_item_codes;
create policy "catalog_item_codes: admin lê tudo"
  on public.catalog_item_codes for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "catalog_item_codes: admin cria" on public.catalog_item_codes;
create policy "catalog_item_codes: admin cria"
  on public.catalog_item_codes for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "catalog_item_codes: admin edita" on public.catalog_item_codes;
create policy "catalog_item_codes: admin edita"
  on public.catalog_item_codes for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "catalog_item_codes: admin exclui" on public.catalog_item_codes;
create policy "catalog_item_codes: admin exclui"
  on public.catalog_item_codes for delete
  to authenticated
  using ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- 6. GRAVAÇÃO ATÔMICA: produto + códigos
--    SECURITY INVOKER: roda com as permissões de quem chama, então a RLS
--    continua valendo (só admin consegue gravar).
--
--    p_id    null = criar; uuid = editar
--    p_item  {"title","brand","category_id","badge","image_url","tags":[],
--             "specifications":[{"label","value"}],"is_featured","is_active"}
--    p_codes [{"id"?: uuid, "code", "description", "packaging"}] (na ordem desejada)
--            Códigos do produto que não vierem na lista são removidos.
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
begin
  if jsonb_typeof(p_codes) is distinct from 'array' or jsonb_array_length(p_codes) = 0 then
    raise exception 'Informe ao menos um código para o produto.' using errcode = '23514';
  end if;

  if v_id is null then
    insert into public.catalog_items
      (title, brand, category_id, badge, image_url, tags, specifications, is_featured, is_active)
    values (
      p_item ->> 'title',
      p_item ->> 'brand',
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
      brand          = p_item ->> 'brand',
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

  -- Remove códigos que saíram da lista.
  select coalesce(array_agg((c ->> 'id')::uuid), '{}')
    into v_keep
    from jsonb_array_elements(p_codes) as c
   where nullif(c ->> 'id', '') is not null;

  delete from public.catalog_item_codes
   where item_id = v_id and not (id = any (v_keep));

  -- Atualiza os existentes e insere os novos, na ordem recebida.
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

  -- Recalcula a busca com os códigos finais.
  update public.catalog_items set updated_at = now() where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.save_catalog_item(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_catalog_item(uuid, jsonb, jsonb) to authenticated;
