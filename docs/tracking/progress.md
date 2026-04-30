# Progresso MAYUS

Este arquivo agora funciona como indice de progresso.

A fonte unica de execucao do rollout agentico esta em:

- `docs/brain/MAYUS_AGENTIC_EXECUTION_CHECKLIST.md`

Use esse checklist para marcar:

- o que ja foi concluido
- o que esta parcial
- o que falta
- blockers antes do smoke final
- validacoes executadas

## Estado Atual

- [x] Foundation agentica criada.
- [x] Camada juridica premium entregue em pacotes.
- [x] Document Brain operacional.
- [x] Draft Factory Premium operacional.
- [x] Learning Loop Capture entregue.
- [~] Support Case Status em andamento.
- [~] Rollout Vault fechado no codigo e pendente de validacao final em ambiente.
- [x] Drift de `agent_audit_logs` corrigido no codigo com separacao para `system_event_logs` e helper canonico agentico.
- [x] Fallbacks plaintext removidos de `src/lib/integrations/server.ts`.
- [x] Fix de runtime aplicado em `/api/integrations/google-drive`.
- [x] Typecheck global desbloqueado em 2026-04-24 (`npx.cmd tsc --noEmit --pretty false`) e teste focado `external-validation` passou.
- [x] Build de producao passou em 2026-04-24 (`npm.cmd run build`, fora do sandbox por bloqueio `spawn EPERM`).
- [x] Harness estatico de integracoes passou em 2026-04-24 (`npx.cmd vitest run src/app/api/integrations/google-drive/route.test.ts`).
- [x] Suite Vitest completa passou em 2026-04-24 (`npm.cmd test`: 15 arquivos, 75 testes).
- [x] Typecheck global passou em 2026-04-25 (`npx.cmd tsc --noEmit --pretty false`).
- [x] Testes focados de auditoria agentica passaram em 2026-04-25 (`npx.cmd vitest run src/lib/agent/kernel/executor.test.ts src/app/api/ai/approve/route.test.ts`: 2 arquivos, 4 testes).
- [x] Suite Vitest completa passou novamente em 2026-04-25 (`npm.cmd test`: 15 arquivos, 75 testes).
- [x] Build de producao passou novamente em 2026-04-25 (`npm.cmd run build`).
- [x] RPCs remotas do Vault confirmadas em 2026-04-25: `get_tenant_integration_resolved` e `list_tenant_integrations_resolved`.
- [x] E2E anonimo de Documentos/Login passou em 2026-04-24 (`npx.cmd playwright test e2e/documentos-auth.spec.ts`: 3 testes).
- [~] E2E autenticado de Documentos ainda pendente por ambiente: tenant/perfil/fixture/RLS foram confirmados via Node com service role e anon session, mas o Chromium do Playwright fica pendurado em chamadas Supabase externas. Login real para em `ACESSANDO...`; bootstrap por cookie entra no dashboard, mas Documentos fica em `Carregando Acervo Operacional...`.
- [x] BUG-005/006 corrigidos no codigo em Prazos.
- [~] BUG-007 corrigido no codigo e pendente de validacao real do bucket/policies `avatars`.
- [x] BUG-001 corrigido no codigo para aliases de `nova_movimentacao`.
- [x] BUG-002 corrigido no codigo com dedupe/upsert no Kanban juridico.
- [x] BUG-003 corrigido no codigo com endpoint server-side para anotacoes.
- [~] BUG-004 mitigado no codigo; pendente revisar/remover `user_tasks` orfa no banco se confirmado.
- [~] BUG-008 em validacao: `cliente_nome` explicito preservado e fallback visual aplicado sem inferir cliente canonico.
- [x] BUG-009 corrigido no codigo com descricoes curtas para cards processuais.
- [~] Smoke final das integracoes em andamento: schema/logs e validacoes tecnicas passaram; falta fluxo funcional autenticado.
- [ ] Validacao funcional local do Google Drive pendente.
- [x] `support_case_status` agora registra artifact, learning event e metadados para visibilidade no MAYUS; router extrai CNJ/cliente/referencia; testes focados, typecheck, suite Vitest completa e build passaram em 2026-04-25.
- [x] `support_case_status` nao escolhe mais automaticamente o processo mais recente em buscas textuais ambiguas; retorna handoff `ambiguous_case_match`; suite Vitest completa e build passaram apos o ajuste.
- [x] E2E observavel de `support_case_status` no MAYUS passou em 2026-04-25: resposta normal e handoff ambiguo exibem mission card, artifact e event.
- [x] `support_case_status` responde andamento, fase, proximo passo, pendencias, base confirmada e inferencias; artifact/event/outputPayload incluem fontes reais, inferencias e sinais faltantes. Validacao 2026-04-27: testes focados, suite Vitest completa, typecheck, build, validacao read-only contra Supabase real, E2Es filtrados do MAYUS e `e2e/documentos-authenticated.spec.ts` completo com 9/9 passaram. O harness MAYUS agora usa `browserProfileMode: "ui-harness"` explicito; Documentos segue com auth/profile reais. O webServer Playwright usa mock oficial de Google Fonts para eliminar dependencia de rede externa no bootstrap.
- [x] Cobertura automatizada de integracoes/Vault ampliada em 2026-04-26: `/api/integrations` e helpers RPC seguros cobertos por Vitest; suite completa passou com 17 arquivos e 89 testes; build passou.
- [x] Cobertura comportamental de Google Drive ampliada em 2026-04-26: GET/PATCH/DELETE e `process-folder` cobertos por Vitest; suite completa passou com 18 arquivos e 105 testes; build passou.
- [x] Cobertura automatizada de LLM Router/OpenRouter, TTS, ZapSign, Asaas e Escavador ampliada em 2026-04-26; pacote focado passou com 6 arquivos e 35 testes; suite completa passou com 24 arquivos e 140 testes; typecheck e build passaram.
- [x] E2E completo passou em 2026-04-26 (`npm.cmd run test:e2e`: 22 testes) apos reset de cache `.next`/dev server e wait explicito para historico formal de minutas.
- [x] Referral Intake iniciado em 2026-04-27: `lead-intake` diferencia indicacao de suporte/status, coleta `referredBy` e `referralRelationship`, preserva origem/relacionamento no card CRM, recomenda confirmacao por SDR/closer e registra evento auditavel `referral_intake_created` em `system_event_logs`. Teste focado passou com 8 casos; typecheck e diff-check passaram.
- [x] Auto Setup Doctor iniciado em 2026-04-27: `GET /api/setup/doctor` diagnostica tenant autenticado e `POST /api/setup/doctor` aplica defaults seguros para CRM e skills; integracoes externas ficam como bloqueios com acao humana explicita. A tela `/dashboard/configuracoes` agora exibe painel de Setup Doctor com status pronto/corrigido/aviso/bloqueio e acoes de atualizar/corrigir. Testes focados passaram com 11 casos, typecheck e diff-check passaram.
- [x] Auto Setup Doctor agentico concluido em 2026-04-27: `POST /api/setup/doctor` cria missao `setup/settings`, run, step, artifact `tenant_setup_doctor_report` e learning event `tenant_setup_doctor_report_created` quando ha correcao ou bloqueio relevante; payload do artifact nao carrega chaves/segredos, Configuracoes mostra link para o MAYUS e o dashboard reconhece label/highlights do doctor. Validacoes passaram com 13 testes focados, typecheck e diff-check.
- [x] Referral Intake agentico concluido em 2026-04-27: indicacoes registradas por `POST /api/growth/lead-intake` agora criam missao `growth/crm`, run, step, artifact `referral_intake` e learning event `referral_intake_artifact_created`; o payload nao expõe telefone/e-mail bruto e o dashboard MAYUS mostra score, area, indicador e handoff humano. Validacoes passaram com 15 testes focados, typecheck e diff-check.
- [x] `lead_intake` como skill formal concluido em 2026-04-27: registry/seed de `agent_skills`, prompt do chat, router deterministico e dispatcher `growth_lead_intake` permitem registrar lead/indicacao pelo MAYUS/chat; a execucao cria card CRM, artifact `lead_intake`/`referral_intake`, evento operacional e learning event sem acionar integracoes externas. Validacoes passaram com 35 testes focados, typecheck e diff-check.
- [x] `lead_qualify` iniciado em 2026-04-27 como primeiro bloco do `growth_frontdoor`: skill formal com router/dispatcher cria artifact `lead_qualification_plan`, roteiro por area, documentos minimos, objecoes provaveis, alertas, handoff e proximo melhor movimento sem acionar integracoes externas. Validacoes passaram com 40 testes focados, typecheck e diff-check.
- [x] `lead_followup` adicionado em 2026-04-27 ao `growth_frontdoor`: skill formal com router/dispatcher cria artifact `lead_followup_plan`, cadencia supervisionada, mensagem inicial, checklist humano, condicoes de pausa e learning event sem enviar WhatsApp/e-mail/telefone automaticamente. Validacoes passaram com 45 testes focados, typecheck e diff-check.
- [x] `lead_schedule` adicionado em 2026-04-27 ao `growth_frontdoor`: skill formal com router/dispatcher cria tarefa em `user_tasks`, artifact `lead_schedule_plan`, checklist de preparo, mensagem de confirmacao sugerida e learning event para consulta/qualificacao/retorno sem Google Calendar/OAuth ou convite externo automatico. Validacoes passaram com 50 testes focados, typecheck e diff-check.
- [x] `revenue_flow_plan` adicionado em 2026-04-27 ao Growth: skill formal com router/dispatcher cria artifact `revenue_flow_plan` e learning event para a trilha proposta -> contrato -> cobranca -> abertura de caso; a execucao e apenas plano supervisionado e nao dispara ZapSign/Asaas nem abre caso real automaticamente. Validacoes passaram com 55 testes focados, typecheck e diff-check.
- [x] `external_action_preview` adicionado em 2026-04-28 ao Growth: skill formal com router/dispatcher cria artifact `external_action_preview` e learning event para pre-flight de ZapSign, Asaas, WhatsApp ou outra acao externa; payload bloqueia side effects externos ate decisao humana e nao expõe e-mail/segredos no metadata. Validacoes passaram com 60 testes focados e typecheck.
- [x] `client_acceptance_record` adicionado em 2026-04-28 ao Growth: skill formal com router/dispatcher cria artifact `client_acceptance_record`, learning event e evento operacional `client_acceptance_recorded` em `system_event_logs` para aceite de proposta/contrato/cobranca/fechamento; side effects externos seguem bloqueados ate revisao humana. Validacoes passaram com 65 testes focados e typecheck.
- [x] `lead_reactivation` adicionado em 2026-04-28 ao Growth: skill formal com router/dispatcher cria artifact `lead_reactivation_plan` e learning event para recuperar leads frios por segmento com lista operacional, criterios, mensagens sugeridas e aprovacao humana; nenhum WhatsApp/e-mail/telefone externo e disparado automaticamente. Validacoes passaram com testes focados, typecheck e diff-check.
- [x] `sales_consultation` adicionado em 2026-04-28 ao Growth: skill formal inspirada em pesquisa publica do Vendas Pro/Metodo DEF, com artifact `sales_consultation_plan`, fases descoberta/encantamento/fechamento, diagnostico, sinais capturados/faltantes do bate-papo, proxima pergunta adaptativa, cliente ideal, solucao central, PUV sugerida quando ausente, pilares autorais, objecoes, ancoragem segura, checklist de qualidade e bloqueio de side effects externos ate revisao humana. Auto Setup Doctor agora alerta perfil comercial incompleto, e Configuracoes salva o perfil comercial em `tenant_settings.ai_features.sales_consultation_profile`. Validacoes passaram com 82 testes focados, typecheck e diff-check.
- [x] `sales_profile_setup` adicionado em 2026-04-28 ao Growth: skill de auto-configuracao comercial por chat que investiga cliente ideal, solucao central, PUV, pilares e anti-cliente, gera PUV/pilares quando faltam, cria artifact `sales_profile_setup`, registra learning event e grava `tenant_settings.ai_features.sales_consultation_profile` como `draft`, `auto_configured` ou `validated`. Validacoes passaram com 87 testes focados, typecheck e diff-check.
- [x] Atendimento consultivo no WhatsApp iniciado em 2026-04-28: novo builder `whatsapp-sales-reply`, endpoint `/api/whatsapp/ai-sales-reply` e botao MAYUS em `/dashboard/conversas/whatsapp` geram resposta DEF a partir do historico, perfil comercial salvo e flags de risco. O envio continua humano/supervisionado: a resposta entra no composer, casos de preco/contrato/urgencia/garantia recebem alerta de revisao e perfil comercial ausente bloqueia resposta ao lead ate auto-configurar.
- [x] Auto-rascunho inbound do WhatsApp iniciado em 2026-04-28: Meta Cloud e Evolution chamam `prepareWhatsAppSalesReplyForContact` apos salvar mensagem recebida, registram `whatsapp_sales_reply_prepared` e notificam a equipe quando ha resposta pronta/revisao/configuracao pendente, mantendo `may_auto_send=false`.
- [x] Visibilidade do rascunho MAYUS no WhatsApp adicionada em 2026-04-28: `GET /api/whatsapp/ai-sales-reply` busca o ultimo `whatsapp_sales_reply_prepared` do contato e a tela de conversa exibe painel com rascunho, riscos, status e acoes para usar/atualizar sem envio automatico.
- [ ] MAYUS Growth OS planejado em 2026-04-28: agenda Google opcional por usuario/global, analise de calls por upload, marketing por referencias, calendario editorial editavel, Meta Ads por upload e ciclo operacional completo conectado ao CRM, agenda, cobranca, juridico, prazos e metricas.
- [x] Agenda Google opcional por usuario iniciada em 2026-04-28: criada integracao `google_calendar_user:{userId}` com OAuth read-only, rotas de conectar/callback/status/desconectar, importacao dos eventos do calendario primario na Agenda Diaria e card de conexao sem alterar a agenda interna. Validacoes passaram: `npm.cmd test -- --run src/lib/services/google-calendar.test.ts` com 4 testes e `npx.cmd tsc --noEmit --pretty false`.
- [x] Agenda Google global opcional concluida em 2026-04-28: criada integracao `google_calendar_global` com OAuth read-only e `requireFullAccess`, rotas de conectar/callback/status/desconectar, importacao dos eventos do calendario primario conectado na Agenda Global e card de conexao sem alterar `user_tasks`. Validacoes passaram: `npm.cmd test -- --run src/lib/services/google-calendar.test.ts` com 5 testes, `npx.cmd tsc --noEmit --pretty false` e `git diff --check`.
- [x] Marketing shell aberto em 2026-04-28: sidebar ganhou secao Marketing e `/dashboard/marketing` foi criado com cards para Referencias, Calendario Editorial, Meta Ads Upload e Conteudos Aprovados, alem de subpaginas estaticas iniciais.
- [x] Backend de marketing por referencias/calendario entregue em 2026-04-28: `src/lib/marketing/editorial-calendar.ts` cria tipos, extrai padroes de referencias fornecidas, gera ideias originais com guardrails anti-copia e calendario editorial editavel. Testes focados passaram.
- [x] MVP de analise de call comercial entregue em 2026-04-28: `POST /api/growth/call-analysis` e `buildCallCommercialAnalysis` geram relatorio estruturado de transcript/notes com dor, objecoes, interesse, pontos fortes/fracos, oportunidades perdidas, proximo passo, follow-up, probabilidade e hints de CRM, sem side effects externos. Persistencia no historico do lead ainda pendente.
- [x] Call analysis endurecido em 2026-04-28: `POST /api/growth/call-analysis` agora exige `getTenantSession`, retorna 401 sem auth e registra evento seguro `call_analysis_prepared` em `system_event_logs` quando ha `crmTaskId`, sem armazenar transcript bruto, dor textual completa, objecoes ou follow-up sugerido no payload persistido.
- [x] Historico seguro de call conectado em 2026-04-28: CRM visual envia `crmTaskId` para a analise; endpoint cria artifact agentico `call_commercial_analysis` quando possivel e registra fallback seguro em `system_event_logs`, sem persistir transcript bruto. O mesmo endpoint agora expõe `GET` seguro por `crmTaskId`, e o modal do CRM mostra histórico com data, interesse, probabilidade, resumo seguro e próximo passo.
- [x] UI local de Marketing conectada ao backend em 2026-04-28: Referencias captura metadados/metricas e exibe padroes via `extractReferencePatterns`; Calendario gera, edita, aprova, recusa e volta rascunhos via `generateEditorialCalendar` e `updateEditorialCalendarItem`, com persistencia MVP em `localStorage`.
- [x] Conteudos aprovados conectados a tarefas internas em 2026-04-28: item aprovado no calendario editorial pode criar tarefa privada em `user_tasks` via `buildMarketingAgendaTaskDraft` e `buildAgendaPayloadFromManualTask`, registrando origem `marketing_editorial_calendar` em descricao/tags/notas, sem publicacao externa nem Google Calendar automatico.
- [x] Meta Ads CSV MVP entregue em 2026-04-28: `src/lib/marketing/meta-ads-analysis.ts` e `/dashboard/marketing/meta-ads` analisam CSV colado/exportado ou arquivo `.csv` client-side, calculam CPL/CTR/CPC/CPM, vencedores, gasto desperdicado, temas de criativo/publico, findings e recomendacoes supervisionadas. XLSX/PDF seguem pendentes.
- [x] Perfil e canais de Marketing MVP entregue em 2026-04-28: `/dashboard/marketing/perfil` cadastra posicionamento, areas, publicos, canais, tom, sites, redes, referencias admiradas e guardrails eticos em `localStorage`; calendario editorial usa esse perfil como briefing inicial, sem publicacao externa automatica.
- [x] Marketing persistente por tenant entregue em 2026-04-28: `/api/marketing/state` salva perfil, referencias e calendario em `tenant_settings.ai_features.marketing_os`, telas de Perfil/Referencias/Calendario/Kanban/Aprovados usam servidor com fallback local e Conteudos Aprovados virou hub operacional para tarefa interna e publicacao manual supervisionada.
- [x] Agenda Google e Marketing UX refinados em 2026-04-28: Agenda Diaria/Global deixam claro que usuarios apenas conectam a conta Google via OAuth, com diagnostico tecnico apenas quando o servidor nao esta configurado; sidebar agora expõe submenus de Marketing e `/dashboard/marketing/kanban` acompanha pautas por status usando o mesmo calendario local, sem publicacao externa.
- [x] CRM Growth sem lead abandonado concluido em 2026-04-28: `buildCrmLeadNextStepStatus` identifica oportunidade aberta sem proximo passo ou parada ha 2+ dias, e o CRM exibe banner/card/lista recomendando data, canal e responsavel sem side effects externos.
- [x] Growth por chat sem abrir CRM entregue em 2026-04-28: skill `marketing_ops_assistant` roteia pedidos de publicacao semanal, conteudos aprovados e leads sem proximo passo; dispatcher le `marketing_os`, CRM e cria artifact/learning event com plano supervisionado, sem WhatsApp, publicacao, Meta Ads ou tarefas automaticas.
- [x] Atribuicao Marketing -> Lead/CRM iniciada em 2026-04-30: criado `src/lib/marketing/marketing-attribution.ts`, `lead-intake` aceita campanha/conteudo/landing/referrer/UTMs em camelCase e snake_case, registra tags/descricao/evento auditavel, preserva `growth_intake` para leads sem origem rastreada e o CRM exibe badge de origem/campanha/sem atribuicao. Validacoes passaram com 16 testes focados e typecheck global.
- [x] `marketing_copywriter` entregue em 2026-04-30: criada skill agentica e motor puro `src/lib/marketing/marketing-copywriter.ts` para copy juridica responsavel por canal, com variações de headline/hook/CTA, sugestao de campanha/atribuicao, flags eticas, artifact `marketing_copywriter_draft` e learning event. `content-draft` usa o novo motor e o calendario passa referencias salvas para `generateEditorialCalendar`. Validacoes passaram com 37 testes focados e typecheck global.
- [x] Fallback IA em rotas criticas avancado em 2026-04-29: `/api/monitoramento/resumir`, chat geral OpenAI-compatible, chat Anthropic com tool-use, geracao de pecas, analisador de movimentacoes, moderador do mural, organizador de processo e `/api/ai/ping` usam wrapper/classificacao de falha com mensagens/erros sanitizados e trace sem chave. `ai/ping` nao envia chave em query string para Gemini e nao devolve erro bruto do provedor.
- [x] Smoke autenticado real parcial passou em 2026-04-26: `GET /api/integrations`, `POST /api/integrations` controlado com cleanup, OpenRouter via Vault e TTS OpenAI.
- [~] Google Drive real validado parcialmente em 2026-04-26: conta conectada e clear root passaram; salvar/restaurar root via API falhou no ambiente local com `The OAuth client was not found`; root foi restaurado via service role; client ID local foi confirmado como malformado.
- [x] Smoke seguro de webhook Asaas passou em 2026-04-26 com payload sintetico e auditoria em `system_event_logs` confirmada.
- [x] Protecao de configuracao Google Drive adicionada em 2026-04-26: `isGoogleDriveConfigured()` agora retorna falso quando o OAuth client ID nao tem formato valido.
- [x] Aplicacao da migration `20260424110000_system_event_logs.sql` concluida em 2026-04-25; tabela `public.system_event_logs` validada com insert/delete temporario.

## Proximo Passo

- [ ] Substituir OAuth client local malformado do Google Drive por credenciais validas e repetir salvar/restaurar root + process-folder.
- [ ] Rodar smoke funcional real de Asaas, ZapSign e Escavador com payloads aprovados.
- [ ] Validar fluxo completo de chat real de `support_case_status` em tenant descartavel/staging, aceitando escritas controladas em auditoria/artifacts/events.
- [x] Abrir execucao do MAYUS Growth OS pela Agenda Google opcional.
- [x] Adicionar Google Agenda global opcional do escritorio.
- [x] Abrir execucao de upload e analise de call comercial no CRM.
- [x] Persistir analise de call no historico/artifact do lead e expor acao no CRM.
- [x] Conectar UI de Marketing ao backend de referencias/calendario.
- [x] Expor acao de analise de call no CRM visual e promover evento seguro para artifact/historico do lead.
- [x] Cadastrar perfis, redes, canais, sites e referencias admiradas para orientar Marketing.
- [x] Persistir Marketing OS por tenant com fallback local e hub operacional de conteudos aprovados.
- [x] Transformar `/dashboard/marketing` em centro operacional autonomo/autoconfiguravel com diagnostico de prontidao, checklist, metricas editoriais e proximas acoes supervisionadas.
- [x] Gerar, persistir, copiar, marcar revisao e separar prontos para publicar do rascunho final supervisionado por canal, mantendo publicacao manual e revisao humana.
- [x] Conectar prontos para publicar e pendentes de revisao final na Central de Marketing com metricas, listas e recomendacoes supervisionadas.
- [ ] Evoluir Meta Ads upload para arquivo real XLSX/PDF ou rota server-side quando necessario.
- [x] Expor Kanban Marketing na lateral usando o calendario editorial local.
- [x] Alertar no CRM leads/oportunidades sem proximo passo operacional.
- [x] Transformar alerta de proximo passo do CRM em plano organizado pelo MAYUS com canal, responsavel, horario sugerido, objetivo e checklist operacional.
- [x] Operar Growth/Marketing por chat sem abrir CRM com artifact supervisionado.
- [x] Criar primeira ponte Marketing -> Lead/CRM com atribuicao de campanha, conteudo e UTM sem banco novo.
- [x] Criar skill de copy juridica responsavel para transformar pauta aprovada em texto por canal com guardrails eticos e artifact.
- [~] Criar controle interno do MAYUS por WhatsApp autorizado para relatorios, agenda, leads, prazos e status do sistema: reconhecimento/autorizacao/resposta segura implementados em modulo puro e Configuracoes permite cadastrar telefones; falta plugar nos webhooks e envio real.
- [~] Criar Playbook diario configuravel por usuario/escritorio: API, artifact/evento, configuracao visual e previa segura entregues; faltam entrega programada, WhatsApp interno autorizado e HTML premium linkavel.
- [x] Criar artifact agentico para `referral_intake` e expor no MAYUS.
- [x] Expor Auto Setup Doctor no MAYUS/Configuracoes com status pronto, corrigido, alerta, bloqueado e artifact agentico rastreavel.
- [x] Resolver instabilidade do bootstrap autenticado Playwright no harness MAYUS sem mascarar os E2Es reais de Documentos.

## Arquivo Antigo

O tracking anterior misturava fases iniciais do produto com o roadmap agentico atual. A informacao util foi preservada e consolidada no checklist principal.
