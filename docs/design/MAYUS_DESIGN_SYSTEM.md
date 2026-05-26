# MAYUS Design System

Este e o padrao visual permanente do MAYUS. Ele foi extraido do arquivo de referencia `Mayus - Design System _standalone_.html` e convertido para tokens, utilitarios e componentes reutilizaveis do projeto.

## Identidade

O MAYUS usa a linguagem dark editorial gold: fundo quase preto, superficies em preto quente, bordas discretas, ouro contido e serifas juridico-editoriais. Novas telas devem consumir os tokens globais em vez de recriar cores soltas.

## Tipografia Oficial

- `--type-display`: Cormorant Garamond para numerais grandes, nomes e titulos hero.
- `--type-title`: Gentium Book Plus para titulos editoriais.
- `--type-body`: Gentium Book Plus para leitura.
- `--type-ui`: Noto Sans para labels, filtros, botoes, abas e UI.
- `--type-proc`: Noto Sans para numero de processo, sempre dourado.

Montserrat permanece apenas como compatibilidade legada e nao deve ser usada em novas superficies do Design System.

## Tokens Principais

- Fundo: `--bg`, `--bg-1`, `--bg-2`, `--bg-3`.
- Texto: `--ink`, `--ink-1`, `--ink-2`, `--ink-3`.
- Bordas: `--line`, `--line-strong`, `--line-gold`.
- Ouro: `--gold`, `--gold-bright`, `--gold-soft`, `--gold-dim`.
- Estados: `--fatal`, `--done`, `--watch` com fundos e bordas proprias.

Os tokens vivem em `src/app/globals.css` e tambem estao expostos no Tailwind como `mayus.*`.

## Componentes Canonicos

Os componentes reutilizaveis ficam em `src/components/ui/mayus/`.

- `MayusPageShell`: estrutura editorial da pagina.
- `MayusCard`: card de registro, com opcao interativa.
- `MayusTabs`: abas pill do sistema.
- `MayusInputField`, `MayusSelectField`, `MayusDateField`, `MayusTextarea`: campos de filtro e formulario.
- `MayusTag`: status, origem e badges.
- `MayusButton` e `MayusIconButton`: comandos de UI.
- `MayusProcessNumber`: numero de processo canonico, sempre em Noto Sans dourado.
- `MayusModal`: modal dark editorial.
- `MayusAvatar` e `MayusEmptyState`: suporte para listas e estados vazios.

## Regra De Uso

Novas telas do dashboard devem preferir estes componentes e fontes semanticas. A pagina `src/app/dashboard/operacoes/prazos/page.tsx` e a primeira tela totalmente migrada para servir como referencia de implementacao.
