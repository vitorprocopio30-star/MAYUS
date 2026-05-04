# MAYUS Finance Checklist

> Arquivo historico. A fonte oficial atual do roadmap e checklist final do MAYUS e `docs/brain/MAYUS_100_PERCENT_FINAL_CHECKLIST.md`.
> Use este arquivo apenas como evidencia tecnica por frente.

Objetivo: capturar valor, reduzir inadimplencia e ligar pagamento a abertura/execucao do caso com governanca.

## Billing

- [x] Skill de cobranca Asaas existe.
- [x] Cobranca sensivel exige aprovacao humana.
- [ ] Validar logs operacionais de cobranca e webhook em `system_event_logs`.
Evidencia 2026-04-24: `src/lib/agent/skills/asaas-cobrar.ts`, `src/lib/agent/skills/financeiro/asaas-cobrar.ts` e `src/app/api/webhooks/asaas/route.ts` ja gravam em `system_event_logs`; falta aplicar migration e rodar smoke.
- [ ] Validar valor, vencimento e descricao antes da aprovacao.
- [ ] Impedir data vencida ou vencimento no mesmo dia.
- [ ] Criar idempotencia por cliente, valor, vencimento e origem.
- [ ] Registrar artifact de cobranca com link e status.

## Revenue-to-Case

- [x] Roadmap indica pagamento -> abertura do caso.
- [ ] Criar regra clara: qual pagamento abre caso, qual apenas registra receita.
- [ ] Criar reconciliacao entre financials, billing artifact e process task.
- [ ] Criar rollback operacional se abertura de caso falhar apos pagamento.
- [ ] Notificar responsavel juridico quando caso abrir por receita.

## Collections

- [ ] Criar skill `collections_followup`.
- [ ] Gerar mensagens de cobranca por tom do escritorio.
- [ ] Separar atraso leve, inadimplencia e renegociacao.
- [ ] Exigir aprovacao para mensagem externa.
- [ ] Registrar promessa de pagamento e proximo contato.

## Forecast e Unidade Economica

- [ ] Criar forecast por funil, proposta, contrato e cobranca.
- [ ] Criar margem estimada por caso.
- [ ] Criar receita por area juridica.
- [ ] Criar comissao por origem/responsavel.
- [ ] Mostrar risco financeiro por tenant.

## Criterios de aceite

- [ ] Comando "Mayus, cobre a entrada do cliente X" encontra contexto, monta cobranca, pede aprovacao e registra artifact.
- [ ] Nenhuma cobranca externa e enviada sem aprovacao.
- [ ] O sistema mostra dinheiro previsto, dinheiro recebido e casos abertos por receita.
