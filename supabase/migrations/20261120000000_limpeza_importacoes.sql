-- =============================================================================
-- Catálogo SP 2027 — Histórico de importações, exclusão da base e limpeza
--
-- Execute no SQL Editor DEPOIS das migrações anteriores (…000000 a …050000).
-- Idempotente: pode ser executado mais de uma vez.
--
--   import_batches                    uma linha por planilha importada
--   import_batch_items                estado anterior dos códigos da ÚLTIMA importação
--                                     (permite desfazê-la por completo)
--   system_products.created_batch_id  importação que criou o registro
--   start_import_batch(file)          abre um lote de importação
--   import_system_products(rows, id)  upsert, agora vinculado ao lote
--   undo_import_batch(id)             desfaz a última importação
--   delete_import_batch_records(id)   exclui os registros criados por uma importação
--   stale_system_products(mode, days) registros sem uso (fora do catálogo e antigos)
--   purge_stale_system_products(...)  exclui esses registros
--   storage_orphan_files(...)         arquivos do bucket sem produto nem marca
--   cleanup_report(days)              números do painel "Saúde e limpeza"
--
-- Segurança: tudo é restrito a ADMINISTRADORES (is_admin()), não a qualquer
-- usuário logado. Funções SECURITY INVOKER: a RLS de quem chama continua valendo.
-- Excluir um registro da base NUNCA apaga produto do catálogo: os códigos do
-- catálogo ficam em catalog_item_codes, sem chave estrangeira para a base.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. LOTES DE IMPORTAÇÃO
-- -----------------------------------------------------------------------------
create table if not exists public.import_batches (
  id            uuid primary key default gen_random_uuid(),
  file_name     text not null check (char_length(btrim(file_name)) between 1 and 255),
  started_at    timestamptz not null default now(),
  -- Preenchido a cada lote de linhas recebido; nulo = nada foi gravado ainda.
  finished_at   timestamptz,
  imported_by   uuid default auth.uid(),
  imported_by_email text default (auth.jwt() ->> 'email'),
  received      integer not null default 0 check (received >= 0),
  inserted      integer not null default 0 check (inserted >= 0),
  updated       integer not null default 0 check (updated >= 0),
  unchanged     integer not null default 0 check (unchanged >= 0),
  undone_at     timestamptz
);

create index if not exists import_batches_started_idx on public.import_batches (started_at desc);

-- Estado anterior de cada código tocado pela importação mais recente.
--   inserted → o código não existia (desfazer = excluir)
--   existing → já existia (desfazer = restaurar descrição, marca e datas)
create table if not exists public.import_batch_items (
  batch_id           uuid not null references public.import_batches (id) on delete cascade,
  code               text not null,
  action             text not null check (action in ('inserted', 'existing')),
  prev_description   text,
  prev_brand         text,
  prev_updated_at    timestamptz,
  prev_last_seen_at  timestamptz,
  primary key (batch_id, code)
);

alter table public.system_products
  add column if not exists created_batch_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'system_products_created_batch_id_fkey') then
    alter table public.system_products
      add constraint system_products_created_batch_id_fkey
      foreign key (created_batch_id) references public.import_batches (id) on delete set null;
  end if;
end;
$$;

create index if not exists system_products_created_batch_idx on public.system_products (created_batch_id);
create index if not exists system_products_last_seen_idx on public.system_products (last_seen_at);


-- -----------------------------------------------------------------------------
-- 2. RLS — somente administradores
-- -----------------------------------------------------------------------------
alter table public.import_batches enable row level security;
alter table public.import_batch_items enable row level security;

drop policy if exists "import_batches: admin" on public.import_batches;
create policy "import_batches: admin"
  on public.import_batches for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "import_batch_items: admin" on public.import_batch_items;
create policy "import_batch_items: admin"
  on public.import_batch_items for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.import_batches, public.import_batch_items from anon;
grant select, insert, update, delete on public.import_batches, public.import_batch_items to authenticated;


-- -----------------------------------------------------------------------------
-- 3. TRIGGER DA BASE: permite restaurar updated_at ao desfazer uma importação
--    (fora disso, updated_at só muda quando descrição ou marca mudam).
-- -----------------------------------------------------------------------------
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
    if coalesce(current_setting('catalog.restoring_import', true), '') = 'on' then
      null; -- desfazendo importação: mantém o updated_at informado
    elsif (new.description, new.brand) is distinct from (old.description, old.brand) then
      new.updated_at := now();
    else
      new.updated_at := old.updated_at;
    end if;
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. ABRIR UM LOTE
--    Só a importação mais recente pode ser desfeita: o estado anterior guardado
--    das importações mais antigas é descartado (a tabela não cresce sem limite).
-- -----------------------------------------------------------------------------
create or replace function public.start_import_batch(p_file_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem importar.' using errcode = '42501';
  end if;

  delete from public.import_batch_items;

  insert into public.import_batches (file_name)
  values (left(coalesce(nullif(btrim(p_file_name), ''), 'planilha'), 255))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.start_import_batch(text) from public, anon;
grant execute on function public.start_import_batch(text) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. IMPORTAÇÃO (substitui a versão de um parâmetro)
--    p_batch_id opcional: sem ele, funciona como antes (sem histórico).
-- -----------------------------------------------------------------------------
drop function if exists public.import_system_products(jsonb);

create or replace function public.import_system_products(p_rows jsonb, p_batch_id uuid default null)
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

  if p_batch_id is not null and not exists (
    select 1 from public.import_batches where id = p_batch_id and undone_at is null
  ) then
    raise exception 'Importação não encontrada ou já desfeita.' using errcode = 'P0002';
  end if;

  -- Todos os CTEs enxergam a base ANTES do comando: "prev" guarda o estado anterior.
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
  prev as (
    insert into public.import_batch_items (batch_id, code, action, prev_description, prev_brand, prev_updated_at, prev_last_seen_at)
    select p_batch_id, sp.code, 'existing', sp.description, sp.brand, sp.updated_at, sp.last_seen_at
    from public.system_products sp
    join input i on i.code = sp.code
    where p_batch_id is not null
    on conflict (batch_id, code) do nothing
  ),
  upserted as (
    insert into public.system_products as sp (code, description, brand, last_seen_at, created_batch_id)
    select code, description, brand, now(), p_batch_id from input
    on conflict (code) do update
      set description  = excluded.description,
          brand        = excluded.brand,
          last_seen_at = now()
    -- xmax = 0 → linha nova; caso contrário, já existia.
    returning sp.code, (xmax = 0) as is_new, sp.updated_at
  ),
  created as (
    insert into public.import_batch_items (batch_id, code, action)
    select p_batch_id, code, 'inserted' from upserted
    where is_new and p_batch_id is not null
    on conflict (batch_id, code) do nothing
  )
  select count(*) filter (where is_new),
         count(*) filter (where not is_new and updated_at >= now()),
         (select count(*) from input)
    into v_inserted, v_updated, v_received
  from upserted;

  if p_batch_id is not null then
    update public.import_batches
       set received    = received + v_received,
           inserted    = inserted + v_inserted,
           updated     = updated + v_updated,
           unchanged   = unchanged + (v_received - v_inserted - v_updated),
           finished_at = now()
     where id = p_batch_id;
  end if;

  return jsonb_build_object(
    'received',  v_received,
    'inserted',  v_inserted,
    'updated',   v_updated,
    'unchanged', v_received - v_inserted - v_updated
  );
end;
$$;

revoke all on function public.import_system_products(jsonb, uuid) from public, anon;
grant execute on function public.import_system_products(jsonb, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 6. DESFAZER A ÚLTIMA IMPORTAÇÃO
--    Exclui os códigos que ela criou e restaura descrição, marca e datas dos que
--    ela alterou. Produtos do catálogo não são tocados.
--    Retorna: {"deleted": n, "restored": n}
-- -----------------------------------------------------------------------------
create or replace function public.undo_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_latest   uuid;
  v_deleted  integer;
  v_restored integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem desfazer importações.' using errcode = '42501';
  end if;

  -- A mais nova de todas: abrir um lote descarta o "desfazer" dos anteriores.
  select id into v_latest
  from public.import_batches
  order by started_at desc
  limit 1;

  if v_latest is null or v_latest <> p_batch_id then
    raise exception 'Só a importação mais recente pode ser desfeita.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.import_batches where id = p_batch_id and undone_at is not null) then
    raise exception 'Esta importação já foi desfeita.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.import_batch_items where batch_id = p_batch_id)
     and exists (select 1 from public.import_batches where id = p_batch_id and received > 0) then
    raise exception 'Os dados para desfazer esta importação não estão mais disponíveis.' using errcode = 'P0001';
  end if;

  delete from public.system_products sp
  using public.import_batch_items i
  where i.batch_id = p_batch_id and i.action = 'inserted' and sp.code = i.code;
  get diagnostics v_deleted = row_count;

  perform set_config('catalog.restoring_import', 'on', true);
  update public.system_products sp
     set description  = i.prev_description,
         brand        = i.prev_brand,
         updated_at   = i.prev_updated_at,
         last_seen_at = i.prev_last_seen_at
    from public.import_batch_items i
   where i.batch_id = p_batch_id and i.action = 'existing' and sp.code = i.code;
  get diagnostics v_restored = row_count;
  perform set_config('catalog.restoring_import', 'off', true);

  delete from public.import_batch_items where batch_id = p_batch_id;
  update public.import_batches set undone_at = now() where id = p_batch_id;

  return jsonb_build_object('deleted', v_deleted, 'restored', v_restored);
end;
$$;

revoke all on function public.undo_import_batch(uuid) from public, anon;
grant execute on function public.undo_import_batch(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 7. EXCLUIR OS REGISTROS CRIADOS POR UMA IMPORTAÇÃO (qualquer uma)
--    Não restaura alterações; só remove os códigos que ela incluiu na base.
-- -----------------------------------------------------------------------------
create or replace function public.delete_import_batch_records(p_batch_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem excluir registros da base.' using errcode = '42501';
  end if;

  delete from public.system_products where created_batch_id = p_batch_id;
  get diagnostics v_deleted = row_count;
  delete from public.import_batch_items where batch_id = p_batch_id and action = 'inserted';
  return v_deleted;
end;
$$;

revoke all on function public.delete_import_batch_records(uuid) from public, anon;
grant execute on function public.delete_import_batch_records(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 8. REGISTROS SEM USO NA BASE
--    Nunca inclui códigos que estão em algum produto do catálogo.
--    p_mode:
--      'last_import' → não vieram na última importação (que não foi desfeita)
--      'older_than'  → não aparecem em nenhuma planilha há mais de p_days dias
-- -----------------------------------------------------------------------------
create or replace function public.stale_system_products(p_mode text, p_days integer default 90)
returns table (code text, description text, brand text, last_seen_at timestamptz, created_at timestamptz)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_cutoff timestamptz;
begin
  if p_mode = 'last_import' then
    select b.started_at into v_cutoff
    from public.import_batches b
    where b.undone_at is null and b.finished_at is not null
    order by b.started_at desc
    limit 1;
  elsif p_mode = 'older_than' then
    v_cutoff := now() - make_interval(days => greatest(coalesce(p_days, 90), 1));
  else
    raise exception 'Critério inválido: %', p_mode using errcode = '22023';
  end if;

  if v_cutoff is null then
    return; -- nenhuma importação registrada ainda
  end if;

  return query
    select sp.code, sp.description, sp.brand, sp.last_seen_at, sp.created_at
    from public.system_products sp
    where sp.last_seen_at < v_cutoff
      and not exists (select 1 from public.catalog_item_codes c where c.code = sp.code)
    order by sp.last_seen_at, sp.code;
end;
$$;

revoke all on function public.stale_system_products(text, integer) from public, anon;
grant execute on function public.stale_system_products(text, integer) to authenticated;

create or replace function public.purge_stale_system_products(p_mode text, p_days integer default 90)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem limpar a base.' using errcode = '42501';
  end if;

  delete from public.system_products sp
  where sp.code in (select s.code from public.stale_system_products(p_mode, p_days) s);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_stale_system_products(text, integer) from public, anon;
grant execute on function public.purge_stale_system_products(text, integer) to authenticated;


-- -----------------------------------------------------------------------------
-- 9. ARQUIVOS SEM USO NO STORAGE (bucket catalog-images)
--    Compara os arquivos do bucket com catalog_items.image_url e brands.logo_url.
--    p_min_age_minutes: ignora arquivos recentes (envio em andamento, produto
--    ainda não salvo). p_names: limita a verificação a estes arquivos (usado
--    logo antes de excluir, para não apagar algo que acabou de ser vinculado).
--    A exclusão em si é feita pela API do Storage (remove o arquivo de fato).
-- -----------------------------------------------------------------------------
create or replace function public.storage_orphan_files(p_min_age_minutes integer default 60, p_names text[] default null)
returns table (name text, size bigint, mimetype text, created_at timestamptz)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem analisar o armazenamento.' using errcode = '42501';
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

revoke all on function public.storage_orphan_files(integer, text[]) from public, anon;
grant execute on function public.storage_orphan_files(integer, text[]) to authenticated;


-- -----------------------------------------------------------------------------
-- 10. RELATÓRIO DO PAINEL "SAÚDE E LIMPEZA"
-- -----------------------------------------------------------------------------
create or replace function public.cleanup_report(p_days integer default 90)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_storage jsonb;
  v_orphans jsonb;
  v_base    jsonb;
  v_last    record;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem ver o relatório.' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'files', count(*),
           'bytes', coalesce(sum((o.metadata ->> 'size')::bigint), 0)
         )
    into v_storage
  from storage.objects o
  where o.bucket_id = 'catalog-images' and o.name not like '%.emptyFolderPlaceholder';

  select jsonb_build_object('files', count(*), 'bytes', coalesce(sum(f.size), 0))
    into v_orphans
  from public.storage_orphan_files(60, null) f;

  select b.id, b.file_name, b.started_at into v_last
  from public.import_batches b
  where b.undone_at is null and b.finished_at is not null
  order by b.started_at desc
  limit 1;

  select jsonb_build_object(
           'total',  (select count(*) from public.system_products),
           'linked', (select count(*) from public.system_products sp
                      where exists (select 1 from public.catalog_item_codes c where c.code = sp.code)),
           'stale_last_import', (select count(*) from public.stale_system_products('last_import', p_days)),
           'stale_older_than',  (select count(*) from public.stale_system_products('older_than', p_days)),
           'last_import_at',    v_last.started_at,
           'last_import_file',  v_last.file_name
         )
    into v_base;

  return jsonb_build_object('storage', v_storage, 'orphans', v_orphans, 'base', v_base, 'days', p_days);
end;
$$;

revoke all on function public.cleanup_report(integer) from public, anon;
grant execute on function public.cleanup_report(integer) to authenticated;
