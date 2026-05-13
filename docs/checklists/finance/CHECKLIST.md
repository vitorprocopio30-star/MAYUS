# MAYUS Finance Checklist

> Arquivo historico. A fonte oficial atual do roadmap e checklist final do MAYUS e `docs/brain/MAYUS_100_PERCENT_FINAL_CHECKLIST.md`.
> Use este arquivo apenas como evidencia tecnica por frente.

Objetivo: capturar valor, reduzir inadimplencia e ligar pagamento a abertura/execucao do caso com governanca.

## Billing

- [x] Skill de cobranca Asaas existe.
- [x] Cobranca sensivel exige aprovacao humana.
- [ ] Validar logs operacionais de cobranca e webhook em `system_event_logs`.
Evidencia 2026-04-24: `src/lib/agent/skills/asaas-cobrar.ts`, `src/lib/agent/skills/financeiro/asaas-cobrar.ts` e `src/app/api/webhooks/asaas/route.ts` ja gravam em `system_event_logs`; falta aplicar migration e rodar smoke.
- [x] `billing_create` e o router do Chat MAYUS reconhecem cobranca agentica como caminho oficial.
- [x] Validar valor, vencimento e descricao antes da aprovacao.
- [x] Impedir data vencida ou vencimento no mesmo dia.
- [x] Criar idempotencia por cliente, valor, vencimento e origem.
- [~] Registrar artifact de cobranca com link e status.
Evidencia 2026-05-12: `src/lib/agent/capabilities/billing-normalization.ts`, `src/lib/agent/kernel/executor.ts`, `src/lib/agent/kernel/router.ts`, `src/lib/agent/capabilities/dispatcher.ts` e `src/lib/agent/capabilities/registry.ts` implementam `billing_create` supervisionado no Chat MAYUS, default de vencimento em hoje + 3 dias uteis, bloqueio de vencimento passado/hoje, tipo `UNDEFINED/PIX/BOLETO/CREDIT_CARD`, idempotencia `cliente + valor + vencimento + origem`, aprovacao obrigatoria antes de Asaas e artifact `asaas_billing`. Validado com Vitest focado (76 testes), `tsc` e `git diff --check`; falta smoke real Asaas/aprovacao em ambiente controlado.

## Revenue-to-Case

- [x] Roadmap indica pagamento -> abertura do caso.
- [ ] Criar regra clara: qual pagamento abre caso, qual apenas registra receita.
- [~] Criar reconciliacao entre financials, billing artifact e process task.
Evidencia 2026-05-12: webhook Asaas preservado usando `asaas_billing` para `revenue-to-case` e teste focado de pagamento confirmado passando; ainda falta reconciliacao completa com `financials` e smoke real.
Evidencia 2026-05-13: `src/lib/finance/revenue-reconciliation.ts` adiciona reconciliacao leve e testada entre `financials`, artifacts `asaas_billing`/`revenue_case_opening`/`revenue_flow_plan` e `process_tasks`, classificando ciclos como `matched`, `partial`, `blocked` ou `unmatched`; ja esta plugada no resumo financeiro do tenant e passou smoke autenticado na aba Financeiro com fixture controlada.
- [ ] Criar rollback operacional se abertura de caso falhar apos pagamento.
- [ ] Notificar responsavel juridico quando caso abrir por receita.

## Collections

- [x] Criar skill `collections_followup`.
- [x] Gerar mensagens de cobranca por tom do escritorio.
- [x] Separar atraso leve, inadimplencia e renegociacao.
- [x] Exigir aprovacao para mensagem externa.
- [x] Registrar promessa de pagamento e proximo contato.
Evidencia 2026-05-13: `src/lib/finance/collections-followup.ts`, router, registry e dispatcher implementam `collections_followup` pelo Chat MAYUS. A skill cria artifact `collections_followup_plan`, learning event, classifica `light_overdue`/`delinquency`/`renegotiation`, monta mensagem por tom/canal, registra promessa/proximo contato e bloqueia side effects externos ate revisao humana. Validado com Vitest focado; ainda falta smoke real com operador financeiro.

## Forecast e Unidade Economica

- [~] Criar forecast por funil, proposta, contrato e cobranca.
Evidencia 2026-05-13: `GET /api/financeiro/summary` agora separa forecast de cobrancas em 7 dias, 30 dias, futuro e sem vencimento, alem de aging de vencidos; a aba Financeiro passou smoke autenticado com fixture controlada. Ainda falta forecast completo por funil/proposta/contrato.
- [ ] Criar margem estimada por caso.
- [ ] Criar receita por area juridica.
- [ ] Criar comissao por origem/responsavel.
- [~] Mostrar risco financeiro por tenant.
Evidencia 2026-05-13: o painel superadmin financeiro mostra risco por escritorio/tenant e separa receita SaaS do MAYUS em `platform_billing_events`; o summary financeiro do tenant lista riscos por cliente/caso agrupados a partir de `financials` e passou smoke autenticado no dashboard com fixture controlada. O smoke do `/admin` segue pendente porque a migration remota de billing SaaS ainda nao esta aplicada (`tenants.last_payment_at` ausente no schema cache) e o usuario E2E nao e superadmin. O dry-run remoto do Supabase CLI foi tentado, mas a sessao nao tem `SUPABASE_ACCESS_TOKEN`.

## Criterios de aceite

- [~] Comando "Mayus, cobre a entrada do cliente X" encontra contexto, monta cobranca, pede aprovacao e registra artifact.
- [x] Nenhuma cobranca externa e enviada sem aprovacao.
- [~] O sistema mostra dinheiro previsto, dinheiro recebido e casos abertos por receita.
Evidencia 2026-05-13: Chat/Brain MAYUS ganhou labels de artifact para `asaas_billing`, `collections_followup_plan` e revenue-to-case, e a reconciliacao leve calcula receita recebida vs caso aberto. O summary financeiro do tenant passou smoke autenticado com fixture controlada cobrindo forecast, aging, cobrancas abertas, collections, reconciliacao e riscos por cliente/caso. O painel superadmin segue pendente de migration remota de billing SaaS e usuario E2E superadmin.
