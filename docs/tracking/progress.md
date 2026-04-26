# Progresso MAYUS

Este arquivo agora funciona como indice de progresso.

A fonte unica de execucao do rollout agentico esta em:

- `docs/brain/MAYUS_AGENTIC_EXECUTION_CHECKLIST.md`

Use esse checklist para marcar:

- o que ja foi concluido
- o que esta parcial
- o que falta
- blockers antes do smoke final
- validacoes executadas

## Estado Atual

- [x] Foundation agentica criada.
- [x] Camada juridica premium entregue em pacotes.
- [x] Document Brain operacional.
- [x] Draft Factory Premium operacional.
- [x] Learning Loop Capture entregue.
- [~] Support Case Status em andamento.
- [~] Rollout Vault fechado no codigo e pendente de validacao final em ambiente.
- [x] Drift de `agent_audit_logs` corrigido no codigo com separacao para `system_event_logs` e helper canonico agentico.
- [x] Fallbacks plaintext removidos de `src/lib/integrations/server.ts`.
- [x] Fix de runtime aplicado em `/api/integrations/google-drive`.
- [x] Typecheck global desbloqueado em 2026-04-24 (`npx.cmd tsc --noEmit --pretty false`) e teste focado `external-validation` passou.
- [x] Build de producao passou em 2026-04-24 (`npm.cmd run build`, fora do sandbox por bloqueio `spawn EPERM`).
- [x] Harness estatico de integracoes passou em 2026-04-24 (`npx.cmd vitest run src/app/api/integrations/google-drive/route.test.ts`).
- [x] Suite Vitest completa passou em 2026-04-24 (`npm.cmd test`: 15 arquivos, 75 testes).
- [x] Typecheck global passou em 2026-04-25 (`npx.cmd tsc --noEmit --pretty false`).
- [x] Testes focados de auditoria agentica passaram em 2026-04-25 (`npx.cmd vitest run src/lib/agent/kernel/executor.test.ts src/app/api/ai/approve/route.test.ts`: 2 arquivos, 4 testes).
- [x] Suite Vitest completa passou novamente em 2026-04-25 (`npm.cmd test`: 15 arquivos, 75 testes).
- [x] Build de producao passou novamente em 2026-04-25 (`npm.cmd run build`).
- [x] RPCs remotas do Vault confirmadas em 2026-04-25: `get_tenant_integration_resolved` e `list_tenant_integrations_resolved`.
- [x] E2E anonimo de Documentos/Login passou em 2026-04-24 (`npx.cmd playwright test e2e/documentos-auth.spec.ts`: 3 testes).
- [~] E2E autenticado de Documentos ainda pendente por ambiente: tenant/perfil/fixture/RLS foram confirmados via Node com service role e anon session, mas o Chromium do Playwright fica pendurado em chamadas Supabase externas. Login real para em `ACESSANDO...`; bootstrap por cookie entra no dashboard, mas Documentos fica em `Carregando Acervo Operacional...`.
- [x] BUG-005/006 corrigidos no codigo em Prazos.
- [~] BUG-007 corrigido no codigo e pendente de validacao real do bucket/policies `avatars`.
- [x] BUG-001 corrigido no codigo para aliases de `nova_movimentacao`.
- [x] BUG-002 corrigido no codigo com dedupe/upsert no Kanban juridico.
- [x] BUG-003 corrigido no codigo com endpoint server-side para anotacoes.
- [~] BUG-004 mitigado no codigo; pendente revisar/remover `user_tasks` orfa no banco se confirmado.
- [~] BUG-008 em validacao: `cliente_nome` explicito preservado e fallback visual aplicado sem inferir cliente canonico.
- [x] BUG-009 corrigido no codigo com descricoes curtas para cards processuais.
- [~] Smoke final das integracoes em andamento: schema/logs e validacoes tecnicas passaram; falta fluxo funcional autenticado.
- [ ] Validacao funcional local do Google Drive pendente.
- [x] `support_case_status` agora registra artifact, learning event e metadados para visibilidade no MAYUS; router extrai CNJ/cliente/referencia; testes focados, typecheck, suite Vitest completa e build passaram em 2026-04-25.
- [x] `support_case_status` nao escolhe mais automaticamente o processo mais recente em buscas textuais ambiguas; retorna handoff `ambiguous_case_match`; suite Vitest completa e build passaram apos o ajuste.
- [x] E2E observavel de `support_case_status` no MAYUS passou em 2026-04-25: resposta normal e handoff ambiguo exibem mission card, artifact e event.
- [x] Cobertura automatizada de integracoes/Vault ampliada em 2026-04-26: `/api/integrations` e helpers RPC seguros cobertos por Vitest; suite completa passou com 17 arquivos e 89 testes; build passou.
- [x] Cobertura comportamental de Google Drive ampliada em 2026-04-26: GET/PATCH/DELETE e `process-folder` cobertos por Vitest; suite completa passou com 18 arquivos e 105 testes; build passou.
- [x] Cobertura automatizada de LLM Router/OpenRouter, TTS, ZapSign, Asaas e Escavador ampliada em 2026-04-26; pacote focado passou com 6 arquivos e 35 testes; suite completa passou com 24 arquivos e 140 testes; typecheck e build passaram.
- [x] E2E completo passou em 2026-04-26 (`npm.cmd run test:e2e`: 22 testes) apos reset de cache `.next`/dev server e wait explicito para historico formal de minutas.
- [x] Smoke autenticado real parcial passou em 2026-04-26: `GET /api/integrations`, `POST /api/integrations` controlado com cleanup, OpenRouter via Vault e TTS OpenAI.
- [~] Google Drive real validado parcialmente em 2026-04-26: conta conectada e clear root passaram; salvar/restaurar root via API falhou no ambiente local com `The OAuth client was not found`; root foi restaurado via service role; client ID local foi confirmado como malformado.
- [x] Smoke seguro de webhook Asaas passou em 2026-04-26 com payload sintetico e auditoria em `system_event_logs` confirmada.
- [x] Protecao de configuracao Google Drive adicionada em 2026-04-26: `isGoogleDriveConfigured()` agora retorna falso quando o OAuth client ID nao tem formato valido.
- [x] Aplicacao da migration `20260424110000_system_event_logs.sql` concluida em 2026-04-25; tabela `public.system_event_logs` validada com insert/delete temporario.

## Proximo Passo

- [ ] Substituir OAuth client local malformado do Google Drive por credenciais validas e repetir salvar/restaurar root + process-folder.
- [ ] Rodar smoke funcional real de Asaas, ZapSign e Escavador com payloads aprovados.
- [ ] Depois disso, retomar `support_case_status` no checklist agentico.
- [ ] Continuar `support_case_status`: validar fluxo real com dados autenticados nao mockados quando o ambiente estiver pronto.

## Arquivo Antigo

O tracking anterior misturava fases iniciais do produto com o roadmap agentico atual. A informacao util foi preservada e consolidada no checklist principal.
