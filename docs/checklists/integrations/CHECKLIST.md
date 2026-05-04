# MAYUS Integrations Checklist

> Arquivo historico. A fonte oficial atual do roadmap e checklist final do MAYUS e `docs/brain/MAYUS_100_PERCENT_FINAL_CHECKLIST.md`.
> Use este arquivo apenas como evidencia tecnica por frente.

Objetivo: integrar provedores externos com menor privilegio, secrets protegidos, webhooks auditados e falha segura.

## Supabase

- [x] Auth, profiles, tenants e RLS aparecem como base do sistema.
- [x] Vault transition para integracoes existe em migrations/docs.
- [ ] Validar RLS de todas as tabelas com `tenant_id`.
- [ ] Garantir `search_path` seguro em todas as functions.
- [ ] Criar teste SQL para tenant isolation.
- [ ] Revisar uso de service role por rota.

## Google Drive

- [x] Drive por tenant/processo existe.
- [x] Publicacao de artifact juridico no Drive existe.
- [x] Garantir refresh token apenas em Vault.
Evidencia 2026-04-24: banco final confirmado sem `tenant_integrations.api_key` plaintext e leitura centralizada por RPC em `src/lib/integrations/server.ts`.
- [ ] Garantir escopo minimo de OAuth.
- [ ] Criar health check por tenant.
- [ ] Criar reautenticacao guiada pelo agente.
Evidencia 2026-04-24: `GET /api/integrations/google-drive` respondeu `401` sem sessao no ambiente local, indicando rota funcional; connect/save/disconnect ainda pendentes de validacao autenticada.
Evidencia 2026-04-24: `npx.cmd vitest run src/app/api/integrations/google-drive/route.test.ts` passou com 4 checks estaticos cobrindo import `supabaseAdmin`, ausencia de lookup plaintext no Escavador, Asaas em `system_event_logs` e RPCs seguras de Vault.

## Escavador

- [x] Webhook Escavador exige segredo global.
- [x] Webhook Escavador nao grava payload bruto completo no log.
- [x] Payload tem limite de tamanho.
- [x] Runtime nao depende mais de `tenant_integrations.api_key` plaintext para resolver tenant.
Evidencia 2026-04-24: lookup legado por `.eq('api_key', ...)` removido de `src/app/api/webhooks/escavador/route.ts`.
Evidencia 2026-04-24: teste estatico de integracoes cobre ausencia de `.eq('api_key')` e `.eq('webhook_secret')` no webhook Escavador.
- [ ] Criar assinatura por tenant quando o provedor permitir.
- [ ] Criar idempotencia forte por movimento/evento.
- [ ] Criar fila com tenant_id sempre preenchido.
- [ ] Criar painel de eventos ignorados e motivos.

## Asaas, ZapSign e Gateway

- [x] Gateway aceita somente provedores permitidos.
- [x] Gateway exige segredo configurado antes de processar evento.
- [x] Comparacao de segredo usa `timingSafeEqual`.
- [x] Payload de gateway tem limite de tamanho.
- [ ] Registrar evento de sistema para cada webhook aceito/ignorado.
Evidencia 2026-04-24: webhook Asaas ja grava em `system_event_logs`; gateway, ZapSign e demais eventos ainda precisam ser cobertos.
Evidencia 2026-04-24: teste estatico garante que o webhook Asaas nao voltou a gravar eventos operacionais em `agent_audit_logs`.
- [ ] Criar reprocessamento manual seguro.
- [ ] Criar alertas para segredo ausente.

## WhatsApp/Voz

- [ ] Validar assinatura do provedor.
- [ ] Separar mensagem de cliente, lead e equipe.
- [ ] Registrar consentimento e opt-out.
- [ ] Sanitizar PII em logs.
- [ ] Criar fallback humano quando baixo contexto.

## Criterios de aceite

- [ ] Nenhum webhook altera estado sem segredo ou assinatura valida.
- [ ] Nenhum segredo plaintext aparece em resposta, log ou payload de browser.
- [ ] Toda integracao tem health, owner e caminho de reautenticacao.
