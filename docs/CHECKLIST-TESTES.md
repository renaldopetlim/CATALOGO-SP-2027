# Checklist de testes ponta a ponta

Roteiro para validar o catálogo contra um projeto Supabase **real**, do zero até a exclusão.
Use duas janelas do navegador: **A** normal (admin) e **B** anônima (visitante). Marque cada item ao concluir.

> Antes de começar: siga as seções 1 e 2 do [README](../README.md) (SQL executado, `.env.local` preenchido,
> `npm run dev` rodando). As rotas usam `#`: localmente, `http://localhost:5173/#/admin`; publicado,
> `https://renaldopetlim.github.io/CATALOGO-SP-2027/#/admin`.

---

## 0. Banco e segurança (SQL Editor)

- [ ] Execute o script de migração **duas vezes**. A segunda execução também termina sem erro.
- [ ] Confira se as tabelas e o bucket existem:

  ```sql
  select table_name from information_schema.tables
  where table_schema = 'public' order by 1;
  -- esperado: admin_users, catalog_items, categories

  select id, public, file_size_limit from storage.buckets where id = 'catalog-images';
  -- esperado: 1 linha, public = true, 5242880
  ```

- [ ] Confira se a RLS está ativa:

  ```sql
  select relname, relrowsecurity from pg_class
  where relname in ('categories', 'catalog_items', 'admin_users');
  -- esperado: relrowsecurity = true nas 3
  ```

## 1. Usuário administrador

- [ ] *Authentication → Sign In / Providers*: **Allow new users to sign up** desativado.
- [ ] *Authentication → Users → Add user*: crie o usuário com **Auto Confirm User** marcado.
- [ ] Ainda **sem** inserir o usuário em `admin_users`, abra `#/admin` na janela A.
  - **Esperado:** redireciona para `/login`.
- [ ] Entre com uma senha errada.
  - **Esperado:** "E-mail ou senha incorretos."
- [ ] Entre com a senha certa.
  - **Esperado:** tela "Acesso restrito", porque o usuário ainda não é admin.
- [ ] Execute o `insert into public.admin_users …` do README e clique em "Sair e entrar com outra conta".
- [ ] Entre de novo.
  - **Esperado:** abre o painel em `#/admin`.
- [ ] Recarregue a página (F5).
  - **Esperado:** continua logado no painel.

## 2. Categoria

- [ ] Vá em **Categorias** → **+ Nova categoria** e digite o nome `Pisos & Revestimentos`.
  - **Esperado:** o slug é preenchido como `pisos-revestimentos`.
- [ ] Salve.
  - **Esperado:** o aviso "… criada." aparece e a categoria entra na lista com "0 itens".
- [ ] Crie uma segunda categoria, `Hidráulica`.
- [ ] Tente criar outra com o slug `hidraulica`.
  - **Esperado:** "Já existe uma categoria com este slug."
- [ ] Use ↑ e ↓ para inverter a ordem e recarregue a página.
  - **Esperado:** a nova ordem foi mantida.
- [ ] Na janela B, abra `/`.
  - **Esperado:** as duas categorias aparecem, na ordem definida.

## 3. Item com imagem

- [ ] Vá em **Itens** → **+ Novo item** e clique em "Criar item" sem preencher nada.
  - **Esperado:** "Campo obrigatório" no título e "Selecione uma categoria".
- [ ] Preencha:
  - **Título:** `Porcelanato Acetinado 60x60 Cinza`
  - **SKU:** `sp-0001` (vira maiúsculo)
  - **Categoria:** Pisos
  - **Preço:** digite `8990`; deve aparecer `89,90`
  - **Tags:** `piso, área externa`
  - **Descrição curta e detalhada:** livres
- [ ] Em **Imagem → Enviar arquivo**, escolha um PDF.
  - **Esperado:** "Formato de imagem não permitido…"
- [ ] Escolha um JPG ou PNG de até 5 MB.
  - **Esperado:** a pré-visualização aparece.
- [ ] Marque **Destaque na página inicial** e clique em **Criar item**.
  - **Esperado:** "… criado." e o item na lista, com miniatura e selo DESTAQUE.
- [ ] No Supabase, em *Storage → catalog-images → items/AAAA/*, confira se o arquivo está lá.
- [ ] Crie um segundo item com o SKU `SP-0001`.
  - **Esperado:** "Já existe um item com este SKU."
- [ ] Mude o SKU, deixe o preço vazio, use **URL externa** com uma imagem pública https e salve.
  - **Esperado:** o item é criado com "Sob consulta" no lugar do preço.
- [ ] Crie um terceiro item na categoria **Hidráulica**, sem imagem.

## 4. Vitrine: busca e filtros (janela B, anônima)

- [ ] `/` mostra o item marcado como destaque em **Destaques**.
- [ ] Busque `ceramica` (sem acento) ou `area externa`.
  - **Esperado:** encontra o porcelanato pelas tags e pela descrição.
- [ ] Busque o SKU `sp-0001` em minúsculas.
  - **Esperado:** encontra o item.
- [ ] Busque `porcelanato 60x60`.
  - **Esperado:** encontra, porque as duas palavras precisam estar presentes.
- [ ] Busque `xyz123`.
  - **Esperado:** "Nenhum item encontrado" com o botão "Limpar busca".
- [ ] Clique em **Pisos** com uma busca ativa.
  - **Esperado:** a URL fica `?q=…&categoria=pisos-revestimentos` e a lista é filtrada pelas duas coisas.
- [ ] Clique em **Todos**.
  - **Esperado:** a categoria é removida da URL e a busca continua.
- [ ] Abra um item.
  - **Esperado:** o modal mostra foto, preço, tags e descrição, e a URL ganha `&item=…`.
- [ ] Feche o modal com **Esc**, depois reabra e feche com o botão **Voltar** do navegador.
  - **Esperado:** a busca e a categoria continuam iguais.
- [ ] Copie a URL com `&item=…` e cole numa nova aba.
  - **Esperado:** o modal abre direto.
- [ ] Abra `#/catalogo?categoria=nao-existe`.
  - **Esperado:** "Categoria não encontrada".
- [ ] Teste no celular, ou no navegador com a tela estreita, e em modo escuro.
  - **Esperado:** sem rolagem lateral e com as cores certas.

## 5. Editar e sincronizar (A edita, B confere)

- [ ] Na janela A, edite o porcelanato: troque a imagem por outro arquivo e mude o preço.
  - **Esperado:** "… atualizado."
  - No Storage, o arquivo **antigo** foi removido e o novo está lá.
- [ ] Na janela B, volte para a aba ou recarregue a página.
  - **Esperado:** aparecem a imagem e o preço novos.
- [ ] Na janela A, clique em **Inativar** no porcelanato.
  - **Esperado:** na janela B ele some da vitrine, da busca e dos destaques.
  - Um link direto `?item=…` mostra "Item indisponível".
- [ ] Na janela A, filtre **Situação → Inativos**.
  - **Esperado:** só o porcelanato aparece. Clique em **Ativar**.
- [ ] Clique em **☆ Destacar** e **★ Destaque** em outro item.
  - **Esperado:** a página inicial da janela B acompanha a mudança.
- [ ] Inative a categoria **Hidráulica**.
  - **Esperado:** na janela B somem a categoria **e** os itens dela.
  - No admin, os itens continuam visíveis com "(categoria inativa)".

## 5b. Tempo real (sem recarregar a janela B)

> Requer a migração `20261119020000_realtime_catalog_sync.sql`.

- [ ] Na janela B, abra `#/catalogo`.
  - **Esperado:** o indicador **● ao vivo** aparece ao lado do total de itens.
- [ ] Na janela A, altere o preço de um item. **Não** mexa na janela B.
  - **Esperado:** em cerca de 1 segundo, o preço novo aparece na janela B.
- [ ] Na janela B, abra o modal de um item. Na janela A, inative esse item.
  - **Esperado:** o modal da janela B passa a mostrar "Item indisponível" e o item sai da lista.
- [ ] Na janela A, crie um item em destaque com a janela B aberta em `/`.
  - **Esperado:** ele aparece em **Destaques** sozinho.
- [ ] Na janela A, reordene várias categorias seguidas.
  - **Esperado:** os filtros da janela B acompanham a nova ordem, numa única atualização.
- [ ] Desligue o Wi-Fi da janela B por alguns segundos, altere algo na janela A e religue.
  - **Esperado:** o indicador some e volta, e a janela B mostra a alteração feita enquanto estava desconectada.
- [ ] Abra o painel em duas abas (A1 e A2). Na A1, edite um item.
  - **Esperado:** a lista da A2 mostra a mudança sozinha, com **● ao vivo** em Itens e em Categorias.
- [ ] Com um formulário aberto na A2, altere outro item na A1.
  - **Esperado:** o texto digitado na A2 é preservado e só a lista atrás do formulário é atualizada.
- [ ] Desligue a internet com o painel aberto.
  - **Esperado:** o indicador muda para **● reconectando…** e volta para **● ao vivo** quando a conexão retorna.
- [ ] No SQL Editor, confira se só a tabela de sinal está publicada:

  ```sql
  select tablename from pg_publication_tables where pubname = 'supabase_realtime';
  -- esperado: catalog_sync
  ```

## 6. Excluir

- [ ] Em **Categorias**, clique em **Excluir** na categoria Pisos, que tem itens.
  - **Esperado:** aviso de que a categoria tem itens vinculados e não pode ser excluída, com as opções "Ver os N itens" e "Inativar categoria".
- [ ] Clique em "Ver os N itens".
  - **Esperado:** abre **Itens** já filtrado por essa categoria.
- [ ] Em **Excluir** um item, use primeiro **Apenas inativar**.
  - **Esperado:** o item é inativado e não é excluído.
- [ ] Clique de novo em **Excluir** → **Excluir definitivamente** no item com imagem enviada.
  - **Esperado:** "… foi excluído." e a imagem sumiu do Storage.
- [ ] Exclua o item que usa URL externa.
  - **Esperado:** é excluído e nada no Storage é afetado.
- [ ] Com a categoria sem itens, exclua-a.
  - **Esperado:** "… foi excluída."

## 7. Segurança (o que o visitante não pode fazer)

Na janela B (anônima), abra o console do navegador (F12). A chave anon já está na página, então os comandos
abaixo simulam um visitante mal-intencionado:

- [ ] Leia todos os itens:

  ```js
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const sb = createClient('SUA_URL', 'SUA_CHAVE_PUBLICA');
  (await sb.from('catalog_items').select('title,is_active')).data;
  ```

  **Esperado:** só itens com `is_active: true`.

- [ ] Tente inserir uma categoria:

  ```js
  await sb.from('categories').insert({ name: 'Hack', slug: 'hack' });
  ```

  **Esperado:** erro `42501` / "row-level security".

- [ ] Tente enviar um arquivo:

  ```js
  await sb.storage.from('catalog-images').upload('x.png', new Blob(['x'], { type: 'image/png' }));
  ```

  **Esperado:** erro de permissão.

- [ ] Tente listar o bucket:

  ```js
  (await sb.storage.from('catalog-images').list('items')).data;
  ```

  **Esperado:** `[]`. As imagens abrem pela URL, mas não podem ser listadas.

## 8. Sessão

- [ ] Clique em **SAIR**.
  - **Esperado:** vai para `#/login`, e abrir `#/admin` leva de volta ao login.
- [ ] Com o servidor parado ou sem internet, use a vitrine.
  - **Esperado:** mensagem de erro com "Tentar novamente", sem tela branca.
- [ ] Renomeie o `.env.local` e reinicie o `npm run dev`.
  - **Esperado:** a tela "Não foi possível iniciar o catálogo" explica o que falta. Depois, restaure o arquivo.
