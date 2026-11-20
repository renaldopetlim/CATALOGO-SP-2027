-- =============================================================================
-- Catálogo SP 2027 — Galeria de fotos do produto (até 5 imagens)
--
-- Execute no SQL Editor DEPOIS das migrações anteriores (…000000 a 20261123000000).
-- Idempotente: pode ser executado mais de uma vez.
--
--   catalog_items.images   lista ORDENADA de URLs (text[]); images[1] é a capa.
--                          Máximo de 5 (CHECK no banco + validação no trigger).
--   catalog_items.image_url continua existindo e acompanha sempre a capa
--                          (compatibilidade com telas e consultas antigas).
--
-- Produtos existentes: a imagem atual vira a 1ª (e única) foto da galeria.
-- save_catalog_item aceita p_item.images; sem essa chave, usa image_url.
-- A análise de arquivos sem uso considera TODAS as fotos de cada produto.
--
-- Storage: nada muda. As fotos ficam na pasta items/ do bucket catalog-images,
-- onde quem tem a permissão de produtos já envia e exclui arquivos.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. COLUNA, LIMITE E MIGRAÇÃO DOS DADOS
-- -----------------------------------------------------------------------------
alter table public.catalog_items
  add column if not exists images text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_images_max_5') then
    alter table public.catalog_items
      add constraint catalog_items_images_max_5 check (cardinality(images) <= 5);
  end if;
end;
$$;

-- A imagem atual vira a capa da galeria (só onde a galeria ainda está vazia).
update public.catalog_items
   set images = array[image_url]
 where image_url is not null and btrim(image_url) <> '' and cardinality(images) = 0;


-- -----------------------------------------------------------------------------
-- 2. TRIGGER DO PRODUTO: normaliza a galeria e sincroniza image_url
--    (mesmo corpo da versão anterior + bloco da galeria)
-- -----------------------------------------------------------------------------
create or replace function public.catalog_items_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);

  -- Galeria (até 5 fotos, a 1ª é a capa). image_url acompanha sempre a capa.
  if tg_op = 'UPDATE'
     and new.images is not distinct from old.images
     and new.image_url is distinct from old.image_url then
    -- Chamada antiga que só troca image_url: troca a capa e mantém as demais.
    new.images := case
      when nullif(btrim(coalesce(new.image_url, '')), '') is null then coalesce(old.images[2:], '{}')
      else array[btrim(new.image_url)] || coalesce(old.images[2:], '{}')
    end;
  elsif coalesce(cardinality(new.images), 0) = 0 and nullif(btrim(coalesce(new.image_url, '')), '') is not null then
    new.images := array[btrim(new.image_url)];
  end if;

  -- Sem vazias nem repetidas, na ordem informada.
  new.images := coalesce(
    (select array_agg(s.url order by s.pos)
       from (select btrim(u) as url, min(t.ord) as pos
               from unnest(coalesce(new.images, '{}')) with ordinality as t(u, ord)
              where btrim(coalesce(u, '')) <> ''
              group by btrim(u)) s),
    '{}'
  );

  if cardinality(new.images) > 5 then
    raise exception 'Cada produto pode ter no máximo 5 imagens.' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(new.images) as u where u !~* '^https?://') then
    raise exception 'Imagem inválida: use um endereço http:// ou https://.' using errcode = '23514';
  end if;

  new.image_url := new.images[1];

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
-- 3. GRAVAÇÃO ATÔMICA DO PRODUTO: com a galeria
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
  -- Galeria: p_item.images (lista ordenada). Sem a chave (chamada antiga), usa image_url.
  v_images text[] := case
    when p_item ? 'images' and jsonb_typeof(p_item -> 'images') = 'array'
      then array(select jsonb_array_elements_text(p_item -> 'images'))
    else null
  end;
begin
  if jsonb_typeof(p_codes) is distinct from 'array' or jsonb_array_length(p_codes) = 0 then
    raise exception 'Informe ao menos um código para o produto.' using errcode = '23514';
  end if;

  if v_id is null then
    insert into public.catalog_items
      (title, brand_id, brand, category_id, badge, images, image_url, tags, specifications, is_featured, is_active)
    values (
      p_item ->> 'title',
      v_brand_id,
      case when v_brand_id is null then p_item ->> 'brand' end,
      (p_item ->> 'category_id')::uuid,
      p_item ->> 'badge',
      coalesce(v_images, '{}'),
      case when v_images is null then p_item ->> 'image_url' else v_images[1] end,
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
      images         = coalesce(v_images, images),
      image_url      = case when v_images is null then p_item ->> 'image_url' else v_images[1] end,
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
-- 4. ARQUIVOS SEM USO: todas as fotos da galeria contam como uso
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
      select substring(g.url from '/storage/v1/object/public/catalog-images/([^?#]+)')
      from public.catalog_items i2
      cross join lateral unnest(i2.images) as g(url)
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
