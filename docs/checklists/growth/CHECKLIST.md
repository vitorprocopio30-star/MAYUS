# MAYUS Growth Checklist

Objetivo: o MAYUS deve captar, qualificar, acompanhar e converter clientes sem exigir que o advogado opere funil manualmente.

## Frontdoor Comercial

- [ ] Criar `lead_intake` como skill formal.
- [x] Capturar origem, area juridica, urgencia, cidade, canal e dor principal.
Evidencia 2026-04-24: `/dashboard/vendas/nova` ganhou aba "Novo Lead" e `POST /api/growth/lead-intake` aceita `origin`, `channel`, `legalArea`, `urgency`, `city`, `state`, `phone`, `email`, `pain` e `notes`.
- [x] Separar lead novo de cliente pedindo status de caso.
Evidencia 2026-04-24: `src/lib/growth/lead-intake.ts` classifica `new_lead`, `case_status_request` e `needs_context`; teste cobre pedido de andamento/status de processo.
- [x] Criar score inicial com explicacao curta.
Evidencia 2026-04-24: `analyzeLeadIntake` retorna `score` e `scoreReason`; o endpoint grava `crm_tasks.lead_scoring`.
- [x] Criar handoff humano quando houver risco juridico, urgencia alta ou baixa confianca.
Evidencia 2026-04-24: `analyzeLeadIntake` retorna `needsHumanHandoff` para urgencia alta, pedido de status de caso ou score alto; a UI mostra proximo passo apos salvar.

## Qualificacao

- [ ] Criar `lead_qualify` com roteiro por area.
- [ ] Identificar documentos minimos necessarios por tipo de caso.
- [ ] Registrar objecoes, capacidade de pagamento e proximo melhor movimento.
- [ ] Criar alerta para caso fora da tese do escritorio.
- [ ] Gerar resumo executivo para consulta.

## Follow-up e Conversao

- [ ] Criar `lead_followup` com cadencia supervisionada.
- [ ] Gerar mensagem por WhatsApp com tom do escritorio.
- [ ] Criar reativacao de leads frios por segmento.
- [ ] Criar agenda de retorno automatico.
- [ ] Registrar taxa de resposta e motivo de perda.

## Proposta, Contrato e Entrada

- [x] Proposta comercial ja existe como capability.
- [x] Contrato via ZapSign existe com aprovacao humana.
- [x] Cobranca Asaas existe com aprovacao humana.
- [ ] Transformar proposta -> contrato -> cobranca -> abertura de caso em um unico fluxo agentico.
- [ ] Criar preview aprovado antes de enviar qualquer documento externo.
- [ ] Criar trilha de auditoria para aceite do cliente.

## KPIs

- [ ] Leads novos por semana.
- [ ] Taxa de qualificacao.
- [ ] Taxa de agendamento.
- [ ] Taxa de comparecimento.
- [ ] Taxa de fechamento.
- [ ] Tempo ate proposta.
- [ ] Receita prevista por origem.

## Criterios de aceite

- [ ] Comando "Mayus, recupere leads frios de previdenciario" gera lista, plano, mensagens e aprovacoes.
- [ ] Lead nunca fica sem proximo passo.
Evidencia parcial 2026-04-24: leads criados via `lead-intake` recebem `nextStep` e descricao no card CRM; ainda falta cobrir follow-up automatico e leads criados por outros fluxos.
- [ ] O advogado consegue operar Growth por chat sem abrir o CRM.
