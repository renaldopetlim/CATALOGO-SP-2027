# Deploy no GitHub Pages

Endereço publicado: **https://renaldopetlim.github.io/CATALOGO-SP-2027/**

Cada `push` na branch `main` roda o workflow `.github/workflows/deploy.yml`. Ele instala as dependências,
checa os tipos e o lint, faz o build com as chaves do Supabase e publica a pasta `dist`.

> Usando outro repositório? Troque `CATALOGO-SP-2027` pelo **nome exato** do repositório em
> `vite.config.ts` (`REPO_BASE`), neste guia e na configuração do Supabase. O caminho diferencia
> maiúsculas de minúsculas.

---

## 1. Como as rotas funcionam no GitHub Pages

O GitHub Pages só serve arquivos estáticos. Uma URL como `…/CATALOGO-SP-2027/admin` não existe como
arquivo, então recarregar a página nessa rota daria **404**.

**Solução adotada: `HashRouter`.** As rotas ficam depois do `#`:

| Página | Endereço |
|---|---|
| Início | `https://renaldopetlim.github.io/CATALOGO-SP-2027/` |
| Catálogo filtrado | `https://renaldopetlim.github.io/CATALOGO-SP-2027/#/catalogo?categoria=pisos&q=porcelanato` |
| Item aberto | `…/#/catalogo?item=<id>` |
| Login | `https://renaldopetlim.github.io/CATALOGO-SP-2027/#/login` |
| Painel | `https://renaldopetlim.github.io/CATALOGO-SP-2027/#/admin` |

O navegador nunca envia ao servidor o que vem depois do `#`. O GitHub Pages sempre recebe o mesmo
`index.html`, e o F5 ou um link compartilhado **nunca dá 404**.

**Por que não `BrowserRouter` + `404.html`?** Nessa alternativa, o GitHub Pages devolve o `404.html` (uma
cópia do app) com **status HTTP 404** em toda rota interna:
- Buscadores e pré-visualizações de link (WhatsApp, Slack) tratam a página como inexistente.
- Alguns monitores e proxies também a tratam como erro.
- O funcionamento depende de um comportamento do GitHub Pages que não faz parte de nenhum contrato.

O `HashRouter` não depende de nada disso. A troca é estética: o `#` aparece na URL.

**Rede de segurança:** o build também gera um `404.html`. Quem digitar um endereço sem `#`, como
`…/CATALOGO-SP-2027/catalogo?q=piso`, é redirecionado para `…/CATALOGO-SP-2027/#/catalogo?q=piso`.

**Caminho base:** o `vite.config.ts` usa `base: '/CATALOGO-SP-2027/'` no build, e scripts, CSS, logo e
favicon apontam para o subdiretório. No desenvolvimento (`npm run dev`), o site continua em
`http://localhost:5173/`.

---

## 2. GitHub: cadastrar as chaves do Supabase

1. No repositório, abra **Settings → Secrets and variables → Actions**.
2. Na aba **Secrets**, clique em **New repository secret** e crie os dois secrets abaixo, um de cada vez:

   | Name | Secret (valor) | Onde encontrar no Supabase |
   |---|---|---|
   | `VITE_SUPABASE_URL` | `https://<id-do-projeto>.supabase.co` | *Project Settings → API Keys / Data API* → **Project URL** |
   | `VITE_SUPABASE_ANON_KEY` | `sb_publishable_…` (ou a chave **anon** legada) | *Project Settings → API Keys* → **Publishable key** |

   - O nome precisa ser **exatamente** esse, em maiúsculas.
   - **Nunca** use a chave `secret` ou `service_role`, porque ela ignora a RLS. O app recusa iniciar se receber uma.
   - A chave publishable/anon fica visível no site publicado, como em qualquer app Supabase no navegador.
     Ela pode ficar pública: quem protege os dados são as políticas RLS. Guardá-la em Secrets apenas evita
     que ela fique no código.

### Validação automática

Antes do build, a etapa **"Conferir os secrets do Supabase"** (`scripts/check-supabase-env.mjs`) confere os
valores. Se algo impediria o site de funcionar, o deploy **não** é feito. A mensagem aparece no resumo da
execução, em *Actions*:

| Situação detectada | Resultado |
|---|---|
| Secret ausente | ❌ bloqueia |
| **Nome da variável no lugar do valor** (ex.: valor `VITE_SUPABASE_URL`) | ❌ bloqueia |
| URL e chave trocadas | ❌ bloqueia |
| Texto de exemplo da documentação (`SEU-PROJETO`) | ❌ bloqueia |
| URL sem `https://` ou com caminho (ex.: `/rest/v1`) | ❌ bloqueia |
| **Chave secreta** (`sb_secret_…` ou JWT `service_role`) | ❌ bloqueia: ela ignoraria a RLS e ficaria pública |
| Chave anon de outro projeto (o `ref` do JWT não bate com a URL) | ❌ bloqueia |
| Projeto inexistente (DNS), chave recusada (401/403) ou projeto pausado (540) | ❌ bloqueia |
| Supabase instável (5xx após 3 tentativas) | ⚠️ apenas avisa; o deploy continua |
| Domínio que não termina em `.supabase.co` | ⚠️ apenas avisa (domínio personalizado) |

O teste de conexão faz um `GET <URL>/auth/v1/settings` com a chave e não altera nada no projeto. Os valores
das chaves nunca aparecem no log.

Para conferir o `.env.local` antes de subir, rode localmente:

```bash
npm run check:env
```

Para checar só o formato, sem testar a conexão, acrescente `-- --offline`.

---

## 3. GitHub: ativar o Pages via Actions

1. No repositório, abra **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**. Não use "Deploy from a branch".
3. Não é preciso escolher tema nem branch: o workflow faz tudo.
4. Publique de uma destas formas:
   - Faça um push na `main`; mesclar um pull request conta.
   - Ou abra **Actions → Deploy no GitHub Pages → Run workflow**.
5. Acompanhe em **Actions**. Quando o job **Deploy** terminar, o link do site aparece no resumo da execução
   e também em **Settings → Pages**.

> Se o deploy falhar com "Branch main is not allowed to deploy to github-pages", abra
> **Settings → Environments → github-pages → Deployment branches and tags** e permita a branch `main`.

---

## 4. Supabase: liberar o endereço publicado

Em **Authentication → URL Configuration**:

| Campo | Valor |
|---|---|
| **Site URL** | `https://renaldopetlim.github.io/CATALOGO-SP-2027/` |
| **Redirect URLs** → *Add URL* | `https://renaldopetlim.github.io/CATALOGO-SP-2027/**` |
| **Redirect URLs** → *Add URL* (desenvolvimento) | `http://localhost:5173/**` |

Clique em **Save**.

- **Para que servem:** o login do `/admin` é por e-mail e senha, e essa troca não passa por redirecionamento.
  O login já funciona em produção com as chaves corretas. A **Site URL** e as **Redirect URLs** passam a valer
  em links enviados por e-mail, como confirmação de cadastro, recuperação de senha ou link mágico. Com elas
  configuradas, esses links levam ao site publicado, e não a `localhost`.
- **O `**` final** libera qualquer caminho e parâmetro desse endereço.
- **Formato dos links de e-mail:** o cliente Supabase está em modo **PKCE**. Os links de e-mail devolvem
  `?code=…`, sem tokens depois do `#`, e por isso não conflitam com o `HashRouter`.
- **Bloqueios de acesso** (CORS): a API do Supabase aceita requisições de qualquer origem por padrão.
  Não há outra lista de domínios para preencher.

---

## 5. Conferir o deploy

- [ ] **Actions:** os jobs **Build** e **Deploy** aparecem verdes.
- [ ] **Início:** `https://renaldopetlim.github.io/CATALOGO-SP-2027/` abre com logo, categorias e destaques.
- [ ] **Catálogo:** filtre uma categoria, abra um item e aperte **F5**. A página volta com o mesmo filtro e o modal aberto.
- [ ] **Admin sem login:** abrir `…/#/admin` leva ao login.
- [ ] **Admin com login:** depois de entrar, o painel abre. Aperte F5 e confirme que você continua logado.
- [ ] **Endereço sem `#`:** abrir `…/CATALOGO-SP-2027/catalogo` redireciona para `…/#/catalogo`.
- [ ] **Tempo real:** o indicador **● ao vivo** aparece no catálogo e no painel. Isso exige a migração de Realtime.
- [ ] **Tela "Não foi possível iniciar o catálogo"** no site publicado: algum secret está ausente ou com o
  nome errado. Corrija em *Settings → Secrets and variables → Actions* e rode o workflow de novo.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Página em branco; no console (F12) aparecem erros 404 em `/assets/…` | `REPO_BASE` em `vite.config.ts` diferente do nome do repositório (atenção às maiúsculas) |
| Workflow falha em "Conferir os secrets" | Leia o motivo no resumo da execução (tabela da seção 2) |
| Workflow falha em "Checar tipos e lint" | Erro de TypeScript ou lint no código; rode `npm run check` localmente |
| Deploy recusado pelo ambiente `github-pages` | Branch `main` não permitida em *Settings → Environments* |
| Site antigo depois do deploy | Cache do navegador; recarregue com Ctrl+Shift+R |
