# Arquitetura — Catálogo SP 2027

## Stack
- **Front-end:** React + TypeScript (Vite), `react-router-dom`, TypeScript `strict` (sem `any`)
- **Back-end:** Supabase — PostgreSQL, Auth, Storage, Row Level Security
- **Visual:** `docs/DESIGN-SYSTEM.md` (tokens herdados do Termo de Retirada)

## Estrutura de pastas

```text
catalogo-sp-2027/
├── docs/                        # ARQUITETURA, DESIGN-SYSTEM, CHECKLIST-TESTES
├── supabase/migrations/         # SQL: tabelas, índices, triggers, RLS, bucket
├── public/
│   ├── assets/                  # logo.png, logo-mini.ico
│   └── _redirects               # SPA fallback (Netlify)
├── src/
│   ├── types/
│   │   ├── database.ts          # tipo Database (formato do supabase gen types)
│   │   └── catalog.ts           # Category, CatalogItem, inputs, filtros
│   ├── lib/
│   │   ├── supabase.ts          # cliente tipado + validação das variáveis VITE_*
│   │   ├── errors.ts            # ServiceError (mensagens em português)
│   │   └── format.ts            # moeda, slug, busca sem acento, máscaras
│   ├── services/
│   │   ├── authService.ts       # login, logout, is_admin()
│   │   ├── categoryService.ts   # listar, CRUD, reordenar, exclusão protegida
│   │   ├── catalogService.ts    # listar com filtros, CRUD, destaque/ativo
│   │   ├── storageService.ts    # upload/remoção no bucket catalog-images
│   │   └── adminCatalogService.ts # salvar item coordenando o Storage
│   ├── hooks/
│   │   ├── useResource.ts       # carregamento genérico (sem "piscar" ao recarregar)
│   │   ├── useCatalogItems.ts   # lista paginada (vitrine e admin)
│   │   ├── useCategories.ts / useAdminCategories.ts / useItemDetail.ts
│   │   ├── useCatalogParams.ts  # estado da vitrine na URL
│   │   ├── useAuth.ts + authContext.ts
│   │   └── useDebounce, useDocumentTitle, useRefetchOnFocus, useToast
│   ├── components/
│   │   ├── auth/AuthProvider.tsx
│   │   ├── ProtectedRoute.tsx
│   │   ├── layout/              # SiteHeader, SiteFooter, PublicLayout, AdminLayout
│   │   ├── catalog/             # ItemCard, ItemGrid, ItemImage, CategoryFilter, SearchBar, ItemDetailModal
│   │   ├── admin/               # ItemForm, CategoryForm, ImageInput
│   │   └── ui/                  # Modal, ConfirmDialog, Toast, StateMessage, StartupError
│   ├── pages/
│   │   ├── HomePage.tsx         # /
│   │   ├── CatalogPage.tsx      # /catalogo?categoria=&q=&item=
│   │   ├── LoginPage.tsx        # /login
│   │   ├── NotFoundPage.tsx
│   │   └── admin/               # AdminItemsPage (/admin), AdminCategoriesPage (/admin/categorias)
│   ├── styles/                  # tokens.css (Design System), global.css
│   ├── App.tsx                  # rotas (admin carregado sob demanda)
│   ├── main.tsx
│   └── vite-env.d.ts
├── .env.example
├── vercel.json                  # SPA fallback (Vercel)
└── package.json
```

Filtros e busca do catálogo ficam na URL (`?categoria=&q=&item=`). Assim, abrir e fechar o
modal de detalhes, recarregar a página ou compartilhar o link preserva o estado da vitrine.

## Banco de dados

| Tabela | Papel |
|---|---|
| `categories` | Categorias da vitrine, ordenadas por `sort_order` |
| `catalog_items` | Itens do catálogo; `category_id` → `categories.id` (`ON DELETE RESTRICT`) |
| `admin_users` | Lista de usuários do Auth com permissão de administrador |

**Triggers em `catalog_items`:**
- `set_updated_at`: atualiza `updated_at` em todo UPDATE.
- `catalog_items_prepare`: limpa título e SKU (maiúsculo), normaliza tags (minúsculas, sem
  duplicadas/vazias) e grava `search_text` (tudo minúsculo e sem acento).

**Busca:** uma coluna `search_text` concentra título, SKU, descrições e tags, com índice
trigram (`pg_trgm`). A busca no front é um único `ILIKE '%termo%'` nessa coluna, sem
diferenciar acentos ("ceramica" encontra "Cerâmica").

## Segurança (RLS)

| Quem | categories | catalog_items | Storage `catalog-images` |
|---|---|---|---|
| Visitante (`anon`) | lê ativas | lê ativos **de categorias ativas** | abre imagens pela URL pública |
| Usuário logado sem ser admin | igual ao visitante | igual ao visitante | igual ao visitante |
| Admin (`admin_users`) | lê tudo, cria, edita, exclui | lê tudo, cria, edita, exclui | lista, envia, substitui, remove |

"Admin" não significa só "estar logado": o usuário também precisa constar em `admin_users`.
Isso evita que alguém crie uma conta pelo Auth e ganhe acesso de escrita. Mesmo assim,
**desative cadastros públicos** em *Authentication → Sign In / Providers → Allow new users to sign up*.

## Fluxo de dados

```text
 PAINEL ADMIN (/admin)                 SUPABASE                         VITRINE PÚBLICA (/, /catalogo)
 ─────────────────────                 ────────                         ──────────────────────────────
 1. Login (email/senha) ─────────────▶ Auth emite JWT
 2. useAuth consulta admin_users ────▶ RLS: só a própria linha
 3. Upload de imagem ────────────────▶ Storage catalog-images
                        ◀──────────── URL pública
 4. Salvar item (com image_url) ─────▶ PostgreSQL
                                       ├─ trigger: updated_at, search_text
                                       └─ RLS: is_admin() = true?
                                                    │
                                                    ▼
                                       Tabelas atualizadas ◀──────────── 5. Consulta com chave anon
                                                                           RLS filtra: só ativos
                                       Storage (público) ◀────────────── 6. <img src="URL pública">
```

A vitrine nunca recebe registros inativos: o filtro acontece no banco, pela RLS, e não no
front. Depois de cada operação, o painel recarrega os dados. A vitrine busca dados novos a
cada visita ou troca de filtro, então as mudanças aparecem imediatamente.
