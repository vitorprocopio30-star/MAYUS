# MAYUS Security Checklist

Objetivo: proteger dados juridicos, clientes, chaves, artifacts e execucoes agenticas com padrao profissional de produto sensivel.

## Resultado da varredura de 2026-04-24

- [x] `npm audit` executado.
- [x] `npm audit fix --ignore-scripts` aplicado sem `--force`.
- [x] Vulnerabilidades cairam de 14 para 10.
- [x] `next` instalado em 14.2.35 e especificado como `^14.2.35`.
- [x] `eslint-config-next` alinhado para 14.2.35.
- [x] Headers HTTP endurecidos.
- [x] API chat tem limite de body, mensagem e historico.
- [x] Gateway de webhooks exige segredo configurado.
- [x] Escavador webhook nao loga payload completo.
- [ ] Decidir estrategia para vulnerabilidades restantes que exigem upgrade major.

## Vulnerabilidades restantes

- [ ] Next.js: planejar upgrade controlado para Next 16 ou trilha segura equivalente quando compativel com React/stack atual.
- [ ] Quill/react-quill: trocar editor vulneravel ou migrar para Quill 2/Tiptap/Lexical com sanitizacao.
- [ ] Resend/Svix/uuid: validar versao segura compativel ou trocar fluxo de email.
- [ ] ESLint/glob: risco dev/CI; resolver ao migrar lint stack ou Next.
- [ ] Criar criterio de release: zero high em runtime antes de producao.

## Auth, Tenant e RBAC

- [x] Middleware protege paginas do dashboard.
- [x] Route handlers criticos validam sessao em pontos centrais.
- [ ] Criar papel `mayus_support_admin` separado de usuarios comuns de tenant.
- [ ] Criar grants temporarios de suporte por tenant com motivo, expiracao e auditoria.
- [ ] Bloquear acesso cross-tenant de super admin sem grant quando houver dado sensivel.
- [ ] Garantir que tenant demo marcado como `demo_mode=true` nao contem dados reais.
- [ ] Garantir que nenhum endpoint API dependa apenas do middleware.
- [ ] Testar tenant isolation com usuario A tentando ler tenant B.
- [ ] Exigir MFA para admin, aprovacao critica e export sensivel.
- [ ] Remover logs de perfil/admin em producao.

## Secrets

- [x] Transicao para Vault documentada.
- [x] Validar que `tenant_integrations.api_key` e `webhook_secret` plaintext nao existem no banco alvo.
Evidencia 2026-04-24: SQL final confirmado com `api_key_secret_id` e `webhook_secret_secret_id` presentes e colunas plaintext removidas; runtime sem fallback plaintext em `src/lib/integrations/server.ts`.
- [ ] Rotacionar chaves apos qualquer exposicao local.
- [ ] Bloquear secrets em logs, artifacts e UI.
- [ ] Criar scanner pre-commit para `.env`, tokens e service role.

## Agent Safety

- [x] Executor gera audit log antes de executar skill.
- [x] Acoes sensiveis exigem aprovacao humana.
- [x] Idempotency key existe no executor.
- [ ] Aplicar e validar separacao entre `agent_audit_logs` e `system_event_logs` no banco alvo.
Evidencia 2026-04-24: runtime de logs operacionais migrado para `system_event_logs`; falta aplicar `20260424110000_system_event_logs.sql` e confirmar writes reais.
Bloqueio 2026-04-24: sem Docker local, projeto remoto linkado ou DB URL para aplicar a migration. Nova tentativa confirmou o mesmo bloqueio.
- [ ] Criar budget por skill.
- [ ] Criar allowlist de ferramentas externas por tenant.
- [ ] Criar kill switch por tenant e por skill.
- [ ] Criar avaliacao de risco antes de acao juridica/financeira externa.

## LGPD e Dados Juridicos

- [ ] Mapear dados pessoais por tabela.
- [ ] Criar retention policy para audio, chats, documentos e logs.
- [ ] Criar exportacao/portabilidade por tenant.
- [ ] Criar exclusao controlada com trilha de auditoria.
- [ ] Separar dado de cliente, lead, processo e usuario interno.

## Criterios de aceite

- [ ] Toda mudanca sensivel tem teste ou checklist de seguranca.
- [ ] Nenhuma chave de tenant fica acessivel ao browser.
- [ ] Nenhum webhook altera estado sem autenticacao.
- [ ] Nenhuma acao agentica externa ocorre sem auditabilidade.
