-- =============================================================================
-- Catálogo SP 2027 — Cores (swatches) para "Tintas e Complementos"
--
-- Execute no SQL Editor DEPOIS das migrações anteriores (…000000 a 20261121000000).
-- Idempotente: pode ser executado mais de uma vez.
--
--   catalog_item_codes.color_name        nome da cor ("Branco Neve")
--   catalog_item_codes.color_hex         cor em hexadecimal (#RRGGBB, gravado em maiúsculas)
--   catalog_item_codes.color_swatch_url  imagem da amostra (textura, metálico, acetinado…)
--   categories.has_color_swatches        a categoria mostra cores (painel e vitrine)
--
-- Na primeira execução, a categoria "Tintas e Complementos" é marcada com
-- has_color_swatches = true. Depois disso, a opção fica no cadastro da categoria.
-- A busca do catálogo passa a encontrar produtos pelo nome da cor.
-- Amostras enviadas ficam na pasta swatches/ do bucket catalog-images
-- (gravação: permissão de produtos) e entram na análise de arquivos sem uso.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. COLUNAS
-- -----------------------------------------------------------------------------
alter table public.catalog_item_codes
  add column if not exists color_name text,
  add column if not exists color_hex text,
  add column if not exists color_swatch_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalog_item_codes_color_name_check') then
    alter table public.catalog_item_codes
      add constraint catalog_item_codes_color_name_check check (char_length(color_name) <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalog_item_codes_color_hex_check') then
    alter table public.catalog_item_codes
      add constraint catalog_item_codes_color_hex_check check (color_hex ~ '^#[0-9A-F]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalog_item_codes_color_swatch_url_check') then
    alter table public.catalog_item_codes
      add constraint catalog_item_codes_color_swatch_url_check check (color_swatch_url ~* '^https?://');
  end if;

  -- Só na primeira execução: marca "Tintas e Complementos" (por nome ou slug).
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categories' and column_name = 'has_color_swatches'
  ) then
    alter table public.categories add column has_color_swatches boolean not null default false;
    update public.categories
       set has_color_swatches = true
     where lower(extensions.unaccent(btrim(name))) = 'tintas e complementos'
        or slug = 'tintas-e-complementos';
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 2. NORMALIZAÇÃO DOS CÓDIGOS (cor incluída)
--    color_hex aceita "#abc", "abc", "#aabbcc" ou "aabbcc" → "#AABBCC".
-- -----------------------------------------------------------------------------
create or replace function public.catalog_item_codes_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_hex text;
begin
  new.code             := upper(btrim(new.code));
  new.description      := nullif(btrim(coalesce(new.description, '')), '');
  new.packaging        := nullif(btrim(coalesce(new.packaging, '')), '');
  new.color_name       := nullif(btrim(regexp_replace(coalesce(new.color_name, ''), '\s+', ' ', 'g')), '');
  new.color_swatch_url := nullif(btrim(coalesce(new.color_swatch_url, '')), '');

  v_hex := upper(ltrim(btrim(coalesce(new.color_hex, '')), '#'));
  if v_hex ~ '^[0-9A-F]{3}$' then
    v_hex := substr(v_hex, 1, 1) || substr(v_hex, 1, 1) || substr(v_hex, 2, 1) || substr(v_hex, 2, 1)
          || substr(v_hex, 3, 1) || substr(v_hex, 3, 1);
  end if;
  new.color_hex := case when v_hex = '' then null else '#' || v_hex end;

  new.updated_at := now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. BUSCA: inclui o nome da cor
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
    (select string_agg(concat_ws(' ', c.code, c.description, c.packaging, c.color_name), ' ')
       from public.catalog_item_codes as c
      where c.item_id = new.id)
  )));

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. GRAVAÇÃO ATÔMICA DO PRODUTO: códigos com cor
--    p_codes: [{ id?, code, description, packaging, color_name, color_hex, color_swatch_url }]
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
        code             = v_code ->> 'code',
        description      = v_code ->> 'description',
        packaging        = v_code ->> 'packaging',
        color_name       = v_code ->> 'color_name',
        color_hex        = v_code ->> 'color_hex',
        color_swatch_url = v_code ->> 'color_swatch_url',
        sort_order       = v_pos
      where id = v_code_id and item_id = v_id;

      if not found then
        raise exception 'Código não pertence a este produto.' using errcode = 'P0002';
      end if;
    else
      insert into public.catalog_item_codes
        (item_id, code, description, packaging, color_name, color_hex, color_swatch_url, sort_order)
      values (
        v_id, v_code ->> 'code', v_code ->> 'description', v_code ->> 'packaging',
        v_code ->> 'color_name', v_code ->> 'color_hex', v_code ->> 'color_swatch_url', v_pos
      );
    end if;

    v_pos := v_pos + 1;
  end loop;

  update public.catalog_items set updated_at = now() where id = v_id;

  return v_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- 5. ARQUIVOS SEM USO: amostras de cor (color_swatch_url) também contam como uso
-- -----------------------------------------------------------------------------
create or replace function public.storage_orphan_files(p_min_age_minutes integer default 60, p_names text[] default null)
returns table (name text, size bigint, mimetype text, created_at timestamptz)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.has_permission('can_cleanup_storage') then
    raise exception 'Sem permissão para limpeza da base e do armazenamento.' using errcode = '42501';
  end if;

  return query
    with used as (
      select substring(i.image_url from '/storage/v1/object/public/catalog-images/([^?#]+)') as path
      from public.catalog_items i
      where i.image_url is not null
      union
      select substring(b.logo_url from '/storage/v1/object/public/catalog-images/([^?#]+)')
      from public.brands b
      where b.logo_url is not null
      union
      select substring(c.color_swatch_url from '/storage/v1/object/public/catalog-images/([^?#]+)')
      from public.catalog_item_codes c
      where c.color_swatch_url is not null
    )
    select o.name,
           coalesce((o.metadata ->> 'size')::bigint, 0),
           o.metadata ->> 'mimetype',
           o.created_at
    from storage.objects o
    where o.bucket_id = 'catalog-images'
      and o.name not like '%.emptyFolderPlaceholder'
      and o.created_at < now() - make_interval(mins => greatest(coalesce(p_min_age_minutes, 60), 0))
      and (p_names is null or o.name = any (p_names))
      and not exists (
        select 1 from used u
        where u.path = o.name or u.path = replace(o.name, ' ', '%20')
      )
    order by o.created_at;
end;
$$;


-- -----------------------------------------------------------------------------
-- 6. Recalcula a busca dos produtos que já têm cor (nada a fazer na 1ª execução)
-- -----------------------------------------------------------------------------
update public.catalog_items i
   set title = i.title
 where exists (select 1 from public.catalog_item_codes c where c.item_id = i.id and c.color_name is not null);
