import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Caminho base do site publicado.
 *
 * GitHub Pages de projeto: https://<usuario>.github.io/<nome-do-repositorio>/
 * → base = '/<nome-do-repositorio>/' (com barra no início e no fim).
 *
 * ⚠️ O caminho diferencia maiúsculas de minúsculas: precisa ser IGUAL ao nome
 *    do repositório no GitHub. Este repositório se chama "CATALOGO-SP-2027".
 *
 * Para publicar em outro lugar (domínio próprio, Vercel, Netlify…), defina
 * BASE_PATH=/ no build, sem alterar este arquivo.
 */
const REPO_BASE = '/CATALOGO-SP-2027/' // ← troque pelo '/<nome-do-repositorio>/' se renomear o repo

/**
 * Gera o `404.html` do GitHub Pages: quem acessar um endereço sem `#`
 * (ex.: …/CATALOGO-SP-2027/catalogo?q=piso) é levado para a rota
 * equivalente do HashRouter (…/CATALOGO-SP-2027/#/catalogo?q=piso).
 */
function githubPages404(): Plugin {
  let base = '/'
  return {
    name: 'github-pages-404',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '404.html',
        source: `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Redirecionando…</title>
    <script>
      (function () {
        var base = ${JSON.stringify(base)};
        var path = location.pathname;
        var route = path.indexOf(base) === 0 ? path.slice(base.length) : '';
        location.replace(base + '#/' + route + location.search);
      })();
    </script>
  </head>
  <body>
    <p>Redirecionando para o <a href="${base}">Catálogo 2027</a>…</p>
  </body>
</html>
`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Em desenvolvimento (npm run dev) o site fica em http://localhost:5173/.
  base: command === 'build' ? (process.env.BASE_PATH ?? REPO_BASE) : '/',
  plugins: [react(), githubPages404()],
}))
