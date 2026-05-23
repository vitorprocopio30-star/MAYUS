# Coordenacao Juridico + Agentic

Status: validado localmente.
Data: 2026-05-21.

## Objetivo

Rodar duas frentes paralelas sem colisao:

1. Frente A - Juridico/Lex: processo, movimentacoes, Case Brain, documentos, Draft Factory e revisao humana.
2. Frente B - Agentic Core: Control Plane, rotinas, profiles, Hermes, OpenClaw, Paperclip, approvals, health e mission snapshots.

O coordenador nao deve assumir trabalho interno das frentes. A funcao do coordenador e manter ownership, validar contrato comum, revisar guardrails e consolidar status.

## Ownership

Frente A pode alterar:

- `src/lib/lex/process-mission-context.ts`
- `src/lib/lex/process-mission-context.test.ts`
- `src/lib/juridico/analisador.ts`
- `src/app/api/juridico/movement-reviews/route.ts`
- testes diretamente ligados a Lex, Case Brain, movimentacoes e Draft Factory

Frente B pode alterar:

- `src/lib/agent/runtime/control-plane.ts`
- `src/lib/agent/runtime/routines.ts`
- `src/lib/agent/runtime/agent-profiles.ts`
- `src/lib/agent/runtime/trajectory.ts`
- testes diretamente ligados a Control Plane, rotinas, OpenClaw, Hermes e Paperclip

Coordenador pode alterar:

- documentacao operacional desta coordenacao
- tipos de integracao read-only entre Inbox, Mission Control e Control Plane
- checklist final de execucao
- ajustes pequenos de integracao quando uma frente terminar e a outra nao precisar tocar no mesmo arquivo

## Regras de nao colisao

- Frente A nao altera Control Plane, rotinas, profiles ou trajectory sem alinhamento.
- Frente B nao altera analisador, movement reviews, Case Brain, Draft Factory ou mission context sem alinhamento.
- Qualquer schema compartilhado deve ser aditivo e retrocompativel.
- Toda acao juridica, financeira ou externa sensivel precisa terminar em approval, artifact e auditoria.
- Nenhuma frente deve armazenar segredo, token, chave, transcript bruto sensivel ou texto documental bruto fora do contrato ja aprovado.

## Validacao cruzada obrigatoria

- Juridico: missao processual gera contexto, proxima acao segura, bloqueios e legal operator state.
- Agentic Core: Control Plane reconstrui agente, rotina, policy OpenClaw, trajectory Hermes, approval e health.
- Integracao: `/dashboard/aprovacoes` e Configuracoes > Agente mostram o mesmo estado sem divergencia de ownership.
- Build/checks: testes focados das duas frentes, dispatcher filtrado, typecheck, build e `git diff --check` nos arquivos tocados.

## Status de coordenacao

- [x] Ownership separado entre Frente A e Frente B.
- [x] Documento operacional de nao colisao criado.
- [x] Contrato de ownership levado para o runtime.
- [x] Validacao focada das duas frentes.
- [x] Consolidacao no checklist mestre apos validacao.
