# Arquitetura — Catálogo SP 2027

## Stack
- **Front-end:** React + TypeScript (Vite), `react-router-dom`, TypeScript `strict` (sem `any`)
- **Back-end:** Supabase — PostgreSQL, Auth, Storage, Row Level Security
- **Visual:** `docs/DESIGN-SYSTEM.md` (tokens herdados do Termo de Retirada)

## Estrutura de pastas

```text
catalogo-sp-2027/
├── docs/
│   ├── ARQUITETURA.md
│   └── DESIGN-SYSTEM.md
├── supabase/
│   └── migrations/
│       └── 20261119000000_init_catalog.sql   # tabelas, índices, triggers, RLS, bucket
├── public/
│   └── assets/                  # logo.png, logo-mini.ico
├── src/
│   ├── types/
│   │   ├── catalog.ts           # Category, CatalogItem, inputs, filtros
│   │   └── database.ts          # tipo Database usado pelo cliente Supabase
│   ├── lib/
│   │   ├── supabase.ts          # cliente tipado + validação das variáveis VITE_*
│   │   ├── errors.ts            # ServiceError e conversão de erros do Supabase
│   │   └── format.ts            # moeda (R$), slug, normalização de busca
│   ├── services/
│   │   ├── categoryService.ts
│   │   ├── catalogService.ts
│   │   └── storageService.ts
│   ├── hooks/
│   │   ├── useAuth.ts           # sessão + verificação de admin
│   │   ├── useCategories.ts
│   │   ├── useCatalogItems.ts
│   │   └── useDebounce.ts
│   ├── components/
│   │   ├── layout/              # Header, Footer, AdminLayout
│   │   ├── catalog/             # ItemCard, CategoryFilter, SearchBar, ItemDetailModal
│   │   ├── admin/               # CategoryForm, ItemForm, ImageInput, ConfirmDialog
│   │   ├── ui/                  # Button, Field, Modal, StatusMessage, Spinner
│   │   └── ProtectedRoute.tsx
│   ├── pages/
│   │   ├── HomePage.tsx         # /
│   │   ├── CatalogPage.tsx      # /catalogo?categoria=&q=&item=
│   │   ├── LoginPage.tsx        # /login
│   │   ├── NotFoundPage.tsx
│   │   └── admin/
│   │       ├── AdminDashboardPage.tsx
│   │       ├── AdminCategoriesPage.tsx
│   │       └── AdminItemsPage.tsx
│   ├── styles/
│   │   ├── tokens.css           # variáveis do Design System (light/dark)
│   │   └── global.css           # reset, base e componentes compartilhados
│   ├── App.tsx                  # definição das rotas
│   ├── main.tsx
│   └── vite-env.d.ts            # tipagem de import.meta.env
├── .env.example
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
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
