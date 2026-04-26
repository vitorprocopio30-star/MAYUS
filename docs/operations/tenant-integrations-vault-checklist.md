# Tenant Integrations / Vault Rollout Checklist

## Concluido

- [x] Roles de `profiles` normalizadas
- [x] Helpers `get_current_tenant_id()` e `get_current_user_role()`
- [x] Superficie segura de integracoes no client
- [x] Leitura server-side centralizada
- [x] Gateway multi-tenant endurecido
- [x] `tenant_integrations.api_key` removido do banco
- [x] `tenant_integrations.webhook_secret` removido do banco
- [x] `api_key_secret_id` presente
- [x] `webhook_secret_secret_id` presente
- [x] Fallbacks temporarios removidos de `src/lib/integrations/server.ts`
- [x] `agent_audit_logs` separado de logs de sistema/webhook
- [x] `system_event_logs` criado para eventos nao agênticos
- [x] Writers nao agênticos migrados para `system_event_logs`
- [x] Roteamento legado por `tenant_integrations.api_key` removido do webhook Escavador
- [x] Migration `20260424110000_system_event_logs.sql` aplicada no banco alvo em 2026-04-25
- [x] `public.system_event_logs` validada com insert/delete temporario

## Proximo

- [ ] Validar Google Drive local apos ajuste de env
  - Evidencia parcial 2026-04-24: `GET /api/integrations/google-drive` respondeu `401` sem sessao, sem crash de rota.
- [ ] Rodar smoke test final de integracoes
- [ ] Confirmar `novo_processo` do Escavador sem dependencia de header legado
- [ ] Atualizar documentacao operacional apos a validacao manual final
