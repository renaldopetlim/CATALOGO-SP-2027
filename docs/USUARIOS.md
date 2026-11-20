# Usuários e permissões

O painel `/admin` tem usuários com permissões granulares. Quem pode o quê é
decidido **no banco** (RLS + funções `SECURITY DEFINER`); a tela só esconde ou
desabilita o que daria erro.

## Perfis e permissões

| Permissão | Libera |
|---|---|
| `can_manage_products` | Produtos, códigos e imagens de produto (inclui “Criar card” em Pendentes) |
| `can_manage_categories` | Categorias (criar, editar, reordenar, excluir) |
| `can_manage_brands` | Marcas e logos (inclui “+ Nova marca” no formulário de produto) |
| `can_import_spreadsheet` | Importar planilha, desfazer importações, excluir registros da base |
| `can_cleanup_storage` | Saúde e limpeza: registros sem uso e arquivos órfãos |
| `can_manage_users` | Usuários e permissões |

Perfis rápidos: **Administrador** (todas), **Editor de catálogo** (produtos,
categorias, marcas e planilha — dá para ajustar uma a uma) e **Apenas consulta**
(nenhuma: vê o painel sem alterar nada). Qualquer perfil **ativo** pode
consultar o painel; um perfil **bloqueado** não vê nem altera nada, na hora.

Proteções no banco:
- só quem tem `can_manage_users` cadastra ou altera acessos;
- ninguém altera o **próprio** papel, permissões ou status;
- sempre sobra pelo menos 1 usuário ativo com `can_manage_users`.

## Configuração (uma vez)

### 1. Migração

Execute `supabase/migrations/20261121000000_usuarios_permissoes.sql` no SQL
Editor. Os administradores atuais (tabela antiga `admin_users`) viram
**Administradores** com todas as permissões, sem nenhum passo extra.

### 2. Edge Function `admin-users` (criar usuários, senhas e bloqueio de login)

Criar contas e mexer na senha de outra pessoa exige a chave secreta
(`service_role`). Ela **nunca** vai para o navegador: essas ações passam pela
Edge Function `supabase/functions/admin-users/index.ts`, que confere no banco se
quem chama tem `can_manage_users`.

Pelo Dashboard (sem instalar nada):
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nome: `admin-users`.
3. Apague o exemplo, cole o conteúdo de `supabase/functions/admin-users/index.ts` e clique em **Deploy**.
4. Opcional: em **Edge Functions → Secrets**, crie `SITE_URL` =
   `https://renaldopetlim.github.io/CATALOGO-SP-2027/` para aceitar links de
   redefinição só para o site.

Ou pela linha de comando: `supabase functions deploy admin-users`.

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem em toda Edge Function.

**Sem a função publicada** o painel continua funcionando: “Novo usuário” grava o
acesso como **pré-cadastrado**; ao criar a conta em *Authentication → Users →
Add user* com o mesmo e-mail, as permissões são aplicadas automaticamente.
Bloquear no painel também funciona (só o login no Auth não é bloqueado).

### 3. Endereços de retorno (recuperação de senha e convites)

Em *Authentication → URL Configuration*:
- **Site URL**: `https://renaldopetlim.github.io/CATALOGO-SP-2027/`
- **Redirect URLs**: adicione `https://renaldopetlim.github.io/CATALOGO-SP-2027/**`

## Senhas

- **Esqueci minha senha** (tela de login): a pessoa recebe um e-mail e define a
  nova senha. Abra o link **no mesmo navegador** em que pediu.
- **Gerar link de redefinição** (painel de usuários): cria um link para enviar
  por WhatsApp ou e-mail; funciona em qualquer navegador. Vale uma vez e por
  tempo limitado.
- **Definir nova senha** (painel de usuários): troca a senha na hora.
- **Alterar minha senha** (menu lateral): para quem está logado.

## Emergência: recuperar o acesso de administrador

Se ninguém mais consegue gerenciar usuários, no SQL Editor (trocando o e-mail):

```sql
insert into public.user_profiles (id, email, full_name, role, is_active)
select id, email, 'Administrador', 'admin', true
from auth.users where email = 'admin@suaempresa.com.br'
on conflict (id) do update set role = 'admin', is_active = true;
```
