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
   - `20261120000000_limpeza_importacoes.sql`: histórico de importações (desfazer planilha errada), exclusão de
     registros da base e análise de registros e arquivos sem uso.
   - `20261121000000_usuarios_permissoes.sql`: usuários do painel com permissões granulares (veja
     [docs/USUARIOS.md](docs/USUARIOS.md), que também explica a Edge Function `admin-users`).
   - `20261122000000_cores_tintas.sql`: cores (swatches) por código nas categorias marcadas com
     "Produtos com cores"; marca "Tintas e Complementos" automaticamente.
2. **Bloquear cadastro público:** *Authentication → Sign In / Providers* → desative **Allow new users to sign up**.
3. **Criar o administrador:** *Authentication → Users → Add user → Create new user*, informe e-mail e senha
   e marque **Auto Confirm User**.
4. **Dar permissão de administrador** ao primeiro usuário: no *SQL Editor*, execute (trocando o e-mail).
   Os próximos usuários são cadastrados pelo painel, em **Usuários e permissões**.

   ```sql
   insert into public.user_profiles (id, email, full_name, role, is_active)
   select id, email, 'Administrador', 'admin', true
   from auth.users where email = 'admin@suaempresa.com.br'
   on conflict (id) do update set role = 'admin', is_active = true;
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

- **Excluir registros da base:** em Pendentes, cada linha tem a lixeira (com confirmação) e a barra de seleção
  tem **Excluir selecionados (N)**. A situação **Toda a base** mostra também os publicados. Um código que está
  num produto é sinalizado como **Em uso no catálogo**: só o registro da planilha sai da base, o produto continua
  igual.
- **Histórico de importações** (em Importar planilha): cada planilha vira um lote. A **mais recente** pode ser
  **desfeita** por completo (os códigos que ela incluiu são excluídos e os que ela alterou voltam ao que eram).
  De qualquer importação dá para **excluir os registros que ela criou**.

A base do sistema só é visível para administradores.

### Cores (Tintas e Complementos)

Categorias marcadas com **Produtos com cores** (no cadastro da categoria; "Tintas e Complementos" já vem
marcada) ganham, em cada código do produto, **nome da cor**, **cor** (seletor + hexadecimal, com prévia) e
**amostra/textura** opcional (upload ou URL, para metálicos, acetinados e texturas). Nas outras categorias
esses campos não aparecem e, se a categoria do produto for trocada, as cores são limpas ao salvar.

Na vitrine, o card mostra uma mini paleta (até 7 cores + "+N cores"). Nos detalhes, um seletor de cores
mostra nome, código, descrição e embalagem da cor escolhida, destaca as linhas dela na tabela de códigos e
permite ver só essa cor. A busca encontra produtos pelo nome da cor.

### Saúde e limpeza

Em **Sistema interno → Saúde e limpeza** (o menu mostra quantos itens pedem atenção):

- **Resumo:** espaço ocupado pelas imagens, arquivos sem uso, tamanho da base e registros sem uso.
- **Registros sem uso:** códigos da base que **não estão em nenhum produto** e não vieram na última planilha
  (ou não aparecem em planilhas há mais de 30/60/90/180/365 dias). **Limpar registros não utilizados** exclui
  todos de uma vez. Códigos em uso no catálogo nunca entram nessa lista.
- **Arquivos sem uso no Storage:** imagens do bucket `catalog-images` que não estão em `image_url` de nenhum
  produto nem em `logo_url` de nenhuma marca, com miniatura, tamanho e data. Exclua um por um ou use **Liberar
  espaço**. Antes de excluir, o banco confere de novo e mantém o arquivo que passou a ser usado. Arquivos
  enviados há menos de 1 hora não entram (envio em andamento).

Tudo isso é restrito a administradores (`is_admin()`), não a qualquer usuário logado.

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
| Login ok, mas "Acesso restrito" | Usuário sem perfil em `user_profiles` (passo 1.4 ou painel Usuários) |
| "Acesso bloqueado" | Perfil bloqueado em **Usuários e permissões** |
| "Você não tem permissão…" ao salvar | Mesmo caso acima, ou sessão expirada: saia e entre de novo |
| Upload recusado | Arquivo acima de 5 MB ou fora de JPEG/PNG/WebP/AVIF |
| Página em branco no GitHub Pages | `REPO_BASE` do `vite.config.ts` diferente do nome do repositório; veja o [guia de deploy](docs/DEPLOY-GITHUB-PAGES.md) |
| Indicador "ao vivo" não aparece | Migração de Realtime não executada, ou WebSocket bloqueado pela rede |

---

Desenvolvido por **Renaldo Petlim**.
