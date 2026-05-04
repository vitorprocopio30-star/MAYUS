# MAYUS Ops & Quality Checklist

> Arquivo historico. A fonte oficial atual do roadmap e checklist final do MAYUS e `docs/brain/MAYUS_100_PERCENT_FINAL_CHECKLIST.md`.
> Use este arquivo apenas como evidencia tecnica por frente.

Objetivo: garantir que cada release seja verificavel, observavel e reversivel.

## Checks executados nesta sessao

- [x] `npm.cmd install --package-lock-only --ignore-scripts`
- [x] `npm.cmd audit --json`
- [x] `npm.cmd audit fix --ignore-scripts`
- [x] `npm.cmd test -- src/lib/agent/kernel/executor.test.ts src/lib/agent/kernel/router.test.ts src/lib/agent/capabilities/dispatcher.test.ts`
- [x] `npm.cmd run lint -- --file src/app/api/integrations/google-drive/route.ts --file src/lib/integrations/server.ts --file src/app/api/webhooks/escavador/route.ts --file src/app/api/webhooks/asaas/route.ts --file src/lib/agent/skills/asaas-cobrar.ts --file src/lib/agent/skills/financeiro/asaas-cobrar.ts --file src/app/api/admin/tenants/[id]/status/route.ts --file src/app/api/onboarding/oab/route.ts`
- [x] `npm.cmd test -- src/lib/lex/proactive-movement-draft.test.ts`
- [x] `npm.cmd run lint -- --file src/lib/agent/proactive-events/registry.ts --file src/lib/lex/proactive-movement-draft.ts --file src/lib/lex/proactive-movement-draft.test.ts --file src/lib/juridico/analisador.ts`
- [x] `npx.cmd tsc --noEmit` sem erro.
Evidencia 2026-04-24: typecheck global passou apos correcao do teste `src/lib/juridico/external-validation.test.ts`.
- [x] `npm.cmd test -- src/lib/juridico/external-validation.test.ts`
Evidencia 2026-04-24: teste `external-validation` passou.
- [x] `npx.cmd vitest run src/app/api/integrations/google-drive/route.test.ts`
Evidencia 2026-04-24: harness estatico de seguranca de integracoes passou com 4 checks.
- [ ] Aplicar migration `20260424110000_system_event_logs.sql` no banco alvo.
Evidencia 2026-04-24: bloqueado por ambiente; Docker/Supabase local indisponivel, remoto nao linkado e sem DB URL. Nova tentativa confirmou o mesmo bloqueio.
- [x] `npm.cmd test` completo.
Evidencia 2026-04-24: suite Vitest completa passou com 15 arquivos e 75 testes.
- [x] `npm.cmd run build`.
Evidencia 2026-04-24: build de producao passou fora do sandbox; restaram warnings conhecidos de hooks/`<img>`.
- [x] `npx.cmd playwright test e2e/documentos-auth.spec.ts`
Evidencia 2026-04-24: E2E anonimo de Documentos/Login passou com 3 testes; primeira tentativa falhou por porta 3000 ocupada, segunda passou com `PORT=3001` e `PLAYWRIGHT_BASE_URL=http://localhost:3001`.
- [ ] `npm.cmd run test:e2e` completo.
Evidencia 2026-04-24: E2E completo foi tentado com `PORT=3001` e `PLAYWRIGHT_BASE_URL=http://localhost:3001`; specs anonimos passaram, mas specs autenticados de Documentos seguem bloqueados no ambiente. Diagnostico com service role e sessao anon confirmou que tenant/perfil/fixture/RLS estao corretos e que a tarefa `11111111-1111-4111-8111-111111111111` fica visivel para o usuario Playwright via Node. No browser Playwright, as chamadas Supabase externas ficam penduradas: login real permanece em `ACESSANDO...` e o bootstrap por cookie entra no dashboard, mas a tela fica em `Carregando Acervo Operacional...` com contadores zerados. Erro anterior de cache `.next` foi mitigado limpando `.next`; pendente validar em ambiente com rede externa liberada para Chromium.

## Testes

- [ ] Cobrir executor para roles, canais, approvals e falha de audit.
- [ ] Cobrir webhooks com segredo ausente, invalido e valido.
- [ ] Cobrir chat com payload grande, historico invalido e provider invalido.
- [ ] Cobrir tenant isolation em rotas admin e juridicas.
- [x] Cobrir fluxo support_case_status com validacao focada.
Evidencia 2026-04-27: pacote responde andamento, fase, proximo passo e pendencias, distinguindo base confirmada de inferencias operacionais.
- [ ] Cobrir Draft Factory: gerar, retry, aprovar, publicar, exportar.
- [x] Cobrir classificador Lex proativo para contestacao -> replica.
- [x] Cobrir registry Lex proativo para sentenca, citacao, audiencia e fallback sem playbook.

## Build e Release

- [ ] Build local sem erro.
- [ ] E2E autenticado sem regressao em ambiente com rede externa do Chromium liberada.
- [ ] `npm audit --omit=dev` revisado.
- [ ] Migrations revisadas e reversibilidade documentada.
- [ ] Changelog atualizado.
- [ ] Plano de rollback definido.

## Observabilidade

- [ ] Logs estruturados por tenant, request id e task id.
- [ ] Redacao de PII em logs.
- [ ] Painel de webhooks aceitos, rejeitados e ignorados.
- [ ] Painel de missoes agenticas por status.
- [ ] Alertas para aumento de falhas, custo ou latencia.

## Performance

- [ ] Medir LCP das paginas principais.
- [ ] Evitar bundle pesado em dashboard.
- [ ] Lazy load para editores, graficos e 3D.
- [ ] Cache seguro para dados nao sensiveis.
- [ ] No-store para APIs sensiveis.

## Criterios de aceite

- [ ] Nenhum deploy sem teste unitario minimo e build.
- [ ] Nenhum fluxo critico sem log rastreavel.
- [ ] Nenhuma falha silenciosa em webhook, skill ou export.
