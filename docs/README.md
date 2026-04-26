# Documentacao do Projeto

Esta pasta centraliza toda a documentacao de produto, tecnica e operacao do MAYUS.

## Estrutura recomendada

- `docs/architecture/`: visao tecnica e desenho do sistema
  - `docs/architecture/system-overview.md`
- `docs/brain/`: blueprint e execucao do runtime agentico
  - `docs/brain/MAYUS_AGENTIC_EXECUTION_CHECKLIST.md`
  - `docs/brain/MAYUS_MASTER_BLUEPRINT.md`
- `docs/operations/`: processo de deploy, historico de sessoes e changelog
  - `docs/operations/deploy.md`
  - `docs/operations/sessions.md`
  - `docs/operations/changelog.md`
- `docs/tracking/`: acompanhamento de bugs, progresso e backlog
  - `docs/tracking/bugs.md`
  - `docs/tracking/progress.md`

## Fonte atual de execucao agentica

Para trabalho no modelo agentico, use primeiro:

`docs/brain/MAYUS_AGENTIC_EXECUTION_CHECKLIST.md`

Os planos menores em `docs/brain/IMPLEMENTATION-PLAN-*.md` ficam como historico e detalhe tecnico. O checklist consolidado e o arquivo que deve ser marcado a cada item concluido.

## Regra pratica para nao "sumir" com docs no git

Sempre que criar/editar documento:

1. Salvar dentro de `docs/` (nunca na raiz do projeto).
2. Verificar no `git status` se o arquivo apareceu como `new file` ou `modified`.
3. Incluir no commit da sessao quando o conteudo for relevante.

## O que nao deve entrar aqui

- Logs temporarios (`*.log`, `tmp*`, `build_output.txt`, etc.)
- Notas de teste descartaveis
- Segredos, tokens ou credenciais
