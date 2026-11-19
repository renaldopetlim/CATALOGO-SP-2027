-- =============================================================================
-- Catálogo SP 2027 — Atualização em tempo real da vitrine (Supabase Realtime)
--
-- Como usar: execute no SQL Editor DEPOIS de 20261119000000_init_catalog.sql.
-- Idempotente: pode ser executado mais de uma vez.
--
-- Por que uma tabela de "sinal" em vez de publicar catalog_items/categories?
--   O Realtime aplica a RLS de leitura ao entregar eventos. Quando o admin
--   INATIVA um item, a nova versão da linha deixa de ser visível ao visitante,
--   e o evento não chega a ele: a vitrine continuaria mostrando o item.
--   Aqui, qualquer mudança no catálogo incrementa `catalog_sync.version`.
--   Essa linha é pública e não contém dados do catálogo. A vitrine recebe o
--   aviso e recarrega pelas consultas normais, que já respeitam a RLS.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. TABELA DE SINAL (uma única linha)
-- -----------------------------------------------------------------------------
create table if not exists public.catalog_sync (
  id          smallint primary key default 1 check (id = 1),
  version     bigint not null default 0,
  changed_at  timestamptz not null default now(),
  last_table  text
);

insert into public.catalog_sync (id) values (1)
on conflict (id) do nothing;

alter table public.catalog_sync enable row level security;

-- Leitura pública (necessária para o visitante receber o evento).
drop policy if exists "catalog_sync: leitura pública" on public.catalog_sync;
create policy "catalog_sync: leitura pública"
  on public.catalog_sync for select
  to anon, authenticated
  using (true);

-- Sem políticas de escrita: só o trigger abaixo (SECURITY DEFINER) altera a linha.


-- -----------------------------------------------------------------------------
-- 2. TRIGGER: incrementa a versão a cada INSERT/UPDATE/DELETE do catálogo
--    FOR EACH STATEMENT → um aviso por comando, mesmo que altere várias linhas.
-- -----------------------------------------------------------------------------
create or replace function public.bump_catalog_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.catalog_sync
     set version    = version + 1,
         changed_at = now(),
         last_table = tg_table_name
   where id = 1;
  return null;
end;
$$;

revoke all on function public.bump_catalog_sync() from public, anon, authenticated;

drop trigger if exists categories_bump_catalog_sync on public.categories;
create trigger categories_bump_catalog_sync
  after insert or update or delete on public.categories
  for each statement
  execute function public.bump_catalog_sync();

drop trigger if exists catalog_items_bump_catalog_sync on public.catalog_items;
create trigger catalog_items_bump_catalog_sync
  after insert or update or delete on public.catalog_items
  for each statement
  execute function public.bump_catalog_sync();


-- -----------------------------------------------------------------------------
-- 3. PUBLICAÇÃO DO REALTIME
--    Adiciona apenas a tabela de sinal à publicação `supabase_realtime`.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'catalog_sync'
  ) then
    alter publication supabase_realtime add table public.catalog_sync;
  end if;
end;
$$;
