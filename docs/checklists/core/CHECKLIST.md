# MAYUS Core Checklist

Objetivo: transformar o MAYUS em um agente agentico supervisionado: um Mission Engine governado, auditavel e facil de acionar por chat, voz, WhatsApp, jobs e eventos internos, capaz de iniciar, explicar, pausar, cancelar, tentar de novo e concluir missoes com trilha reconstruivel.

## Mission Engine

- [x] `brain_tasks`, `brain_runs`, `brain_steps` existem como base de missao.
- [x] `POST /api/brain/dispatch` cria task, run e primeiro step.
- [x] Eventos internos podem abrir missao Lex sem comando manual.
Evidencia 2026-04-24: `analisarMovimentacao` aciona `prepareProactiveMovementDraft` apos criar prazo/card; a Draft Factory registra task/run/step e artifacts para revisao humana.
- [x] Registry central de eventos proativos existe como contrato de plataforma.
Evidencia 2026-04-24: `src/lib/agent/proactive-events/registry.ts` resolve playbooks por dominio/fonte/evento e suporta `draft_factory` e `artifact_only`.
- [x] Criar endpoint de retry por step com idempotencia.
Evidencia 2026-05-02: `POST /api/brain/tasks/:id/retry` exige `stepId`, aceita apenas step `failed`/`cancelled`, impede retry duplicado por `idempotency_key`, cria nova `brain_run`/`brain_step` em `queued`, preserva contexto do step original e registra `learning_events.task_step_retry_requested` sem executar ferramenta externa automaticamente.
- [x] Criar controle agentico de cancelamento de missao com motivo e ator.
Evidencia 2026-05-02: `POST /api/brain/tasks/:id/cancel` valida sessao/tenant, exige `reason`, grava ator em `error_payload`, cancela runs/steps/approvals ativos e registra `learning_events.task_cancelled`; teste focado passou com 4 casos. O objetivo nao e apenas encerrar uma rota, mas permitir que o agente pare uma missao sob comando humano e deixe o motivo auditavel.
- [ ] Criar streaming/status incremental da missao para UI.
- [ ] Persistir plano completo antes de executar ferramentas externas.
- [ ] Garantir estados padronizados: queued, planning, executing, awaiting_input, awaiting_approval, failed, completed, completed_with_warnings.

## Skill Fabric

- [x] `agent_skills` tem registry com risco, canal, roles e handler.
- [x] Executor consulta a skill no servidor antes de executar.
- [x] Roles do executor agora aceitam forma canonica, acentos e maiusculas.
- [x] Skills com `requires_human_confirmation` entram em aprovacao antes de executar.
- [ ] Validar input de cada skill contra schema antes do dispatch.
- [ ] Versionar handlers e registrar compatibilidade por schema.
- [ ] Criar painel de health por skill: uso, falhas, tempo, custo, taxa de aprovacao.

## Governance

- [x] `agent_audit_logs` registra intencao, status, approval e idempotency.
- [x] Aprovacao humana executa payload gravado no banco, nao no body.
- [ ] Separar logs operacionais de `agent_audit_logs` no banco e em runtime.
Evidencia 2026-04-24: runtime migrado para `system_event_logs` em Asaas, onboarding e admin; falta aplicar a migration `20260424110000_system_event_logs.sql` e validar em ambiente.
- [ ] Separar politicas por risco: low, medium, high, critical.
- [ ] Bloquear automaticamente critical sem aprovador executivo e MFA.
- [ ] Registrar motivo de rejeicao de approval.
- [ ] Criar budget por tenant, skill e dia.
- [ ] Auto-pausar tenant/skill em anomalia de custo ou erro.

## Memory

- [x] Memoria institucional entra no prompt do chat.
- [ ] Criar memoria por usuario com consentimento e revogacao.
- [ ] Criar memoria procedural para passos recorrentes.
- [ ] Criar memoria de falhas para evitar repeticao de erro.
- [ ] Registrar origem e confianca de cada memoria.
- [ ] Criar promocao supervisionada de memoria: sugestao -> aprovacao -> ativa.

## Criterios de aceite

- [~] Uma missao complexa pode ser reconstruida somente com os dados do banco.
Evidencia parcial 2026-05-02: cancel/retry agora deixam trilha em `brain_runs`, `brain_steps`, `brain_approvals` e `learning_events`; falta painel/stream e padronizacao completa de plano antes de ferramentas externas.
- [ ] Nenhuma skill sensivel executa sem audit log.
- [ ] Toda falha retorna proximo passo claro ao usuario.
- [ ] Dashboard mostra missoes em andamento, pausadas, aguardando aprovacao e concluidas.
