# Arquitetura — Catálogo SP 2027

## Stack
- **Front-end:** React + TypeScript (Vite), `react-router-dom`, TypeScript `strict` (sem `any`)
- **Back-end:** Supabase — PostgreSQL, Auth, Storage, Row Level Security
- **Visual:** `docs/DESIGN-SYSTEM.md` (tokens herdados do Termo de Retirada)

## Estrutura de pastas

```text
catalogo-sp-2027/
├── docs/                        # ARQUITETURA, DESIGN-SYSTEM, CHECKLIST-TESTES
├── supabase/migrations/         # SQL: tabelas, RLS, bucket + sinal do Realtime
├── public/
│   └── assets/                  # logo.png, logo-mini.ico
├── src/
│   ├── types/
│   │   ├── database.ts          # tipo Database (formato do supabase gen types)
│   │   └── catalog.ts           # Category, CatalogItem, inputs, filtros
│   ├── lib/
│   │   ├── supabase.ts          # cliente tipado + validação das variáveis VITE_*
│   │   ├── assets.ts            # URLs de arquivos públicos respeitando o base
│   │   ├── catalogSync.ts       # canal único do Realtime (avisos de mudança)
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
│   │   ├── useCatalogLive.ts    # recarrega ao receber aviso do Realtime
│   │   └── useDebounce, useDocumentTitle, useRefetchOnFocus, useToast, useDialogBehavior
│   ├── components/
│   │   ├── auth/AuthProvider.tsx
│   │   ├── ProtectedRoute.tsx
│   │   ├── layout/              # SiteHeader, SiteFooter, PublicLayout, AdminLayout (barra lateral + área principal)
│   │   ├── catalog/             # ItemCard, ItemGrid, ItemImage, CategoryFilter, SearchBar, ItemDetailModal
│   │   ├── admin/               # AdminTopbar, ItemForm, CategoryForm (gavetas), ImageInput, DateCell
│   │   └── ui/                  # Modal, Drawer, Switch, ConfirmDialog, Toast, StateMessage, StartupError
│   ├── pages/
│   │   ├── HomePage.tsx         # /
│   │   ├── CatalogPage.tsx      # #/catalogo?categoria=&q=&item=
│   │   ├── LoginPage.tsx        # /login
│   │   ├── NotFoundPage.tsx
│   │   └── admin/               # AdminItemsPage (/admin), AdminCategoriesPage (/admin/categorias)
│   ├── styles/                  # tokens.css (Design System), global.css, admin.css (só no /admin)
│   ├── App.tsx                  # rotas com HashRouter (admin carregado sob demanda)
│   ├── main.tsx
│   └── vite-env.d.ts
├── .env.example
├── .github/workflows/deploy.yml  # deploy automático no GitHub Pages
├── vite.config.ts               # base '/CATALOGO-SP-2027/' + geração do 404.html
└── package.json
```

Filtros e busca do catálogo ficam na URL (`?categoria=&q=&item=`). Assim, abrir e fechar o
modal de detalhes, recarregar a página ou compartilhar o link preserva o estado da vitrine.

## Banco de dados

| Tabela | Papel |
|---|---|
| `categories` | Categorias da vitrine, ordenadas por `sort_order` |
| `catalog_items` | Produtos: título, marca, selo, imagem, tags (ocultas), ficha técnica (`specifications` jsonb); `category_id` → `categories.id` (`ON DELETE RESTRICT`) |
| `brands` | Marcas: nome (único, sem diferenciar maiúsculas), `logo_url` (pasta `brands/` do bucket), ativa/inativa. Visitante lê só as ativas |
| `system_products` | Base importada do sistema interno: código (chave), descrição, marca; `updated_at` só muda quando o conteúdo muda. **Só admin** |
| `system_products_reconciliation` (view) | Cada código da base com a situação no catálogo: `missing`, `inactive` ou `published` (`security_invoker`) |
| `catalog_item_codes` | Códigos do produto (código **único no catálogo**, descrição, embalagem, ordem); `item_id` → `catalog_items.id` (`ON DELETE CASCADE`) |
| `admin_users` | Lista de usuários do Auth com permissão de administrador |

**Triggers em `catalog_items`:**
- `set_updated_at`: atualiza `updated_at` em todo UPDATE.
- `catalog_items_prepare`: limpa título e marca, normaliza tags (minúsculas, sem duplicadas/vazias)
  e grava `search_text` (tudo minúsculo e sem acento).
- Em `catalog_item_codes`: o código é gravado em maiúsculas, e qualquer mudança "toca" o produto,
  recalculando a busca e disparando o aviso de tempo real.

**Gravação atômica:** o painel salva produto e códigos pela função `save_catalog_item(p_id, p_item, p_codes)`,
numa única transação. Com `SECURITY INVOKER`, a RLS continua valendo. Códigos fora da lista são removidos e
um código duplicado desfaz tudo.

**Busca:** uma coluna `search_text` concentra título, marca, tags, ficha técnica e **todos os códigos**
(com descrição e embalagem), com índice
trigram (`pg_trgm`). A busca no front é um único `ILIKE '%termo%'` nessa coluna, sem
diferenciar acentos ("ceramica" encontra "Cerâmica").

## Segurança (RLS)

| Quem | categories | catalog_items | Storage `catalog-images` |
|---|---|---|---|
| Visitante (`anon`) | lê ativas | lê ativos **de categorias ativas** | abre imagens pela URL pública |
| Usuário logado sem ser admin | igual ao visitante | igual ao visitante | igual ao visitante |
| Admin (`admin_users`) | lê tudo, cria, edita, exclui | lê tudo, cria, edita, exclui | lista, envia, substitui, remove |

`catalog_item_codes` segue o produto: o visitante só lê os códigos de produtos visíveis, e só o admin grava.

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

**Tempo real:** cada alteração em `categories` ou `catalog_items` dispara um trigger que incrementa
`catalog_sync.version`. A vitrine assina essa tabela pelo Supabase Realtime (um único canal, em
`src/lib/catalogSync.ts`) e recarrega as consultas quando recebe o aviso. Avisos em sequência viram uma só
recarga. O Realtime só transporta o número da versão, nunca dados do catálogo.

A vitrine nunca recebe registros inativos: o filtro acontece no banco, pela RLS, e não no
front. Depois de cada operação, o painel recarrega os dados. A vitrine busca dados novos a
cada visita ou troca de filtro, então as mudanças aparecem imediatamente.
