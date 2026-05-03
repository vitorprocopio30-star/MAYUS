# Sessoes de Desenvolvimento MAYUS

Log central das sessoes de desenvolvimento. Cada sessao registra briefing, feitos, pendencias e proximos passos.

---

## Sessao 9 - 02/05/2026

### Briefing
Analisar o checklist principal e retomar uma frente executavel sem depender de credenciais externas, mantendo a intencao central: MAYUS como agente agentico supervisionado, nao apenas um conjunto de endpoints.

### Feitos
- [x] Retomado Core Agentico como controle de autonomia supervisionada do agente.
- [x] Criado `POST /api/brain/tasks/:id/cancel` com auth/tenant, motivo obrigatorio e bloqueio de estados finais.
- [x] Cancelamento atualiza task, runs, steps e approvals pendentes, registrando ator/motivo e `learning_events.task_cancelled`.
- [x] Criado `POST /api/brain/tasks/:id/retry` para retomar step falho/cancelado com idempotencia, nova run/step em fila e `learning_events.task_step_retry_requested`.
- [x] Planejada frente Demo Tenant, Super Admin e WhatsApp multi-conta para demonstracoes sem dados reais e suporte MAYUS separado de tenants.
- [x] Criado `docs/operations/demo-superadmin-whatsapp-plan.md` com fases, guardrails, criterios de aceite e ordem recomendada.
- [x] Implementado primeiro reset demo: gerador de 100 casos sinteticos, rota `POST /api/admin/demo/reset`, dry-run padrao, confirmacao `RESET_DEMO` e bloqueio para tenant sem `demo_mode`.
- [x] Ampliado fluxo demo completo: OAB ficticia `SP/123456`, cache Escavador sintetico, monitoramentos, inbox de movimentacoes, processos monitorados, conversas WhatsApp demo e organizacao deterministica sem provedor externo.
- [x] Iniciado padrao `Executar` para demonstracao operacional: Monitoramento mostra a organizacao como execucao de fase, e Prazos ganhou `Executar na agenda` com rota server-side, sincronizacao idempotente e auditoria.
- [x] WhatsApp demo ganhou `Executar` supervisionado: contato seed da conta modelo pode simular envio outbound auditado sem chamar provedor externo; contato real recebe bloqueio 409 e exige envio humano.
- [x] Drive da conta modelo alinhado para conta Google dedicada de demonstracao: reset demo deixou de gravar `drive_folder_id`/links fake, mantendo o fluxo real de criar estrutura, sincronizar e executar acervo quando o Drive demo estiver conectado.
- [x] Criado painel super admin da conta modelo em `/admin/demo`, com listagem de tenants, marcar/desmarcar `demo_mode`, dry-run e reset real com confirmacao `RESET_DEMO`.
- [x] Painel `/admin/demo` passou a mostrar prontidao do Drive dedicado por tenant, incluindo disponibilidade OAuth, status conectado, email seguro da conta demo e pasta raiz configurada, sem expor refresh token, access token ou `api_key`.
- [x] Adicionado banner permanente de ambiente demo no dashboard inteiro, lido de `tenant_settings.ai_features`, com helper compartilhado `isDemoModeEnabled`.
- [x] Iniciado suporte MAYUS amplo: `GET /api/admin/support/tenants` e `/admin/support` listam tenants com dados sanitizados, usuarios ativos, resumo de integracoes, flag demo e grant sensivel ainda pendente.
- [x] Criados grants temporarios de suporte: migration `admin_support_grants`, rota de criar grant com motivo/escopo/expiracao, rota de revogar e UI em `/admin/support`.
- [x] Grants passaram a proteger endpoint real: `GET /api/admin/support/tenants/:id/sensitive-summary` exige escopo `tenant_sensitive_readonly`, retorna resumo redigido e audita `support_access_viewed`.
- [x] Usuario confirmou em 2026-05-03 que o SQL `admin_support_grants` passou com sucesso no Supabase.
- [~] Inbox de suporte MAYUS iniciada: `GET /api/admin/support/inbox` lista eventos de suporte redigidos e `/admin/support` exibe eventos recentes; falta WhatsApp oficial MAYUS.
- [x] Setup Doctor passou a calcular prontidao agentica do escritorio (`readinessScore`, `readinessLevel`) e organizar o proximo melhor passo como `recommendedAction`, visivel em Configuracoes e no artifact do MAYUS.
- [x] Modo Beta MAYUS criado: `POST /api/setup/beta` inicia uma missao supervisionada, gera artifact `tenant_beta_workplan`, learning event e fila operacional para o MAYUS trabalhar sem side effects externos automaticos.
- [x] Fila do Modo Beta agora vira execucao acompanhavel: cada item gera `brain_steps`, com operacoes seguras em `queued` e checkpoints humanos em `awaiting_approval` + `brain_approvals`.
- [x] Criado executor do proximo item seguro da fila beta: `POST /api/setup/beta/execute-next` muda `queued -> executing -> completed`, cria artifact `tenant_beta_step_result`, learning event e atualiza o painel de Configuracoes.
- [x] Conectado primeiro handler real da fila beta: `core:daily_playbook` agora gera Playbook Diario a partir de CRM/agenda/configuracoes e salva artifact `daily_playbook` na missao beta, sem envio externo.
- [x] Conectado handler Growth da fila beta: `growth:crm_next_steps` agora usa `buildMarketingOpsAssistantPlan`, identifica leads sem proximo passo e salva artifact `marketing_ops_assistant_plan`, sem WhatsApp/publicacao/campanhas.
- [x] Conectado handler Lex da fila beta: `lex:support_case_status` monta snapshot seguro do processo mais recente, usa `buildSupportCaseStatusContract`/`buildSupportCaseStatusReply` e salva artifact `support_case_status`.
- [x] Missao beta agora acompanha o estado real da fila: depois de cada `execute-next`, `brain_tasks`/`brain_runs` ficam `executing`, `awaiting_approval` ou `completed`.
- [x] Criada execucao continua da fila segura beta: `POST /api/setup/beta/execute-safe-queue` executa itens seguros em sequencia e para em aprovacao humana/conclusao/limite.
- [x] Configuracoes passou a exibir historico compacto da ultima execucao beta: status final, quantidade de itens e resumos dos steps executados.
- [x] Cockpit MAYUS passou a exibir historico compacto da execucao beta dentro do card da missao, com contadores de concluidos/fila/executando/aprovacao e eventos recentes.
- [~] Painel operacional de missoes iniciado no cockpit MAYUS: a conversa agora mostra resumo das missoes acompanhadas, ativas, aprovacoes pendentes e steps concluidos; falta painel global por tenant.
- [~] Painel operacional de missoes expandido no cockpit MAYUS: a UI agora tambem consulta a inbox global do brain para mostrar missoes recentes do tenant, aprovacoes pendentes globais, eventos recentes, carregamento parcial, refresh periodico e stream SSE com fallback.
- [~] Stream operacional do brain iniciado: `GET /api/brain/stream` publica eventos SSE autenticados para perfis executivos com `latest_task_id` e `latest_step_*`; o cockpit MAYUS usa `EventSource` como gatilho de refresh da inbox e da missao alterada, mantendo polling de 15s como fallback e indicador ao vivo/reconectando com ultimo step/status.
- [x] Painel de missoes do cockpit ganhou supervisao rapida: botao `Atualizar` e atalho para `/dashboard/aprovacoes` quando existem aprovacoes pendentes.
- [x] Painel de missoes do cockpit ganhou bloco `Proximas decisoes`, destacando aprovacoes pendentes, missoes aguardando input/aprovacao e falhas que precisam de revisao humana.
- [x] Painel de missoes do cockpit ganhou cancelamento supervisionado de missao ativa, com motivo obrigatorio e refresh da missao/inbox apos `POST /api/brain/tasks/:id/cancel`.
- [x] Painel de missoes do cockpit ganhou retry supervisionado para step falho/cancelado, com motivo obrigatorio e refresh da missao/inbox apos `POST /api/brain/tasks/:id/retry`.
- [x] Checklist principal, checklist Core e progresso atualizados com evidencia.

### Pendencias
- [x] Criar UI/painel super admin para dry-run/reset da conta demo.
- [ ] Implementar contrato/tipos e flags para `demo_mode`, `mayus_support_admin` e contas WhatsApp por dono operacional.
- [ ] Criar onboarding conversacional para areas, equipe, tom, permissoes e rotina, usando o score do Setup Doctor como entrada.
- [x] Transformar itens da fila `tenant_beta_workplan` em execucoes acompanhadas por status de missao.
- [x] Criar executor do proximo item seguro da fila beta, com transicao `queued -> executing -> completed`.
- [~] Conectar execucoes reais por tipo de step beta, com handlers especificos para Playbook Diario, CRM e status de caso.
  - [x] `core:daily_playbook`
  - [x] `growth:crm_next_steps`
  - [x] `lex:support_case_status`
- [~] Criar stream/status incremental de missao.
- [x] Criar acao de executar todos os itens seguros restantes da fila beta, parando em aprovacoes pendentes.
- [x] Expor historico compacto da execucao segura no painel Configuracoes.
- [x] Expor historico compacto da execucao segura tambem no painel MAYUS.
- [~] Criar painel operacional de missoes.
  - [x] Missões da conversa.
  - [x] Missões recentes do tenant via inbox global.
  - [x] Feed incremental por eventos recentes do brain.
  - [~] Stream em tempo real via SSE.
  - [x] Refresh granular por missão alterada.
  - [x] Stream granular por step/status.
  - [ ] Substituir polling interno do SSE por push nativo do banco quando a infra permitir.
- [ ] Conectar uma conta Google Drive exclusiva da demo e validar `Criar Estrutura` -> `Executar Acervo` -> `Sincronizar IA` com arquivos ficticios reais.

### Validacoes
- Primeira tentativa de Vitest focado falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/app/api/brain/tasks/[id]/cancel/route.test.ts` passou: 1 arquivo, 4 testes.
- Primeira tentativa de Vitest focado de retry falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/app/api/brain/tasks/[id]/retry/route.test.ts` passou: 1 arquivo, 4 testes.
- Primeira tentativa do pacote Mission Control falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/app/api/brain/tasks/[id]/cancel/route.test.ts src/app/api/brain/tasks/[id]/retry/route.test.ts` passou: 2 arquivos, 8 testes.
- `npx.cmd tsc --noEmit --pretty false` passou.
- `git diff --check` passou nos docs do plano Demo/Super Admin/WhatsApp.
- Primeira tentativa dos testes do demo reset falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/lib/demo/demo-tenant-reset.test.ts src/app/api/admin/demo/reset/route.test.ts` passou: 2 arquivos, 8 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos o demo reset.
- Primeira tentativa dos testes do `Executar` de prazos falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/app/api/prazos/executar-agenda/route.test.ts src/lib/demo/demo-tenant-reset.test.ts src/app/api/escavador/buscar-completo/route.test.ts src/app/api/agent/processos/organizar/route.test.ts` passou: 4 arquivos, 16 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos o padrao `Executar`.
- Primeira tentativa dos testes focados do WhatsApp `Executar` falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/app/api/whatsapp/execute-reply/route.test.ts src/app/api/whatsapp/send/route.test.ts src/app/api/prazos/executar-agenda/route.test.ts` passou: 3 arquivos, 9 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos o `Executar` do WhatsApp demo.
- `npx.cmd tsc --noEmit --pretty false` passou apos alinhar Drive demo ao fluxo real.
- Primeira tentativa dos testes focados de Documentos/Drive demo falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/app/api/documentos/processos/[taskId]/organize/route.test.ts src/lib/demo/demo-tenant-reset.test.ts src/app/api/whatsapp/execute-reply/route.test.ts` passou: 3 arquivos, 10 testes.
- Primeira tentativa dos testes focados do painel demo falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/app/api/admin/demo/status/route.test.ts src/app/api/admin/demo/reset/route.test.ts src/lib/demo/demo-tenant-reset.test.ts` passou: 3 arquivos, 12 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos o painel `/admin/demo`.
- Primeira tentativa dos testes focados da prontidao Drive no painel demo falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/app/api/admin/demo/status/route.test.ts src/app/api/admin/demo/reset/route.test.ts src/lib/demo/demo-tenant-reset.test.ts` passou novamente: 3 arquivos, 12 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos incluir prontidao Drive no `/admin/demo`.
- `git diff --check` passou nos arquivos da fatia `/admin/demo`, docs e status Drive, restando apenas warnings LF/CRLF do Windows.
- Primeira tentativa dos testes focados do banner demo/helper falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/lib/demo/demo-mode.test.ts src/app/api/admin/demo/status/route.test.ts src/lib/demo/demo-tenant-reset.test.ts src/app/api/escavador/buscar-completo/route.test.ts` passou: 4 arquivos, 18 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos o banner demo.
- Primeira tentativa dos testes focados de suporte MAYUS falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/app/api/admin/support/tenants/route.test.ts src/lib/demo/demo-mode.test.ts src/app/api/admin/demo/status/route.test.ts` passou: 3 arquivos, 7 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos `/admin/support`.
- Primeira tentativa dos testes focados de grants de suporte falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/app/api/admin/support/tenants/route.test.ts src/app/api/admin/support/grants/route.test.ts src/app/api/admin/support/grants/[id]/revoke/route.test.ts` passou: 3 arquivos, 6 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos grants temporarios.
- Primeira tentativa dos testes focados de resumo protegido por grant falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/lib/admin/support-grants.test.ts src/app/api/admin/support/tenants/route.test.ts src/app/api/admin/support/tenants/[id]/sensitive-summary/route.test.ts src/app/api/admin/support/grants/route.test.ts src/app/api/admin/support/grants/[id]/revoke/route.test.ts` passou: 5 arquivos, 11 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos resumo protegido por grant.
- Primeira tentativa dos testes focados da inbox de suporte falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/app/api/admin/support/inbox/route.test.ts src/lib/admin/support-grants.test.ts src/app/api/admin/support/tenants/route.test.ts src/app/api/admin/support/tenants/[id]/sensitive-summary/route.test.ts src/app/api/admin/support/grants/route.test.ts src/app/api/admin/support/grants/[id]/revoke/route.test.ts` passou: 6 arquivos, 13 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos inbox de suporte.
- Primeira tentativa dos testes focados do Modo Beta falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/lib/setup/tenant-doctor.test.ts` passou: 1 arquivo, 10 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos o Modo Beta.
- `npm.cmd test -- --run src/lib/setup/tenant-doctor.test.ts` passou novamente apos handler `core:daily_playbook`: 1 arquivo, 10 testes.
- `npm.cmd test -- --run src/lib/setup/tenant-doctor.test.ts` passou apos handler `growth:crm_next_steps`: 1 arquivo, 11 testes.
- `npm.cmd test -- --run src/lib/setup/tenant-doctor.test.ts` passou apos handler `lex:support_case_status`: 1 arquivo, 12 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos handler `lex:support_case_status`.
- `npm.cmd test -- --run src/lib/setup/tenant-doctor.test.ts` passou apos status final da missao beta: 1 arquivo, 12 testes.
- `npm.cmd test -- --run src/lib/setup/tenant-doctor.test.ts` passou apos execucao continua da fila segura: 1 arquivo, 13 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos historico compacto da execucao beta em Configuracoes.
- `npx.cmd tsc --noEmit --pretty false` passou apos expandir o painel de missoes do cockpit para a inbox global do brain.
- Primeira tentativa do teste focado do stream do brain falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/app/api/brain/stream/route.test.ts` passou: 1 arquivo, 2 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos refresh granular por missao alterada via SSE.
- `npm.cmd test -- --run src/app/api/brain/stream/route.test.ts` passou novamente apos refresh granular: 1 arquivo, 2 testes.
- `npm.cmd test -- --run src/app/api/brain/stream/route.test.ts` passou apos granularidade por step/status: 1 arquivo, 3 testes.
- `npx.cmd tsc --noEmit --pretty false` e o teste focado do stream passaram apos cancelamento limpo do SSE quando o browser fecha a conexao.
- `npx.cmd tsc --noEmit --pretty false` e o teste focado do stream passaram apos a supervisao rapida do painel de missoes.
- `npx.cmd tsc --noEmit --pretty false` e o teste focado do stream passaram apos o bloco `Proximas decisoes` do cockpit.
- `npm.cmd test -- --run src/app/api/brain/stream/route.test.ts src/app/api/brain/tasks/[id]/cancel/route.test.ts` passou apos cancelamento supervisionado no cockpit: 2 arquivos, 7 testes.
- `npm.cmd test -- --run src/app/api/brain/stream/route.test.ts src/app/api/brain/tasks/[id]/cancel/route.test.ts src/app/api/brain/tasks/[id]/retry/route.test.ts` passou apos retry supervisionado no cockpit: 3 arquivos, 11 testes.

---

## Sessao 8 - 27/04/2026

### Briefing
Retomar `support_case_status` sem depender de novas credenciais externas, fechando resposta de status mais operacional e auditavel.

### Feitos
- [x] Ampliar contrato `support_case_status` com andamento, base confirmada, inferencias e sinais faltantes.
- [x] Ajustar resposta do chat para explicitar andamento, fase, proximo passo, pendencias, fontes reais e inferencias.
- [x] Publicar os novos campos em artifact metadata, learning event e outputPayload.
- [x] Exibir highlights adicionais no dashboard MAYUS para inferencias e sinais faltantes.
- [x] Atualizar E2E observavel do MAYUS para resposta normal e handoff ambiguo.
- [x] Estabilizar o bootstrap do E2E MAYUS com `browserProfileMode: "ui-harness"` explicito, preservando o modo real para Documentos.

### Pendencias
- [ ] Validar fluxo completo de chat real de `support_case_status` em tenant descartavel/staging, aceitando escritas controladas em auditoria/artifacts/events.
- [x] Resolver instabilidade do bootstrap autenticado Playwright no harness MAYUS sem mascarar os E2Es reais de Documentos.

### Validacoes
- Primeira tentativa de Vitest focado falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/lib/lex/case-context.test.ts src/lib/agent/capabilities/dispatcher.test.ts src/lib/agent/kernel/router.test.ts` passou: 3 arquivos, 29 testes.
- `npm.cmd test` passou: 24 arquivos, 143 testes.
- `npm.cmd run build` passou com warnings preexistentes de hooks/img.
- `npx.cmd tsc --noEmit --pretty false` passou.
- Primeira tentativa de Playwright filtrado falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npx.cmd playwright test e2e/mayus-authenticated.spec.ts -g "status do caso"` passou: 2 testes Chromium.
- Validacao read-only contra Supabase real passou sem escrita: contrato `support_case_status` montado para processo real com `responseMode=answer`, `confidence=high`, andamento/fase presentes e grounding no reply.
- Rodadas posteriores de `npm.cmd run test:e2e` e E2E filtrado travaram no bootstrap autenticado da UI antes do chat, com a tela em `Acessando Cofre de Chaves...`; classificado como bloqueio de ambiente/browser, nao regressao do contrato.
- Apos separar o profile browser em modo `ui-harness`, `npx.cmd playwright test e2e/mayus-authenticated.spec.ts -g "status do caso" --reporter=list` passou: 2 testes.
- Smokes de seguranca do helper passaram: `npx.cmd playwright test e2e/documentos-auth.spec.ts --reporter=list` passou com 3 testes anonimos; `npx.cmd playwright test e2e/documentos-authenticated.spec.ts --grep "abre a area|abre o detalhe" --reporter=list` passou com 2 testes autenticados reais; `npx.cmd playwright test e2e/mayus-authenticated.spec.ts --grep "resolve o contexto juridico|responde status do caso" --reporter=list` passou com 2 testes.
- O bootstrap Playwright deixou de depender de Google Fonts remoto via `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` e fixture local; `npx.cmd playwright test e2e/documentos-authenticated.spec.ts --reporter=list` passou completo: 9 testes Chromium em 3,3 min.
- `git diff --check` ainda acusa `src/app/page.tsx:1184: new blank line at EOF`, arquivo fora do escopo desta frente e ja modificado previamente.
- A frente `Referral Intake` foi iniciada: `lead-intake` diferencia indicacao de suporte/status, coleta indicador/relacionamento, registra tags/origem no payload CRM, cria evento auditavel `referral_intake_created` e recomenda confirmacao por SDR/closer.
- `npm.cmd test -- --run src/lib/growth/lead-intake.test.ts` passou: 1 arquivo, 8 testes.
- O primeiro nucleo do Auto Setup Doctor foi criado: `GET /api/setup/doctor` diagnostica sem corrigir; `POST /api/setup/doctor` aplica autocorrecoes seguras para CRM e skills, detecta integracoes pendentes, bloqueia Google Drive com OAuth invalido e registra evento operacional `tenant_doctor_check`/`tenant_doctor_autofix`.
- A UI do Auto Setup Doctor foi exposta em `/dashboard/configuracoes`, com contadores de OK/corrigidos/avisos/bloqueios, lista de checks e botoes para atualizar diagnostico ou aplicar defaults seguros.
- O Auto Setup Doctor virou trilha agentica: `POST /api/setup/doctor` registra `brain_tasks`, `brain_runs`, `brain_steps`, artifact `tenant_setup_doctor_report` e learning event `tenant_setup_doctor_report_created` quando ha correcao ou bloqueio relevante.
- O payload do artifact foi sanitizado para expor somente status, resumo, checks, acoes humanas e contadores; nao inclui chaves, tokens ou campos de segredo.
- A tela de Configuracoes mostra link para o MAYUS quando a trilha agentica foi registrada, e o dashboard MAYUS reconhece label/highlights do Setup Doctor.
- `referral_intake` tambem virou trilha agentica: indicacoes registradas por `POST /api/growth/lead-intake` criam mission/run/step, artifact `referral_intake` e learning event `referral_intake_artifact_created`.
- O artifact de indicacao evita telefone/e-mail bruto e expõe apenas score, origem, canal, area, indicador, relacionamento, proximo passo e handoff humano.
- O dashboard MAYUS reconhece label/highlights de `referral_intake` com score, area, indicador e handoff humano.
- `lead_intake` virou skill formal de chat: seed em `agent_skills`, prompt do MAYUS, router deterministico e dispatcher `growth_lead_intake`.
- A execucao por chat cria card CRM, system event, artifact `lead_intake` ou `referral_intake` dentro da missao e learning event; nao aciona WhatsApp, pagamento, assinatura ou outra integracao externa.
- O dashboard MAYUS reconhece tambem artifact/event `lead_intake` com score, area, tipo e handoff humano.
- `lead_qualify` iniciou o `growth_frontdoor`: skill formal com playbooks de Previdenciario, Trabalhista, Familia e fallback geral, gerando artifact `lead_qualification_plan` com roteiro, documentos minimos, objecoes provaveis, alertas e proximo melhor movimento.
- O dashboard MAYUS reconhece artifact/event de qualificacao com confianca, area, quantidade de documentos e alertas.
- `lead_followup` avancou o `growth_frontdoor`: skill formal com cadencia supervisionada, mensagem inicial sugerida, checklist humano, condicoes de pausa e proximo melhor movimento, gerando artifact `lead_followup_plan` e learning event.
- O dispatcher de `lead_followup` nao envia WhatsApp, telefone ou e-mail automaticamente; ele deixa o contato como acao humana/aprovacao obrigatoria.
- O dashboard MAYUS reconhece artifact/event de follow-up com prioridade, area, quantidade de passos e aprovacao humana.
- `lead_schedule` adicionou agendamento supervisionado ao `growth_frontdoor`: skill formal cria tarefa em `user_tasks`, artifact `lead_schedule_plan`, checklist de preparo, mensagem de confirmacao sugerida e learning event.
- O dispatcher de `lead_schedule` nao cria Google Calendar, OAuth, convite externo ou envio automatico; ele registra agenda interna e exige confirmacao humana do horario com o lead.
- O dashboard MAYUS reconhece artifact/event de agendamento com data, urgencia, tarefa de agenda e confirmacao humana.
- `revenue_flow_plan` criou o plano supervisionado proposta -> contrato -> cobranca -> abertura de caso: skill formal com artifact `revenue_flow_plan`, learning event, etapas, bloqueios e proxima acao humana.
- O dispatcher de `revenue_flow_plan` nao chama ZapSign, Asaas nem `openCaseFromConfirmedBilling`; ele apenas organiza o fluxo e deixa os passos externos sob aprovacao/execucao explicita.
- `external_action_preview` adicionou pre-flight supervisionado antes de acoes externas: skill formal com artifact `external_action_preview`, checklist, bloqueios, risco e side effects externos bloqueados.
- O dispatcher de `external_action_preview` nao chama ZapSign, Asaas, WhatsApp ou qualquer integracao externa; ele tambem evita persistir e-mail do destinatario no metadata do artifact.
- `client_acceptance_record` adicionou trilha auditavel de aceite do cliente: skill formal com artifact `client_acceptance_record`, learning event e evento operacional `client_acceptance_recorded` em `system_event_logs`.
- O dispatcher de `client_acceptance_record` nao executa contrato, cobranca, WhatsApp ou abertura de caso; ele registra o aceite e mantem side effects externos bloqueados ate revisao humana/evidencia.
- `lead_reactivation` adicionou reativacao supervisionada de leads frios por segmento: skill formal com artifact `lead_reactivation_plan`, lista operacional de candidatos do CRM, criterios, mensagens sugeridas, checklist humano e learning event.
- `sales_consultation` adicionou skill DEF de atendimento consultivo comercial: artifact `sales_consultation_plan`, descoberta antes da proposta, sinais capturados/faltantes no bate-papo, proxima pergunta adaptativa, cliente ideal do escritorio, solucao central, PUV sugerida quando ausente, pilares autorais, encantamento personalizado, fechamento racional, movimentos de objecao e bloqueio de contatos externos automaticos.
- `sales_profile_setup` adicionou auto-configuracao comercial por chat: o MAYUS investiga cliente ideal, solucao central, PUV, pilares e anti-cliente, monta rascunhos quando faltam, cria artifact `sales_profile_setup` e grava `tenant_settings.ai_features.sales_consultation_profile` para reduzir configuracao manual.
- WhatsApp ganhou geracao de resposta comercial pelo MAYUS: `/api/whatsapp/ai-sales-reply` le historico do contato, aplica o perfil comercial salvo e devolve resposta DEF para o composer da tela `/dashboard/conversas/whatsapp`; o sistema registra `whatsapp_sales_reply_prepared` e nao envia automaticamente.
- Meta Cloud e Evolution agora tambem preparam rascunho comercial automaticamente no recebimento inbound via `prepareWhatsAppSalesReplyForContact`, com notificacao interna e auditoria, mas sem disparo externo automatico.
- A tela de WhatsApp mostra o painel "Rascunho MAYUS", carregando o ultimo evento `whatsapp_sales_reply_prepared` do contato e permitindo usar/atualizar a resposta no composer.
- Auto Setup Doctor passou a diagnosticar `commercial:sales_profile` e avisar em Configuracoes quando o MAYUS ainda precisa investigar cliente ideal, solucao, PUV e pilares antes de escalar atendimento comercial.
- Configuracoes ganhou painel "Perfil Comercial do MAYUS" para preencher/validar cliente ideal, solucao, PUV e pilares; o painel salva em `tenant_settings.ai_features.sales_consultation_profile`, fonte lida pela skill `sales_consultation`.
- O dispatcher de `lead_reactivation` nao envia WhatsApp, telefone, e-mail ou campanha externa; ele deixa a execucao como lote manual aprovado e registra side effects externos bloqueados.
- `npm.cmd test -- --run src/lib/setup/tenant-doctor.test.ts src/lib/growth/lead-intake.test.ts` passou: 2 arquivos, 11 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos o doctor.
- `git diff --check` passou apos remover apenas a linha extra no EOF de `src/app/page.tsx`.
- `npx.cmd tsc --noEmit --pretty false` passou apos expor a UI do doctor.
- `npm.cmd test -- --run src/lib/setup/tenant-doctor.test.ts src/lib/growth/lead-intake.test.ts` passou novamente: 2 arquivos, 11 testes.
- Primeira tentativa dos testes focados do artifact falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/lib/setup/tenant-doctor.test.ts src/lib/growth/lead-intake.test.ts` passou apos o artifact: 2 arquivos, 13 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos o artifact.
- `git diff --check` passou apos o artifact; restaram apenas warnings de conversao LF/CRLF em arquivos ja modificados.
- Primeira tentativa dos testes focados de `referral_intake` agentico falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/lib/growth/lead-intake.test.ts src/lib/setup/tenant-doctor.test.ts` passou apos `referral_intake`: 2 arquivos, 15 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos `referral_intake`.
- `git diff --check` passou apos `referral_intake`; restaram apenas warnings LF/CRLF.
- Primeira tentativa dos testes focados da skill formal `lead_intake` falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/lib/agent/kernel/router.test.ts src/lib/agent/capabilities/dispatcher.test.ts src/lib/growth/lead-intake.test.ts` passou: 3 arquivos, 35 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos `lead_intake`.
- `git diff --check` passou apos `lead_intake`; restaram apenas warnings LF/CRLF.
- Primeira tentativa dos testes focados de `lead_qualify` falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/lib/growth/lead-qualification.test.ts src/lib/agent/kernel/router.test.ts src/lib/agent/capabilities/dispatcher.test.ts src/lib/growth/lead-intake.test.ts` passou: 4 arquivos, 40 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos `lead_qualify`.
- `git diff --check` passou apos `lead_qualify`; restaram apenas warnings LF/CRLF.
- Primeira tentativa dos testes focados de `lead_followup` falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/lib/growth/lead-followup.test.ts src/lib/growth/lead-qualification.test.ts src/lib/agent/kernel/router.test.ts src/lib/agent/capabilities/dispatcher.test.ts src/lib/growth/lead-intake.test.ts` passou: 5 arquivos, 45 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos `lead_followup`.
- Primeira tentativa dos testes focados de `lead_schedule` falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/lib/growth/lead-scheduling.test.ts src/lib/growth/lead-followup.test.ts src/lib/growth/lead-qualification.test.ts src/lib/agent/kernel/router.test.ts src/lib/agent/capabilities/dispatcher.test.ts src/lib/growth/lead-intake.test.ts` passou: 6 arquivos, 50 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos `lead_schedule`.
- Primeira tentativa dos testes focados de `revenue_flow_plan` falhou no sandbox com `spawn EPERM`; rerun fora do sandbox apontou ajustes locais de router/mock, depois passou.
- `npm.cmd test -- --run src/lib/growth/revenue-flow.test.ts src/lib/growth/lead-scheduling.test.ts src/lib/growth/lead-followup.test.ts src/lib/growth/lead-qualification.test.ts src/lib/agent/kernel/router.test.ts src/lib/agent/capabilities/dispatcher.test.ts src/lib/growth/lead-intake.test.ts` passou: 7 arquivos, 55 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos `revenue_flow_plan`.
- Primeira tentativa dos testes focados de `external_action_preview` falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/lib/growth/external-action-preview.test.ts src/lib/growth/revenue-flow.test.ts src/lib/growth/lead-scheduling.test.ts src/lib/growth/lead-followup.test.ts src/lib/growth/lead-qualification.test.ts src/lib/agent/kernel/router.test.ts src/lib/agent/capabilities/dispatcher.test.ts src/lib/growth/lead-intake.test.ts` passou: 8 arquivos, 60 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos `external_action_preview`.
- Primeira tentativa dos testes focados de `client_acceptance_record` falhou no sandbox com `spawn EPERM`; rerun fora do sandbox passou.
- `npm.cmd test -- --run src/lib/growth/client-acceptance.test.ts src/lib/growth/external-action-preview.test.ts src/lib/growth/revenue-flow.test.ts src/lib/growth/lead-scheduling.test.ts src/lib/growth/lead-followup.test.ts src/lib/growth/lead-qualification.test.ts src/lib/agent/kernel/router.test.ts src/lib/agent/capabilities/dispatcher.test.ts src/lib/growth/lead-intake.test.ts` passou: 9 arquivos, 65 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos `client_acceptance_record`.
- Primeira tentativa dos testes focados de `lead_reactivation` falhou no sandbox com `spawn EPERM`; rerun fora do sandbox apontou apenas ajuste de matcher para canal `phone`, depois passou.
- `npm.cmd test -- --run src/lib/growth/cold-lead-reactivation.test.ts src/lib/agent/kernel/router.test.ts src/lib/agent/capabilities/dispatcher.test.ts` passou: 3 arquivos, 41 testes.
- `npm.cmd test -- --run src/lib/growth/cold-lead-reactivation.test.ts src/lib/growth/client-acceptance.test.ts src/lib/growth/external-action-preview.test.ts src/lib/growth/revenue-flow.test.ts src/lib/growth/lead-scheduling.test.ts src/lib/growth/lead-followup.test.ts src/lib/growth/lead-qualification.test.ts src/lib/agent/kernel/router.test.ts src/lib/agent/capabilities/dispatcher.test.ts src/lib/growth/lead-intake.test.ts` passou: 10 arquivos, 69 testes.
- `npx.cmd tsc --noEmit --pretty false` passou apos `lead_reactivation`.
- `git diff --check` passou apos `lead_reactivation`; restaram apenas warnings LF/CRLF.

### Observacoes
- O trabalho ficou isolado em `support_case_status`, dashboard MAYUS e tracking; nao tocou integrações/Vault/OAuth.
- O fluxo read-only real valida snapshot/contrato/reply sem side effects; o fluxo real de chat ainda grava auditoria, artifacts e learning events, entao deve ser executado em staging ou com caso descartavel.
- `browserProfileMode: "ui-harness"` deve ficar restrito a specs de orquestracao que ja mockam APIs internas do MAYUS; Documentos continua exercitando auth/profile reais.
- O mock de Google Fonts fica restrito ao webServer do Playwright e preserva o runtime normal de dev/build.
- `Referral Intake` agora tem artifact agentico proprio no MAYUS; `lead_intake`, `lead_qualify`, `lead_followup`, `lead_reactivation`, `lead_schedule`, `revenue_flow_plan`, `external_action_preview` e `client_acceptance_record` ja operam como skills formais de chat. Proximo bloco natural e registrar taxa de resposta/motivo de perda do Growth.
- Auto Setup Doctor agora aparece em Configuracoes e tambem como artifact agentico proprio no MAYUS; build nao foi rodado nesta etapa porque a validacao pedida foi coberta por testes focados, typecheck e diff-check, e o worktree segue amplo com assets/landing fora do escopo.

---

## Sessao 7 - 26/04/2026

### Briefing
Continuar o smoke automatizado de integracoes sem depender de OAuth/credenciais reais, preservando assets da pagina de vendas e frames em uso por outro agente.

### Feitos
- [x] Criar `src/lib/llm-router.test.ts` cobrindo prioridade Vault/OpenRouter, aliases Gemini/Grok, providers desconectados, fallback env e headers.
- [x] Criar `src/app/api/ai/tts/route.test.ts` cobrindo auth, tenant ausente, OpenAI via Vault, ElevenLabs via tenant/env e provider invalido.
- [x] Criar `src/app/api/integrations/zapsign/send/route.test.ts` cobrindo chave Vault, envio com/sem contato, timeline WhatsApp e erro do servico.
- [x] Criar `src/lib/asaas.test.ts` cobrindo chave Vault, criacao de cobranca e erro amigavel da API.
- [x] Criar `src/app/api/webhooks/asaas/route.test.ts` cobrindo token invalido, eventos ignorados, revenue-to-case, tenant ausente e GET 405.
- [x] Criar `src/app/api/escavador/buscar-completo/route.test.ts` cobrindo auth, OAB invalida, trava de busca paga, chave Vault, cache hit, chamada externa e fallback.
- [x] Executar micro-limpeza segura: remover `dev_log_fixed.txt`, `dev_log_fresh.txt`, `dev_log_undo.txt`, `.codex-test/config.toml` e ignorar `dev_log_*.txt`/`.codex-test/`.
- [x] Ajustar E2E autenticado de Documentos para aguardar explicitamente o historico formal de minutas antes de interagir com versoes.
- [x] Rodar E2E completo do checklist.
- [x] Rodar smoke autenticado real de `GET /api/integrations` e confirmar providers safe sem expor segredos.
- [x] Rodar smoke autenticado real de `POST /api/integrations` com provider controlado `playwright_smoke` e remover o artefato em seguida.
- [x] Rodar smoke real de OpenRouter/LLM Router carregando chave por tenant via Vault sem expor segredo.
- [x] Rodar smoke real de TTS OpenAI autenticado e confirmar resposta `audio/mpeg`.
- [~] Rodar smoke reversivel de Google Drive root: estado conectado e clear passaram; restore via API falhou por OAuth client local invalido; root foi restaurado via service role.
- [x] Confirmar diagnostico Google OAuth por refresh direto: `401 invalid_client` / `The OAuth client was not found`.
- [x] Rodar smoke seguro de webhook Asaas com payload sintetico `PAYMENT_OVERDUE` e confirmar auditoria em `system_event_logs`.
- [x] Confirmar que o `GOOGLE_DRIVE_CLIENT_ID` local esta presente, mas malformado, e adicionar validacao de formato em `isGoogleDriveConfigured()`.

### Pendencias
- [ ] Validar Google Drive completo com OAuth real em `/dashboard/configuracoes/integracoes`.
- [ ] Substituir OAuth client local malformado do Google Drive por credenciais validas e repetir salvar/restaurar root + process-folder real.
- [ ] Rodar smoke funcional real de Asaas, ZapSign e Escavador com payloads aprovados.
- [ ] Organizar worktree amplo em commits/branches por escopo antes de deploy/merge.

### Validacoes
- `npx.cmd vitest run src/lib/llm-router.test.ts src/app/api/ai/tts/route.test.ts` passou: 2 arquivos, 15 testes.
- `npx.cmd vitest run src/app/api/integrations/zapsign/send/route.test.ts` passou: 1 arquivo, 4 testes.
- `npx.cmd vitest run src/lib/asaas.test.ts src/app/api/webhooks/asaas/route.test.ts` passou: 2 arquivos, 9 testes.
- `npx.cmd vitest run src/app/api/escavador/buscar-completo/route.test.ts` passou: 1 arquivo, 7 testes.
- `npx.cmd vitest run src/lib/llm-router.test.ts src/app/api/ai/tts/route.test.ts src/app/api/integrations/zapsign/send/route.test.ts src/lib/asaas.test.ts src/app/api/webhooks/asaas/route.test.ts src/app/api/escavador/buscar-completo/route.test.ts` passou: 6 arquivos, 35 testes.
- `npx.cmd tsc --noEmit --pretty false` passou.
- `npm.cmd test` passou: 24 arquivos, 140 testes.
- `npm.cmd run build` passou com warnings preexistentes de hooks/img.
- Primeira tentativa de `npm.cmd run test:e2e` estourou timeout com `missing required error components` e loaders de Documentos devido a dev server/cache stale.
- Apos parar o processo na porta 3000 e limpar `.next`, `npx.cmd playwright test e2e/documentos-authenticated.spec.ts -g "exibe filtros" --reporter=list` passou.
- Apos wait explicito de minutas, `npx.cmd playwright test e2e/documentos-authenticated.spec.ts --reporter=list` passou: 9 testes.
- `npm.cmd run test:e2e` passou: 22 testes Playwright em 9,7 min.
- Smoke `GET /api/integrations?providers=...` autenticado passou: 7 providers retornados com flags safe (`asaas`, `elevenlabs`, `escavador`, `google_drive`, `openai`, `openrouter`, `zapsign`).
- Smoke `POST /api/integrations` autenticado passou com provider `playwright_smoke`, sem segredos, status `disconnected`; artefato removido depois via service role.
- Smoke OpenRouter/LLM Router passou: provider `openrouter`, modelo resolvido por tenant, endpoint OpenRouter e headers safe montados.
- Smoke TTS OpenAI passou: `200`, `audio/mpeg`, 12960 bytes.
- Smoke Google Drive root: `GET /api/integrations/google-drive` retornou conectado com root; `PATCH` clear root passou; `PATCH` restore root falhou com `The OAuth client was not found`; metadados de root restaurados via service role e reconferidos por GET.
- Diagnostico Google OAuth direto confirmou refresh token falhando com `401 invalid_client` e `The OAuth client was not found`; variaveis locais existem, mas o client configurado nao e aceito pelo Google.
- Smoke Asaas webhook seguro passou: rota respondeu `200 { ok: true }` e o evento `asaas_webhook_no_tenant` foi auditado em `system_event_logs` para `playwright-smoke-customer`.
- Validacao de formato confirmou `GOOGLE_DRIVE_CLIENT_ID` com 35 caracteres, sufixo `.apps.googleusercontent.com`, mas sem o prefixo numerico/hash esperado; apos o ajuste, `isGoogleDriveConfigured()` retorna `false` neste ambiente ate as credenciais serem trocadas.
- Validacoes apos ajuste Google Drive passaram: `npx.cmd vitest run src/app/api/integrations/google-drive/route.test.ts src/app/api/integrations/google-drive/process-folder/route.test.ts` passou com 2 arquivos/20 testes; `npx.cmd tsc --noEmit --pretty false` passou.

### Observacoes
- Nenhum asset visual, frame, video, `scratch/iron-man-ref`, pagina de vendas ou componente landing foi removido.
- A cobertura adicionada valida integracoes por mocks e Vault, mas nao substitui smoke funcional com credenciais reais.
- Para rodar E2E em ambiente Windows, parar dev servers stale e limpar `.next` pode ser necessario quando aparecer `missing required error components`.
- Nao rodar `DELETE /api/integrations/google-drive` sem aprovacao explicita, pois desconecta a conta real.
- Nao rodar cobranca Asaas, envio ZapSign ou busca paga Escavador sem payload aprovado, pois podem gerar efeitos externos/custo.

---

## Sessao 6 - 26/04/2026

### Briefing
Executar o proximo passo do plano de integracoes/Vault, priorizando smoke real quando possivel e fechando cobertura automatizada onde OAuth/Google Drive real ainda exige validacao manual.

### Feitos
- [x] Mapear gaps de teste em `/api/integrations`, Google Drive e helpers Vault
- [x] Confirmar que o smoke completo do Google Drive ainda depende de sessao autenticada, OAuth Google e pasta real
- [x] Criar testes comportamentais de `/api/integrations` com listagem safe, dedupe de providers, POST via Vault e erros 401/403/400
- [x] Criar testes diretos dos helpers Vault em `src/lib/integrations/server.ts`
- [x] Validar harness estatico existente de Google Drive/Vault
- [x] Ampliar `src/app/api/integrations/google-drive/route.test.ts` com testes de GET/PATCH/DELETE
- [x] Criar `src/app/api/integrations/google-drive/process-folder/route.test.ts`

### Pendencias
- [ ] Validar Google Drive completo com OAuth real em `/dashboard/configuracoes/integracoes`
- [ ] Validar `PATCH /api/integrations/google-drive` salvando/limpando pasta raiz com conta conectada
- [ ] Validar `DELETE /api/integrations/google-drive` com conta conectada
- [ ] Validar `POST /api/integrations/google-drive/process-folder` com processo real
- [ ] Rodar smoke funcional real de Asaas, ZapSign, Escavador, TTS e OpenRouter

### Validacoes
- `npx.cmd vitest run src/app/api/integrations/route.test.ts src/app/api/integrations/google-drive/route.test.ts src/lib/integrations/server.test.ts` passou: 3 arquivos, 13 testes
- `npx.cmd tsc --noEmit --pretty false` passou
- `npm.cmd test` passou: 17 arquivos, 89 testes
- `npm.cmd run build` passou com warnings preexistentes de hooks/img apos parar `next dev` concorrente na porta 3000
- `npx.cmd vitest run src/app/api/integrations/google-drive/route.test.ts src/app/api/integrations/google-drive/process-folder/route.test.ts` passou: 2 arquivos, 20 testes
- `npx.cmd vitest run src/app/api/integrations/route.test.ts src/app/api/integrations/google-drive/route.test.ts src/app/api/integrations/google-drive/process-folder/route.test.ts src/lib/integrations/server.test.ts` passou: 4 arquivos, 29 testes
- `npm.cmd test` passou novamente apos testes Google Drive: 18 arquivos, 105 testes
- `npm.cmd run build` passou em segunda tentativa isolada; a primeira tentativa ficou presa apos lint antes de coletar paginas

### Observacoes
- O build pode falhar ou travar quando `next dev` do proprio MAYUS esta ativo, pois ambos disputam `.next`. Parar o processo dev antes do build resolveu.
- Mesmo sem `next dev`, uma tentativa de build pode ficar presa apos lint; repetir isolado resolveu nesta sessao.
- O smoke funcional completo de Google Drive continua exigindo OAuth/Drive real; a cobertura sem OAuth agora protege o caminho Vault/API safe.

---

## Sessao 5 - 25/04/2026

### Briefing
Abrir o plano atual, executar validacoes possiveis e avancar o proximo item seguro antes do smoke funcional autenticado.

### Feitos
- [x] Mapear smoke de integracoes/Vault e separar validacoes automaticas de fluxos que exigem sessao/OAuth reais
- [x] Rodar harness estatico de integracoes Google Drive/Vault
- [x] Rodar testes focados de `support_case_status`
- [x] Registrar artifact `support_case_status` no dispatcher
- [x] Registrar learning event `support_case_status_resolved`
- [x] Expor labels/highlights de status do caso no dashboard MAYUS e inbox de aprovacoes
- [x] Ampliar router de `support_case_status` para extrair CNJ, cliente e referencia textual
- [x] Bloquear resolucao textual ambigua sem escolher automaticamente o processo mais recente
- [x] Registrar handoff `ambiguous_case_match` quando `support_case_status` recebe referencia ambigua
- [x] Criar E2E observavel de `support_case_status` no MAYUS para resposta normal e handoff ambiguo
- [x] Corrigir checklist operacional do Vault para refletir migration ja aplicada

### Pendencias
- [ ] Validar Google Drive completo com sessao real e OAuth Google
- [ ] Rodar smoke final funcional de integracoes
- [ ] Validar `support_case_status` em fluxo real nao mockado quando houver ambiente autenticado estavel

### Validacoes
- `npx.cmd vitest run src/app/api/integrations/google-drive/route.test.ts` passou: 1 arquivo, 4 testes
- `npx.cmd vitest run src/lib/lex/case-context.test.ts src/lib/agent/capabilities/dispatcher.test.ts` passou: 2 arquivos, 12 testes
- `npx.cmd vitest run src/lib/agent/capabilities/dispatcher.test.ts` passou: 1 arquivo, 10 testes
- `npx.cmd vitest run src/lib/agent/kernel/router.test.ts src/lib/agent/capabilities/dispatcher.test.ts src/lib/lex/case-context.test.ts` passou: 3 arquivos, 23 testes
- `npx.cmd vitest run src/lib/lex/case-context.test.ts src/lib/agent/capabilities/dispatcher.test.ts src/lib/agent/kernel/router.test.ts` passou apos ambiguidade: 3 arquivos, 26 testes
- `npx.cmd tsc --noEmit --pretty false` passou
- `npm.cmd test` passou: 15 arquivos, 77 testes
- `npm.cmd run build` passou com warnings preexistentes de hooks/img
- Apos resolucao ambigua, `npm.cmd test` passou novamente: 15 arquivos, 80 testes
- Apos resolucao ambigua, `npm.cmd run build` passou novamente com warnings preexistentes de hooks/img
- `npx.cmd playwright test e2e/mayus-authenticated.spec.ts -g "status do caso"` passou: 2 testes Chromium autenticados mockados
- `npm.cmd test` passou novamente apos o E2E: 15 arquivos, 80 testes
- `npm.cmd run build` passou apos limpar cache `.next` corrompido por `next dev`; warnings preexistentes de hooks/img permanecem

### Proximos passos
1. Se houver sessao/OAuth disponiveis, validar Google Drive autenticado em `/dashboard/configuracoes/integracoes`.
2. Caso contrario, continuar `support_case_status` pela resolucao segura de multiplos matches e extracao de cliente/referencia.

---

## Sessao 4 - 25/04/2026

### Briefing
Reconciliar o plano operacional com o estado real do codigo e executar o proximo item seguro antes do smoke final.

### Feitos
- [x] Conferir fonte unica de execucao em `docs/brain/MAYUS_AGENTIC_EXECUTION_CHECKLIST.md`
- [x] Confirmar que Google Drive ja importa `supabaseAdmin`
- [x] Confirmar que fallbacks plaintext de Vault foram removidos da camada server-side
- [x] Confirmar que writers operacionais usam `system_event_logs`
- [x] Criar helper canonico de auditoria agentica em `src/lib/agent/audit.ts`
- [x] Migrar o executor agentico para o helper canonico
- [x] Migrar a rota de aprovacao humana para o helper canonico
- [x] Atualizar checklist agentico e tracking de progresso

### Pendencias
- [x] Aplicar migration `20260424110000_system_event_logs.sql` no banco alvo
- [ ] Validar Google Drive autenticado em `/dashboard/configuracoes/integracoes`
- [ ] Rodar smoke test final de integracoes
- [ ] Confirmar evento real `novo_processo` do Escavador sem header legado

### Validacoes
- `npx.cmd tsc --noEmit --pretty false` passou
- `npx.cmd vitest run src/lib/agent/kernel/executor.test.ts src/app/api/ai/approve/route.test.ts` passou fora do sandbox: 2 arquivos, 4 testes
- `npx.cmd vitest run src/app/api/integrations/google-drive/route.test.ts src/lib/agent/kernel/executor.test.ts src/app/api/ai/approve/route.test.ts` passou: 3 arquivos, 8 testes
- `npm.cmd test` passou: 15 arquivos, 75 testes
- `npm.cmd run build` passou; restam apenas warnings preexistentes de hooks/img
- RPCs remotas `get_tenant_integration_resolved` e `list_tenant_integrations_resolved` responderam com sucesso
- Migration `20260424110000_system_event_logs.sql` aplicada no Supabase remoto em 2026-04-25
- `public.system_event_logs` validada via Supabase API com insert/delete temporario
- Tentativa inicial do Vitest dentro do sandbox falhou com `spawn EPERM`, igual ao bloqueio ja observado em sessoes anteriores
- Ambiente segue sem Supabase CLI e sem `psql`; migration foi aplicada via conexao Postgres direta com driver temporario `pg`, removido apos o uso

### Proximos passos
1. Validar Google Drive completo com sessao real.
2. Rodar smoke final de integracoes.
3. Confirmar evento `novo_processo` do Escavador em ambiente real.
4. Retomar `support_case_status`.

---

## Sessao 3 - 24/04/2026

### Briefing
Fechamento do rollout de seguranca de `tenant_integrations` com Vault, separacao de logs nao agênticos e preparo do smoke test final de integracoes.

### Feitos
- [x] Corrigir import ausente de `supabaseAdmin` em `src/app/api/integrations/google-drive/route.ts`
- [x] Remover fallbacks plaintext de `src/lib/integrations/server.ts`
- [x] Criar `supabase/migrations/20260424110000_system_event_logs.sql`
- [x] Migrar logs nao agênticos para `system_event_logs`
- [x] Manter `agent_audit_logs` restrito ao runtime agêntico
- [x] Remover roteamento por `tenant_integrations.api_key` no webhook Escavador
- [x] Corrigir autenticacao cookie-based em `src/app/api/onboarding/oab/route.ts`
- [x] Criar `docs/operations/tenant-integrations-vault-rollout.md`
- [x] Criar `docs/operations/tenant-integrations-vault-checklist.md`

### Pendencias
- [ ] Aplicar migration `20260424110000_system_event_logs.sql` no banco alvo
- [ ] Validar Google Drive localmente em `/dashboard/configuracoes/integracoes`
- [ ] Rodar smoke test final de integracoes
- [ ] Confirmar o comportamento real do evento `novo_processo` do Escavador sem header legado
- [ ] Resolver erro de typecheck global em `src/lib/juridico/external-validation.test.ts`

### Validacoes
- `npm run lint` passou nos arquivos alterados
- Grep sem inserts nao agênticos em `agent_audit_logs`
- Grep sem lookup runtime por `tenant_integrations.api_key`
- `npx tsc --noEmit` ainda falha por erro preexistente fora do escopo desta sessao
- Supabase local/remoto ainda indisponivel para aplicar migration: Docker engine ausente, projeto remoto nao linkado e sem DB URL no `.env.local`
- `/api/integrations/google-drive` respondeu `401` sem sessao, indicando rota viva sem crash local
- Nova tentativa de execucao confirmou o mesmo bloqueio de ambiente para migration e repetiu as validacoes nao-Lex: lint focado passou, runtime sem lookup plaintext e sem inserts operacionais em `agent_audit_logs`
- `scratch` foi excluido do `tsconfig.json`; `npx tsc --noEmit` agora falha apenas no blocker Lex conhecido em `src/lib/juridico/external-validation.test.ts`

### Proximos passos
1. Aplicar a migration nova e confirmar eventos em `system_event_logs`.
2. Validar Google Drive completo com connect/save/disconnect/process-folder.
3. Rodar smoke test final de Asaas, ZapSign, TTS e Escavador.
4. Corrigir o typecheck global bloqueado em `src/lib/juridico/external-validation.test.ts`.

---

## Sessao 2 - 24/04/2026

### Briefing
Consolidar a documentacao principal e os planos secundarios do modelo agentico em uma fonte unica de execucao, com checklist marcavel por status.

### Feitos
- [x] Criar `docs/brain/MAYUS_AGENTIC_EXECUTION_CHECKLIST.md`
- [x] Consolidar blueprint, Document Brain roadmap e planos secundarios em um checklist unico
- [x] Repriorizar blockers de Vault, Google Drive, Escavador e `agent_audit_logs`
- [x] Atualizar `docs/README.md` com a fonte atual de execucao agentica
- [x] Atualizar `docs/tracking/progress.md` para apontar para o checklist consolidado

### Pendencias
- [ ] Criar `docs/operations/tenant-integrations-vault-rollout.md`
- [ ] Criar `docs/operations/tenant-integrations-vault-checklist.md`
- [ ] Corrigir import ausente em `src/app/api/integrations/google-drive/route.ts`
- [ ] Normalizar writes de `agent_audit_logs`
- [ ] Remover fallbacks plaintext de `src/lib/integrations/server.ts`
- [ ] Ajustar webhook Escavador para nao depender de `tenant_integrations.api_key`

### Proximos passos
1. Seguir `docs/brain/MAYUS_AGENTIC_EXECUTION_CHECKLIST.md`, secao `12. Proximo Passo Exato`.
2. Fechar blockers antes do smoke final.
3. Retomar `support_case_status` depois que integracoes e auditoria estiverem estaveis.

---

## Sessao 1 - 13/04/2026

### Briefing
Organizacao do projeto, criacao de documentacao robusta e inicio dos fixes criticos do Documento Mestre v4.

### Feitos
- [x] Criar `docs/operations/sessions.md`
- [x] Criar `docs/architecture/system-overview.md`
- [x] Criar `docs/tracking/bugs.md`
- [x] Criar `docs/operations/deploy.md`
- [x] Criar `docs/operations/changelog.md`
- [ ] Fix webhook `nova_movimentacao`
- [ ] Corrigir cards duplicados no Kanban juridico
- [ ] Corrigir RLS em `process_tasks` para anotacoes
- [ ] Remover prazo fantasma `d155f6e9`

### Pendencias
- [ ] Dropdown de responsavel mostrar todos `is_active = true`
- [ ] Botao "Remover Responsavel" funcionando
- [ ] Exibir cliente/autor no card de prazo
- [ ] Padronizar botao copiar CNJ nas telas de processo
- [ ] Upload de foto de perfil com bucket `avatars`
- [ ] Deduplicacao automatica no analisador

### Metricas de Referencia
- Processos monitorados: 21/21 com ID Escavador
- Skills ativas: 7
- Tenant principal: Dutra

### Proximos passos (Sessao 2)
1. Fixes rapidos de `src/app/dashboard/operacoes/prazos/page.tsx`.
2. Ajustar upload de avatar em `src/app/dashboard/configuracoes/usuarios/page.tsx`.
3. Implementar deduplicacao no analisador de movimentacoes.
4. Ligar bloco de prazos criticos das agendas com dados reais.
