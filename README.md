# Catálogo 2027 · Distribuidora São Paulo

Catálogo online com vitrine pública (busca, filtro por categoria e detalhes do item) e painel administrativo
para gerenciar categorias, itens e imagens sem editar código.

**Stack:** React 19 + TypeScript (Vite) · Supabase (PostgreSQL, Auth, Storage, RLS) · React Router.
**Visual:** tokens do [Design System](docs/DESIGN-SYSTEM.md) herdados do Termo de Retirada.

| Documento | Conteúdo |
|---|---|
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Pastas, banco, segurança (RLS) e fluxo de dados |
| [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) | Cores, tipografia, componentes |
| [docs/CHECKLIST-TESTES.md](docs/CHECKLIST-TESTES.md) | Roteiro de teste ponta a ponta |
| [docs/DEPLOY-GITHUB-PAGES.md](docs/DEPLOY-GITHUB-PAGES.md) | Deploy automático no GitHub Pages |

**Produto:** título, marca, imagem, selo opcional (`LANÇAMENTO`), tags de busca (ocultas na vitrine),
ficha técnica opcional e um ou mais blocos **Código + Descrição + Embalagem**. O card da vitrine mostra
imagem, selo, título e marca; códigos e ficha técnica aparecem nos detalhes. A busca encontra o produto
por qualquer um dos seus códigos.
| [supabase/migrations/](supabase/migrations/) | Script SQL do banco |

---

## Requisitos

- **Node.js 20.19+ ou 22.12+** (exigência do Vite 8) e npm
- Um projeto no [Supabase](https://supabase.com) (o plano gratuito atende)

## 1. Configurar o Supabase

1. **Banco:** em *SQL Editor → New query*, execute **nesta ordem** os arquivos de `supabase/migrations/`
   (cole o conteúdo e clique em **Run**). Ambos podem ser executados de novo sem erro.
   - `20261119000000_init_catalog.sql`: tabelas, índices, triggers, RLS e bucket `catalog-images`.
   - `20261119020000_realtime_catalog_sync.sql`: atualização da vitrine em tempo real.
   - `20261119030000_produtos_codigos.sql`: marca, selo, ficha técnica e **vários códigos por produto**.
     Os produtos que já existirem são migrados: o SKU vira o primeiro código e as descrições viram ficha técnica.
   - `20261119040000_base_sistema.sql`: base do sistema interno (importação de planilha) e conciliação com o catálogo.
   - `20261119050000_marcas.sql`: cadastro de marcas com logo, vinculado aos produtos. As marcas atuais, que estão
     em texto, são criadas e vinculadas automaticamente.
2. **Bloquear cadastro público:** *Authentication → Sign In / Providers* → desative **Allow new users to sign up**.
3. **Criar o administrador:** *Authentication → Users → Add user → Create new user*, informe e-mail e senha
   e marque **Auto Confirm User**.
4. **Dar permissão de admin:** no *SQL Editor*, execute (trocando o e-mail):

   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'admin@suaempresa.com.br'
   on conflict do nothing;
   ```

5. **Copiar as chaves:** em *Project Settings → API Keys* (ou *Data API*), copie a **Project URL** e a chave
   **publishable** (`sb_publishable_…`) ou a **anon** legada. **Nunca** use a chave `secret`/`service_role`
   no front-end. O app recusa iniciar se detectar uma.

## 2. Rodar localmente

Clone o repositório:

```bash
git clone https://github.com/renaldopetlim/catalogo-sp-2027.git
```

Entre na pasta:

```bash
cd catalogo-sp-2027
```

Instale as dependências (versões travadas no `package-lock.json`):

```bash
npm ci
```

Crie o arquivo de ambiente a partir do modelo:

```bash
cp .env.example .env.local
```

Edite o `.env.local` com os valores do passo 1.5:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxx
```

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

Abra `http://localhost:5173`. O painel fica em `http://localhost:5173/#/admin`.

> O `.env.local` já está no `.gitignore`. Depois de alterar esse arquivo, reinicie o `npm run dev`.

### Comandos

| Comando | Para quê |
|---|---|
| `npm run dev` | Servidor de desenvolvimento com recarga automática |
| `npm run check` | Checagem de tipos (TypeScript strict) + lint (sem `any`) |
| `npm run check:env` | Confere a URL e a chave do Supabase no `.env.local` e testa a conexão |
| `npm run build` | Checa os tipos e gera a versão de produção em `dist/` |
| `npm run preview` | Serve o `dist/` localmente para conferir o build |

## Como o projeto foi criado (referência)

Estes comandos **já foram executados**; servem para entender ou recriar a base do zero.

```bash
npm create vite@latest catalogo-sp-2027 -- --template react-ts
```

```bash
cd catalogo-sp-2027
```

```bash
npm install @supabase/supabase-js react-router-dom
```

## Marcas e logos

Em **Marcas**, no painel, você cadastra cada marca com o nome (único, sem diferenciar maiúsculas), o logo e o
status (ativa ou inativa).

- **Logo:** upload ou URL. Os arquivos vão para a pasta `brands/` do bucket `catalog-images` e são exibidos com
  fundo quadriculado, para mostrar a transparência. Recomendado: PNG ou WebP com fundo transparente, formato
  horizontal (ex.: 400 × 160). SVG não é aceito, porque pode executar scripts.
- **No formulário do produto:** a marca é escolhida numa lista e pode ser criada na hora ("+ Nova marca").
- **Pendentes no catálogo:** a marca vinda do sistema é reconhecida automaticamente quando já está cadastrada.
- **Na vitrine:** o logo aparece ao lado do nome da marca no card e nos detalhes. Sem logo, ou com a marca
  inativa, aparece só o nome.
- **Exclusão:** uma marca com produtos não pode ser excluída. Inative-a ou troque a marca dos produtos.
- **Renomear** uma marca atualiza todos os produtos dela.

## Importação do sistema interno e conciliação

No painel, em **Sistema interno**:

- **Importar planilha:** arquivo `.csv` ou `.xlsx` com as colunas `CODIGO`, `DESCRICAO` e `MARCA`. A ordem não
  importa, nem acentos ou maiúsculas, e colunas extras são ignoradas. Há pré-visualização com validação antes de
  gravar. A gravação é por código (upsert) e o resumo mostra inseridos, atualizados, sem mudança e ignorados.
  Código e marca são gravados em MAIÚSCULAS. CSV salvo pelo Excel em português (Windows-1252, separado por
  `;`) é lido corretamente.
- **Pendentes no catálogo:** mostra os códigos da base que **não aparecem na vitrine**. Cada um está **não
  cadastrado** (em nenhum produto) ou **fora do ar** (produto ou categoria inativa). Tem busca por código,
  descrição ou marca. **+ Cadastrar no catálogo** abre o formulário de produto já preenchido com código, descrição
  e marca.
- **Vários códigos num único card:** marque os códigos não cadastrados (o checkbox do cabeçalho marca todos os
  visíveis; Shift+clique marca um intervalo). A seleção continua ao trocar de página ou de busca. A barra no
  rodapé mostra a quantidade e o botão **Criar card com selecionados**, que abre o formulário com:
  - todos os códigos marcados (código e descrição; a embalagem fica para completar), que podem ser reordenados,
    removidos ou complementados;
  - o título sugerido a partir do início comum das descrições (editável);
  - a marca selecionada quando todos têm a mesma; com marcas diferentes, um aviso com atalhos para escolher a
    principal.

  Ao salvar, os códigos saem da lista de pendentes na hora e a seleção é limpa.

A base do sistema só é visível para administradores.

## Atualização em tempo real (Supabase Realtime)

A vitrine se atualiza sozinha quando o admin altera o catálogo: código, imagem, item novo, item inativado,
categoria renomeada ou reordenada. Não é preciso recarregar a página. Quando a conexão está ativa, o catálogo
mostra o indicador **● ao vivo** ao lado do total de itens.

No painel admin, as listas de **Itens** e **Categorias** também se atualizam sozinhas, por exemplo quando outro
administrador edita algo ou quando você altera em outra aba. Formulários abertos não são afetados. Ali o
indicador também mostra **● reconectando…**, em laranja, quando a conexão em tempo real cai, avisando que a
lista pode estar desatualizada até voltar.

- **Como funciona:** cada alteração em `categories` ou `catalog_items` incrementa a linha única de
  `catalog_sync`. A vitrine escuta só essa tabela e, ao receber o aviso, recarrega pelas consultas normais,
  que já respeitam a RLS. Nenhum dado do catálogo trafega pelo Realtime.
- **Por que não publicar as tabelas direto:** o Realtime filtra eventos pela RLS. Quando um item é inativado,
  ele deixa de ser visível ao visitante, e o aviso não chegaria. A vitrine continuaria exibindo o item.
- **Se o Realtime cair:** o cliente reconecta sozinho e recarrega ao voltar. A recarga ao focar a aba
  continua como reserva.
- **Conferir no painel do Supabase:** em *Database → Publications → supabase_realtime*, apenas
  `catalog_sync` deve estar marcada.

## 3. Publicar (deploy no GitHub Pages)

O deploy é automático: cada push na `main` publica o site em
**https://renaldopetlim.github.io/CATALOGO-SP-2027/** pelo workflow `.github/workflows/deploy.yml`.

Configuração única, com o passo a passo completo em **[docs/DEPLOY-GITHUB-PAGES.md](docs/DEPLOY-GITHUB-PAGES.md)**:

1. **Secrets:** em *Settings → Secrets and variables → Actions*, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
2. **Pages:** em *Settings → Pages → Source*, escolha **GitHub Actions**.
3. **Supabase:** em *Authentication → URL Configuration*, preencha a **Site URL**
   `https://renaldopetlim.github.io/CATALOGO-SP-2027/` e a **Redirect URL**
   `https://renaldopetlim.github.io/CATALOGO-SP-2027/**`.

As rotas usam `#`, como em `…/CATALOGO-SP-2027/#/admin`, para que o F5 nunca dê 404 no GitHub Pages.
Para hospedar em outro lugar, gere o build com `BASE_PATH=/`.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Tela "Não foi possível iniciar o catálogo" | `.env.local` ausente ou incompleto; reinicie o `npm run dev` |
| Vitrine vazia, sem erro | Nenhum item ativo em categoria ativa, ou o SQL não foi executado |
| Login ok, mas "Acesso restrito" | Usuário não está em `admin_users` (passo 1.4) |
| "Você não tem permissão…" ao salvar | Mesmo caso acima, ou sessão expirada: saia e entre de novo |
| Upload recusado | Arquivo acima de 5 MB ou fora de JPEG/PNG/WebP/AVIF |
| Página em branco no GitHub Pages | `REPO_BASE` do `vite.config.ts` diferente do nome do repositório; veja o [guia de deploy](docs/DEPLOY-GITHUB-PAGES.md) |
| Indicador "ao vivo" não aparece | Migração de Realtime não executada, ou WebSocket bloqueado pela rede |

---

Desenvolvido por **Renaldo Petlim**.
