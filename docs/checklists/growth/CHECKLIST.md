# MAYUS Growth Checklist

Objetivo: o MAYUS deve captar, qualificar, acompanhar e converter clientes sem exigir que o advogado opere funil manualmente.

## Frontdoor Comercial

- [x] Criar `lead_intake` como skill formal.
Evidencia 2026-04-27: `lead_intake` foi registrado em `agent_skills`, roteado pelo kernel, executado pelo dispatcher no chat, cria card CRM, artifact `lead_intake`/`referral_intake`, evento operacional e learning event sem acionar integracoes externas.
- [x] Capturar origem, area juridica, urgencia, cidade, canal e dor principal.
Evidencia 2026-04-24: `/dashboard/vendas/nova` ganhou aba "Novo Lead" e `POST /api/growth/lead-intake` aceita `origin`, `channel`, `legalArea`, `urgency`, `city`, `state`, `phone`, `email`, `pain` e `notes`.
- [x] Separar lead novo de cliente pedindo status de caso.
Evidencia 2026-04-24: `src/lib/growth/lead-intake.ts` classifica `new_lead`, `case_status_request` e `needs_context`; teste cobre pedido de andamento/status de processo.
- [x] Separar indicacao de lead frio e de suporte/status.
Evidencia 2026-04-27: `lead-intake` classifica `referral`, aceita `referredBy` e `referralRelationship`, preserva tags/origem no CRM e mantem pedido de andamento como `case_status_request`.
- [x] Registrar trilha auditavel de intake comercial/indicacao.
Evidencia 2026-04-27: `POST /api/growth/lead-intake` registra `lead_intake_created` ou `referral_intake_created` em `system_event_logs` com score, tags, proximo passo e dados do indicador quando houver.
- [x] Criar artifact agentico para indicacoes.
Evidencia 2026-04-27: indicacoes criam mission/run/step, artifact `referral_intake` e learning event `referral_intake_artifact_created`; metadata nao expõe telefone/e-mail bruto e aparece no MAYUS com score, area, indicador e handoff humano.
- [x] Criar score inicial com explicacao curta.
Evidencia 2026-04-24: `analyzeLeadIntake` retorna `score` e `scoreReason`; o endpoint grava `crm_tasks.lead_scoring`.
- [x] Criar handoff humano quando houver risco juridico, urgencia alta ou baixa confianca.
Evidencia 2026-04-24: `analyzeLeadIntake` retorna `needsHumanHandoff` para urgencia alta, pedido de status de caso ou score alto; a UI mostra proximo passo apos salvar.

## Qualificacao

- [x] Criar `sales_consultation` como skill DEF de atendimento comercial.
Evidencia 2026-04-28: `sales_consultation` foi registrado em `agent_skills`, roteado pelo kernel e executado pelo dispatcher; cria artifact `sales_consultation_plan` com descoberta, encantamento, fechamento, mapa de diagnostico, sinais capturados/faltantes no bate-papo, proxima pergunta adaptativa, cliente ideal do escritorio, solucao central, PUV sugerida quando ausente, pilares autorais, movimentos de objecao, ancoragem segura e checklist de qualidade, bloqueando qualquer contato externo automatico ate revisao humana.
- [x] Criar `sales_profile_setup` para auto-configurar o perfil comercial do escritorio.
Evidencia 2026-04-28: `sales_profile_setup` conversa com o usuario MAYUS, extrai cliente ideal, solucao central, PUV, pilares e anti-cliente, cria artifact `sales_profile_setup`, registra `sales_profile_configured`/`sales_profile_setup_created` e grava automaticamente `tenant_settings.ai_features.sales_consultation_profile` quando o perfil atinge completude suficiente, mantendo side effects externos bloqueados.
- [x] Levar atendimento consultivo para a tela de WhatsApp.
Evidencia 2026-04-28: `/api/whatsapp/ai-sales-reply` prepara resposta consultiva DEF com `sales_consultation_profile`, registra `whatsapp_sales_reply_prepared` em `system_event_logs` e a tela `/dashboard/conversas/whatsapp` ganhou botao MAYUS que coloca a resposta sugerida no composer sem enviar automaticamente; se faltar perfil comercial, exige `sales_profile_setup` antes de responder o lead.
Evidencia 2026-04-28: os webhooks Meta Cloud e Evolution tambem chamam `prepareWhatsAppSalesReplyForContact` depois de salvar mensagem inbound, gerando rascunho/auditoria/notificacao em background sem autoenvio externo.
Evidencia 2026-04-28: `/api/whatsapp/ai-sales-reply` ganhou `GET` para buscar o ultimo rascunho preparado; a conversa WhatsApp agora mostra painel "Rascunho MAYUS" com modo, riscos e botoes para usar/atualizar o texto no composer.
- [x] Criar `lead_qualify` com roteiro por area.
Evidencia 2026-04-27: `lead_qualify` foi registrado em `agent_skills`, roteado pelo kernel e executado pelo dispatcher; cria artifact `lead_qualification_plan` e learning event sem acionar integracoes externas.
- [x] Identificar documentos minimos necessarios por tipo de caso.
Evidencia 2026-04-27: `buildLeadQualificationPlan` cobre playbooks iniciais de Previdenciario, Trabalhista, Familia e fallback geral com documentos minimos.
- [x] Registrar objecoes, capacidade de pagamento e proximo melhor movimento.
Evidencia 2026-04-27: artifact `lead_qualification_plan` registra objecoes provaveis, alertas de risco, confianca, handoff humano e `next_best_action`; capacidade de pagamento fica como pergunta/objecao supervisionada, nao como dado inferido.
- [ ] Criar alerta para caso fora da tese do escritorio.
- [ ] Gerar resumo executivo para consulta.

## Follow-up e Conversao

- [x] Criar `lead_followup` com cadencia supervisionada.
Evidencia 2026-04-27: `lead_followup` foi registrado em `agent_skills`, roteado pelo kernel e executado pelo dispatcher; cria artifact `lead_followup_plan` e learning event sem enviar WhatsApp, telefone ou e-mail automaticamente.
- [x] Gerar mensagem por WhatsApp com tom do escritorio.
Evidencia 2026-04-27: `buildLeadFollowupPlan` cria primeira mensagem sugerida e cadencia supervisionada, exigindo revisao/aprovacao humana antes de qualquer envio externo.
- [x] Criar reativacao de leads frios por segmento.
Evidencia 2026-04-28: `lead_reactivation` foi registrado em `agent_skills`, roteado pelo kernel e executado pelo dispatcher; cria artifact `lead_reactivation_plan`, lista operacional de candidatos do CRM, mensagens sugeridas, checklist de aprovacao e learning event sem enviar WhatsApp/telefone/e-mail automaticamente.
- [x] Criar agenda de retorno automatico.
Evidencia 2026-04-27: `lead_schedule` cria tarefa em `user_tasks`, artifact `lead_schedule_plan` e learning event para consulta/qualificacao/retorno; a confirmacao com o lead segue manual e supervisionada, sem Google Calendar/OAuth.
- [ ] Registrar taxa de resposta e motivo de perda.

## Proposta, Contrato e Entrada

- [x] Proposta comercial ja existe como capability.
- [x] Contrato via ZapSign existe com aprovacao humana.
- [x] Cobranca Asaas existe com aprovacao humana.
- [x] Transformar proposta -> contrato -> cobranca -> abertura de caso em um unico fluxo agentico.
Evidencia 2026-04-27: `revenue_flow_plan` monta plano supervisionado de proposta -> contrato -> cobranca -> abertura de caso, cria artifact `revenue_flow_plan` e learning event, sem acionar ZapSign/Asaas nem abrir caso real automaticamente.
- [x] Criar preview aprovado antes de enviar qualquer documento externo.
Evidencia 2026-04-28: `external_action_preview` cria preview/checklist de aprovacao antes de ZapSign, Asaas, WhatsApp ou outra acao externa; artifact `external_action_preview` bloqueia side effects externos ate decisao humana e nao expõe e-mail/segredos no metadata.
- [x] Criar trilha de auditoria para aceite do cliente.
Evidencia 2026-04-28: `client_acceptance_record` registra artifact `client_acceptance_record`, learning event e evento operacional `client_acceptance_recorded` em `system_event_logs`; side effects externos seguem bloqueados ate revisao humana.

## KPIs

- [ ] Leads novos por semana.
- [ ] Taxa de qualificacao.
- [ ] Taxa de agendamento.
- [ ] Taxa de comparecimento.
- [ ] Taxa de fechamento.
- [ ] Tempo ate proposta.
- [ ] Receita prevista por origem.

## MAYUS Growth OS

- [ ] Posicionar MAYUS como socio operacional de IA da banca.
- [x] Agenda Google opcional por usuario.
Evidencia 2026-04-28: Agenda Diaria ganhou conexao Google Agenda por usuario, OAuth read-only, listagem dos eventos do calendario primario e desconexao sem afetar tarefas internas.
- [x] Agenda Google global opcional do escritorio.
Evidencia 2026-04-28: Agenda Global ganhou conexao Google Agenda global com OAuth read-only, provider `google_calendar_global`, acesso restrito a administradores/socios e eventos externos exibidos sem afetar tarefas internas.
- [x] Upload e analise de call comercial por lead/oportunidade.
Evidencia 2026-04-28: MVP textual `POST /api/growth/call-analysis` recebe transcript/notes e gera analise comercial sem side effects externos.
- [x] Relatorio de call com resumo, dor, objecoes, pontos fortes/fracos, proximo passo e follow-up.
Evidencia 2026-04-28: builder `buildCallCommercialAnalysis` retorna resumo, dor, interesse, objecoes, pontos fortes/fracos, oportunidades perdidas, proxima acao, follow-up sugerido e probabilidade de avanco.
- [x] Historico/artifact seguro da analise de call no lead/oportunidade.
Evidencia 2026-04-28: CRM visual envia `crmTaskId` para `POST /api/growth/call-analysis`; endpoint registra evento seguro e artifact agentico `call_commercial_analysis` quando possivel, sem transcript bruto persistido. `GET /api/growth/call-analysis?crmTaskId=...` retorna historico seguro por lead e o modal do CRM exibe data, interesse, probabilidade, resumo seguro e proximo passo.
- [x] Marketing por referencias sem copia de conteudo.
Evidencia 2026-04-28: backend `src/lib/marketing/editorial-calendar.ts` extrai padroes de referencias fornecidas e cria ideias originais com guardrails explicitos contra copia.
- [x] Cadastro de perfis, redes, canais, sites e referencias admiradas.
Evidencia 2026-04-28: `/dashboard/marketing/perfil` salva perfil de marca, areas, publicos, canais, tom, sites, redes, referencias admiradas e guardrails eticos em `localStorage`; `/dashboard/marketing/calendario` usa esse perfil como briefing inicial sem publicacao externa automatica.
- [x] Extracao de padroes vencedores: temas, formatos, ganchos, CTAs, frequencia, tom e engajamento.
Evidencia 2026-04-28: tela local de Referencias usa `extractReferencePatterns` para exibir padroes de referencias cadastradas pelo usuario.
- [x] Calendario editorial editavel.
Evidencia 2026-04-28: `generateEditorialCalendar` e `updateEditorialCalendarItem` geram e editam calendario por frequencia, estilo, canal, area, objetivo, tom e publico-alvo.
- [x] Configuracoes de frequencia, estilo, formato, canal, area juridica, objetivo, tom e publico-alvo.
Evidencia 2026-04-28: tela local de Calendario Editorial gera calendario com frequencia, estilo, canais, areas, objetivos, tons, publicos, data inicial e periodos.
- [x] Aprovacao, edicao ou recusa de conteudos sugeridos.
Evidencia 2026-04-28: calendario editorial local permite editar, aprovar, recusar e voltar para rascunho, mantendo persistencia MVP em `localStorage`; persistencia server-side fica para etapa futura.
- [x] Conteudos aprovados entram na agenda/tarefas quando fizer sentido.
Evidencia 2026-04-28: pauta aprovada no calendario editorial pode virar tarefa interna privada em `user_tasks`, com origem de marketing registrada em descricao/tags/notas e sem side effect externo.
- [~] Analise de Meta Ads por upload de CSV, XLSX ou PDF.
Evidencia parcial 2026-04-28: MVP local em `/dashboard/marketing/meta-ads` aceita CSV colado/exportado ou arquivo `.csv` client-side e analisa com `analyzeMetaAdsCsv`; XLSX/PDF ainda pendentes.
- [x] Diagnostico de campanhas, CPL, CTR, CPC, CPM, criativos, publicos, verba desperdicada e oportunidades.
Evidencia 2026-04-28: `meta-ads-analysis` calcula totais, benchmarks, campanhas vencedoras, gasto desperdicado, temas criativos/publicos e findings.
- [x] Recomendar realocacao de verba e novos criativos com revisao humana.
Evidencia 2026-04-28: recomendacoes deterministicas sao geradas sem Meta API e sem alteracao automatica de campanhas.
- [ ] Ciclo completo conectado: marketing -> lead -> CRM -> call -> follow-up -> contrato -> cobranca -> juridico -> prazos -> metricas.
- [ ] Integracoes automaticas futuras mantidas fora do escopo inicial: Meta Ads API, Google Meet, Drive de gravacoes, publicacao automatica e monitoramento amplo.

## Criterios de aceite

- [x] Comando "Mayus, recupere leads frios de previdenciario" gera lista, plano, mensagens e aprovacoes.
Evidencia 2026-04-28: router detecta `lead_reactivation` para "recupere leads frios de previdenciario"; dispatcher gera `lead_reactivation_plan` com candidatos, criterios, mensagens, aprovacoes e side effects externos bloqueados.
- [x] Comando "Mayus, crie atendimento consultivo de vendas metodo DEF" gera roteiro superior a um script comum.
Evidencia 2026-04-28: router detecta `sales_consultation`; dispatcher gera artifact `sales_consultation_plan` com fases DEF, perguntas de descoberta, sinais ja respondidos, sinais faltantes, proxima pergunta do bate-papo, ponte de encantamento, tratamento de objecoes, sequencia de fechamento, travas eticas e side effects externos bloqueados.
- [x] Auto Setup Doctor identifica perfil comercial incompleto.
Evidencia 2026-04-28: `GET/POST /api/setup/doctor` agora inclui check `commercial:sales_profile`; quando faltam cliente ideal, solucao, PUV ou pilares, Configuracoes mostra aviso e proxima acao para o usuario MAYUS responder antes de escalar vendas. A tela Configuracoes ganhou painel "Perfil Comercial do MAYUS" para salvar cliente ideal, solucao central, PUV, pilares e status rascunho/validado em `tenant_settings.ai_features.sales_consultation_profile`.
Evidencia 2026-04-28: a auto-configuracao por chat tambem grava esse mesmo perfil via skill `sales_profile_setup`, reduzindo a necessidade de mexer manualmente em Configuracoes.
- [ ] Lead nunca fica sem proximo passo.
Evidencia parcial 2026-04-24: leads criados via `lead-intake` recebem `nextStep` e descricao no card CRM; ainda falta cobrir follow-up automatico e leads criados por outros fluxos.
- [ ] O advogado consegue operar Growth por chat sem abrir o CRM.
