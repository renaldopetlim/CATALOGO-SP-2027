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

## 3. Produto com vários códigos e imagem

- [ ] Vá em **Itens** → **+ Novo produto** e clique em "Criar produto" sem preencher nada.
  - **Esperado:** "Campo obrigatório" no título, "Selecione uma categoria" e "Informe o código".
- [ ] Preencha:
  - **Título:** `Porcelanato Acetinado Cinza`
  - **Marca:** `Portobello`
  - **Categoria:** Pisos
  - **Selo:** `LANÇAMENTO`
  - **Códigos** (use "+ Adicionar código"):
    - `sp-0001` · `60 x 60 cm` · `Caixa 2,16 m²`. O código vira maiúsculo.
    - `SP-0002` · `90 x 90 cm` · `Caixa 1,62 m²`
  - **Tags de busca:** `piso, área externa`
  - **Ficha técnica:** `PEI` → `4`; `Acabamento` → `Acetinado`
- [ ] Repita um código em duas linhas e tente salvar.
  - **Esperado:** "Código repetido (linha N)". Corrija antes de continuar.
- [ ] Em **Imagem → Enviar arquivo**, escolha um PDF.
  - **Esperado:** "Formato de imagem não permitido…"
- [ ] Escolha um JPG ou PNG de até 5 MB.
  - **Esperado:** a pré-visualização aparece.
- [ ] Marque **Destaque na página inicial** e clique em **Criar item**.
  - **Esperado:** "… criado." e o produto na lista, com miniatura, `LANÇAMENTO` e a coluna Códigos mostrando "SP-0001 +1 código".
- [ ] No Supabase, em *Storage → catalog-images → items/AAAA/*, confira se o arquivo está lá.
- [ ] Crie outro produto usando o código `SP-0001`.
  - **Esperado:** "Um dos códigos informados já está cadastrado em outro produto."
- [ ] Troque para um código novo, use **URL externa** com uma imagem pública https e salve.
  - **Esperado:** o produto é criado.
- [ ] Edite o porcelanato: remova a linha `SP-0002` e mude a embalagem da primeira. Salve e reabra.
  - **Esperado:** só a primeira linha, com a embalagem nova.
- [ ] Crie um terceiro item na categoria **Hidráulica**, sem imagem.

## 4. Vitrine: busca e filtros (janela B, anônima)

- [ ] `/` mostra o item marcado como destaque em **Destaques**.
- [ ] Busque `ceramica` (sem acento) ou `area externa`.
  - **Esperado:** encontra o porcelanato pelas tags e pela descrição.
- [ ] Busque os códigos `sp-0001` e `sp-0002`, em minúsculas, a marca `portobello` e o valor da ficha técnica `acetinado`.
  - **Esperado:** cada busca encontra o porcelanato.
- [ ] Olhe o card do porcelanato.
  - **Esperado:** mostra imagem, `LANÇAMENTO`, título e marca. Não mostra tags, códigos nem preço.
- [ ] Busque `porcelanato 60x60`.
  - **Esperado:** encontra, porque as duas palavras precisam estar presentes.
- [ ] Busque `xyz123`.
  - **Esperado:** "Nenhum item encontrado" com o botão "Limpar busca".
- [ ] Clique em **Pisos** com uma busca ativa.
  - **Esperado:** a URL fica `?q=…&categoria=pisos-revestimentos` e a lista é filtrada pelas duas coisas.
- [ ] Clique em **Todos**.
  - **Esperado:** a categoria é removida da URL e a busca continua.
- [ ] Abra um item.
  - **Esperado:** o modal mostra foto, selo, marca, ficha técnica e a tabela **Código · Descrição · Embalagem**, sem as tags. A URL ganha `&item=…`.
- [ ] Feche o modal com **Esc**, depois reabra e feche com o botão **Voltar** do navegador.
  - **Esperado:** a busca e a categoria continuam iguais.
- [ ] Copie a URL com `&item=…` e cole numa nova aba.
  - **Esperado:** o modal abre direto.
- [ ] Abra `#/catalogo?categoria=nao-existe`.
  - **Esperado:** "Categoria não encontrada".
- [ ] Teste no celular, ou no navegador com a tela estreita, e em modo escuro.
  - **Esperado:** sem rolagem lateral e com as cores certas.

## 5. Editar e sincronizar (A edita, B confere)

- [ ] Na janela A, edite o porcelanato: troque a imagem por outro arquivo e acrescente um código.
  - **Esperado:** "… atualizado."
  - No Storage, o arquivo **antigo** foi removido e o novo está lá.
- [ ] Na janela B, volte para a aba ou recarregue a página.
  - **Esperado:** aparecem a imagem nova e o código novo nos detalhes.
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
- [ ] Na janela A, altere a marca de um produto. **Não** mexa na janela B.
  - **Esperado:** em cerca de 1 segundo, a marca nova aparece no card da janela B.
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
