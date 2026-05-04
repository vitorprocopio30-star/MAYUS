# Documentacao do Projeto

Esta pasta centraliza toda a documentacao de produto, tecnica e operacao do MAYUS.

## Fonte oficial atual

Para qualquer decisao de roadmap, status, prioridade ou checklist ate o MAYUS chegar a 100%, comece por:

`docs/brain/MAYUS_100_PERCENT_FINAL_CHECKLIST.md`

Os demais documentos continuam como historico, evidencia tecnica e detalhe de implementacao. Quando houver divergencia, o documento acima vence.

## Estrutura recomendada

- `docs/architecture/`: visao tecnica e desenho do sistema
  - `docs/architecture/system-overview.md`
- `docs/brain/`: blueprint e execucao do runtime agentico
  - `docs/brain/MAYUS_100_PERCENT_FINAL_CHECKLIST.md`
  - `docs/brain/MAYUS_AGENTIC_EXECUTION_CHECKLIST.md`
  - `docs/brain/MAYUS_MASTER_BLUEPRINT.md`
- `docs/operations/`: processo de deploy, historico de sessoes e changelog
  - `docs/operations/deploy.md`
  - `docs/operations/sessions.md`
  - `docs/operations/changelog.md`
- `docs/tracking/`: acompanhamento de bugs, progresso e backlog
  - `docs/tracking/bugs.md`
  - `docs/tracking/progress.md`

## Arquivos historicos de execucao agentica

O checklist agentico antigo agora e historico tecnico:

`docs/brain/MAYUS_AGENTIC_EXECUTION_CHECKLIST.md`

Os planos menores em `docs/brain/IMPLEMENTATION-PLAN-*.md` tambem ficam como historico e detalhe tecnico. Novas decisoes e progresso consolidado devem refletir no documento mestre de 100%.

## Regra pratica para nao "sumir" com docs no git

Sempre que criar/editar documento:

1. Salvar dentro de `docs/` (nunca na raiz do projeto).
2. Verificar no `git status` se o arquivo apareceu como `new file` ou `modified`.
3. Incluir no commit da sessao quando o conteudo for relevante.

## O que nao deve entrar aqui

- Logs temporarios (`*.log`, `tmp*`, `build_output.txt`, etc.)
- Notas de teste descartaveis
- Segredos, tokens ou credenciais
