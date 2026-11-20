-- =============================================================================
-- Catálogo SP 2027 — Usuários do painel e permissões granulares
--
-- Execute no SQL Editor DEPOIS das migrações anteriores (…000000 a 20261120000000).
-- Idempotente: pode ser executado mais de uma vez.
--
--   user_profiles        um perfil por usuário do Auth: nome, papel, status e
--                        permissões (jsonb com as 6 chaves abaixo)
--   user_invites         acesso pré-cadastrado por e-mail: quando o usuário é
--                        criado no Auth, o perfil nasce com essas permissões
--   has_permission(p)    o usuário logado está ATIVO e tem a permissão p?
--   is_staff()           o usuário logado tem acesso ATIVO ao painel (leitura)?
--   is_admin()           mantida por compatibilidade: agora = is_staff()
--   admin_list_users()   usuários do Auth + perfis + convites (só quem gerencia usuários)
--
-- Permissões:
--   can_manage_products     produtos e códigos do catálogo (e imagens de produto)
--   can_manage_categories   categorias
--   can_manage_brands       marcas e logos
--   can_import_spreadsheet  importar planilha e excluir registros da base do sistema
--   can_cleanup_storage     ver e limpar registros sem uso e arquivos órfãos do Storage
--   can_manage_users        este painel de usuários
--
-- Papéis: 'admin' = todas as permissões; 'viewer' = nenhuma (só consulta);
--         'editor' = combinação escolhida.
--
-- Proteções (no banco, não só na tela):
--   * só quem tem can_manage_users cadastra ou altera acessos;
--   * ninguém altera o próprio papel, permissões ou status (não se promove
--     nem se bloqueia por engano);
--   * sempre sobra ao menos 1 usuário ativo com can_manage_users.
--
-- Os administradores atuais (admin_users) viram perfis 'admin' com todas as
-- permissões: o painel continua funcionando para eles sem nenhum passo extra.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. TABELAS
-- -----------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  role        text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  is_active   boolean not null default true,
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists user_profiles_email_idx on public.user_profiles (lower(email));

create table if not exists public.user_invites (
  email       text primary key check (email = lower(btrim(email)) and email like '_%@_%'),
  full_name   text not null default '' check (char_length(full_name) <= 120),
  role        text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  is_active   boolean not null default true,
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  invited_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- 2. PERMISSÕES: chaves, normalização e verificação
-- -----------------------------------------------------------------------------
create or replace function public.permission_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'can_manage_products',
    'can_manage_categories',
    'can_manage_brands',
    'can_import_spreadsheet',
    'can_cleanup_storage',
    'can_manage_users'
  ]::text[];
$$;

-- Sempre as 6 chaves, só booleanos. admin → tudo true; viewer → tudo false.
create or replace function public.normalize_permissions(p_role text, p_permissions jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_object_agg(
           k,
           case
             when p_role = 'admin' then true
             when p_role = 'viewer' then false
             else coalesce(p_permissions -> k = 'true'::jsonb, false)
           end
         )
  from unnest(public.permission_keys()) as k;
$$;

-- SECURITY DEFINER: lê user_profiles sem depender da RLS (evita recursão nas políticas).
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select up.is_active and (up.permissions -> p_permission) = 'true'::jsonb
       from public.user_profiles up
      where up.id = (select auth.uid())),
    false
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles up
    where up.id = (select auth.uid()) and up.is_active
  );
$$;

-- Compatibilidade: o nome continua o mesmo (o front antigo chama is_admin()),
-- mas agora significa "tem acesso ativo ao painel".
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_staff();
$$;

revoke all on function public.has_permission(text), public.is_staff(), public.is_admin() from public;
grant execute on function public.has_permission(text), public.is_staff(), public.is_admin() to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3. TRIGGERS DE PROTEÇÃO EM user_profiles
-- -----------------------------------------------------------------------------
create or replace function public.user_profiles_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_syncing boolean := coalesce(current_setting('catalog.syncing_profile', true), '') = 'on';
begin
  new.full_name   := btrim(regexp_replace(coalesce(new.full_name, ''), '\s+', ' ', 'g'));
  new.permissions := public.normalize_permissions(new.role, new.permissions);

  if tg_op = 'INSERT' then
    -- O e-mail vem sempre do Auth (não pode ser inventado pelo painel).
    select lower(u.email) into new.email from auth.users u where u.id = new.id;
    new.created_at := now();
  else
    new.created_at := old.created_at;
    if not v_syncing then
      new.email := old.email;
    end if;
  end if;
  new.updated_at := now();

  -- Chamadas pela API (há usuário logado). SQL Editor e service_role não passam aqui.
  if v_uid is not null and not v_syncing then
    if tg_op = 'UPDATE' and new.id = v_uid
       and (new.role, new.permissions, new.is_active) is distinct from (old.role, old.permissions, old.is_active) then
      raise exception 'Você não pode alterar o seu próprio perfil, permissões ou status. Peça a outro usuário com acesso a Usuários.'
        using errcode = '42501';
    end if;

    if not public.has_permission('can_manage_users')
       and (tg_op = 'INSERT'
            or (new.role, new.permissions, new.is_active) is distinct from (old.role, old.permissions, old.is_active)) then
      raise exception 'Sem permissão para gerenciar usuários.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists user_profiles_prepare on public.user_profiles;
create trigger user_profiles_prepare
  before insert or update on public.user_profiles
  for each row
  execute function public.user_profiles_prepare();

-- Nunca deixa o sistema sem ninguém que consiga gerenciar usuários.
create or replace function public.user_profiles_keep_manager()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.user_profiles)
     and not exists (
       select 1 from public.user_profiles
       where is_active and (permissions -> 'can_manage_users') = 'true'::jsonb
     ) then
    raise exception 'É preciso manter pelo menos um usuário ativo com acesso a Usuários e Permissões.'
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

drop trigger if exists user_profiles_keep_manager on public.user_profiles;
create trigger user_profiles_keep_manager
  after update or delete on public.user_profiles
  for each statement
  execute function public.user_profiles_keep_manager();

-- Convite: normaliza e-mail, nome e permissões.
create or replace function public.user_invites_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email       := lower(btrim(new.email));
  new.full_name   := btrim(regexp_replace(coalesce(new.full_name, ''), '\s+', ' ', 'g'));
  new.permissions := public.normalize_permissions(new.role, new.permissions);
  return new;
end;
$$;

drop trigger if exists user_invites_prepare on public.user_invites;
create trigger user_invites_prepare
  before insert or update on public.user_invites
  for each row
  execute function public.user_invites_prepare();


-- -----------------------------------------------------------------------------
-- 4. INTEGRAÇÃO COM O AUTH
--    Usuário criado no Auth (pelo painel, pelo Dashboard ou por convite) com um
--    convite pendente → o perfil nasce com as permissões do convite.
--    E-mail alterado no Auth → atualizado no perfil.
-- -----------------------------------------------------------------------------
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.user_invites%rowtype;
begin
  select * into v_invite from public.user_invites where email = lower(new.email);
  if found then
    perform set_config('catalog.syncing_profile', 'on', true);
    insert into public.user_profiles (id, email, full_name, role, is_active, permissions)
    values (new.id, lower(new.email), v_invite.full_name, v_invite.role, v_invite.is_active, v_invite.permissions)
    on conflict (id) do nothing;
    delete from public.user_invites where email = v_invite.email;
    perform set_config('catalog.syncing_profile', 'off', true);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_catalog on auth.users;
create trigger on_auth_user_created_catalog
  after insert on auth.users
  for each row
  execute function public.handle_auth_user_created();

create or replace function public.handle_auth_user_email_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('catalog.syncing_profile', 'on', true);
  update public.user_profiles set email = lower(new.email) where id = new.id;
  perform set_config('catalog.syncing_profile', 'off', true);
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed_catalog on auth.users;
create trigger on_auth_user_email_changed_catalog
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_auth_user_email_changed();

revoke all on function public.handle_auth_user_created(), public.handle_auth_user_email_changed() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 5. MIGRAÇÃO DOS ADMINISTRADORES ATUAIS
-- -----------------------------------------------------------------------------
do $$
begin
  perform set_config('catalog.syncing_profile', 'on', true);
  insert into public.user_profiles (id, email, full_name, role, is_active, permissions)
  select au.user_id, lower(u.email), '', 'admin', true, '{}'::jsonb
  from public.admin_users au
  join auth.users u on u.id = au.user_id
  on conflict (id) do nothing;
  perform set_config('catalog.syncing_profile', 'off', true);
end;
$$;


-- -----------------------------------------------------------------------------
-- 6. RLS DE user_profiles E user_invites
-- -----------------------------------------------------------------------------
alter table public.user_profiles enable row level security;
alter table public.user_invites enable row level security;

revoke all on public.user_profiles, public.user_invites from anon;
grant select, insert, update, delete on public.user_profiles, public.user_invites to authenticated;

drop policy if exists "user_profiles: lê o próprio ou gerencia" on public.user_profiles;
create policy "user_profiles: lê o próprio ou gerencia"
  on public.user_profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select public.has_permission('can_manage_users')));

drop policy if exists "user_profiles: gerente cadastra" on public.user_profiles;
create policy "user_profiles: gerente cadastra"
  on public.user_profiles for insert
  to authenticated
  with check ((select public.has_permission('can_manage_users')));

-- O próprio usuário pode editar só o nome (o trigger barra papel/permissões/status).
drop policy if exists "user_profiles: gerente edita ou o próprio nome" on public.user_profiles;
create policy "user_profiles: gerente edita ou o próprio nome"
  on public.user_profiles for update
  to authenticated
  using (id = (select auth.uid()) or (select public.has_permission('can_manage_users')))
  with check (id = (select auth.uid()) or (select public.has_permission('can_manage_users')));

drop policy if exists "user_profiles: gerente remove" on public.user_profiles;
create policy "user_profiles: gerente remove"
  on public.user_profiles for delete
  to authenticated
  using ((select public.has_permission('can_manage_users')) and id <> (select auth.uid()));

drop policy if exists "user_invites: gerente" on public.user_invites;
create policy "user_invites: gerente"
  on public.user_invites for all
  to authenticated
  using ((select public.has_permission('can_manage_users')))
  with check ((select public.has_permission('can_manage_users')));


-- -----------------------------------------------------------------------------
-- 7. LISTAGEM PARA O PAINEL DE USUÁRIOS
--    status: active | blocked | no_access (existe no Auth, sem perfil) | invited
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (
  id               uuid,
  email            text,
  full_name        text,
  role             text,
  is_active        boolean,
  permissions      jsonb,
  status           text,
  created_at       timestamptz,
  updated_at       timestamptz,
  last_sign_in_at  timestamptz,
  email_confirmed  boolean,
  banned           boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('can_manage_users') then
    raise exception 'Sem permissão para gerenciar usuários.' using errcode = '42501';
  end if;

  return query
    select u.id,
           lower(u.email)::text,
           coalesce(p.full_name, ''),
           p.role,
           coalesce(p.is_active, false),
           coalesce(p.permissions, public.normalize_permissions('viewer', '{}'::jsonb)),
           case when p.id is null then 'no_access' when p.is_active then 'active' else 'blocked' end,
           u.created_at,
           coalesce(p.updated_at, u.created_at),
           u.last_sign_in_at,
           u.email_confirmed_at is not null,
           coalesce(u.banned_until > now(), false)
    from auth.users u
    left join public.user_profiles p on p.id = u.id
    union all
    select null::uuid, i.email, i.full_name, i.role, i.is_active, i.permissions, 'invited',
           i.created_at, i.created_at, null::timestamptz, false, false
    from public.user_invites i
    where not exists (select 1 from auth.users u2 where lower(u2.email) = i.email)
    order by 3, 2;
end;
$$;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;


-- -----------------------------------------------------------------------------
-- 8. POLÍTICAS DO CATÁLOGO: leitura do painel = is_staff(); gravação = permissão
-- -----------------------------------------------------------------------------
-- categories
drop policy if exists "categories: admin lê tudo" on public.categories;
create policy "categories: admin lê tudo" on public.categories for select to authenticated
  using ((select public.is_staff()));
drop policy if exists "categories: admin cria" on public.categories;
create policy "categories: admin cria" on public.categories for insert to authenticated
  with check ((select public.has_permission('can_manage_categories')));
drop policy if exists "categories: admin edita" on public.categories;
create policy "categories: admin edita" on public.categories for update to authenticated
  using ((select public.has_permission('can_manage_categories')))
  with check ((select public.has_permission('can_manage_categories')));
drop policy if exists "categories: admin exclui" on public.categories;
create policy "categories: admin exclui" on public.categories for delete to authenticated
  using ((select public.has_permission('can_manage_categories')));

-- catalog_items
drop policy if exists "catalog_items: admin lê tudo" on public.catalog_items;
create policy "catalog_items: admin lê tudo" on public.catalog_items for select to authenticated
  using ((select public.is_staff()));
drop policy if exists "catalog_items: admin cria" on public.catalog_items;
create policy "catalog_items: admin cria" on public.catalog_items for insert to authenticated
  with check ((select public.has_permission('can_manage_products')));
drop policy if exists "catalog_items: admin edita" on public.catalog_items;
create policy "catalog_items: admin edita" on public.catalog_items for update to authenticated
  using ((select public.has_permission('can_manage_products')))
  with check ((select public.has_permission('can_manage_products')));
drop policy if exists "catalog_items: admin exclui" on public.catalog_items;
create policy "catalog_items: admin exclui" on public.catalog_items for delete to authenticated
  using ((select public.has_permission('can_manage_products')));

-- catalog_item_codes
drop policy if exists "catalog_item_codes: admin lê tudo" on public.catalog_item_codes;
create policy "catalog_item_codes: admin lê tudo" on public.catalog_item_codes for select to authenticated
  using ((select public.is_staff()));
drop policy if exists "catalog_item_codes: admin cria" on public.catalog_item_codes;
create policy "catalog_item_codes: admin cria" on public.catalog_item_codes for insert to authenticated
  with check ((select public.has_permission('can_manage_products')));
drop policy if exists "catalog_item_codes: admin edita" on public.catalog_item_codes;
create policy "catalog_item_codes: admin edita" on public.catalog_item_codes for update to authenticated
  using ((select public.has_permission('can_manage_products')))
  with check ((select public.has_permission('can_manage_products')));
drop policy if exists "catalog_item_codes: admin exclui" on public.catalog_item_codes;
create policy "catalog_item_codes: admin exclui" on public.catalog_item_codes for delete to authenticated
  using ((select public.has_permission('can_manage_products')));

-- brands
drop policy if exists "brands: admin lê tudo" on public.brands;
create policy "brands: admin lê tudo" on public.brands for select to authenticated
  using ((select public.is_staff()));
drop policy if exists "brands: admin cria" on public.brands;
create policy "brands: admin cria" on public.brands for insert to authenticated
  with check ((select public.has_permission('can_manage_brands')));
drop policy if exists "brands: admin edita" on public.brands;
create policy "brands: admin edita" on public.brands for update to authenticated
  using ((select public.has_permission('can_manage_brands')))
  with check ((select public.has_permission('can_manage_brands')));
drop policy if exists "brands: admin exclui" on public.brands;
create policy "brands: admin exclui" on public.brands for delete to authenticated
  using ((select public.has_permission('can_manage_brands')));

-- system_products (base da planilha). Excluir: importação ou limpeza.
drop policy if exists "system_products: admin lê" on public.system_products;
create policy "system_products: admin lê" on public.system_products for select to authenticated
  using ((select public.is_staff()));
drop policy if exists "system_products: admin cria" on public.system_products;
create policy "system_products: admin cria" on public.system_products for insert to authenticated
  with check ((select public.has_permission('can_import_spreadsheet')));
drop policy if exists "system_products: admin edita" on public.system_products;
create policy "system_products: admin edita" on public.system_products for update to authenticated
  using ((select public.has_permission('can_import_spreadsheet')))
  with check ((select public.has_permission('can_import_spreadsheet')));
drop policy if exists "system_products: admin exclui" on public.system_products;
create policy "system_products: admin exclui" on public.system_products for delete to authenticated
  using ((select public.has_permission('can_import_spreadsheet')) or (select public.has_permission('can_cleanup_storage')));

-- import_batches / import_batch_items: leitura do painel; gravação = importação
drop policy if exists "import_batches: admin" on public.import_batches;
drop policy if exists "import_batches: painel lê" on public.import_batches;
create policy "import_batches: painel lê" on public.import_batches for select to authenticated
  using ((select public.is_staff()));
drop policy if exists "import_batches: importação grava" on public.import_batches;
create policy "import_batches: importação grava" on public.import_batches for all to authenticated
  using ((select public.has_permission('can_import_spreadsheet')))
  with check ((select public.has_permission('can_import_spreadsheet')));

drop policy if exists "import_batch_items: admin" on public.import_batch_items;
drop policy if exists "import_batch_items: importação" on public.import_batch_items;
create policy "import_batch_items: importação" on public.import_batch_items for all to authenticated
  using ((select public.has_permission('can_import_spreadsheet')))
  with check ((select public.has_permission('can_import_spreadsheet')));


-- -----------------------------------------------------------------------------
-- 9. STORAGE (bucket catalog-images) por pasta
--    items/  → can_manage_products     brands/ → can_manage_brands
--    excluir também com can_cleanup_storage (arquivos órfãos)
-- -----------------------------------------------------------------------------
create or replace function public.can_write_catalog_image(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case split_part(p_name, '/', 1)
           when 'items'  then public.has_permission('can_manage_products')
           when 'brands' then public.has_permission('can_manage_brands')
           else public.has_permission('can_manage_products')
         end;
$$;

revoke all on function public.can_write_catalog_image(text) from public;
grant execute on function public.can_write_catalog_image(text) to authenticated;

drop policy if exists "catalog-images: admin lê" on storage.objects;
create policy "catalog-images: admin lê" on storage.objects for select to authenticated
  using (bucket_id = 'catalog-images' and (select public.is_staff()));

drop policy if exists "catalog-images: admin envia" on storage.objects;
create policy "catalog-images: admin envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog-images' and public.can_write_catalog_image(name));

drop policy if exists "catalog-images: admin substitui" on storage.objects;
create policy "catalog-images: admin substitui" on storage.objects for update to authenticated
  using (bucket_id = 'catalog-images' and public.can_write_catalog_image(name))
  with check (bucket_id = 'catalog-images' and public.can_write_catalog_image(name));

drop policy if exists "catalog-images: admin remove" on storage.objects;
create policy "catalog-images: admin remove" on storage.objects for delete to authenticated
  using (
    bucket_id = 'catalog-images'
    and (public.can_write_catalog_image(name) or (select public.has_permission('can_cleanup_storage')))
  );


-- -----------------------------------------------------------------------------
-- 10. FUNÇÕES DE IMPORTAÇÃO E LIMPEZA: checagem pela permissão específica
--     (mesmo corpo da migração 20261120000000; muda só a verificação inicial)
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
  if not public.has_permission('can_import_spreadsheet') then
    raise exception 'Sem permissão para importar planilhas.' using errcode = '42501';
  end if;

  delete from public.import_batch_items;

  insert into public.import_batches (file_name)
  values (left(coalesce(nullif(btrim(p_file_name), ''), 'planilha'), 255))
  returning id into v_id;

  return v_id;
end;
$$;

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
  if not public.has_permission('can_import_spreadsheet') then
    raise exception 'Sem permissão para importar planilhas.' using errcode = '42501';
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

create or replace function public.delete_import_batch_records(p_batch_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if not public.has_permission('can_import_spreadsheet') then
    raise exception 'Sem permissão para importar planilhas.' using errcode = '42501';
  end if;

  delete from public.system_products where created_batch_id = p_batch_id;
  get diagnostics v_deleted = row_count;
  delete from public.import_batch_items where batch_id = p_batch_id and action = 'inserted';
  return v_deleted;
end;
$$;

create or replace function public.purge_stale_system_products(p_mode text, p_days integer default 90)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if not public.has_permission('can_cleanup_storage') then
    raise exception 'Sem permissão para limpeza da base e do armazenamento.' using errcode = '42501';
  end if;

  delete from public.system_products sp
  where sp.code in (select s.code from public.stale_system_products(p_mode, p_days) s);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

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
  if not public.has_permission('can_cleanup_storage') then
    raise exception 'Sem permissão para limpeza da base e do armazenamento.' using errcode = '42501';
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
