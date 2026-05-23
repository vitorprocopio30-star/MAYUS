# Coordenacao Hermes + Agentes Publicos

Status: validado localmente com pendencia de ambiente real.
Data: 2026-05-21.

## Objetivo

Continuar a extracao agentica em duas frentes paralelas, mantendo produto visivel e sem criar canais paralelos de execucao.

1. Frente A - Hermes Cross-Module: memoria, lifecycle, trajectory, avaliacao de missao e uso cross-module supervisionado.
2. Frente B - Public Agents: Paperclip, OpenClaw e Hermes como primitivas internas reaproveitadas pelo Agent Control Plane.

O coordenador integra status, checklist e superficies comuns. As frentes nao devem assumir arquivos uma da outra.

## Ownership

Frente A pode alterar:

- `src/lib/agent/runtime/trajectory.ts`
- `src/lib/agent/memory/skill-lifecycle.ts`
- `src/lib/brain/mission-control.ts`
- `src/app/api/agent/memory/route.ts`
- `src/app/dashboard/configuracoes/memoria/page.tsx`
- testes diretamente ligados a Hermes, lifecycle, memoria e Mission Control

Frente B pode alterar:

- `src/lib/agent/runtime/control-plane.ts`
- `src/lib/agent/runtime/routines.ts`
- `src/lib/agent/runtime/agent-profiles.ts`
- `src/app/dashboard/configuracoes/agente/page.tsx`
- testes diretamente ligados a Control Plane, rotinas, OpenClaw e Public Agents

Coordenador pode alterar:

- `docs/operations/hermes-public-agents-coordination.md`
- `docs/brain/MAYUS_100_PERCENT_FINAL_CHECKLIST.md`
- `docs/brain/MAYUS_AGENTIC_BETA_MASTER_PLAN.md`
- `src/app/dashboard/aprovacoes/page.tsx`, apenas para leitura integrada das duas frentes

## Regras de nao colisao

- Frente A nao altera Control Plane, rotinas, profiles ou Configuracoes > Agente.
- Frente B nao altera lifecycle Hermes, API de memoria, Mission Control ou Configuracoes > Memoria.
- `publicAgents` e avaliacao Hermes devem ser aditivos e retrocompativeis.
- Nenhuma primitiva publica vira agente autonomo fora do MAYUS Operating Partner.
- Toda acao juridica, financeira, externa ou sensivel continua exigindo approval, artifact, fonte e auditoria.

## Validacao cruzada obrigatoria

- Hermes: avaliacao de missao informa completude, eventos faltantes, lifecycle/memoria, approval e proxima acao segura.
- Public Agents: Control Plane informa Paperclip, OpenClaw e Hermes como primitivas internas, com evidencias e blockers.
- Produto: Configuracoes > Agente, Configuracoes > Memoria e Aprovacoes mostram o estado sem divergencia de ownership.
- Checks: testes focados das duas frentes, typecheck, build e `git diff --check` nos arquivos tocados.

## Status de coordenacao

- [x] Ownership separado entre Hermes e Public Agents.
- [x] Documento operacional de nao colisao criado.
- [x] Frente A: avaliacao Hermes cross-module.
- [x] Frente B: matriz Public Agents no Control Plane.
- [x] Integracao final nas superficies comuns e checklist mestre.
- [x] Estabilizacao local: testes focados, typecheck, build limpo e smoke autenticado nao destrutivo passaram.
- [~] Smoke real do Brain: pendente alinhar schema/ambiente real (`brain_runs.output_payload` e `brain_steps.error_message`) antes de marcar producao como fechado.
