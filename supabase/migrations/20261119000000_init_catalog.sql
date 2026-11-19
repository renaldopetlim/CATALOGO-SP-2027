-- =============================================================================
-- Catálogo SP 2027 — Estrutura inicial
-- Tabelas, índices, triggers, RLS e bucket de imagens.
--
-- Como usar: cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- O script é idempotente: pode ser executado mais de uma vez sem erro.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. EXTENSÕES
--    pg_trgm  → índices para busca parcial (ILIKE '%termo%') rápidos
--    unaccent → busca sem acento ("ceramica" encontra "Cerâmica")
-- -----------------------------------------------------------------------------
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;


-- -----------------------------------------------------------------------------
-- 1. ADMINISTRADORES
--    Somente usuários listados aqui podem escrever no catálogo.
--    Isso impede que qualquer pessoa que crie uma conta no Auth vire admin.
-- -----------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- O usuário logado pode consultar apenas a própria linha
-- (o front usa isso para saber se deve liberar o /admin).
drop policy if exists "admin_users: ler a própria linha" on public.admin_users;
create policy "admin_users: ler a própria linha"
  on public.admin_users for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Sem políticas de insert/update/delete: admins são cadastrados pelo SQL Editor.

-- Função usada pelas políticas de RLS.
-- SECURITY DEFINER para ler admin_users sem depender das políticas dessa tabela.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. TABELA: categories
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  slug        text not null unique
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists categories_active_order_idx
  on public.categories (is_active, sort_order, name);


-- -----------------------------------------------------------------------------
-- 3. TABELA: catalog_items
-- -----------------------------------------------------------------------------
create table if not exists public.catalog_items (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null check (char_length(btrim(title)) between 1 and 200),
  sku                  text,
  -- RESTRICT: uma categoria com itens não pode ser excluída;
  -- o admin precisa mover/excluir os itens ou inativar a categoria.
  category_id          uuid not null
                         references public.categories (id)
                         on update cascade on delete restrict,
  short_description    text,
  detailed_description text,
  price                numeric(12, 2) check (price is null or price >= 0),
  image_url            text,
  tags                 text[] not null default '{}',
  is_featured          boolean not null default false,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- Texto normalizado (minúsculo, sem acento) para busca. Mantido por trigger.
  search_text          text not null default ''
);

-- SKU único quando informado (ignora maiúsculas/minúsculas).
create unique index if not exists catalog_items_sku_unique_idx
  on public.catalog_items (lower(sku))
  where sku is not null;

-- Filtro por categoria e listagem padrão da vitrine.
create index if not exists catalog_items_category_idx
  on public.catalog_items (category_id);

create index if not exists catalog_items_active_created_idx
  on public.catalog_items (is_active, created_at desc);

-- Destaques da página inicial (índice parcial: só linhas relevantes).
create index if not exists catalog_items_featured_idx
  on public.catalog_items (created_at desc)
  where is_featured and is_active;

-- Tags: filtro exato por tag (tags @> '{porcelanato}').
create index if not exists catalog_items_tags_idx
  on public.catalog_items using gin (tags);

-- Busca parcial em título, SKU, descrições e tags.
create index if not exists catalog_items_search_trgm_idx
  on public.catalog_items using gin (search_text extensions.gin_trgm_ops);


-- -----------------------------------------------------------------------------
-- 4. FUNÇÕES E TRIGGERS
-- -----------------------------------------------------------------------------

-- Atualiza updated_at em todo UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists catalog_items_set_updated_at on public.catalog_items;
create trigger catalog_items_set_updated_at
  before update on public.catalog_items
  for each row
  execute function public.set_updated_at();

-- Normaliza campos de texto e recalcula search_text em INSERT/UPDATE.
create or replace function public.catalog_items_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.sku   := nullif(upper(btrim(coalesce(new.sku, ''))), '');

  -- Tags: minúsculas, sem espaços nas pontas, sem vazias e sem duplicadas.
  new.tags := coalesce(
    (
      select array_agg(distinct t order by t)
      from (
        select lower(btrim(x)) as t
        from unnest(coalesce(new.tags, '{}')) as x
      ) s
      where t <> ''
    ),
    '{}'
  );

  new.search_text := lower(extensions.unaccent(concat_ws(' ',
    new.title,
    new.sku,
    new.short_description,
    new.detailed_description,
    array_to_string(new.tags, ' ')
  )));

  return new;
end;
$$;

drop trigger if exists catalog_items_prepare on public.catalog_items;
create trigger catalog_items_prepare
  before insert or update on public.catalog_items
  for each row
  execute function public.catalog_items_prepare();


-- -----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
--    Visitante (anon) e usuário comum: só registros ativos.
--    Admin (is_admin()): leitura total e escrita.
--    Políticas do mesmo comando são combinadas com OR.
-- -----------------------------------------------------------------------------
alter table public.categories    enable row level security;
alter table public.catalog_items enable row level security;

-- ---------- categories ----------
drop policy if exists "categories: leitura pública de ativas" on public.categories;
create policy "categories: leitura pública de ativas"
  on public.categories for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "categories: admin lê tudo" on public.categories;
create policy "categories: admin lê tudo"
  on public.categories for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "categories: admin cria" on public.categories;
create policy "categories: admin cria"
  on public.categories for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "categories: admin edita" on public.categories;
create policy "categories: admin edita"
  on public.categories for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "categories: admin exclui" on public.categories;
create policy "categories: admin exclui"
  on public.categories for delete
  to authenticated
  using ((select public.is_admin()));

-- ---------- catalog_items ----------
-- Item visível ao público somente se ele E a sua categoria estiverem ativos.
-- (A subconsulta passa pela RLS de categories, que já só expõe as ativas.)
drop policy if exists "catalog_items: leitura pública de ativos" on public.catalog_items;
create policy "catalog_items: leitura pública de ativos"
  on public.catalog_items for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.categories c
      where c.id = catalog_items.category_id
        and c.is_active = true
    )
  );

drop policy if exists "catalog_items: admin lê tudo" on public.catalog_items;
create policy "catalog_items: admin lê tudo"
  on public.catalog_items for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "catalog_items: admin cria" on public.catalog_items;
create policy "catalog_items: admin cria"
  on public.catalog_items for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "catalog_items: admin edita" on public.catalog_items;
create policy "catalog_items: admin edita"
  on public.catalog_items for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "catalog_items: admin exclui" on public.catalog_items;
create policy "catalog_items: admin exclui"
  on public.catalog_items for delete
  to authenticated
  using ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- 6. STORAGE: bucket catalog-images
--    public = true → qualquer pessoa abre a imagem pela URL pública
--    (/storage/v1/object/public/catalog-images/...), sem política de SELECT
--    para anon. Assim o visitante vê as imagens, mas não consegue LISTAR o bucket.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-images',
  'catalog-images',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Admin: listar (também necessário para substituir e remover arquivos).
drop policy if exists "catalog-images: admin lê" on storage.objects;
create policy "catalog-images: admin lê"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'catalog-images' and (select public.is_admin()));

drop policy if exists "catalog-images: admin envia" on storage.objects;
create policy "catalog-images: admin envia"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'catalog-images' and (select public.is_admin()));

drop policy if exists "catalog-images: admin substitui" on storage.objects;
create policy "catalog-images: admin substitui"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'catalog-images' and (select public.is_admin()))
  with check (bucket_id = 'catalog-images' and (select public.is_admin()));

drop policy if exists "catalog-images: admin remove" on storage.objects;
create policy "catalog-images: admin remove"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'catalog-images' and (select public.is_admin()));


-- -----------------------------------------------------------------------------
-- 7. PROMOVER UM USUÁRIO A ADMIN (execute depois de criar o usuário no Auth)
--
--   insert into public.admin_users (user_id)
--   select id from auth.users where email = 'seu-email@empresa.com.br'
--   on conflict do nothing;
-- -----------------------------------------------------------------------------
