# Bugs Conhecidos MAYUS

Lista centralizada dos bugs abertos, com prioridade e status.

---

## Criticos

### BUG-010 - `agent_audit_logs` com drift entre schema e runtime
- Status: em validacao
- Impacto: risco reduzido no codigo; depende de aplicar a migration e confirmar writes em ambiente real
- Causa provavel: schema agentico exigia `user_id`, `skill_invoked` e `idempotency_key`, mas writers legados usavam `action/status`
- Acao: aplicar `20260424110000_system_event_logs.sql` e validar que eventos nao agênticos nao voltaram a gravar em `agent_audit_logs`
- Arquivos alvo: `src/app/api/webhooks/asaas/route.ts`, `src/lib/agent/skills/asaas-cobrar.ts`, `src/app/api/admin/tenants/[id]/status/route.ts`, `src/app/api/onboarding/oab/route.ts`

### BUG-011 - Google Drive PATCH usa `supabaseAdmin` sem import
- Status: em validacao
- Impacto: risco reduzido no codigo; falta validacao funcional local do fluxo do card
- Causa provavel: `src/app/api/integrations/google-drive/route.ts` usava `supabaseAdmin` sem importar
- Acao: validar connect/save/disconnect/process-folder apos ajuste de env local
- Arquivo alvo: `src/app/api/integrations/google-drive/route.ts`

### BUG-012 - Fallback plaintext de Vault ainda consulta colunas removidas
- Status: corrigido no codigo
- Impacto: risco removido do runtime alterado nesta sessao
- Causa provavel: `src/lib/integrations/server.ts` ainda tentava ler/escrever `api_key` e `webhook_secret`
- Acao: manter apenas as RPCs seguras e nao reintroduzir compatibilidade plaintext
- Arquivo alvo: `src/lib/integrations/server.ts`

### BUG-013 - Webhook Escavador resolve tenant por `tenant_integrations.api_key`
- Status: em validacao
- Impacto: compatibilidade com Vault corrigida no codigo; falta confirmar comportamento do emissor real no smoke
- Causa provavel: handler usava `.eq('api_key', possivelApiKey)`
- Acao: validar `novo_processo` por `tenant_id` explicito ou contexto de monitoramento OAB; so criar lookup seguro novo se o smoke provar necessidade
- Arquivo alvo: `src/app/api/webhooks/escavador/route.ts`

### BUG-001 - Webhook de movimentacao nao processa evento esperado
- Status: corrigido no codigo
- Impacto: movimentacoes podem nao gerar cards/prazos
- Causa provavel: mismatch entre evento recebido e evento tratado no handler
- Acao: alinhar validacao para `nova_movimentacao`
- Arquivo alvo: `src/app/api` (handler de webhook Escavador)
- Evidencia 2026-04-24: handler aceita `event`, `evento`, `tipo_evento`, `tipoEvento`, `event_type` e `type`; normaliza aliases de `nova_movimentacao`; typecheck passou.

### BUG-002 - Cards duplicados no Kanban juridico
- Status: corrigido no codigo
- Impacto: ruido operacional e tarefas em duplicidade
- Causa provavel: instancia de client/reactividade no componente
- Acao: estabilizar instancia de client e fluxo de render
- Evidencia 2026-04-24: Kanban juridico estabiliza Supabase client, aplica dedupe/upsert por `task.id` e modal bloqueia duplo insert com `saveInFlightRef`; typecheck passou.

### BUG-003 - Anotacoes em cards nao persistem
- Status: corrigido no codigo
- Impacto: perda de historico e contexto
- Causa provavel: policy RLS bloqueando `INSERT/UPDATE` em `process_tasks`
- Acao: revisar e corrigir policy para papeis permitidos
- Evidencia 2026-04-24: endpoint `/api/prazos/salvar-anotacao` usa sessao tenant + `supabaseAdmin` para criar/atualizar cards; tela de prazos passou a usar a API tambem em updates existentes.

---

## Altos

### BUG-004 - Prazo fantasma `d155f6e9`
- Status: em validacao
- Impacto: inconsistencias visuais e operacionais
- Acao: validar origem e remover registro indevido
- Causa provavel: `user_tasks` orfa com `source_table = 'process_prazos'` e `source_id` sem prazo correspondente.
- Evidencia 2026-04-24: agendas diaria/global/admin filtram tarefas de `process_prazos` contra a tabela fonte antes de renderizar; falta operador revisar/remover dado orfao no banco.

### BUG-005 - Dropdown de responsavel nao lista todos os usuarios ativos
- Status: corrigido no codigo
- Impacto: atribuicao incompleta de prazos
- Acao: listar por `is_active = true`, sem filtro indevido de role
- Arquivo alvo: `src/app/dashboard/operacoes/prazos/page.tsx`
- Evidencia 2026-04-24: dropdown carrega usuarios ativos do tenant, sem dependencia de `role`; lint focado passou.

### BUG-006 - Botao "Remover Responsavel" nao funciona
- Status: corrigido no codigo
- Impacto: impossibilidade de desatribuir prazos
- Acao: validar update para `responsavel_id = null`
- Evidencia 2026-04-24: update grava `responsavel_id = null`, filtra por `tenant_id` e atualiza estado local com retorno do Supabase.

### BUG-007 - Upload de avatar falhando
- Status: em validacao
- Impacto: experiencia de perfil incompleta
- Acao: validar integracao com bucket `avatars`
- Arquivo alvo: `src/app/dashboard/configuracoes/usuarios/page.tsx`
- Evidencia 2026-04-24: UI faz upload para `avatars/{tenantId}/{memberId}/avatar.jpg`, salva `profiles.avatar_url` e exibe erro de bucket/policy; falta validar bucket/policies reais.

### BUG-014 - Typecheck global bloqueado em `external-validation.test.ts`
- Status: corrigido no codigo
- Impacto: impede validar o repo inteiro com `npx tsc --noEmit`
- Causa provavel: fixture/tipo usa `auto_draft_factory_on_case_brain_ready` fora do contrato atual
- Acao: alinhar shape esperado no teste ou no tipo compartilhado
- Arquivo alvo: `src/lib/juridico/external-validation.test.ts`
- Evidencia 2026-04-24: `npx.cmd tsc --noEmit --pretty false` passou; `npm.cmd test -- src/lib/juridico/external-validation.test.ts` passou com 4 testes.

---

## Medios/Baixos

### BUG-008 - `cliente_nome` ausente em parte dos cards
- Status: em validacao
- Impacto: contexto incompleto no card
- Acao: garantir populacao do campo no fluxo de importacao/sincronizacao
- Evidencia 2026-04-24: fluxos de sync/import preservam `cliente_nome` explicito e cards usam fallback visual por parte processual sem inventar cliente canonico.

### BUG-009 - Texto bruto do Escavador em algumas descricoes
- Status: corrigido no codigo
- Impacto: baixa legibilidade
- Acao: padronizar template de resumo
- Evidencia 2026-04-24: novo helper de contexto gera titulo/descricao curta, prefere `resumo_curto` valido e evita JSON/texto bruto longo do Escavador.

---

## Resolvidos Recentemente

- Ajustes de normalizacao de role para `admin`
- Backfill de IDs de monitoramento
- Ajustes de frequencia/cache no fluxo Escavador
- Remocao dos fallbacks plaintext em `src/lib/integrations/server.ts`
- Separacao entre `agent_audit_logs` e `system_event_logs`
- Fix de runtime em `/api/integrations/google-drive`
- BUG-005/006: responsaveis de prazos corrigidos no codigo
- BUG-014: typecheck global desbloqueado
- BUG-001: webhook Escavador reconhece aliases de `nova_movimentacao`
- BUG-009: descricoes de cards processuais padronizadas no codigo
- BUG-002: dedupe de cards no Kanban juridico corrigido no codigo
- BUG-003: persistencia de anotacoes movida para endpoint server-side seguro
- BUG-004: agendas filtram prazos orfaos antes de renderizar
