# Tenant Integrations / Vault Rollout

## Objetivo

Fechar o rollout final de seguranca de `tenant_integrations`, mantendo secrets apenas via Vault e separando logs agênticos de logs operacionais genericos.

## Estado Atual

- Banco no modelo final com `api_key_secret_id` e `webhook_secret_secret_id`.
- Colunas plaintext `api_key` e `webhook_secret` removidas do banco.
- Camada server-side de integracoes centralizada em RPCs.
- `agent_audit_logs` mantido exclusivo para o runtime agêntico.
- `system_event_logs` criado para webhooks, onboarding, admin actions e eventos operacionais.

## Mudancas Concluidas Nesta Sessao

- Corrigido o bloqueador de runtime em `src/app/api/integrations/google-drive/route.ts` com import de `supabaseAdmin`.
- Removidos os fallbacks temporarios de `src/lib/integrations/server.ts` que ainda consultavam colunas plaintext.
- Mantida apenas a superficie final baseada em RPCs:
  - `get_tenant_integration_resolved`
  - `list_tenant_integrations_resolved`
  - `upsert_tenant_integration_secure`
- Criada a migration `supabase/migrations/20260424110000_system_event_logs.sql`.
- Migrados para `system_event_logs` os writers nao agênticos de:
  - `src/app/api/webhooks/asaas/route.ts`
  - `src/lib/agent/skills/asaas-cobrar.ts`
  - `src/lib/agent/skills/financeiro/asaas-cobrar.ts`
  - `src/app/api/admin/tenants/[id]/status/route.ts`
  - `src/app/api/onboarding/oab/route.ts`
- Removido o roteamento por `tenant_integrations.api_key` em `src/app/api/webhooks/escavador/route.ts`.
- Corrigida a autenticacao de `src/app/api/onboarding/oab/route.ts` para usar sessao por cookie, compatível com a chamada real da tela de onboarding.

## Decisao de Logging

### `agent_audit_logs`

Tabela canonica do runtime agêntico. Deve continuar reservada para:

- execucao de skills
- aprovacao humana
- idempotencia
- payload pendente de execucao

### `system_event_logs`

Tabela operacional para:

- webhooks
- billing
- onboarding
- admin actions
- eventos tecnicos de integracao

Schema inicial:

- `tenant_id`
- `user_id`
- `source`
- `provider`
- `event_name`
- `status`
- `payload`
- `created_at`

## Validacoes Feitas

- Grep sem ocorrencias de runtime com `.eq('api_key', ...)` ou `.eq('webhook_secret', ...)`.
- Grep sem inserts nao agênticos em `agent_audit_logs`.
- `npm run lint` passou nos arquivos alterados.
- Supabase CLI validado, mas migration ainda bloqueada por ambiente: Docker local indisponivel, projeto remoto nao linkado e sem DB URL no `.env.local`.
- `GET /api/integrations/google-drive` local respondeu `401` sem sessao, indicando rota viva sem crash.
- Nova tentativa de execucao confirmou: lint focado passou, greps seguem sem lookup plaintext e sem writes operacionais em `agent_audit_logs`; migration continua bloqueada por falta de alvo Supabase.

## Pendencias Reais

- Validar localmente o card e o fluxo completo do Google Drive em `/dashboard/configuracoes/integracoes`.
- Rodar smoke test final de integracoes apos aplicar a migration nova.
- Confirmar em ambiente real se algum webhook legado do Escavador ainda dependia de `x-escavador-api-key` para o evento `novo_processo`.
- Disponibilizar um alvo Supabase para aplicar a migration: Docker local, projeto remoto linkado ou DB URL direta.

## Riscos Remanescentes

- O fluxo `novo_processo` do Escavador agora depende de `tenant_id` explicito no payload ou contexto por monitoramento OAB. Se algum emissor legado dependia apenas do header com API key, sera necessario formalizar um lookup seguro especifico para webhook.
- O typecheck global do repo continua bloqueado por erro preexistente em `src/lib/juridico/external-validation.test.ts` e nao por arquivos tocados nesta sessao.

## Proximos Passos

1. Aplicar a migration `20260424110000_system_event_logs.sql` no banco alvo.
2. Validar Google Drive localmente.
3. Rodar smoke test final de integracoes.
4. Confirmar eventos novos em `system_event_logs` e ausencia de lixo operacional em `agent_audit_logs`.
