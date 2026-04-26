# MAYUS Agentic Execution Checklist

Fonte unica de execucao para o rollout agentico do MAYUS.

Este documento consolida:

- `docs/brain/MAYUS_MASTER_BLUEPRINT.md`
- `docs/architecture/document-brain-roadmap.md`
- `docs/brain/IMPLEMENTATION-PLAN-legal-document-memory-refresh.md`
- `docs/brain/IMPLEMENTATION-PLAN-legal-draft-revision-loop.md`
- `docs/brain/IMPLEMENTATION-PLAN-artifact-publish-premium.md`
- `docs/brain/IMPLEMENTATION-PLAN-learning-loop-capture.md`
- `docs/brain/IMPLEMENTATION-PLAN-support-case-status.md`
- `docs/brain/IMPLEMENTATION-PLAN-voice-brain-execution.md`
- plano operacional do rollout Vault / integracoes

Regra de uso:

1. Toda nova sessao deve comecar lendo este arquivo.
2. Ao concluir um item, marcar `[x]`.
3. Ao concluir parcialmente, manter `[~]` no titulo ou registrar nota curta.
4. Ao encontrar bug real, registrar tambem em `docs/tracking/bugs.md`.
5. Ao finalizar sessao, atualizar `docs/operations/sessions.md`.

Legenda:

- `[x]` concluido e validado
- `[~]` parcial ou entregue sem validacao final
- `[ ]` pendente

---

## 0. Estado Executivo

- [x] Blueprint agentico criado.
- [x] Brain runtime inicial entregue.
- [x] Runtime juridico premium entregue em blocos.
- [x] Supabase acessivel via service role local.
- [~] MCP Supabase aparece no Codex, mas nao entrega ferramentas ao agente nesta sessao.
- [~] Rollout Vault fechado no codigo e migration aplicada; falta smoke funcional autenticado.
- [x] `agent_audit_logs` reservado para runtime agentico; eventos operacionais usam `system_event_logs`.

Foco atual recomendado:

1. Fechar blockers de integracoes/Vault.
2. Fechar drift de auditoria agentica.
3. Retomar `support_case_status`.
4. Depois abrir `referral_intake` e `growth_frontdoor`.
5. Deixar `voice_brain_execution` para conectar tudo no fim.

---

## 1. Melhorias no Plano Atual

- [x] Repriorizar `agent_audit_logs` para antes do smoke final.
- [x] Tratar Google Drive PATCH como fix rapido e bloqueador visivel.
- [x] Remover fallbacks plaintext de integracoes antes de validar Vault.
- [x] Fechar webhook Escavador sem dependencia de `tenant_integrations.api_key`.
- [x] Manter planos secundarios como historico, mas usar este checklist como fonte de execucao.
- [x] Criar documentacao operacional especifica do Vault.
- [x] Transformar writes de auditoria agentica em helper unico para reduzir drift.
- [x] Separar auditoria de sistema/webhook da auditoria de skill agentica.

Decisao tecnica recomendada:

- `agent_audit_logs` deve continuar sendo a trilha de execucao de skills agenticas.
- Eventos operacionais de sistema/webhook que nao possuem `user_id`, `skill_invoked` e `idempotency_key` devem usar um helper que gere valores compativeis ou uma tabela propria de eventos de sistema.
- Para o curto prazo, preferir helper compativel para destravar smoke sem grande migration destrutiva.

---

## 2. Blockers Antes do Smoke Final

### 2.1 Google Drive Integration

- [x] Corrigir import ausente de `supabaseAdmin` em `src/app/api/integrations/google-drive/route.ts`.
- [~] Validar `GET /api/integrations/google-drive` sem sessao: respondeu `401` sem crash de rota.
- [x] Validar `PATCH /api/integrations/google-drive` limpando pasta raiz.
- [~] Validar `PATCH /api/integrations/google-drive` salvando pasta raiz: bloqueado por OAuth client local invalido; metadados reais foram restaurados via service role.
- [ ] Validar `DELETE /api/integrations/google-drive`.
- [ ] Validar `POST /api/integrations/google-drive/process-folder` com `taskId` valido.

### 2.2 Vault / Tenant Integrations

- [x] Remover fallback plaintext em `getTenantIntegrationResolved`.
- [x] Remover fallback plaintext em `listTenantIntegrationsResolved`.
- [x] Remover fallback plaintext em `upsertTenantIntegrationSecure`.
- [x] Remover fallback plaintext em `listTenantIntegrationsSafe`.
- [x] Garantir que `get_tenant_integration_resolved` exista no Supabase.
- [x] Garantir que `list_tenant_integrations_resolved` exista no Supabase.
- [x] Garantir que `upsert_tenant_integration_secure` exista nas migrations Supabase.
- [~] Confirmar que `tenant_integrations.api_key` foi removida sem quebrar runtime: codigo final usa RPC resolvida; falta smoke real.
- [~] Confirmar que `tenant_integrations.webhook_secret` foi removida sem quebrar runtime: codigo final usa RPC resolvida; falta smoke real.

### 2.3 Webhook Escavador

- [x] Remover resolucao por `.eq("api_key", possivelApiKey)`.
- [x] Resolver tenant por `tenant_oab_monitoramentos` quando houver `monitoramento_id`.
- [x] Manter fallback por `metadata.monitoramento_oab_id` somente se compativel com Vault.
- [ ] Validar evento `novo_processo`.
- [ ] Validar evento `processo_encontrado`.
- [ ] Validar evento `nova_movimentacao`.

### 2.4 Audit Logs Agenticos

- [x] Mapear todos os writers de `agent_audit_logs`.
- [x] Criar helper unico de escrita de auditoria agentica.
- [x] Adaptar `src/app/api/webhooks/asaas/route.ts`.
- [x] Adaptar `src/lib/agent/skills/asaas-cobrar.ts`.
- [x] Adaptar `src/lib/agent/skills/financeiro/asaas-cobrar.ts`.
- [x] Adaptar `src/app/api/admin/tenants/[id]/status/route.ts`.
- [x] Adaptar `src/app/api/onboarding/oab/route.ts`.
- [x] Validar `src/lib/agent/kernel/executor.ts` como writer canonico de skill.
- [x] Confirmar que `status` continua enum agentico; status operacional fica em `system_event_logs`.
- [x] Confirmar que inserts sem usuario real nao usam `agent_audit_logs`.

---

## 3. Smoke Test de Integracoes

- [x] `npm test`
- [x] `npm run build`
- [x] Testes automatizados de `/api/integrations` cobrindo listagem safe, dedupe de providers, POST via Vault e erros 401/403/400.
- [x] Testes automatizados dos helpers Vault em `src/lib/integrations/server.ts` cobrindo RPCs seguras, flags safe e propagacao de erro.
- [x] Testes comportamentais de `/api/integrations/google-drive` cobrindo GET, PATCH limpar/salvar pasta raiz, refresh de token, integracao desconectada e DELETE.
- [x] Testes comportamentais de `/api/integrations/google-drive/process-folder` cobrindo task invalida, Drive indisponivel/desconectado, processo inexistente, pasta existente e criacao de pasta nova.
- [x] Testes automatizados de LLM Router/OpenRouter cobrindo prioridade Vault, aliases, fallback env, providers desconectados e headers.
- [x] Testes comportamentais de TTS cobrindo OpenAI via Vault, ElevenLabs por tenant/env, auth, tenant ausente e provider invalido.
- [x] Testes comportamentais de ZapSign cobrindo chave Vault, envio com/sem contato, registro de mensagem e erro do servico.
- [x] Testes automatizados de Asaas cobrindo service Vault/API e webhook com token, eventos ignorados, revenue-to-case e tenant ausente.
- [x] Testes comportamentais de Escavador `buscar-completo` cobrindo auth, OAB invalida, trava de busca paga, chave Vault, cache hit, chamada externa e fallback de URL.
- [x] `npm run test:e2e`
- [x] `GET /api/integrations`
- [x] `POST /api/integrations`
- [ ] Google Drive: conectar conta.
- [~] Google Drive: salvar/remover pasta raiz. Remover pasta raiz passou; salvar/restaurar via API falhou localmente por OAuth client ID malformado/invalid_client; metadados foram restaurados via service role.
- [ ] Google Drive: processar pasta de um processo.
- [ ] Asaas: cobranca via chat/skill.
- [x] Asaas: webhook recebido e auditado.
- [ ] ZapSign: gateway com segredo resolvido.
- [ ] Escavador: buscar processo.
- [ ] Escavador: ativar monitoramento.
- [ ] Escavador: webhook de movimentacao.
- [x] ElevenLabs/OpenAI TTS: gerar fala usando integracao resolvida.
- [x] OpenRouter/LLM router: carregar chave por tenant via Vault.

---

## 4. Core Agentico

### 4.1 Foundation

- [x] `brain/dispatch`.
- [x] Missao persistida.
- [x] Auth real por tenant.
- [x] Telemetria minima de missao.
- [~] Unificacao de chat e voz no mesmo gateway.
- [~] Remocao de fluxos criticos hardcoded do chat.
- [x] Auditoria agentica sem drift no codigo.
- [x] Politica final para eventos de sistema vs eventos de skill.

### 4.2 Mission Engine

- [x] `brain_tasks`.
- [x] `brain_runs`.
- [x] `brain_steps`.
- [x] `brain_artifacts`.
- [x] `brain_approvals`.
- [x] `brain_memories`.
- [x] `learning_events`.
- [ ] Retry/cancel de missao como rotas de primeira classe.
- [ ] Stream de status de missao.
- [ ] Painel operacional de missoes.

### 4.3 Skill Fabric

- [x] `agent_skills`.
- [x] Registro de capabilities em runtime.
- [x] Router com intents juridicas.
- [x] Dispatcher com handlers.
- [x] Approval flow de skill sensivel.
- [ ] Registro final de todas as skills criticas.
- [ ] Score/evaluation por skill.
- [ ] Versionamento operacional de skill.

---

## 5. Growth Brain

### 5.1 Growth MVP

- [ ] `lead_capture`.
- [ ] `lead_qualify`.
- [ ] `lead_followup`.
- [ ] Agendamento.
- [x] Proposta.
- [x] Contrato.
- [x] Cobranca inicial.
- [ ] Reativacao de leads frios.

### 5.2 Revenue Loop

- [~] Lead -> CRM.
- [x] CRM -> proposta.
- [x] Proposta -> contrato.
- [x] Contrato -> cobranca.
- [x] Cobranca -> abertura do caso.
- [ ] Padronizar o loop como missao agentica unica.
- [ ] Criar `referral_intake`.
- [ ] Criar `growth_frontdoor`.

---

## 6. Lex Brain

### 6.1 Case Brain

- [x] Gemeo digital do caso.
- [ ] Timeline estruturada.
- [~] Mapa de teses.
- [ ] Mapa de riscos.
- [x] Lacunas documentais.
- [ ] Proximos atos provaveis.

### 6.2 Document Brain

- [x] Corrigir salvamento de `process_tasks`.
- [x] Unificar integracao Google Drive.
- [x] Criar pagina `Repositorio de Documentos`.
- [x] Criar pasta automatica por processo salvo.
- [x] Criar subpastas padrao.
- [x] Mostrar repositorio com status, link, quantidade e ultima atualizacao.
- [x] Listar arquivos do Drive por processo.
- [x] Permitir sincronizacao manual.
- [x] Ler PDFs e DOCX.
- [x] Classificar documentos por tipo.
- [x] Gerar resumo documental incremental.
- [x] Salvar memoria documental estruturada.
- [x] Injetar memoria documental no gerador de pecas.
- [x] Resumir processo.
- [x] Listar documentos faltantes.
- [~] Gerar contestacao com base na inicial e documentos.
- [ ] Apontar contradicoes.
- [ ] Gerar cronologia do caso.
- [x] Usar memoria documental no chat e no gerador de pecas.

### 6.3 Legal Grounding

- [x] Source packs.
- [x] Citacoes estruturadas.
- [x] Validacao de artigo.
- [x] Validacao de jurisprudencia.
- [~] Bloqueio de fonte duvidosa em peca final.

### 6.4 Draft Factory Premium

- [x] Planner.
- [x] Writer.
- [~] Auditor.
- [ ] Expander.
- [~] Formatter.
- [x] Export `.docx`.
- [x] Export `.pdf`.
- [x] Publisher no Drive.
- [x] Registro automatico no processo.
- [x] Historico formal de versoes.
- [x] Approval card.
- [x] Publicacao via MAYUS.

---

## 7. Pacotes Concluidos

### 7.1 Legal Document Memory Refresh

- [x] Capability `legal_document_memory_refresh`.
- [x] Router de sync documental.
- [x] Drive access fora de route context.
- [x] Dispatcher chamando `syncProcessDocuments`.
- [x] Artifact `legal_document_memory_refresh`.
- [x] Event `legal_document_memory_refreshed`.
- [x] Contexto juridico enriquecido.
- [x] Visibilidade no MAYUS.
- [x] Tests principais.
- [x] `npm test`.
- [x] `npm run build`.
- [x] `npm run test:e2e`.
- [ ] Teste extra: erro sem Drive.
- [ ] Teste extra: processo sem pasta.
- [ ] E2E extra: reconsultar contexto depois do sync.

### 7.2 Legal Draft Revision Loop

- [x] Capability `legal_draft_revision_loop`.
- [x] Router de revisao por secao.
- [x] Resolucao da versao formal.
- [x] Segmentacao em secoes.
- [x] Score de secoes fracas.
- [x] Plano estruturado de revisao.
- [x] Artifact/event.
- [x] Visibilidade no MAYUS.
- [x] Dispatcher tests.
- [x] MAYUS E2E.
- [x] `npm test`.
- [x] `npm run build`.
- [x] `npm run test:e2e`.
- [ ] `Vn+1` supervisionada materializada no historico formal.

### 7.3 Artifact Publish Premium

- [x] Estrategia de export `.pdf`.
- [x] Export premium reutilizavel.
- [x] Publicacao no Drive.
- [x] Registro do artifact publicado.
- [x] Metadados de publicacao.
- [x] UI Documentos.
- [x] UI MAYUS.
- [x] Unit tests.
- [x] E2E Documentos.
- [x] E2E MAYUS.
- [x] `npm test`.
- [x] `npm run build`.
- [x] `npm run test:e2e`.

### 7.4 Learning Loop Capture

- [x] Modelo de delta entre minuta e artifact final.
- [x] Categorias iniciais de edicao humana.
- [x] Registro de delta no processo/artifacts.
- [x] Event do learning loop.
- [x] Visibilidade no MAYUS.
- [x] Visibilidade no fluxo de Documentos.
- [x] Unit tests.
- [x] E2E observavel.
- [x] `npm test`.
- [x] `npm run build`.
- [x] `npm run test:e2e`.
- [ ] Promocao supervisionada de padrao institucional.
- [ ] Sugestao automatica de novas skills.

---

## 8. Pacote Ativo: Support Case Status

Objetivo:
fechar a camada agentica de suporte para clientes que perguntam como esta o caso.

### 8.1 Contrato

- [x] Definir contrato minimo de resposta.
- [x] Definir criterios de handoff humano.
- [x] Implementar resposta curta com confianca minima.

### 8.2 Resolucao

- [~] Identificar processo por numero; resolver ja existe e router extrai CNJ.
- [~] Identificar processo por nome; router extrai referencia textual e resolver bloqueia multiplos matches, falta E2E real.
- [~] Identificar processo por cliente; router extrai nome do cliente e resolver bloqueia multiplos matches, falta E2E real.
- [x] Lidar com multiplos matches sem inventar.
- [x] Reaproveitar match no `support_case_status`.

### 8.3 Resposta de Status

- [ ] Resumir andamento.
- [ ] Resumir fase.
- [ ] Resumir proximo passo.
- [ ] Resumir pendencias.
- [ ] Distinguir dado real de inferencia.
- [ ] Gerar handoff humano quando confianca for baixa.

### 8.4 Auditabilidade

- [x] Registrar artifact de atendimento de status.
- [x] Registrar learning event de suporte juridico.
- [x] Associar artifact ao processo.
- [x] Associar artifact ao tenant.

### 8.5 Visibilidade MAYUS

- [x] Exibir atendimento de suporte no MAYUS via artifact/event.
- [x] Exibir sinal de handoff em highlights.
- [x] Exibir processo resolvido em highlights.
- [x] Exibir resumo de status em artifact card.

### 8.6 Testes

- [x] Unit tests de resolucao textual e ambiguidade.
- [x] Unit tests de resposta.
- [x] Dispatcher tests de artifact/event de `support_case_status`.
- [x] E2E observavel no MAYUS para resposta normal e handoff ambiguo.
- [ ] `npm test`.
- [ ] `npm run build`.
- [ ] `npm run test:e2e`.

---

## 9. Pacotes Futuros

### 9.1 Referral Intake

- [ ] Diferenciar indicacao de suporte.
- [ ] Criar entrada correta no CRM.
- [ ] Coletar dados minimos do indicado.
- [ ] Encaminhar para SDR/closer.
- [ ] Registrar origem e relacionamento.
- [ ] Criar artifact/event.

### 9.2 Growth Frontdoor

- [ ] Intake comercial completo.
- [ ] Qualificacao.
- [ ] Follow-up.
- [ ] Agendamento.
- [ ] Proposta.
- [ ] Contrato.
- [ ] Cobranca.
- [ ] Abertura de caso.

### 9.3 Voice Brain Execution

- [ ] Contrato entre ElevenLabs shell e brain principal.
- [ ] Resposta curta pronta para TTS.
- [ ] Acionar missoes juridicas por voz.
- [ ] Entregar status de caso por voz.
- [ ] Handoff seguro de approval por voz.
- [ ] Refletir missao de voz no inbox.
- [ ] Feedback operacional no `MAYUSOrb`.
- [ ] Missao de voz visivel no `dashboard/mayus`.
- [ ] Unit/integration tests.
- [ ] E2E observavel.
- [ ] `npm test`.
- [ ] `npm run build`.
- [ ] `npm run test:e2e`.

---

## 10. Documentacao Operacional

- [x] Criar `docs/operations/tenant-integrations-vault-rollout.md`.
- [x] Criar `docs/operations/tenant-integrations-vault-checklist.md`.
- [x] Atualizar `docs/operations/sessions.md` ao fim da sessao atual.
- [ ] Registrar novos bugs reais em `docs/tracking/bugs.md`.
- [x] Atualizar `docs/tracking/progress.md` para apontar este checklist como fonte atual.
- [ ] Atualizar `docs/architecture/system-overview.md` para refletir Vault em `tenant_integrations`.
- [ ] Revisar docs antigas que ainda dizem que chaves ficam plaintext em `tenant_integrations`.

---

## 11. Bugs e Riscos Abertos

- [x] BUG-001: webhook reconhece aliases de `nova_movimentacao`.
- [x] BUG-002: Kanban juridico dedupe/upsert por task id e modal bloqueia duplo insert.
- [x] BUG-003: anotacoes persistem via endpoint server-side seguro.
- [~] BUG-004: agendas filtram `user_tasks` orfas de `process_prazos`; limpeza de banco pendente de operador.
- [x] BUG-005: dropdown de responsavel lista usuarios ativos esperados.
- [x] BUG-006: botao "Remover Responsavel" remove responsavel de prazos.
- [~] BUG-007: upload de avatar implementado; bucket/policies reais pendentes.
- [~] BUG-008: cliente explicito preservado; fallback visual sem inventar cliente canonico, em validacao.
- [x] BUG-009: cards usam descricoes curtas em vez de texto bruto do Escavador.
- [x] BUG-014: typecheck global e teste `external-validation` passaram.
- [ ] RISCO: smoke final mascarar erro por audit log best-effort.
- [ ] RISCO: RPC Vault ausente quebrar runtime depois da remocao de fallback.
- [ ] RISCO: handlers antigos usarem status textual incompativel com enum agentico.

---

## 12. Proximo Passo Exato

- [x] Corrigir `src/app/api/integrations/google-drive/route.ts` importando `supabaseAdmin` ou trocando updates diretos por helper seguro.
- [x] Criar helper canonico para `agent_audit_logs`.
- [x] Remover fallbacks plaintext de `src/lib/integrations/server.ts`.
- [x] Ajustar webhook Escavador para aliases de `nova_movimentacao`.
- [~] Rodar validacoes e smoke: typecheck, suite Vitest, build e migration passaram; smoke funcional autenticado ainda pendente.
- [ ] Retomar `support_case_status`.

---

## 13. Historico de Validacao

Ultima validacao consolidada conhecida:

- [x] `npm test`
- [x] `npm run build`
- [x] `npm run test:e2e`
- [x] `npx.cmd tsc --noEmit`
- [x] `npm.cmd test -- src/lib/juridico/external-validation.test.ts`
- [x] 2026-04-25: `npm.cmd test` passou com 15 arquivos e 75 testes
- [x] 2026-04-25: `npm.cmd run build` passou
- [x] 2026-04-25: RPCs remotas do Vault responderam com sucesso
- [x] 2026-04-25: `public.system_event_logs` criada no Supabase remoto e validada com insert/delete temporario
- [x] 2026-04-25: `support_case_status` artifact/event, visibilidade MAYUS e router CNJ/cliente/referencia passaram em testes focados; `npm.cmd test` passou com 15 arquivos e 77 testes; `npm.cmd run build` passou com warnings preexistentes.
- [x] 2026-04-25: resolucao textual de `support_case_status` bloqueia multiplos matches sem escolher o mais recente; handoff usa `ambiguous_case_match`; testes focados, typecheck, suite Vitest completa e build passaram.
- [x] 2026-04-25: E2E autenticado mockado de `support_case_status` passou no MAYUS para artifact/event de resposta normal e handoff ambiguo; suite Vitest completa e build passaram apos limpar cache `.next` corrompido por `next dev`.
- [x] 2026-04-26: cobertura automatizada de integracoes/Vault ampliada; `src/app/api/integrations/route.test.ts`, `src/lib/integrations/server.test.ts` e harness Google Drive passaram; suite Vitest completa passou com 17 arquivos e 89 testes; build passou apos parar `next dev` concorrente.
- [x] 2026-04-26: cobertura comportamental de Google Drive ampliada; `route.test.ts` e `process-folder/route.test.ts` passaram com 20 testes; pacote de integracoes passou com 29 testes; suite Vitest completa passou com 18 arquivos e 105 testes; build passou.
- [x] 2026-04-26: cobertura automatizada das integracoes restantes ampliada; LLM Router/OpenRouter, TTS, ZapSign, Asaas e Escavador `buscar-completo` passaram com 35 testes focados; suite Vitest completa passou com 24 arquivos e 140 testes; typecheck e build passaram.
- [x] 2026-04-26: E2E completo passou com 22 testes Playwright apos limpar `.next`, parar dev server stale e aumentar espera explicita para historico formal de minutas em Documentos.
- [x] 2026-04-26: smoke autenticado real de integracoes passou para `GET /api/integrations`, `POST /api/integrations` controlado com cleanup, OpenRouter via Vault e TTS OpenAI; Google Drive conectado foi lido e limpeza de root passou, mas salvar/restaurar via API falhou por OAuth client local invalido.
- [x] 2026-04-26: smoke seguro de webhook Asaas passou com payload sintetico `PAYMENT_OVERDUE`, resposta 200 e auditoria `system_event_logs` confirmada; diagnostico Google OAuth confirmou refresh `401 invalid_client` / `The OAuth client was not found`.
- [x] 2026-04-26: Google Drive agora valida formato do OAuth client ID em `isGoogleDriveConfigured`; o `.env.local` atual tem client ID presente, mas malformado, entao a integracao fica explicitamente nao configurada ate trocar credenciais.

Observacao:

- Esses comandos foram registrados como verdes nos planos concluidos.
- Depois dos blockers Vault/audit, eles devem ser rodados novamente e remarcados nesta secao.
- Smoke funcional autenticado de integracoes segue pendente.
