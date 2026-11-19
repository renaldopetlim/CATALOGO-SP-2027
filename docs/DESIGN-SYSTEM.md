# Design System — Distribuidora São Paulo (Fonte da Verdade · Catálogo 2027)

Extraído de index.html, style.css, script.js (PDF jsPDF) e logo.png do Termo de Retirada.

## 1. Cores
| Token | Light | Dark | Uso |
|---|---|---|---|
| --bg | #f5f7fb | #0f1526 | Fundo da página e dos inputs |
| --card | #ffffff | #18213a | Fieldsets, caixas .steps, modal |
| --ink | #17264d | #e8ecf7 | Texto principal |
| --mut | #5a6270 | #a3adc2 | Texto secundário, labels, ícones discretos |
| --line | #d5dbe8 | #2c3a5e | Bordas e divisores |
| --acc | #f07a0a | #f07a0a | CTA, foco, links, hover de ícones, títulos de alerta |
| --err | #c62828 | #ff8a80 | Erro de validação |
| --ok | #1b7f3b | #6fd58c | Mensagem de sucesso |
| (fixo) navy | #17264d | #17264d | Header, legend (não muda no dark) |
| (fixo) branco | #ffffff | #ffffff | Texto sobre navy/laranja |
| overlay | rgba(0,0,0,.6) + blur(2px) | idem | Fundo do modal |

PDF (rgb): navy 23,38,77 · laranja 240,122,10 · cinza 90,98,112 · célula #f5f7fb · borda célula 190,198,215 (#bec6d7) · texto 25,25,25 / 40,40,40.
Logo: "SP" azul + wordmark branco → exige fundo escuro (navy). O azul da logo não é token de UI.

Estados: foco = outline 2px --acc, offset 1px · erro = borda --err · link hover = underline · ícone hover = --mut→--acc (transition color .2s) · botões sem hover/active definidos.

## 2. Tipografia
Família única: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif · base 16px · line-height 1.4. PDF: Helvetica.

| Elemento | Tamanho | Peso | Extras |
|---|---|---|---|
| Header título (.hd b) | 0.8rem | 700 | letter-spacing .04em, maiúsculas no texto |
| Header subtítulo (.hd span) | 0.75rem | 400 | opacity .85 |
| H1 | 1.15rem | 700 (padrão) | margin .2rem 0 .1rem |
| Subtítulo (.sub) | 0.88rem | 400 | --mut |
| Legend de seção | 0.82rem | 700 | branco sobre navy |
| Label | 0.72rem | 700 | uppercase, ls .03em, --mut |
| Input/select | 1rem | 400 | |
| Botão | 1rem | 700 | |
| Modal H3 | 1.2rem | 700 | --acc |
| Modal texto | 0.95rem | 400 | line-height 1.5 |
| Status (#st) | 0.9rem | 600 | |
| Caixa info (.steps) | 0.85rem (0.8rem LGPD) | 400 | --mut |
| Mensagem erro (.msg) | 0.78rem | 400 | --err |
| Rodapé | 0.8rem | 400 | --mut, strong em --ink |

H2, H4–H6, preços e badges: NÃO existem na base — precisam de aprovação antes de definir.

## 3. Estrutura
- Container: max-width 760px, margin 0 auto, padding 16px (header 14px 16px).
- Header: flex, space-between, gap 14px, logo 70px de altura, borda inferior 4px --acc.
- Grid: .g = 2 colunas 1fr, gap 12px, margin-top 12px; .full ocupa a linha; ≤560px → 1 coluna.
- Fieldset: margin 0 0 14px, padding 0 14px 14px.
- Barra de ações: flex, gap 10px, wrap; .pri flex:1, min-width 200px.
- Escala de espaçamento observada: 2 · 3 · 4 · 5 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 24px.

## 4. Componentes
| Componente | Especificação |
|---|---|
| Card (fieldset/.steps) | --card, 1px --line, radius 10px, sem sombra |
| Legend/tag de seção | navy, branco, 700, padding 5px 12px, radius 6px |
| Botão primário .pri | --acc, branco, padding 12px 18px, radius 8px, sem borda |
| Botão secundário .sec | transparente, --ink, 1px --line, mesmo padding/radius |
| Input/select | padding 9px 10px, 1px --line, radius 7px, fundo --bg |
| Modal | --card, radius 12px, padding 24px, max 420px, sombra 0 10px 25px rgba(0,0,0,.2), anim. fade+scale .25s |
| Rodapé | max 760px, borda superior 1px --line, centralizado, links --acc 600 com ícone inline-flex gap 4px |
| PDF | faixa navy 23mm + filete laranja 1.2mm; barras de seção navy; células #f5f7fb com borda #bec6d7 |

Radius: 6 (tag) · 7 (input) · 8 (botão) · 10 (card) · 12 (modal). Sombra: apenas no modal.

## 5. Tom visual
Corporativo-industrial (atacado da construção): navy institucional + laranja de ação, cards planos com borda fina, labels uppercase compactas, alta legibilidade, mobile-first. Dark mode automático via prefers-color-scheme ou data-theme. Ponto de quebra único 560px; safe-area insets respeitados.

## Pontos de atenção do código-fonte
- Regras de input duplicadas em style.css; `.ft-content a` e `.dev-info` definidos duas vezes.
- `.hd img` declara background #fff e depois none (vale none).
- Sem hover/active nos botões nem estilo de :disabled.
