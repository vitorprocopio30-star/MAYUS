# MAYUS 100 Percent Final Checklist

Fonte oficial atual para decidir o que falta para o MAYUS chegar a 100%.

Atualizado em: 2026-05-26

Este documento substitui os checklists espalhados como fonte principal de execucao. Os arquivos antigos continuam como historico tecnico, evidencias e detalhes de implementacao.

Regra operacional: toda implementacao nova, ajuste de escopo, risco encontrado ou melhoria entregue deve aparecer neste documento antes de ser considerada concluida. Se nao houve validacao real em ambiente controlado, marcar como `[~]`, nao como `[x]`.

Legenda:

- `[x]` pronto e validado
- `[~]` parcial, entregue em parte ou dependente de validacao real
- `[ ]` pendente

---

## 1. Estado Executivo

### Percentual atual

| Frente | Percentual | Leitura honesta |
| --- | ---: | --- |
| MAYUS geral | 81% | Produto forte, WhatsApp multimodal, bloqueio de grupos, recuperacao de locks, observabilidade, fila de resposta, ACK de midia, politica de qualidade agentica, Configuracoes > Agente com smoke real autenticado e onboarding operacional pelo Chat MAYUS evoluiram, mas ainda falta fechar o Operating Partner supervisionado em todos os modulos. |
| Produto juridico/base SaaS | 78% | Dashboard, CRM, documentos, juridico, agenda, marketing e permissoes ja existem. |
| Maturidade agentica | 65% | Ha runtime, artifacts, skills, Operating Partner ativo em WhatsApp, perfil operacional do escritorio no prompt, metodologia tenant-scoped, defaults por area em modo supervisionado, auditoria, onboarding operacional deterministico e Agent Control Plane v1.2 com health, approvals, snapshots, handoff Metodologia -> Lex -> Core, OpenClaw debugger e Hermes lifecycle por agente; o corte beta processual agora carrega envelope Paperclip/OpenClaw/Hermes em artifacts/aprovacoes. Ainda falta um operador central continuo em todos os modulos. |
| WhatsApp vendas/suporte | 92% | Evolution passou smoke multimodal anterior, ACK de midia deployado, bloqueio de grupos, filas zeradas, recuperacao de locks, audio autorizado do dono roteado por transcricao antes do ACK e autoenvio conversacional restrito ao Operating Partner; respostas agora usam digitando/delay humanizado no envio Evolution agentico. Faltam smoke privado fechado com conversa longa real e Meta Cloud. |
| Growth/vendas | 72% | Intake, qualificacao, follow-up, reativacao, sales profile e uso do documento de vendas como playbook existem; falta fechar execucao real ponta a ponta. |
| Juridico/Lex | 87% | Base juridica e documental esta forte; movimentacoes agora tem beta seguro com fila humana, recovery, prazos/cards auditaveis, guard de recurso do proprio polo, metodologia do tenant em `ProcessMissionContext`, `legalDuty` com polo/obrigacao/confianca/lacunas quando houver sinal explicito, envelope beta em `process_mission_plan`/`process_mission_step_result` e sinais Paperclip/OpenClaw/Hermes no inbox; faltam polo/obrigacao plenamente consolidados por dados reais, contradicoes, cronologia, riscos e pecas verificaveis com smoke real. |
| Financeiro | 72% | Financeiro Beta separa receita SaaS do MAYUS em `platform_billing_events`, entrega painel superadmin com MRR/ARR/receita/risco por escritorio, resumo financeiro do tenant, `collections_followup`, labels financeiros no Chat/Brain, reconciliacao leve, forecast por prazo, aging de vencidos, riscos por cliente/caso, forecast comercial por funil/proposta/contrato, unidade economica estimada e politica segura de revenue-to-case. A aba Financeiro do escritorio passou smoke autenticado com fixture controlada cobrindo forecast de cobrancas, aging, riscos, collections, reconciliacao, forecast comercial, unidade economica e geracao de plano supervisionado a partir de risco financeiro; ainda faltam smoke real Asaas, dados reais de custo/comissao, migration remota do billing SaaS e superadmin E2E. Dry-run remoto esta bloqueado nesta sessao porque o Supabase CLI nao tem `SUPABASE_ACCESS_TOKEN`. |
| Auto-configuracao | 66% | Setup Doctor, sales profile, `office_knowledge_profile`, `operational_methodology`, `TenantOperationalMethodologyContext`, Configuracoes > Agente com readiness/rotinas e `office_setup_conversation` pelo fast-path do Chat MAYUS cobrem Metodologia Operacional v0, permissoes, agenda, financeiro, playbooks secundarios, pipelines e estrutura documental por area com defaults supervisionados; falta validacao real das politicas por area/equipe, aprovacao visual completa e uso cross-module final. |
| Reaproveitamento de agentes publicos | 63% | Paperclip, OpenClaw e Hermes viraram trilha documentada e ja entregam routines/heartbeat interno, Agent Control Plane v1.2, scheduler protegido, agent profiles restritivos com debugger, trajectory, lifecycle supervisionado/persistivel, metodologia tenant-only em mission snapshots, route wiring de lifecycle para `brain_memories`/`learning_events`, smoke real de Configuracoes > Agente e verificador seguro do scheduler. O corte processual beta agora usa OpenClaw para `legal_decision`, Hermes para trajectory e Paperclip para owner/next action; `publicAgents` expoe estado operacional por primitiva (`working`, `awaiting_approval`, `blocked`, `needs_attention`, `read_only`) com cobertura, ultimo sinal, approvals, lacunas e proxima acao segura. Faltam deploy/merge para observar workflow em producao, portability e uso cross-module continuo. |
| UX sem curso | 68% | WhatsApp ganhou controles melhores, a tela de Agente/Skills passa smoke real com readiness/rotinas/dry-run e o Chat MAYUS agora monta Metodologia Operacional v0 sem depender do LLM, com artifact/eventos/memorias propostas, politicas operacionais e defaults por area; o usuario ainda precisa entender demais o sistema. |
| Integracoes e operacao real | 78% | WhatsApp Evolution tem smoke, observabilidade, alerta de falha, job assincrono validado manualmente, ACK de midia deployado, bloqueio de grupos, filas zeradas, audio de comando interno tratado antes do ACK, autoenvio agentico endurecido e scheduler de rotinas versionado localmente no workflow. O verificador protegido ja classifica 404/401/403 sem expor segredo, mas a rota `/api/agent/routines` ainda nao esta no alias publico atual. Faltam smoke privado fechado com audio real do dono, PDF novo, Meta Cloud e observar scheduler automatico em producao apos deploy. |

### O que ja e usavel

- [x] Dashboard operacional com modulos principais.
- [x] CRM e Growth com artifacts, proximo passo e planos supervisionados.
- [x] WhatsApp com atendimento supervisionado e resposta MAYUS no composer.
- [~] WhatsApp multimodal com preview de imagem/audio/video/documento, leitura/transcricao parcial e etiqueta editavel por contato.
- [x] Suporte de status de caso com resposta segura, artifact e handoff.
- [~] Suporte WhatsApp de cliente atual para status de processo com contexto verificado, linguagem simples, fase atual, proximo passo, pendencias e bloqueio contra status inventado; falta smoke real com processo controlado.
- [x] Document Brain, Draft Factory, publicacao, export e learning loop juridico.
- [x] Auto Setup Doctor inicial com artifact e defaults seguros.
- [~] Agent Control Plane v1.2 em Configuracoes > Agente: lista agentes internos, health, owner, budget, approvals reais, ultima missao, bloqueio, artifact/evento, metodologia tenant-scoped, OpenClaw debugger, Hermes lifecycle, memoria e proxima acao usando `/api/agent/routines`; tambem reconstrui `Missao processual Lex` quando existe artifact juridico com envelope beta. Falta smoke real autenticado apos deploy.
- [~] Coordenacao Metodologia + Juridico + Agentic formalizada: Frente 0 Metodologia Individual, Frente A Juridico/Lex e Frente B Agentic Core agora tem ownership, bloqueios de colisao, handoff e proximo passo coordenado documentados e expostos no runtime; `/dashboard/aprovacoes` mostra motivo OpenClaw, lacunas, fontes e guardrails para approval juridico. Falta smoke real autenticado mostrando a supervisao com dados vivos em `/dashboard/aprovacoes` e Configuracoes > Agente.
- [~] Hermes + agentes publicos expostos como matriz operacional: Mission Control avalia completude Hermes, eventos faltantes, approval e proxima acao segura; Agent Control Plane mostra Paperclip/OpenClaw/Hermes como primitivas internas reaproveitadas, incluindo bloqueio `tenant_methodology`, superficie `legal_decision` e aprendizado tenant-only; falta smoke autenticado real pos-deploy.
- [~] Cobranca agentica pelo Chat MAYUS: `billing_create` prepara cobranca com aprovacao obrigatoria, valor/vencimento/tipo normalizados, idempotencia e artifact `asaas_billing`; falta smoke real Asaas.
- [~] Visibilidade financeira no Chat/Brain: respostas do MAYUS destacam `asaas_billing`, `collections_followup_plan` e revenue-to-case quando o kernel retorna essas capabilities/artifacts; painel superadmin, summary do tenant, forecast por prazo, aging de vencidos, riscos por cliente/caso e forecast comercial ja estao implementados. A aba Financeiro do dashboard passou smoke autenticado com fixture controlada incluindo faixa comercial e botao de gerar plano de cobranca supervisionado; falta smoke visual do `/admin` apos aplicar migration remota de billing SaaS e usar usuario E2E superadmin.
- [~] Inteligencia de gestao: base curada Gestao Juridica BR, readiness financeiro/CRM e artifact `management_intelligence_brief` ja estruturam conceitos, lacunas, dados usados, perguntas e cenarios sem decisao automatica; falta smoke real com dados Asaas/CRM completos.
- [x] Marketing OS com perfil, referencias, calendario, aprovados, copy supervisionada e maquina de narrativa AI-native para Instagram.
- [x] Auditoria e eventos em `agent_audit_logs` / `system_event_logs` em varios fluxos.

### O que ainda impede o 100%

- [ ] MAYUS Operating Partner ainda nao domina todos os modulos como motor unico.
- [~] WhatsApp ganhou base de vendedor/suporte real com papel conversacional, objetivo, temperatura, estado e bloqueio de resposta generica; ainda precisa smoke longo real.
- [ ] WhatsApp multimodal ainda precisa smoke real Meta Cloud, scheduler frequente e validacao em conversa longa.
- [ ] Acoes reais supervisionadas ainda nao cobrem todo o ciclo CRM -> contrato -> cobranca -> caso.
- [~] Auto-configuracao agora cobre Metodologia Operacional v0 pelo Chat MAYUS em caminho deterministico, incluindo rascunho/recomendacao/aprovacao em `tenant_settings.ai_features.operational_methodology`, contrato `TenantOperationalMethodologyContext`, permissoes, agenda, financeiro, playbooks secundarios, pipelines e estrutura documental por area; ainda falta aprovacao visual completa, validacao por area/equipe e uso cross-module em rotina completa.
- [~] Reaproveitamento dos agentes publicos agora tem matriz Paperclip/OpenClaw/Hermes no Agent Control Plane, com heartbeat/rotinas, approvals, budget/hard stops, policy coverage, lifecycle Hermes, metodologia tenant-only, superficie `legal_decision` e proxima acao segura; faltam deploy/merge para observar workflow em producao, portability real e smoke autenticado do corte novo.
- [~] Memoria e aprendizado ganharam promocao supervisionada: propostas entram em `brain_memories` com fonte/confianca, a tela de Memoria permite promover/rejeitar/revogar com auditoria, a Inbox do Brain rotula auto-correcao/self-improvement no feed canonico e tem filtro `Correcoes MAYUS`, o onboarding operacional validado gera propostas, e o ciclo de auto-correcao passou smoke autenticado real evento -> rotina -> proposta -> aprovacao -> memoria institucional; ainda falta governar a proxima decisao em todos os fluxos.
- [ ] Smokes reais de integracoes sensiveis ainda faltam para producao confiavel.
- [ ] Experiencia ainda tem inconsistencias visuais e operacionais entre modulos.
- [~] Monitoramento juridico premium ganhou backend de excedente Escavador com 100 inclusos, R$ 0,97/processo, gates e auditoria; ainda faltam checkout/cobranca Asaas real, dashboard completo, Kanban automatico seguro e pecas com fontes verificaveis.

---

## 2. Tese do Produto

O MAYUS nao deve ser apenas um software juridico com IA. O produto final e um `Revenue-to-Case OS`: uma camada de inteligencia operacional e de gestao supervisionada que conecta captacao, atendimento, venda, contrato, cobranca, abertura do caso, execucao juridica, comunicacao com cliente, documentos, agenda, metricas e aprendizado. O MAYUS estrutura decisoes com dados reais, mas o dono do escritorio decide.

Frase mae:

**Para o advogado iniciante, o MAYUS e a estrutura que ele ainda nao tem. Para o escritorio grande, e o controle que ele esta perdendo.**

Tese beta da Metodologia Operacional:

**Se o escritorio ja tem metodo, o MAYUS aprende. Se ainda nao tem, ajuda a construir.**

No plano real do produto, "playbook" deixa de ser o conceito principal e passa a ser artefato secundario. A fonte central vira `operational_methodology`: identidade/PUV, cliente ideal, areas, intake, documentos, fases, responsaveis, criterios de avanco/trava, regras de melhoria e politica de internet auditavel.

Regra de isolamento: o MAYUS aprende metodo, memoria, estilo e melhoria por escritorio/tenant. A Metodologia Base MAYUS e apenas default de produto para quando o escritorio ainda nao tem processo definido; ela nao carrega aprendizado de outros escritorios.

Comando futuro ideal:

`Mayus, recupere os leads frios do previdenciario, qualifique os quentes, agende consulta, gere a proposta, prepare o contrato, cobre a entrada e abra o caso com os documentos certos.`

Comando juridico ideal:

`Mayus, faca a replica do processo da Camila contra o Banco X, valide fundamentos, gere Word e PDF, salve na pasta do caso e me entregue resumo executivo.`

Regra de produto:

O MAYUS pode agir, mas acoes juridicas, financeiras ou externas sensiveis exigem aprovacao, fonte, auditoria e trilha de reversao quando aplicavel.

---

## 3. Checklist Final por Frente

### 3.1 Core / Operating Partner

- [x] Base de missoes com `brain_tasks`, `brain_runs`, `brain_steps`, artifacts e learning events.
- [x] Registry de skills, roteamento e dispatcher para varios fluxos.
- [x] Auditoria agentica separada de eventos operacionais em parte relevante do sistema.
- [~] `mayus_operating_partner` existe e ja atua em vendas/suporte, mas ainda nao e o centro unico de toda conversa.
- [~] Operating Partner ja consome `office_knowledge_profile` e `operational_methodology` no WhatsApp quando configurados: areas, triagem, handoff, tom, documentos, promessas proibidas, preco/SLA, departamentos, permissoes, agenda, financeiro, playbooks secundarios e criterios de metodologia entram no prompt.
- [ ] Fazer o Operating Partner ser o motor padrao de decisao nos modulos criticos.
- [~] Criar estado de missao reconstruivel: Mission Control ja reconstrui missao por `brain_tasks`, `brain_runs`, `brain_steps`, approvals, artifacts e `learning_events`, anexando Legal Operator quando existir; ainda falta streaming incremental e health por skill.
- [ ] Criar streaming/status incremental de missao na UI.
- [~] Criar retry/cancelamento por step com motivo e ator: v1 adiciona rotas seguras por step, exige perfil executivo, usa ator da sessao, registra learning events e reabre apenas fila `queued` sem executar side effects externos.
- [ ] Criar health por skill: uso, falha, custo, tempo medio, aprovacao e fallback.

### 3.2 WhatsApp vendedor e suporte

- [x] `/api/whatsapp/ai-sales-reply` prepara resposta com historico e perfil comercial.
- [x] LLM testbench de vendas configurado com OpenRouter e DeepSeek V4 Pro como default inicial.
- [x] Resposta sugerida entra no composer, sem envio automatico indiscriminado.
- [x] Interface de WhatsApp alinhada para nao exibir painel separado de `Rascunho MAYUS`; MAYUS fica como ferramenta discreta no composer.
- [~] Chat WhatsApp renderiza midia no historico: imagem, audio, video e documento.
- [~] Webhooks Meta/Evolution capturam midia e salvam metadados em `whatsapp_messages`.
- [~] MAYUS recebe `media_text` e `media_summary` no contexto da conversa quando a midia foi lida/transcrita.
- [~] Envio manual de anexo agora faz upload para `whatsapp-media` e chama a rota de envio com tipo/nome/mime da midia.
- [~] Etiqueta editavel por contato existe com `label` e `label_color`, exibida na lista, header e painel lateral.
- [~] `mayus_operating_partner` reconstrói fase, fatos, objecoes, urgencia, decisor, suporte, prontidao de fechamento e proxima acao em parte do fluxo WhatsApp.
- [~] LLM/MAYUS no runtime WhatsApp so ativam quando `tenant_settings.ai_features.*.enabled === true` explicitamente.
- [~] Acoes CRM/tarefa do Operating Partner sao bloqueadas para aprovacao quando a confianca fica abaixo de `auto_execute`.
- [~] Webhooks Meta/Evolution enfileiram texto e nao processam resposta conversacional dentro do webhook; o processor/scheduler fica responsavel por uma resposta agentica com mais contexto e janela maior de decisao.
- [~] Webhook Evolution confirma recebimento de imagem/documento/PDF em segundos com ACK deterministico e tenta processar a midia por `messageId` com timeout curto; audio e transcrito antes do ACK para permitir comando interno do dono. Falta smoke privado fechado com audio real e PDF/contracheque novo.
- [~] Resposta conversacional automatica foi restringida ao MAYUS Operating Partner; fallback deterministico e Sales LLM podem preparar rascunho/auditoria, mas nao autoenviar ao cliente.
- [~] Reconstruir estado conversacional por contato: papel vendedor/suporte/status/cobranca/triagem, objetivo, temperatura, fase, fatos, objecoes, urgencia, documentos, decisor, ultimo combinado e proxima acao.
- [~] Conduzir lead multi-turn ate fechamento humano/comercial sem discurso generico: Operating Partner agora recebe e normaliza papel/objetivo/temperatura e bloqueia autoenvio de resposta generica/incompleta; falta smoke real longo.
- [ ] Separar lead novo, cliente atual, suporte, status de processo, cobranca e pergunta fora de escopo.
- [~] Suporte WhatsApp de cliente atual para status de processo: busca processo verificado em `process_tasks`/`process_stages`/movimentacoes, traduz andamento em linguagem simples, informa fase atual, proximo passo e pendencias sem juridiques; autoenvio segue permitido apenas pelo Operating Partner e com base confirmada. Endurecido em 2026-05-07 com matching por telefone normalizado/CPF, limpeza de `case_status_unverified` quando o processo foi verificado e bloqueio de pergunta sobre resultado juridico; numero autorizado em `daily_playbook.authorizedPhones` agora usa `accessScope = tenant_authorized` e pode consultar qualquer processo do tenant por CNJ, nome do cliente, titulo ou referencia textual, sem depender do telefone vinculado ao card. Correcao adicional cobre plural/erro comum em frases como `COMO ESTA O PROCESSOS DO MARCIO DA SILVA MACHADO`, extraindo a referencia por nome e mantendo a intencao deterministica como `process_status`. Operating Partner agora tem fast paths pre-LLM para saudacao pura, pedido generico de processo sem referencia, status verificado seguro, processo nao localizado/ambiguo e cobranca curta como `Cade?`, evitando pergunta de tema/assunto e reduzindo travamento por fila/modelo. Apos smoke real expor falhas, a apresentacao da Maya deixou de confiar em `previousMayusEvent` sem apresentacao visivel no historico recente, `MAYUS` foi bloqueado como nome visivel de escritorio, `Gostaria de saber sobre/de um processo` entra no fast path antes da LLM, e nome explicito enviado no ultimo turno passa a vencer telefone/contato na busca processual. UI do WhatsApp agora nao forca scroll para o fim quando o usuario esta relendo mensagens antigas e mostra botao de novas mensagens. Build tambem exigiu corrigir uma tag extra em `AdminSidebar.tsx` que bloqueava deploy. Validado por suite focada WhatsApp (`76 passed`), `tsc`, build local e deploy Vercel em `https://mayus-premium-pro.vercel.app` (`https://mayus-premium-hk51lb7p3-vitorprocopio30-stars-projects.vercel.app`); falta novo smoke real Evolution.
- [~] Atualizacao 2026-05-08: scroll do painel WhatsApp agora restaura posicao tambem quando polling/focus/realtime substituem a lista sem alterar `messages.length`; Operating Partner trata mudanca explicita para `contracheque`, `desconto`, `beneficio`, `INSS`, `RMC`, `RCC` ou `Credcesta` como triagem comercial/juridica e nao como continuidade de processo; busca processual por nome passou a consultar `client_name`, `title` e `description`, usar candidatos/tokens normalizados e ranquear a melhor correspondencia antes de declarar ambiguidade. Validado localmente com suite focada WhatsApp (`78 passed`), `npx.cmd tsc --noEmit --pretty false` e `npm.cmd run build`. Falta smoke real privado final em producao para confirmar scroll, busca por nome e troca de contexto no WhatsApp real.
- [~] Atualizacao complementar 2026-05-08: busca de status processual no WhatsApp deixou de depender apenas de `process_tasks` e agora consulta tambem dados locais do Escavador em `monitored_processes` e cache `processos_cache` (`OAB_FULL`), incluindo `cliente_nome`, `partes`, `envolvidos`, `raw_escavador`, assunto, resumo e ultima movimentacao. Quando encontra mais de um processo para o mesmo cliente, a Maya nao responde mais que nao localizou; lista ate 3 processos com CNJ/fase para o usuario escolher. Fallback de identificacao agora diferencia dono/telefone autorizado (`nome completo do cliente`) de cliente comum (`seu nome completo`). Nenhuma busca paga externa do Escavador e disparada pelo WhatsApp. Validado localmente com suite focada WhatsApp (`81 passed`), `tsc` e build.
- [~] Atualizacao de dossie processual 2026-05-08: atendimento de status por nome agora monta resposta humana de dossie quando ha multiplos processos, selecao por resposta curta (`ultimo`, `isso`, `1`, `2`, `3`) ou fonte Escavador/cache, priorizando resumo salvo, ultima movimentacao, parte adversa e contexto do cerebro MAYUS quando disponivel. Agravos/incidentes (`Agravo de Instrumento` ou CNJ final `.0000`) sao separados dos processos principais para nao inflar a contagem do cliente. O caminho de processo unico em `process_tasks` preserva a consulta de inbox de movimentacoes e prazo critico antes de responder. Validado com suite WhatsApp ampla (`82 passed`), `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run build` e deploy Vercel de producao `dpl_GRFUqrsEKiewhaD4zZotDWgmSWft` em `Ready`, aliasado em `https://mayus-premium-pro.vercel.app`; warnings restantes sao preexistentes de hooks e `<img>`. Falta smoke real privado com Marcio e selecoes `O ultimo`/`Isso` em producao.
- [~] Hotfix pos-smoke 2026-05-08: pedido generico como `Gostaria de saber de um processo` agora nao reutiliza CNJ/nome/processo antigo do historico; a Maya pede identificador seguro antes de consultar status. Autoenvio longo passa a ser quebrado em blocos de ate 650 caracteres no WhatsApp. Validado com suite WhatsApp ampla (`84 passed`), foco adicional de hotfix (`53 passed`), `npx.cmd tsc --noEmit --pretty false` e `npm.cmd run build`; falta smoke real repetir exatamente `Gostaria de saber de um processo`.
- [~] Virada agentica de status processual 2026-05-08: o dossie processual deixou de gerar resposta pronta em `clientReply`; `process-status-context` agora entrega fatos verificados e `candidateProcesses`, enquanto o `mayus_operating_partner` redige a resposta humana, usa `reply_blocks` quando houver multiplos processos e grava `last_process_candidates` para continuacoes como `o primeiro`, `isso` ou banco especifico. Se ha processos verificados, a Maya deve responder todos os processos principais diretamente, sem perguntar se o cliente quer resumo, se prefere um especifico ou se quer detalhar; o validador `scripted_process_followup_question` bloqueia/repara esse padrao roteirizado. `whatsapp-sales-reply-runtime` passa a autoenviar os `reply_blocks` do Operating Partner com metadata de indice/total. Validado com foco agentico (`55 passed`), suite WhatsApp ampla (`86 passed`), `npm.cmd run build`, `npx.cmd tsc --noEmit --pretty false` e deploy Vercel de producao `dpl_CqVsuaZBEZLbmQuwXhVsrPCzViL6` em `Ready`, aliasado em `https://mayus-premium-pro.vercel.app`; falta smoke real privado com `Marcio da Silva Machado`, `O primeiro`, `Isso` e troca para `Tenho desconto no contracheque`.
- [~] Hotfix pos-smoke real 2026-05-08: smoke em producao mostrou que `Marcio da Silva Machado` gerou contexto verificado com `candidate_count = 2`, mas a resposta ainda perguntou `qual desses voce quer acompanhar` e mandou pedir numero/foto. O detector `scripted_process_followup_question` foi ampliado para bloquear/reparar tambem `qual desses/deles/processo`, `qual voce quer acompanhar` e `se nao souber mande numero/foto` quando ha `candidateProcesses` verificados. Teste de reparo atualizado com a frase real do smoke. Validado com foco agentico (`55 passed`), `npm.cmd run build`, `npx.cmd tsc --noEmit --pretty false` e deploy Vercel de producao `dpl_6LSDkideRVYkQRs2Tm78ht5w1555` em `Ready`, aliasado em `https://mayus-premium-pro.vercel.app`; falta repetir smoke real apos este hotfix.
- [~] Autoenviar somente quando confianca, risco e politica permitirem; locks antigos agora sao suprimidos com seguranca, mas ainda falta smoke privado real e revisao de politica por tenant.
- [~] Registrar por resposta: fonte, modelo, fase, confianca, risco, proxima acao e resultado esperado.
- [x] Proteger `POST /api/whatsapp/send` com autenticacao, sessao e validacao de tenant/contact.
- [x] Trocar `whatsapp-media` de publico para privado com signed URLs ou rota proxy autenticada.
- [x] Processar download, OCR/visao, transcricao e extracao documental fora do webhook para evitar timeout/reenvio.
- [x] Se o download de midia Meta falhar, salvar `media_url = null` e manter o ID apenas em metadata.
- [x] Criar idempotencia por `tenant_id` + `message_id_from_evolution` antes de inserir mensagem.
- [x] Ignorar ou tratar `messages.update` da Evolution como atualizacao de status, nao como nova mensagem.
- [ ] Validar com conversas reais de venda, suporte, objecao, fechamento e cliente irritado/confuso.
- [ ] Smoke real completo com texto, imagem, audio, PDF/DOCX e envio manual em Meta Cloud e Evolution; Evolution passou varios smokes, mas falta rodada privada fechada com PDF novo apos recuperacao de locks.

### 3.3 CRM e Growth

- [x] `lead_intake`, referral intake, qualificacao, follow-up, agendamento e reativacao existem como skills/artifacts.
- [x] CRM identifica lead sem proximo passo e o MAYUS organiza canal, horario, responsavel, objetivo e checklist.
- [x] Sales profile setup auto-configura cliente ideal, solucao, PUV, pilares e anti-cliente.
- [~] Sales LLM usa Documento de Vendas/playbook do tenant como fonte comercial principal para tom, oferta, qualificacao e claims proibidos; promocao automatica a partir de midia WhatsApp esta em codigo e pendente smoke real.
- [x] Analise de call comercial existe e pode virar artifact seguro.
- [~] Marketing -> Lead/CRM tem atribuicao inicial por campanha/conteudo/UTM.
- [ ] Fechar Growth Frontdoor como uma trilha unica: entrada -> qualificacao -> follow-up -> proposta.
- [ ] Transformar oportunidades paradas em acoes agenticas supervisionadas, nao apenas alertas.
- [ ] Registrar motivo de perda, motivo de ganho e qualidade da resposta no learning loop.
- [ ] Criar score de pipeline por etapa, fonte, campanha e responsavel.
- [ ] Validar comportamento com leads reais e metricas de conversao.

### 3.4 Proposta, contrato, cobranca e abertura de caso

- [x] `revenue_flow_plan` monta plano supervisionado proposta -> contrato -> cobranca -> abertura de caso.
- [x] Preview de acao externa existe para ZapSign, Asaas, WhatsApp e outros side effects.
- [x] Registro de aceite do cliente existe como artifact/evento.
- [x] Contrato ZapSign e cobranca Asaas existem como capacidades sensiveis com aprovacao humana.
- [~] Loop completo esta planejado e parcialmente implementado, mas ainda nao e uma execucao operacional real ponta a ponta.
- [ ] Gerar proposta com base no perfil comercial, servico, escopo, preco aprovado e condicoes.
- [ ] Preparar contrato com dados confirmados e pedir aprovacao antes de enviar.
- [~] Preparar cobranca com valor, vencimento, descricao e aprovacao.
- [ ] Confirmar pagamento e abrir caso juridico com checklist documental.
- [ ] Registrar artifact unico do ciclo revenue-to-case.
- [ ] Rodar smoke real em ambiente controlado para ZapSign, Asaas e abertura de caso.

### 3.5 Juridico / Lex Brain

- [x] Contexto juridico do processo por chat.
- [x] Primeira minuta, retry, historico formal, aprovacao, publicacao, Word e PDF.
- [x] Revisao juridica orientada e learning loop capture.
- [x] Support case status cobre andamento, fase, proximo passo, pendencias, inferencias e handoff.
- [~] Mapa de teses e auditor ainda estao parciais.
- [~] Timeline estruturada do caso iniciada via `legal_case_brain_insights`; smoke autenticado em producao passou em 2026-05-15 com `E2E-2026-0001`, criando resposta, artifact `legal_case_brain_insights` e event `legal_case_brain_insights_created`; ainda falta persistencia propria.
- [~] Mapa de riscos e proximos atos provaveis iniciado via `legal_case_brain_insights`; riscos/contradicoes criticos agora bloqueiam `legal_process_mission_execute_next` em testes focados. Smoke autenticado em producao passou em 2026-05-15: missao criou `process_mission_step_result` e `process_mission_step_executed` com falha segura da memoria documental (`Bad Request`) sem protocolo/publicacao/envio externo; ainda falta detector documental profundo e validacao de falhas Drive por tipo.
- [~] Apontar contradicoes nos documentos e na narrativa iniciado com divergencia de fase, minuta stale, duplicidade e arquivo fora da estrutura; falta detector documental profundo.
- [~] Gerar cronologia do caso iniciado com snapshot, documentos e movimentacoes; falta cronologia persistente completa.
- [~] Promover padroes aprovados para memoria institucional supervisionada: fluxo inicial de proposta/aprovacao/rejeicao/revogacao existe para memoria institucional e onboarding operacional, mas falta smoke autenticado e aplicacao uniforme nos padroes juridicos.
- [ ] Protocolo externo nunca executa sem aprovacao humana.
- [~] Classificar movimentacao processual com contexto de polo, fase, historico e obrigacao real: Lex agora enriquece a analise com polo/obrigacao antes de criar prazo/card, incluindo recurso interposto pelo proprio polo representado e papel passivo `apelado`/`agravado`/`recorrido`; falta fase/historico mais profundos e matriz completa.
- [~] Identificar se a obrigacao da movimentacao e do escritorio, do cliente, da parte contraria ou indeterminada: heuristica inicial cobre polo representado, ato pessoal do cliente e parte contraria; falta matriz ampla por classe processual.
- [~] Persistir em cada movimentacao analisada: `polo_representado`, `obrigacao_de_quem`, `confidence`, `confidence_reason`, `evidencia` e `review_required`: salvo em `analise_json` e payload da fila beta; falta coluna/index proprio se virar contrato de consulta.
- [~] Criar prazo/card automaticamente apenas quando a confianca juridica for alta: beta cria com evidencia/auditoria, exige pipeline/card Kanban e volta para revisao se falhar; falta classificador completo de polo/obrigacao do escritorio/cliente representado.
- [~] Enviar movimentacoes de confianca media/baixa, polo incerto ou obrigacao ambigua para fila de revisao humana: fila `/api/juridico/movement-reviews` e UI em `/dashboard/aprovacoes` passaram testes focados e smoke Playwright autenticado; falta persistencia propria alem de `system_event_logs`.
- [~] Evitar prazo indevido de contestacao quando o escritorio representa o autor e a movimentacao e citacao do reu: coberto por guard deterministico e teste focado em `analisador`; falta smoke com dados reais Escavador.
- [~] Evitar prazo indevido de contrarrazoes quando o recurso foi interposto pelo proprio escritorio: guard deterministico grava `requer_acao = false`, `obrigacao_de_quem = parte_contraria`, nao cria prazo/card e bloqueia Draft Factory proativa para ato proprio; quando o polo representado aparece como recorrida/apelada, o prazo seguro de resposta continua permitido; validado em testes focados, falta smoke com movimentacao real Escavador.
- [~] Detectar prazo explicito em dias uteis e vincular evidencia textual da movimentacao: parser/testes cobrem prazo explicito e evidencia em `analise_json`; falta validar mais formatos reais por tribunal.
- [~] Criar Kanban juridico automatico com etapa, prazo, responsavel, fonte, evidencia e motivo da IA: beta cria/atualiza `process_tasks` e `process_prazos` em alta confianca ou aprovacao humana, sem aprovar prazo novo quando a pipeline juridica nao existe; falta etapa/motivo mais ricos por classificador.
- [~] Permitir aprovacao/rejeicao humana de movimentacoes incertas com motivo auditavel: aprovar, ignorar e recuperar travadas existem com auditoria; arquivamento/extincao seguem bloqueados para acao manual no beta.

### 3.6 Documentos / Drive

- [x] Repositorio de documentos, pasta por processo, subpastas, listagem e sincronizacao.
- [x] Leitura de PDFs/DOCX, classificacao, resumo incremental e memoria documental.
- [x] Memoria documental entra no chat e na geracao de pecas.
- [~] Drive Scanner tem base forte, mas depende de revisao/aprovacao para movimentos reais.
- [ ] Apontar documentos contraditorios, duplicados, antigos ou fora do processo.
- [ ] Criar cronologia documental.
- [ ] Organizar Drive legado com fila auditavel de revisao e revert seguro.
- [ ] Criar estrutura documental padrao por area e tipo de processo via auto-configuracao.
- [ ] Relacionar cada fato importante ao documento e trecho de origem.
- [ ] Identificar documentos relevantes nao usados na minuta.
- [ ] Identificar documentos faltantes para o proximo ato processual.
- [ ] Enriquecer Case Brain com evidencias documentais profundas, nao apenas resumo por arquivo.
- [ ] Manter preview, aprovacao, aplicacao, auditoria e reversao segura para qualquer organizacao do Drive legado.

### 3.6A Pecas juridicas verificaveis

- [~] Draft Factory ja carrega documentos internos, fontes externas validadas e checklist de citacoes em parte do fluxo; falta UI de verificacao e bloqueio forte de publicacao.
- [ ] Exibir documentos usados em cada minuta com link para o Drive.
- [ ] Exibir leis, sumulas, temas e jurisprudencias usadas com fonte verificavel.
- [ ] Criar botao de verificacao humana rapida para cada fonte externa.
- [ ] Impedir que a IA invente jurisprudencia ou cite precedente nao validado.
- [ ] Bloquear ou alertar publicacao premium quando houver citacao externa pendente.
- [ ] Permitir override de fonte pendente apenas com aprovacao humana explicita.
- [ ] Registrar fonte, validacao, modelo, versao, documentos usados, lacunas e alertas no artifact da peca.
- [ ] Exportar PDF/DOCX preservando rastreabilidade no metadata da versao.
- [ ] Exigir revisao humana antes de qualquer protocolo externo ou envio de peca final.

### 3.7 Financeiro

- [x] Skill de cobranca Asaas existe.
- [x] Cobranca sensivel exige aprovacao humana.
- [~] Webhook Asaas e logs existem em parte, mas faltam smokes reais e artifacts completos.
- [~] Comando "Mayus, cobre a entrada do cliente X" encontra contexto, monta cobranca, pede aprovacao e registra artifact; implementado em codigo e validado com testes focados, faltando smoke real de aprovacao/Asaas.
- [x] Validar valor, vencimento futuro, tipo de cobranca e descricao antes da aprovacao; vencimento ausente usa hoje + 3 dias uteis.
- [~] Registrar artifact de cobranca `asaas_billing` com link, status inicial, vencimento, cliente/CRM e chave de idempotencia; falta confirmacao com Asaas real.
- [~] Conectar pagamento confirmado a abertura/execucao do caso: webhook continua usando `asaas_billing` para `revenue-to-case`, agora com politica explicita que impede receita SaaS/plataforma, exige CRM/area juridica/intencao explicita para abrir caso, e manda pagamento ambiguo para revisao supervisionada. Falta smoke real controlado.
- [x] Falha de abertura revenue-to-case gera recuperacao operacional: `revenue_case_opening_review`, `system_event_logs`, learning event quando houver Brain task, acoes de recuperacao e notificacao ao responsavel/tenant sem vazar erro bruto no webhook.
- [x] `collections_followup` organiza cobranca vencida pelo Chat MAYUS: classifica atraso leve/inadimplencia/renegociacao, gera mensagem por tom/canal, registra promessa/proximo contato, cria artifact e learning event, mantendo qualquer envio externo bloqueado para aprovacao humana.
- [x] Riscos financeiros do dashboard agora viram acao operacional supervisionada: a aba Financeiro chama `POST /api/financeiro/collections-followup`, revalida `riskKey` no tenant da sessao, cria `collections_followup_plan` em `brain_artifacts` com dedupe e confirma no smoke autenticado sem enviar cobranca externa.
- [~] Chat/Brain MAYUS agora rotula artifacts financeiros (`asaas_billing`, `collections_followup_plan`, revenue-to-case) nas respostas do kernel; falta validar o fluxo visual do Chat/Brain com operador real.
- [~] Reconciliacao leve `financials` + Brain artifacts + `process_tasks` existe em helper testado, com status `matched`/`partial`/`blocked`/`unmatched`; ja esta plugada no resumo financeiro do tenant e passou smoke autenticado na aba Financeiro com fixture controlada.
- [~] Criar forecast por funil, proposta, contrato, cobranca e inadimplencia: summary financeiro ja separa cobrancas a vencer em 7 dias, 30 dias, futuro e sem vencimento, e agora adiciona `commercialForecast` separado de caixa recebido usando `sales`, `crm_tasks` e `crm_stages` para funil/proposta/contrato. A faixa passou smoke visual/autenticado na aba Financeiro com fixture controlada; ainda falta smoke real Asaas e superadmin SaaS autenticado.
- [~] Unidade economica do escritorio implementada tecnicamente: `unitEconomics` calcula margem estimada por caso, receita por area juridica e comissoes por origem/responsavel; a aba Financeiro mostra Margem, Receita por area, Casos mais rentaveis e Comissoes sem redesign. Permanece estimada/baixa confianca quando faltam custos diretos reais por caso.
- [~] Mostrar risco financeiro por tenant e por cliente: superadmin ja mostra risco por escritorio/tenant em codigo, e o summary do tenant lista riscos por cliente/caso agrupados a partir de `financials`; risco por cliente/caso passou smoke autenticado no dashboard, mas o `/admin` segue pendente porque a migration remota de billing SaaS ainda nao esta aplicada e o usuario E2E nao e superadmin. Tentativa de `supabase db push --dry-run` em 2026-05-13 foi bloqueada por CLI sem `SUPABASE_ACCESS_TOKEN` apos corrigir bytes NUL locais em `.env.local`.

### 3.7A Monitoramento juridico premium / Escavador

- [~] Formalizar o monitoramento processual como produto premium de contencioso do MAYUS: regras backend de capacidade, gates e cobranca interna foram iniciadas; falta dashboard completo, checkout Asaas da plataforma e smoke real.
- [~] Incluir 100 processos monitorados por tenant/escritorio no plano base: migration/helper usam limite default 100 por tenant, pendente aplicar migration remota.
- [~] Cobrar excedente de monitoramento a `R$ 0,97` por processo/mes: helper usa 97 centavos e cria cobranca interna `mayus_platform`; cobranca Asaas real fica para proximo corte.
- [~] Calcular excedente pelo maior pico mensal de processos monitorados ativos acima de 100: snapshot mensal registra pico no uso de importacao/ativacao individual e fechamento usa o pico salvo mesmo se o tenant cancelar excedentes antes do fechamento; falta aplicar migration remota e reconciliar Asaas real.
- [~] Considerar monitorado apenas processo com `ativo = true`, `monitoramento_ativo = true` e `escavador_monitoramento_id IS NOT NULL`: RPC/migration e testes focados cobrem a regra, pendente migration remota/smoke.
- [~] Ordenar processos inclusos/excedentes de forma estavel por data de ativacao do monitoramento: helper testado classifica inclusos e excedentes por ativacao/criacao/id, pendente plugar no dashboard de consumo.
- [~] Bloquear criacao de monitoramento excedente sem aceite explicito de custo: importacao em lote e ativacao individual retornam preview/bloqueio antes da chave Escavador e antes de criar monitoramento externo; quando o bloqueio exige termos, o payload aponta `terms_acceptance_endpoint = /api/monitoramento/overage-terms`; `POST /api/monitoramento/overage-terms` grava aceite explicito auditado.
- [~] Bloquear criacao de monitoramento excedente sem metodo de pagamento valido quando cobranca automatica estiver ativada: gate exige termos, metodo valido e customer/subscription da plataforma MAYUS.
- [~] Cancelar monitoramento externo no Escavador ao remover, arquivar ou encerrar processo: remover/arquivar bloqueiam a operacao local se o cancelamento externo falhar e preservam `escavador_monitoramento_id`; falta plugar encerramento juridico real.
- [~] Registrar auditoria para ativacao, aceite de custo, cobranca, pausa e cancelamento de monitoramentos excedentes: eventos `monitoring_overage_blocked`, `monitoring_overage_terms_required`, `monitoring_overage_terms_accepted`, `escavador_budget_blocked`, `escavador_monitoring_cancel_failed` e `monitoring_overage_close_executed` existem e agora declaram `Monitoring Agent` + `Finance Agent`; falta pausa/checkout real.
- [x] Corrigir budget Escavador para usar corretamente `Creditos-Utilizados`: o budget soma creditos do mes e converte por `credit_cost_cents`, expondo credito, custo, bloqueio e agentes responsaveis sem vazar chave.
- [~] Criar migrations versionadas para `api_usage_log`, capacidade de monitoramento e incremento de contadores: migration local `20260515183000_monitoring_overage_billing.sql` cobre base e RPC, mas nao foi aplicada remotamente neste corte.
- [~] Solicitar resumo IA pago apenas para processos efetivamente monitorados e movimentacoes juridicamente relevantes: webhook usa `paid_summary_recommended === true` e mantem guard de monitoramento/cooldown; falta budget unificado final para todos os fluxos Escavador.
- [~] Aplicar cooldown, budget e auditoria antes de qualquer resumo pago recorrente: cooldown e trilha existem no caminho de movimentacao; falta dashboard/limite operacional completo.
- [~] Separar a decisao de gasto em regra deterministica; IA pode recomendar relevancia juridica, mas nao autorizar custo sozinha: beta usa recomendacao deterministica do analisador e nao dispara custo sem flag explicita.
- [ ] Auto-pausar ou bloquear novas chamadas Escavador em anomalia de custo, erro ou comportamento.
- [ ] Criar dashboard de consumo Escavador com inclusos, excedentes, custo previsto, gasto real e risco de bloqueio.

### 3.7B Billing MAYUS / excedentes Asaas

- [~] Billing SaaS/plataforma ja possui base separada em `platform_billing_events`, campos em `tenants`, criacao de customer/assinatura e webhook Asaas; falta fluxo completo de excedente e metodo de pagamento.
- [~] Usar a conta Asaas da MAYUS para cobranca da plataforma, nunca a integracao Asaas do escritorio: fechamento mensal agora cria cobranca interna `mayus_platform` sem chamar Asaas do escritorio; checkout/cobranca real da conta MAYUS fica para proximo corte.
- [ ] Criar fluxo seguro para cadastro de cartao do tenant via checkout/link hospedado pelo Asaas.
- [ ] Nunca armazenar numero de cartao, CVV ou dados sensiveis no MAYUS.
- [ ] Guardar apenas IDs e status do Asaas: customer, subscription, payment, metodo valido e eventos.
- [~] Separar assinatura base da cobranca variavel de excedentes: tabelas `platform_usage_snapshots`/`platform_overage_charges` separam uso variavel da assinatura, pendente cobranca real.
- [~] Criar ledger mensal de uso de monitoramento por tenant: snapshot local versionado registra ciclo, inclusos, pico, excedente e valor projetado; falta aplicar migration remota.
- [~] Criar snapshot de pico mensal de processos monitorados ativos: importacao atualiza pico no ciclo; falta consolidar todos os caminhos de ativacao para pico historico perfeito.
- [~] Calcular excedente mensal como `max(0, pico_monitorado - 100)`: helper usa o maior pico mensal salvo em `platform_usage_snapshots` e cria draft interno; falta reconciliacao Asaas real.
- [ ] Criar cobranca mensal agregada de excedente no Asaas: `excedente * 0.97`.
- [ ] Descrever cobranca como `MAYUS - Excedente de monitoramento - ciclo - quantidade x R$ 0,97`.
- [ ] Reconciliar cobranca de excedente pelo webhook Asaas em `platform_billing_events`.
- [~] Criar status de excedente por tenant: `excedente_liberado`, `cartao_pendente`, `pagamento_excedente_pendente`, `excedente_inadimplente`, `excedente_bloqueado` e `excedente_pausado`: migration local adiciona campos/status; falta aplicar e expor no dashboard.
- [~] Bloquear novos excedentes quando cobranca estiver pendente, inadimplente ou sem metodo valido: importacao em lote bloqueia sem termos/metodo/status validos antes de chamada externa; falta pausar excedentes existentes.
- [ ] Apos tolerancia configuravel, pausar/cancelar monitoramentos excedentes inadimplentes, preservando os 100 inclusos.
- [ ] Mostrar no dashboard: inclusos, usados, excedentes, valor previsto, cartao/metodo, ciclo e cobrancas.
- [~] Registrar todo aceite de custo, checkout gerado, pagamento confirmado, falha, bloqueio e pausa em auditoria: bloqueios, aceite explicito de termos e fechamento mensal ja geram eventos; checkout, pagamento e pausa reais ficam para proximo corte.

### 3.7C Kanban processual premium

- [~] Criar ou atualizar card automaticamente quando movimentacao exigir acao e a confianca for alta: implementado no beta com rollback para revisao humana em falha operacional.
- [ ] Mover etapa do processo com base no tipo de ato, fase e pipeline juridico.
- [~] Criar prazo vinculado a movimentacao, processo, responsavel e fonte: prazo fica vinculado a `monitored_process_id`, `process_task_id` e `escavador_movimentacao_id`; UI de prazos mostra origem e alerta `Sem card`.
- [~] Registrar timeline com data, conteudo, tipo de evento, evidencia, origem e `escavador_movimentacao_id`: beta grava timeline no card e badges `Revisado por humano`, `IA alta confiança` e `Manual`; falta timeline persistente propria mais rica.
- [~] Evitar duplicidade por `escavador_movimentacao_id` e por semantica do prazo: upsert agora usa conflito por movimentacao quando ha ID do Escavador e timeline do card deduplica a entrada; falta constraint/fluxo proprio de review persistente.
- [~] Enviar para revisao quando houver conflito, baixa confianca, polo incerto ou obrigacao ambigua: fila humana, estados `review_required`/processing, recovery e smoke Playwright autenticado cobrem o caminho beta; falta enriquecer conflito de polo/obrigacao.
- [ ] Exibir no card motivo da movimentacao, prazo, fonte, evidencia e confianca da IA.
- [ ] Permitir rollback logico de movimentacao/prazo/card criado por erro de classificacao.

### 3.8 Marketing

- [x] Marketing OS, perfil/canais, referencias, calendario, kanban e aprovados existem.
- [x] Copy juridica responsavel por canal existe com guardrails eticos.
- [x] Maquina de narrativa AI-native do Instagram existe com banco de 6 colunas, modelagem anti-copia e gerador da Semana 1 no calendario.
- [x] Conteudos aprovados podem gerar rascunho final supervisionado.
- [x] Marketing pode criar tarefa interna quando fizer sentido.
- [~] MVP seguro de automacoes Instagram iniciado: `instagram_automations` e `instagram_webhook_events` ganharam migration, `/api/instagram/automations` lista/cria/remove automacoes por tenant via rota autenticada, a tela de integracoes deixou de usar service role no client, e o webhook do Instagram resolve tenant por provider `instagram`/`meta_instagram`/fallback `meta_cloud`, aplica idempotencia, responde comentario e envia private reply com texto + link de entrega. Validado com testes focados de API/webhook e `tsc`; falta aplicar migration, configurar app Meta/Instagram Business Account ID/token e smoke real com comentario em post.
- [~] Meta Ads por upload e ciclo marketing -> receita ainda estao parciais.
- [ ] Meta Ads XLSX/PDF alem de CSV.
- [ ] Diagnosticar campanhas vencedoras, desperdicio, CPL, CTR, CPC, CPM, criativos, publico e temas.
- [ ] Recomendar realocacao de verba e novos criativos com aprovacao.
- [ ] Conectar ROI de campanha ate lead, call, contrato, cobranca, juridico e metricas.

### 3.9 Auto-configuracao

- [x] Auto Setup Doctor diagnostica tenant, CRM, skills e integracoes pendentes.
- [x] Doctor aplica defaults seguros quando nao envolve credenciais/sensibilidade.
- [x] Doctor cria artifact agentico e learning event.
- [x] Sales profile setup auto-configura perfil comercial por chat.
- [~] `tenant_settings.ai_features` agora tem dois blocos complementares: `office_knowledge_profile` para compatibilidade/perfil confirmado e `operational_methodology` para a Metodologia Operacional v0. Setup Doctor diagnostica/auto-semeia defaults seguros, o Chat grava metodologia como rascunho/recomendacao/aprovada, e `TenantOperationalMethodologyContext` normaliza status, ativacao, documentos, area methods, review reasons e politica de internet auditavel; ainda falta validacao real por area/equipe.
- [~] Doctor identifica perfil comercial incompleto e orienta acao humana.
- [~] Onboarding conversacional com `office_setup_conversation`: coleta nome do escritorio, PUV, cliente ideal, areas, anti-cliente, tom, triagem, handoff humano, documentos, promessas proibidas, politica de preco, SLA, departamentos, permissoes, agenda, financeiro e metodologia; persiste `operational_methodology` como draft/recommended/approved, grava `office_knowledge_profile` apenas quando confirmado, cria artifact `office_operational_methodology`, mantem artifact legado de onboarding, registra learning events de metodologia, propoe memorias institucionais quando validado e bloqueia side effects externos. O Chat MAYUS executa a intencao pelo fast-path deterministico sem depender do LLM, sempre isolado por tenant; ainda falta rotina completa por area/equipe.
- [~] Pipeline juridico padrao por area de atuacao e objetivo do escritorio: `practice_area_playbooks` gera etapas por area em modo `needs_area_review`, sem executar acao externa.
- [~] Estrutura documental padrao por area/tipo de processo: `practice_area_playbooks.document_structure` sugere pastas por area para orientar Drive/Document Brain, pendente validacao humana e conexao com criacao real de pastas.
- [~] Playbooks de atendimento, marketing, agenda e cobranca sugeridos pelo MAYUS viraram artefatos secundarios da Metodologia Operacional: o onboarding grava fases, criterios e playbooks por area como draft/recommended; falta fluxo de aprovacao/edicao por equipe.
- [~] Score de prontidao do escritorio com proximo melhor passo existe no Doctor AI First/Configuracoes e aponta pendencias por modulo; Configuracoes > Agente passou smoke autenticado com backend real cobrindo readiness, rotinas e dry-run; falta onboarding conversacional completo e validacao real das politicas por area/equipe.
- [ ] Aprovar/rejeitar configuracoes sugeridas em lote.

### 3.10 Memoria e aprendizado

- [x] Memoria institucional entra no prompt do chat.
- [x] Learning events existem para varios artifacts.
- [x] Delta entre minuta e artifact final ja e capturado em parte.
- [~] Aprendizado agora governa decisao do MAYUS Operating Partner no WhatsApp e mantem o caminho do chat: novo helper `src/lib/agent/memory/institutional.ts` une `office_institutional_memory.enforced=true` com `brain_memories` `institutional_memory_proposal` `promoted=true` (dedup por categoria/key/texto), expoe `summarizeInstitutionalMemoryForPrompt` e `buildInstitutionalMemoryPromptBlock`; Operating Partner recebe `institutionalMemory` no input e insere bloco `Memoria institucional aprovada` antes do estado conversacional; runtime WhatsApp carrega 12 entradas no Promise.all e registra `mayus_operating_partner.institutional_memory_applied`; `fetchInstitutionalMemory` do chat passa a reusar o helper sem mudar resultado externo. O loop Observa -> Aprende -> Corrige -> Aplica ganhou captura de repair/billing/lead outcome em `learning_events`, rotina `mayus-self-improvement-review` para propor memoria institucional supervisionada quando padroes se repetem e painel de auto-correcao na tela de memoria.
- [ ] Memoria por usuario com consentimento e revogacao.
- [ ] Memoria procedural para passos recorrentes.
- [~] Memoria de falhas para evitar erro repetido: reparos do Operating Partner agora viram `mayus_operating_partner_repair_pattern` e eventos `self_correction_*` em `learning_events`; a rotina de auto-aprendizado cria proposta quando a mesma falha/correcao aparece 3+ vezes e o smoke real validou evento -> proposta -> promocao -> memoria institucional aplicada; falta ampliar a taxonomia para outros erros operacionais.
- [ ] Registrar origem, confianca, escopo e motivo de cada memoria.
- [~] Promocao supervisionada: sugestao -> correcao -> aprovacao -> ativa. MAYUS detecta padroes diariamente, grava propostas `institutional_memory_proposal` com `source=self_improvement_loop`, inclui `correction_kind`/`recommended_action`, exibe badges `Detectado pelo MAYUS` e `Correcao sugerida pelo MAYUS`, mostra contadores/recentes de `self_correction_*` na tela de memoria, permite acionar `mayus-self-improvement-review` manualmente pela memoria, e mantem aprovacao/rejeicao humana pela tela de memoria. A Inbox do Brain tambem exibe eventos `self_correction_*`, `self_improvement_proposals_created` e artifacts `self_improvement_report` com rotulos humanos e filtro dedicado `Correcoes MAYUS`. Validado por smoke real autenticado com cleanup em `e2e/configuracoes-memoria-self-correction-real-smoke.spec.ts` e smoke UI mockado da Inbox em `e2e/aprovacoes-self-correction-activity-smoke.spec.ts`.
- [~] Aprender com lead ganho/perdido, objecao, suporte, peca aprovada e cobranca: entregues repair pattern, billing payment confirmed/overdue, lead won/lost, delta humano de minuta, peca aprovada/publicada, delta humano de atendimento WhatsApp e suporte de status do caso; pendente expandir delta humano para canais fora WhatsApp e provar governanca cross-module em conversas reais longas.

### 3.11 Governanca e aprovacoes

- [x] Skills sensiveis ja entram em aprovacao em partes do runtime.
- [x] Side effects externos ficam bloqueados em varios planos/artifacts.
- [x] Eventos e artifacts carregam fontes e sinais em fluxos importantes.
- [~] Runtime WhatsApp agora exige `enabled: true` explicito para ativar LLM/MAYUS e bloqueia side effects CRM/tarefa abaixo de `auto_execute`.
- [~] Policy agentica uniforme agora passa pelo executor de skills com `policyDecision`, risco, superficie, motivo sanitizado e gate de credencial sem leitura de segredo; executor passa `channel` e `agentId` (handler_type/skill name) para `decideMayusSkillAutonomy`, ativando a precedencia OpenClaw `platform_default -> tenant -> module -> agent -> tool -> channel` ja modelada em `agent-profiles.ts`, e persiste `profile_explanation` completa (subject, applied_layers, surface_matrix, source) no `approval_context.policy_decision` do audit log para base de UI de debugger; Lex registra envelope OpenClaw em `analise_json.agentic_governance`, e `/api/juridico/movement-reviews` agora expoe resumo sanitizado para a UI; validado em testes focados, ainda falta smoke real, debugger completo e fechamento de todos os modulos criticos.
- [~] Centro de aprovacoes ganhou filtros operacionais em `/dashboard/aprovacoes` para setup, juridico, financeiro, Escavador e mensagens externas, classificados por skill, handler, modulo e superficie da policy; a revisao juridica agora mostra sinais de polo, obrigacao, confianca, OpenClaw e Hermes sem tabela nova; falta smoke visual autenticado e filtros server-side/metricas antes de chamar de approval center completo.
- [ ] Nenhuma rota server-side de envio externo pode aceitar `tenant_id` do body sem autenticar sessao e conferir permissao.
- [ ] Buckets com dados juridicos/WhatsApp devem ser privados por padrao; acesso por signed URL/proxy autenticado.
- [ ] Separar politicas por risco: low, medium, high, critical.
- [ ] Bloquear critical sem aprovador executivo e MFA/sessao recente.
- [ ] Registrar motivo de rejeicao de approval.
- [~] Escavador pago agora passa por budget compartilhado cache-first antes de busca externa em OAB completa, sincronizacao OAB, paginacao de processos, monitoramento OAB, importacao em lote e ativacao individual; validado por testes focados cobrindo cache hit, bloqueio antes do `fetch`, confirmacao de custo e evento sanitizado, mas falta smoke real e budget diario/por skill para todos os provedores.
- [ ] Auto-pausar tenant/skill em anomalia de custo, erro ou comportamento.
- [ ] Nenhuma acao juridica/financeira/externa sem auditabilidade.

### 3.12 UX sem curso

- [x] Algumas telas ja mostram proximo passo, highlights e artifacts.
- [x] Configuracoes ja tem Doctor e perfil comercial.
- [~] A experiencia ainda exige conhecimento do sistema em muitos lugares.
- [ ] Criar caminho "Mayus, faca isso por mim" nos fluxos criticos.
- [ ] Toda tela critica deve ter equivalente agentico.
- [ ] Estados vazios devem orientar acao real, nao apenas explicar a tela.
- [ ] Unificar padrao visual de Conversas, WhatsApp, CRM, MAYUS e Configuracoes.
- [ ] Mostrar missoes em andamento, pausadas, aguardando aprovacao e concluidas.
- [ ] Reduzir configuracao manual com doctor, entrevista e defaults aprovaveis.

### 3.13 Voz / MAYUSOrb

- [x] Infra inicial de voz e bridge existem.
- [~] Experiencia agentica por voz ainda nao esta fechada.
- [ ] Voz deve acionar o mesmo Brain, nao um fluxo paralelo.
- [ ] Comandos curtos: status, resumo, proxima tarefa, cobrar, gerar minuta.
- [ ] Aprovacoes por voz precisam de confirmacao na UI ou sessao recente/MFA.
- [ ] Voz nao pode virar bypass de permissao, aprovacao ou tenant.
- [ ] MAYUSOrb Streamer Mode: Orb como facecam agentica com `idle`, `summoned`, `working` e `presenting`, mantendo ElevenLabs como voz e Brain como execucao.
- [ ] Exibir feedback operacional claro no MAYUSOrb: working no canto superior esquerdo, anel dourado ativo, tela clicavel e presenting para resultado/aprovacao/erro.

### 3.14 Integracoes, deploy e observabilidade

- [x] Google Calendar opcional por usuario/global existe como read-only.
- [x] Drive, Escavador, Asaas, ZapSign e WhatsApp possuem partes implementadas/testadas.
- [~] Vault/integracoes tiveram validacoes tecnicas, mas ainda faltam smokes funcionais finais.
- [~] WhatsApp multimodal tem schema/helper/webhooks/UI iniciais, mas ainda precisa smokes reais, idempotencia e processamento async.
- [ ] Smoke real controlado de Asaas, ZapSign, Escavador, WhatsApp e Drive.
- [ ] Smoke real especifico de WhatsApp: inbound texto, imagem, audio, documento, outbound texto, audio, imagem/documento e fallback/override de provider.
- [x] Observabilidade de midia WhatsApp: processor registra eventos sanitizados por midia/batch, tela WhatsApp mostra painel admin e falhas geram notificacoes internas.
- [x] Respostas WhatsApp de texto podem ser enfileiradas fora do webhook em `/api/whatsapp/replies/process`, com eventos sanitizados, alerta de pendencia atrasada e alerta de falha.
- [ ] Observabilidade por skill, rota, webhook, provedor LLM e custo.
- [~] Alertas de falha de webhook e provider: midia WhatsApp ja alerta falha de processamento/batch; ainda faltam webhooks/providers gerais.
- [ ] Checklist de release com build, typecheck, testes focados, E2E essencial e diff-check.
- [ ] Deploy estavel com variaveis verificadas sem expor segredos.

### 3.15 Reaproveitamento de agentes publicos

Fonte de verdade detalhada: `docs/brain/MAYUS_AGENTIC_BETA_MASTER_PLAN.md`, secao `Public Agent Extraction Matrix`.

- [~] Paperclip e a base principal para operar agentes como organizacao: governance, approvals, budget, hard stops, activity log, ownership, heartbeat/routines internas, scheduler global protegido e matriz `publicAgents` ja aparecem no Control Plane; faltam observar workflow em producao, portability e timeline unificada.
- [~] OpenClaw e a base de seguranca/config/policy: executor ja usa policy por tenant, profiles restritivos, surfaces, gates de credencial/budget e blocked reasons sanitizados; Control Plane expoe precedencia, outcome, camada bloqueada, motivo e proximos modulos; falta matriz completa aplicada a todos os modulos e smoke real.
- [~] Hermes e a base de memoria/skills/scheduler/aprendizado: Doctor, readiness, setup conversation, memory proposals, trajectory, lifecycle helpers e `POST /api/agent/memory` ja propoe lifecycle Hermes em `brain_memories`/`learning_events` sem auto-aprovar; Mission Control agora avalia completude, eventos faltantes, approval, lifecycle/memoria e proxima acao segura; falta uso cross-module real em producao.
- [~] Paperclip heartbeat/routines: `runMayusRoutineHeartbeat` cria rotinas reconstruiveis com objetivo, owner, budget, blocker, approval id, artifact `routine_wakeup_plan`, learning event e system event; `/api/agent/routines` agora tambem roda scheduler global por `CRON_SECRET`, o workflow local chama essa rota e `npm run verify:agent-routines` testa dry-run protegido. A rotina `mayus-self-improvement-review` entra como daily/low-risk/desabilitada por padrao e executa a revisao de auto-aprendizado depois dos gates de policy/budget. Observacao 2026-05-15: o workflow remoto de `main` ainda nao tem o step novo e o alias publico retorna `404` para a rota, entao falta deploy/merge antes de observar execucao real em producao.
- [ ] Paperclip portability: export/import de configuracao do escritorio com secret scrubbing, colisao de tenant e revisao humana.
- [~] Hermes skill lifecycle: criar, versionar, propor, aprovar, revogar e preparar persistencia de skills/memorias como procedimentos operacionais por tenant; `POST /api/agent/memory` aceita `propose_hermes_lifecycle`, normaliza role `admin`/`administrador`/`socio`, grava proposta supervisionada em `brain_memories` e evento em `learning_events`, e passou smoke autenticado real com cleanup sem auto-aprovar; falta conectar o uso cross-module antes de governar execucao.
- [~] Hermes trajectory: registrar trajetoria de missao para aprendizado supervisionado e avaliacao, sem virar verdade automatica; Mission Control e `/dashboard/aprovacoes` exibem completude, eventos faltantes, approval/lifecycle e proxima acao segura; falta persistencia/query propria e uso cross-module mais amplo em ambiente real.
- [~] Smoke real/documental antes de marcar qualquer reaproveitamento como `[x]`: `e2e/configuracoes-agente-real-smoke.spec.ts` passou com backend real em Configuracoes > Agente, cobrindo readiness, rotinas e dry-run; o gate da tela agora normaliza `admin`/`administrador`/`socio` como o backend; `npm run verify:agent-routines` classifica o alias publico atual como `route_not_deployed_or_wrong_endpoint`; ainda falta observar scheduler no workflow de producao apos deploy.

---

## 4. Ordem de Execucao Recomendada

### Fase 0 - Hardening obrigatorio antes de release/commit da frente WhatsApp

Foco: seguranca, privacidade e confiabilidade da entrega multimodal.

- [x] Proteger `POST /api/whatsapp/send` com usuario autenticado, tenant da sessao e validacao de `contact_id`.
- [x] Remover dependencia de `tenant_id` vindo do body em rotas server-side sensiveis.
- [x] Tornar `whatsapp-media` privado; servir preview com signed URL curta ou rota proxy autenticada.
- [x] Salvar inbound rapidamente com `media_processing_status = 'pending'` e processar midia fora do webhook.
- [x] Criar job/rota interna para baixar midia, extrair texto, transcrever audio, descrever imagem e atualizar a mensagem.
- [x] Garantir que falha de download nao salve ID de provider como `media_url`.
- [x] Criar idempotencia por `tenant_id` + `message_id_from_evolution` e ignorar duplicatas.
- [x] Tratar `messages.update` da Evolution como atualizacao, nao como mensagem nova.
- [x] Adicionar testes para rota autenticada, bucket privado/signed URL, duplicidade de webhook, fila pending e processor de midia.
- [ ] Rodar smoke real controlado com Meta Cloud e Evolution antes de marcar qualquer item multimodal como `[x]`.

### Fase 1 - Subir de 68% para 75%

Foco: WhatsApp + Operating Partner + CRM actions.

- [~] Fazer o WhatsApp usar o Operating Partner como caminho principal de conversa.
- [~] Persistir estado conversacional por contato.
- [~] Conectar acoes reais supervisionadas: atualizar lead, etapa, nota, tarefa, documento pedido e handoff.
- [~] Tirar preparacao pesada de resposta de texto do webhook e enfileirar para processamento interno protegido, priorizando resposta humana/contextual em vez de velocidade; falta deploy e smoke privado fechado apos o ajuste.
- [ ] Validar multi-turn com lead novo, dor clara, objecao, fechamento, suporte, status e cliente irritado.
- [ ] Corrigir inconsistencias visuais restantes entre WhatsApp e Todas as Conversas.
- [ ] Separar mudancas globais de layout/sidebar das mudancas de WhatsApp antes de commitar.

### Fase 2 - Subir de 75% para 85%

Foco: revenue loop real.

- [ ] Transformar `revenue_flow_plan` em missao operacional unica.
- [ ] Proposta -> contrato -> cobranca -> abertura de caso com checkpoints.
- [ ] Artifacts unificados por ciclo comercial.
- [ ] Smokes controlados de ZapSign e Asaas.
- [ ] Handoff humano claro para preco, contrato, pagamento e promessa juridica.

### Fase 3 - Subir de 85% para 92%

Foco: auto-configuracao completa.

- [~] Onboarding conversacional do escritorio via `office_setup_conversation`; grava perfil operacional confirmado com permissoes, agenda, financeiro, playbooks e defaults por area, cria artifact/eventos/memorias propostas e passou smoke autenticado real com cleanup, mas ainda falta fluxo completo por area/equipe.
- [~] Defaults por area juridica: `practice_area_playbooks` gera perguntas, documentos, pipeline e estrutura documental por area em modo `needs_area_review`.
- [~] Playbooks de atendimento, marketing, agenda, documentos e financeiro: notas/playbooks operacionais entram no perfil e nas memorias propostas; falta UI de revisao e aprovacao por equipe.
- [~] Score de prontidao por modulo existe no runtime/Doctor e aparece na configuracao do Agente; falta smoke autenticado amplo antes de marcar como concluido.
- [ ] Aprovar/rejeitar sugestoes em lote.

### Fase 3A - Produto juridico premium e billing de excedentes

Foco: transformar monitoramento processual, Drive e pecas em produto premium rentavel e seguro.

- [~] Criar schema de uso/excedente: snapshot mensal, pico monitorado, cobranca gerada e status por tenant existe em migration local; falta aplicar migration remota e smoke real.
- [~] Implementar calculo de capacidade: 100 inclusos, excedente, valor previsto e bloqueios existem em helper/rotas/testes; falta consolidar todos os caminhos de ativacao e dashboard.
- [ ] Criar fluxo Asaas para metodo de pagamento do tenant via checkout seguro, sem armazenar cartao no MAYUS.
- [~] Bloquear excedente sem aceite explicito e sem metodo de pagamento valido: importacao em lote e ativacao individual bloqueiam antes da chave Escavador e da criacao externa, com endpoint de aceite no payload quando termos faltam; falta checkout real.
- [ ] Gerar cobranca mensal agregada de excedente e reconciliar webhook Asaas.
- [~] Cancelar monitoramento externo no Escavador ao remover, arquivar ou encerrar processo: remover/arquivar bloqueiam localmente se o cancelamento externo falha; falta encerramento juridico/smoke Escavador real.
- [ ] Corrigir budget Escavador, ledger de `Creditos-Utilizados` e migrations faltantes.
- [ ] Criar gate deterministico para resumo IA pago por relevancia juridica, cooldown e budget.
- [ ] Evoluir classificador juridico com polo representado, obrigacao real, confianca, evidencia e fila de revisao.
- [ ] Criar Kanban processual automatico apenas para alta confianca, com revisao humana para casos ambiguos.
- [ ] Criar cronologia documental e detector de contradicoes/duplicidades/documentos fora do processo.
- [ ] Expor fontes verificaveis em minutas e bloquear publicacao premium sem validacao adequada.
- [ ] Rodar smoke real controlado de Asaas, Escavador, Drive, Kanban e Draft Factory antes de marcar como `[x]`.

### Fase 4 - Subir de 92% para 97%

Foco: memoria, aprendizado e governanca.

- [ ] Memorias por usuario, procedimento, falha e padrao institucional.
- [ ] Promocao supervisionada de memoria.
- [ ] Health por skill, custo e fallback.
- [ ] Politicas de risco e aprovacao uniformes.
- [ ] Dashboard de missoes e observabilidade.

### Fase 5 - Subir de 97% para 100%

Foco: voz, deploy, validacao real e acabamento.

- [ ] MAYUSOrb como canal real do mesmo Brain, incluindo Streamer Mode integrado a `brain_steps` e fallback local do chat/voice bridge.
- [ ] E2E e browser verification dos fluxos criticos.
- [ ] Smokes reais de integracoes.
- [ ] UX sem curso em todos os modulos principais.
- [ ] Auditoria e rollback/reversao para acoes sensiveis.

---

## 5. Criterios de 100%

O MAYUS so deve ser considerado 100% quando:

- [ ] Entende o contexto real de cliente, lead, processo, documento, tarefa e financeiro.
- [ ] Decide a proxima acao com base em historico, risco, fase e objetivo.
- [ ] Executa acoes reais quando permitido e pede aprovacao quando necessario.
- [ ] Registra auditoria, fonte, confianca, modelo/ferramenta e resultado esperado.
- [ ] Aprende com ganho, perda, edicao humana, suporte, cobranca e erro.
- [ ] Opera sem exigir configuracao manual pesada.
- [ ] Funciona em WhatsApp, chat, dashboard e voz com a mesma politica.
- [ ] Nunca inventa status de processo, resultado juridico, preco, contrato ou cobranca.
- [ ] Cobra excedentes de monitoramento com aceite, metodo valido, auditoria e reconciliacao financeira.
- [ ] Cria prazos/cards juridicos automaticamente apenas com fonte, evidencia e confianca alta.
- [ ] Gera pecas juridicas com documentos e fontes externas verificaveis antes de publicar.
- [ ] Tem smokes reais e observabilidade para integracoes sensiveis.
- [ ] Um usuario novo consegue obter valor sem fazer curso.

---

## 6. Registro de Execucao Obrigatorio

### 2026-05-04 - WhatsApp multimodal, etiquetas e Operating Partner

Status: `[~]` implementado em codigo local e validado tecnicamente, mas nao pronto para producao ate concluir a Fase 0 de hardening.

Entregas registradas:

- [~] Migration `20260504120000_whatsapp_media_labels.sql` adiciona `label`, `label_color`, `metadata`, campos de midia, status de processamento e bucket `whatsapp-media`.
- [~] Helper `src/lib/whatsapp/media.ts` baixa/processa midia Meta/Evolution, salva no storage e tenta extrair texto/transcrever audio/descrever imagem quando ha provider configurado.
- [~] Webhook Meta Cloud tenta baixar ID de midia, persistir signed URL temporaria, metadados, texto/sumario e status de processamento; falhas mantem `media_url = null` e ID em metadata.
- [~] Webhook Evolution detecta imagem/audio/video/documento/sticker e tenta baixar/base64 antes de persistir.
- [~] Envio manual por WhatsApp aceita `audio_url`, `media_url`, `media_type`, `media_filename` e `media_mime_type`.
- [~] Tela `/dashboard/conversas/whatsapp` renderiza imagem, audio, video e documento; mostra leitura MAYUS quando existe `media_summary/media_text`.
- [~] Tela WhatsApp permite editar etiqueta do contato e mostra etiqueta na lista, header e painel lateral.
- [~] Runtime de resposta WhatsApp passa `media_text/media_summary` para os builders deterministicos, Sales LLM e Operating Partner.
- [~] Runtime WhatsApp so ativa LLM/MAYUS quando a feature esta explicitamente habilitada no tenant.
- [~] Operating Partner ganhou estado conversacional, prontidao de fechamento, resumo de suporte e guard para side effects CRM/tarefa abaixo do threshold.
- [x] `/api/whatsapp/send` passou a autenticar sessao, buscar tenant em `profiles`, validar `contact_id` no tenant e usar telefone salvo do contato, ignorando `tenant_id/phone_number` do body.
- [x] Bucket `whatsapp-media` passou para privado na migration e fluxos WhatsApp usam signed URLs temporarias em vez de URL publica permanente.
- [x] Meta webhook deixou de salvar ID de provider em `media_url`; Evolution `messages.update` atualiza status e `messages.upsert` ignora duplicata por message id.
- [x] Webhooks Meta/Evolution passaram a salvar midia recebida como `media_processing_status = 'pending'`, sem download/transcricao/visao inline.
- [x] `src/lib/whatsapp/media-processor.ts` e `/api/whatsapp/media/process` processam a fila com `x-cron-secret`, baixam/analisam midia, atualizam a mensagem e so entao preparam resposta MAYUS para inbound.
- [x] `vercel.json` agenda `/api/whatsapp/media/process` diariamente por compatibilidade com limite Hobby do Vercel; smoke e reprocessamento podem chamar a rota manualmente com `CRON_SECRET`.
- [x] `media_url` deixou de persistir signed URL temporaria quando existe `media_storage_path`; a UI gera signed URL sob demanda para preview.

Validacoes executadas:

- [x] `npx.cmd tsc --noEmit --pretty false`
- [x] `npx.cmd vitest run src/lib/whatsapp/send-message.test.ts src/lib/growth/whatsapp-sales-reply.test.ts src/lib/growth/sales-llm-reply.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts src/lib/agent/mayus-operating-partner.test.ts src/lib/agent/mayus-operating-partner-actions.test.ts src/app/api/whatsapp/send/route.test.ts src/app/api/evolution-webhook/route.test.ts` com 8 arquivos e 27 testes.
- [x] `npx.cmd vitest run src/app/api/whatsapp/send/route.test.ts src/app/api/evolution-webhook/route.test.ts src/lib/whatsapp/send-message.test.ts` com 3 arquivos e 8 testes apos hardening de seguranca/midia.
- [x] `npx.cmd vitest run src/lib/whatsapp/send-message.test.ts src/lib/whatsapp/media-processor.test.ts src/lib/growth/whatsapp-sales-reply.test.ts src/lib/growth/sales-llm-reply.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts src/lib/agent/mayus-operating-partner.test.ts src/lib/agent/mayus-operating-partner-actions.test.ts src/app/api/whatsapp/send/route.test.ts src/app/api/evolution-webhook/route.test.ts` com 9 arquivos e 31 testes apos processamento assincrono.
- [x] Deploy Vercel do commit `2242893` concluido com sucesso em `mayus`, `mayus-premium`, `mayus-premium-pro` e `mayus-v9`.
- [ ] Pre-smoke Supabase bloqueado: migration `20260504120000_whatsapp_media_labels.sql` ainda nao aplicada no banco validado por `.env.local`; faltam `whatsapp_messages.metadata`, colunas de midia e `whatsapp_contacts.label`.
- [ ] Rota `/api/whatsapp/media/process` respondeu `403` com `CRON_SECRET` local no alias publico, indicando segredo de producao diferente do local ou ambiente/projeto divergente.
- [x] Apos aplicar migration, `npm run verify:whatsapp-media` retornou `ok: true`, bucket privado e `pending_count: 0`.
- [x] Rota publica `/api/whatsapp/media/process?limit=1` respondeu `200 OK` com `CRON_SECRET` de producao do Vercel e `picked: 0`.
- [x] Smoke real Evolution: inbound texto, imagem, audio, PDF e DOCX chegaram no banco; processor converteu midias para `processed`, gravou `media_storage_path`, `media_text/media_summary` quando aplicavel e zerou fila `pending`.
- [x] Smoke real Evolution: outbound texto enviado com sucesso via provider `evolution` e registrado como `status = 'sent'`.
- [x] Smoke real revelou e corrigiu politica de MIME do bucket para DOC/DOCX em `whatsapp-media`.
- [x] Observabilidade inicial do processor WhatsApp registra `whatsapp_media_processed`, `whatsapp_media_failed` e `whatsapp_media_batch_processed` em `system_event_logs` sem texto integral, signed URL ou segredo.
- [x] Deploy correto `mayus-premium-pro` do commit `d1d41fa` ficou `READY/PROMOTED`; rota `https://mayus-premium-pro.vercel.app/api/whatsapp/media/process?limit=1` respondeu `200 OK`, `picked: 0`, e gravou `whatsapp_media_batch_processed`.
- [x] Painel admin de observabilidade WhatsApp na tela `/dashboard/conversas/whatsapp` consome API sanitizada e mostra pendentes, falhas, processadas 24h, tempo medio, ultimo batch e eventos recentes sem expor texto de midia, signed URL ou segredo.
- [x] Processor protegido em `mayus-premium-pro` reprocessou fila real com `picked: 8`, `processed: 5`, `unsupported: 3`, `failed: 0`, `replies_prepared: 8`; readiness voltou para `pending_count: 0`.
- [x] Falhas de processamento de midia WhatsApp e batches com falha geram notificacoes internas sanitizadas em `notifications`, com dedupe basico e link para `/dashboard/conversas/whatsapp`.
- [x] Deploy correto `mayus-premium-pro` do commit `2bdc50d` ficou `READY/PROMOTED`; readiness retornou `ok: true`, `pending_count: 0`, e a API admin `/api/whatsapp/media/observability` seguiu protegida com `401` sem sessao.
- [x] Envio WhatsApp aceita override seguro `preferred_provider` para smoke Meta Cloud sem fallback silencioso para Evolution; padrao continua preferindo Evolution quando nada e informado.
- [x] Webhooks Meta/Evolution de texto enfileiram resposta em `metadata.reply_processing_status = 'pending'` e retornam rapido; `/api/whatsapp/replies/process` prepara/envia resposta fora do webhook com `CRON_SECRET`.
- [x] Fila de resposta preserva `reply_preferred_provider`, entao inbound Meta Cloud responde por Meta e inbound Evolution responde por Evolution sem fallback cruzado silencioso.
- [x] Processor de respostas registra `whatsapp_reply_processed`, `whatsapp_reply_failed` e `whatsapp_reply_stale_pending` sem texto integral, signed URL ou segredo; falhas/pendencias atrasadas geram notificacoes internas deduplicadas.
- [x] Autoenvio para contato ja atribuido permanece bloqueado por padrao, mas pode ser liberado por tenant com `whatsapp_agent.autonomy_mode = 'auto_respond_assigned'`.
- [x] Deploy correto `mayus-premium-pro` do commit `3ea6b7d` ficou `READY/PROMOTED`; rotas protegidas retornaram `403` sem segredo, processor de midia retornou `picked: 0` e processor de respostas retornou `picked: 0` com `CRON_SECRET` de producao sem expor o valor.
- [x] Smoke Evolution com MAYUS fechado: mensagem `Boa tarde` entrou como inbound, ficou `pending`, foi reprocessada com `CRON_SECRET`, gerou outbound `sent` via Evolution e evento `whatsapp_sales_llm_auto_sent` sem expor segredo.
- [~] Webhooks Evolution e Meta Cloud passaram a acionar `processPendingWhatsAppRepliesBatch` imediatamente para o `message_id` de texto salvo, preservando `reply_preferred_provider`, com timeout curto para nao prender o webhook; validado em testes locais, pendente deploy e smoke real com pergunta de contracheque.
- [~] Sales LLM ganhou timeout operacional; quando falha/expira, o runtime pode autoenviar fallback deterministico apenas em triagem juridica segura (`payroll_discount`/`benefit_or_inss`), sem liberar status de processo, preco, contrato, pagamento ou urgencia.
- [~] Processor de respostas ganhou claim atomico: antes de preparar/enviar, muda `reply_processing_status` de `pending` para `processing` somente se ainda estiver pendente; execucoes concorrentes pulam como `skipped`, reduzindo risco de resposta duplicada.
- [x] Validacao local do ajuste imediato endurecido: `npx.cmd vitest run src/lib/growth/sales-llm-reply.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts src/app/api/evolution-webhook/route.test.ts src/app/api/whatsapp/webhook/route.test.ts src/lib/whatsapp/reply-processor.test.ts` com 5 arquivos e 24 testes; `npx.cmd tsc --noEmit --pretty false`; `git diff --check` sem erro; `npm run verify:whatsapp-media` retornou `ok: true` com `pending_count: 1`; `npm run build` passou com warnings preexistentes de hooks/`<img>`.
- [x] Deploy Vercel de producao `dpl_8CSoVVKeCgkjpoSS9xXaQ2NcZtU3` do commit `d84a630` ficou `Ready` e aliasado em `https://mayus-premium-pro.vercel.app`; falta smoke real Evolution com texto de contracheque.
- [~] Smoke real Evolution com `Posso mandar meu contracheque para vc analisar?` entrou no banco, mas o caminho LLM/processor levou cerca de 49s quando acionado manualmente; para venda em segundos, Evolution ganhou fast-path deterministico seguro que responde pedido de envio/analise de contracheque direto no webhook, sem esperar LLM, e cai na fila se o envio falhar.
- [x] Deploy Vercel de producao `dpl_69socey4Swtoj81Gp4SCoaUMQPCY` do commit `681ad4e` ficou `Ready` e aliasado em `https://mayus-premium-pro.vercel.app`.
- [x] Webhook da Evolution foi reconfigurado para a URL estavel `https://mayus-premium-pro.vercel.app/api/evolution-webhook`; chamada `webhook/set` retornou `201` para a instancia `mayus-dutra` sem expor API key.
- [x] Smoke real Evolution fast-path: inbound `Posso enviar meu contracheque?` gerou outbound `sent` via `evolution` em cerca de 4s, com `reply_processing_status = processed`, `reply_auto_sent = true`, `reply_source = immediate_safe_deterministic_reply` e evento `whatsapp_immediate_safe_reply_auto_sent`.
- [~] Webhook Evolution ganhou ACK imediato para midia/documento/PDF: salva a mensagem como `pending`, envia confirmacao deterministica por Evolution com `source = immediate_media_ack`, marca `media_ack_sent` e `reply_processing_status = waiting_media_processing`, e tenta `processPendingWhatsAppMediaBatch({ messageId, limit: 1 })` com timeout curto para nao depender apenas do scheduler.
- [~] ACK especifico para contracheque/PDF pede o desconto ou valor que o cliente quer conferir sem prometer resultado juridico; demais midias recebem confirmacao generica segura e pedido de ponto especifico.
- [~] Sales LLM passou a incluir Documento de Vendas/playbook do tenant como fonte comercial principal para tom, oferta, qualificacao, perguntas e claims proibidos, mantendo documentos do cliente como evidencia do caso e nao promessa de resultado.
- [~] Processor de midia promove automaticamente documento de vendas relevante para `tenant_settings.ai_features.sales_playbook_context`, `sales_document_summary` e `sales_playbook_source`, com evento sanitizado `whatsapp_sales_playbook_promoted`.
- [x] Validacao local do ACK de midia/playbook: `npx.cmd vitest run "src/app/api/evolution-webhook/route.test.ts" "src/app/api/whatsapp/webhook/route.test.ts" "src/lib/growth/sales-llm-reply.test.ts" "src/lib/growth/whatsapp-sales-reply-runtime.test.ts" "src/lib/whatsapp/media-processor.test.ts" "src/lib/whatsapp/reply-processor.test.ts"` com 6 arquivos e 30 testes; `npx.cmd tsc --noEmit --pretty false`; `npm run verify:whatsapp-media` retornou `ok: true` com `pending_count: 3`; `git diff --check` sem erro alem de warnings CRLF; `npm run build` passou com warnings preexistentes de hooks/`<img>`.
- [x] Deploy Vercel de producao `dpl_9Dh7UAZotNUkLUdY71my8QYNyUu7` do commit `96cbc77` ficou `Ready` e aliasado em `https://mayus-premium-pro.vercel.app`; rotas protegidas `/api/whatsapp/media/process?limit=1` e `/api/whatsapp/replies/process?limit=1` retornaram `403` sem `CRON_SECRET`, como esperado.
- [~] WhatsApp passou a priorizar o MAYUS Operating Partner como motor agentico padrao quando nao estiver explicitamente desativado no tenant; ele recebe playbook/documento de vendas, estado conversacional, CRM e regras de claims, com timeout operacional para nao empilhar LLM lenta no webhook.
- [~] Processor de midia deixou de autoenviar resposta tardia quando existe mensagem inbound mais nova do mesmo contato; nesses casos registra `whatsapp_media_reply_suppressed_stale` e deixa o contexto processado para a proxima decisao agentica.
- [x] Validacao local do ajuste agentico: `npx.cmd vitest run "src/app/api/evolution-webhook/route.test.ts" "src/app/api/whatsapp/webhook/route.test.ts" "src/lib/growth/sales-llm-reply.test.ts" "src/lib/growth/whatsapp-sales-reply-runtime.test.ts" "src/lib/whatsapp/media-processor.test.ts" "src/lib/whatsapp/reply-processor.test.ts" "src/lib/agent/mayus-operating-partner.test.ts"` com 7 arquivos e 36 testes; `npx.cmd tsc --noEmit --pretty false`; `npm run build` passou com warnings preexistentes de hooks/`<img>`.
- [x] Deploy Vercel de producao `dpl_SBpdzMniKTtxjatX7TnvHqcraHou` do commit `4a60700` ficou `Ready` e aliasado em `https://mayus-premium-pro.vercel.app`.
- [x] Tenant de smoke `a0000000-0000-0000-0000-000000000001` teve `mayus_operating_partner.enabled` alterado de `false` para `true` para validar o motor agentico real no WhatsApp.
- [x] Bloqueio de grupos WhatsApp implementado e deployado: webhook Evolution ignora `remoteJid` `@g.us` antes de tenant/contato/mensagem/resposta, e `sendWhatsAppMessage` rejeita envio para JID de grupo; validado localmente e publicado no deploy `dpl_7u3Mg6DwFHejgGCMVTaezKo5JMgJ`.
- [x] Limpeza operacional pos-incidente: 1 contato de grupo WhatsApp e 50 mensagens recentes vinculadas foram marcadas com `group_chat_ignored = true`; replies pendentes/processando foram convertidas para `ignored_group_chat` e midias pendentes para `unsupported`, sem apagar historico.
- [x] Processor de respostas WhatsApp recupera locks `processing` antigos: se houver qualquer mensagem mais nova no contato ou se o lock passou de 10 minutos, marca como processado/suprimido sem autoenvio; se for lock recente sem mensagem mais nova, reprocessa com limite de tentativas e evento sanitizado. Validado com 24 testes focados, typecheck, deploy `dpl_6UaJmVwQC32D1rJCsRVXGLqcP4rz`, e limpeza operacional deixou `processing_count: 0`, `pending_reply_count: 0`, `pending_media_count: 0`.
- [~] `office_knowledge_profile` implementado e deployado: runtime WhatsApp carrega o perfil operacional do escritorio de `tenant_settings.ai_features`, envia ao MAYUS Operating Partner e Setup Doctor diagnostica/auto-semeia defaults seguros. Validado localmente com 35 testes focados, typecheck, readiness `pending_count: 0`, deploy `dpl_5xuQmi2nniedn5NtXS1xxaRAEeHc` do commit `0a4d207`, e Auto Setup Doctor no tenant de smoke semeou perfil `draft` com triagem/handoff/promessas proibidas/politica de preco; faltam validar nome, areas, documentos, departamentos reais e smoke privado fechado.
- [~] Teste ativo Evolution mostrou que `sendWhatsAppMessage` aceitava HTTP 2xx sem persistir ID do provider e que midia `fromMe` podia ficar como `media_processing_status = pending`; helper agora extrai/persiste `message_id_from_evolution` para Evolution, retorna `messageId`, e webhook nao enfileira midia enviada pelo proprio WhatsApp conectado. Validado com `npx.cmd vitest run src/lib/whatsapp/send-message.test.ts src/app/api/evolution-webhook/route.test.ts` (15 testes) e `npx.cmd tsc --noEmit --pretty false`; limpeza operacional corrigiu 1 midia outbound `fromMe` pendente e deixou `media_pending_count: 0`.
- [x] Deploy Vercel de producao `dpl_F7HeF5mCRmR1xMQKz2qrQE6Qdi9i` do commit `e023e1e` ficou `READY/PROMOTED` e aliasado em `https://mayus-premium-pro.vercel.app`; verificacao pos-deploy manteve `reply_processing_count: 0`, `reply_pending_count: 0` e `media_pending_count: 0`.
- [x] Ajuste agentico apos smoke privado deployado: ACK de midia continua automatico, mas resposta conversacional ao cliente nao pode mais ser fallback deterministico, Sales LLM ou fast-path textual; autoenvio fica permitido somente quando o MAYUS Operating Partner gerar a decisao. `Credcesta` segue classificado como `payroll_discount`, mas se o Operating Partner expirar o processor registra `blocked_reason = operating_partner_timeout_no_agentic_answer`, deixa a mensagem pendente para retry agentico controlado e nao envia texto roteirizado. Validado com `npx.cmd vitest run src/lib/whatsapp/reply-processor.test.ts src/lib/growth/whatsapp-sales-reply.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts src/app/api/evolution-webhook/route.test.ts` (31 testes), `npx.cmd tsc --noEmit --pretty false`, deploy Vercel de producao `dpl_5Xdi7UqU6Mij3Ac1y1hANuC5RTLm` do commit `a90dab9` em `READY/PROMOTED`, aliasado em `https://mayus-premium-pro.vercel.app`, e verificacao pos-deploy com `reply_processing_count: 0`, `reply_pending_count: 0` e `media_pending_count: 0`; falta repetir smoke privado `O credcesta`.
- [~] Virada para qualidade humana/contextual deployada: webhooks Meta/Evolution deixam de processar resposta textual dentro da requisicao e apenas enfileiram; ACK de midia continua imediato; o MAYUS Operating Partner passa a ter janela maior fora do webhook (`52s` para webhooks, cabendo na rota `maxDuration = 60`, e `120s` manual) e prompt reforcado para agir como funcionario experiente, usando historico, documento recebido, CRM, playbook, estado conversacional e uma pergunta estrategica por vez. Validado com `npx.cmd vitest run src/app/api/evolution-webhook/route.test.ts src/app/api/whatsapp/webhook/route.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts src/lib/whatsapp/reply-processor.test.ts src/lib/agent/mayus-operating-partner.test.ts` (31 testes), `npx.cmd tsc --noEmit --pretty false`, deploy Vercel de producao `dpl_72HgA3Z5TX6n4pShVnhQmvcGnyyR` em `READY/PROMOTED`, aliasado em `https://mayus-premium-pro.vercel.app`, e verificacao pos-deploy com `reply_processing_count: 0`, `reply_pending_count: 0` e `media_pending_count: 0`; falta smoke privado `O credcesta`.
- [~] Conversational Operating Partner deployado para WhatsApp: `conversation_state` ganhou `conversation_role`, `conversation_goal`, `customer_temperature` e `last_commitment`; prompt manda o MAYUS conduzir conversa como vendedor consultivo/suporte, nao responder mensagem isolada; normalizacao bloqueia autoenvio de resposta generica ou decisao sem controle conversacional; testes cobrem conversa multi-turn com contracheque/Credcesta e bloqueio de suporte generico. Validado com `npx.cmd vitest run src/lib/agent/mayus-operating-partner.test.ts src/lib/agent/mayus-operating-partner-actions.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts src/lib/whatsapp/reply-processor.test.ts src/app/api/evolution-webhook/route.test.ts src/app/api/whatsapp/webhook/route.test.ts` (35 testes), `npx.cmd tsc --noEmit --pretty false`, deploy Vercel de producao `dpl_j9kfyGrgdJxNoJvETDxoWziH3XRB` em `READY/PROMOTED`, aliasado em `https://mayus-premium-pro.vercel.app`, e verificacao pos-deploy com `reply_processing_count: 0`, `reply_pending_count: 0` e `media_pending_count: 0`; falta smoke real longo.
- [~] Incidente `Boa noite` diagnosticado: webhook Evolution salvou texto e enfileirou corretamente, mas como o processamento textual tinha sido movido para scheduler, a mensagem ficou `pending` ate o workflow rodar. Processor GitHub respondeu com `reply_source = operating_partner`, `conversation_role = seller`, modelo `deepseek/deepseek-v4-pro` e outbound contextual sobre Credcesta/contracheque. Correcao local: webhooks Meta/Evolution continuam enfileirando, mas tambem acionam `processPendingWhatsAppRepliesBatch({ messageId, limit: 1 })` dentro de `maxDuration = 60`; scheduler fica fallback, nao caminho principal. Validado com `npx.cmd vitest run src/app/api/evolution-webhook/route.test.ts src/app/api/whatsapp/webhook/route.test.ts src/lib/agent/mayus-operating-partner.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts src/lib/whatsapp/reply-processor.test.ts` (33 testes), `npx.cmd tsc --noEmit --pretty false` e `git diff --check`; falta deploy.
- [x] Follow-up `Nao lembro` revelou gargalo de timeout do Operating Partner com `deepseek/deepseek-v4-pro`, mantendo a mensagem com `blocked_reason = operating_partner_timeout_no_agentic_answer`. Correcao entregue em duas frentes: historico enviado ao Operating Partner compactado para 12 mensagens e contexto de midia limitado por trecho (`media_summary`/`media_text` truncados), preservando fatos do documento sem inflar a chamada LLM; default operacional do tenant e do Doctor/Sales LLM alterado para `minimax/minimax-m2.7`, mantendo `deepseek/deepseek-v4-pro` como candidato. Benchmark real no mesmo contexto: `minimax/minimax-m2.7` respondeu em ~38s com `should_auto_send = true`; `qwen/qwen3.6-plus` passou de ~72s; o modelo anterior expirava no limite operacional.
- [x] Follow-up `Nao lembro` apos compactacao deixou de expirar, mas o modelo marcou a resposta segura como `requires_approval` por recomendar handoff interno, resultando em `reply_not_marked_auto_send`. Correcao deployada: autoenvio da mensagem foi desacoplado da aprovacao da acao interna `recommend_handoff`; se nao houver risco alto, status/processo/cobranca, resposta generica ou fechamento, a mensagem consultiva pode autoenviar enquanto o handoff fica pendente de aprovacao. Validado com testes focados (`30 passed` para Sales LLM, Doctor, Operating Partner e runtime WhatsApp), `npx.cmd tsc --noEmit`, deploy Vercel `dpl_6sxma8nnx8EM2VHcBbEttkCSckQn` em `READY/PROMOTED`, aliasado em `https://mayus-premium-pro.vercel.app`, e reprocessamento real do inbound `Nao lembro`: outbound `sent` via `mayus_operating_partner_auto_reply`, modelo `minimax/minimax-m2.7`, `reply_source = operating_partner`, `conversation_role = seller`, `auto_send = true`, `reply_auto_sent = true`, `blocked_reason = null`, filas `pending/processing/media = 0/0/0`.
- [~] Experiencia humana no WhatsApp Evolution ganhou helper nao bloqueante para `markMessageAsRead` e `sendPresence`: webhook tenta marcar inbound como lido, sinaliza `available`, usa `composing` antes do processamento agentico e `paused` ao finalizar/errar; processor tambem sinaliza `composing`/`paused` no fallback/scheduler para nao depender apenas do webhook. Em 2026-05-07, o processor passou a manter pulso de `composing` a cada janela segura durante o processamento agentico, alem do delay humanizado antes do envio final; `paused` segue como no-op seguro porque a Evolution nao aceita presence invalida. Validado localmente com `npm.cmd test -- src/app/api/evolution-webhook/route.test.ts src/lib/whatsapp/reply-processor.test.ts src/lib/whatsapp/send-message.test.ts` (23 testes) e `npx.cmd tsc --noEmit`; falta smoke real confirmar visto azul/digitando porque depende do suporte da instancia Evolution/WhatsApp.
- [x] Playbook RMC/Credcesta ativado no atendimento WhatsApp: criado `src/lib/growth/rmc-playbook.ts` com contexto de cartao beneficio/RMC/RCC/especie IV/Credcesta, regras de nao perguntar fato ja evidente no contracheque, perguntas de qualificacao e claims proibidos; runtime injeta esse playbook quando `sales_playbook_template = rmc_dutra` e o tenant real `a0000000-0000-0000-0000-000000000001` foi atualizado com `sales_playbook_context`, `sales_document_summary`, `offer_positioning`, `sales_rules`, `qualification_questions`, `forbidden_claims` e `sales_playbook_source`. Tambem foram adicionados bloqueios de autoenvio para vazamento de idioma estrangeiro (`foreign_language_leak`) e pergunta que ignora pagamento/desconto ja conhecido (`asks_already_known_payment_status`). Validado com `npm.cmd test -- src/lib/agent/mayus-operating-partner.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts src/lib/growth/sales-llm-reply.test.ts src/app/api/evolution-webhook/route.test.ts src/lib/whatsapp/reply-processor.test.ts` (43 testes), `npx.cmd tsc --noEmit`, deploy Vercel `dpl_4U3qbVWD9ahvETkHRgJhPWM6hngS` em `READY/PROMOTED`, aliasado em `https://mayus-premium-pro.vercel.app`; falta smoke real com nova mensagem RMC para observar qualidade e se algum bloqueio exige regeneracao automatica.
- [x] Loop de aprendizado operacional/reparo automatico adicionado ao MAYUS Operating Partner: quando uma primeira resposta do modelo cai em flags reparaveis (`foreign_language_leak` ou `asks_already_known_payment_status`), o runtime faz uma segunda chamada curta com o contexto original, a resposta invalida e regras de reparo para gerar novo JSON em portugues BR, sem pergunta obvia e sem orientar suspender pagamento. Se o reparo passar nos validadores, pode autoenviar; se nao passar, continua bloqueado para revisao. Validado com teste que repara resposta com ingles vazado para resposta RMC segura, `npm.cmd test -- src/lib/agent/mayus-operating-partner.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts src/lib/whatsapp/reply-processor.test.ts` (28 testes), `npx.cmd tsc --noEmit`, deploy Vercel `dpl_33zMo1zHSPeWFnkZ5TBwn6rhrkHi` em `READY/PROMOTED`, aliasado em `https://mayus-premium-pro.vercel.app`; falta smoke real observar latencia extra quando reparo for acionado.
- [x] Telemetria do reparo automatico adicionada: cada tentativa de reparar resposta invalida registra `mayus_operating_partner_reply_repaired` em `system_event_logs` com flags originais, flags reparadas, `should_auto_send`/`requires_approval`, intent/modelo, duracao e erro quando houver. Se o reparo falhar, o sistema retorna a decisao invalida ja bloqueada, sem autoenvio. Validado com testes de sucesso e falha (`29 passed` nos focados), `npx.cmd tsc --noEmit`, deploy Vercel `dpl_UNfzRgDceZVWcGjUSffvDJGBJ6Km` em `READY/PROMOTED`, aliasado em `https://mayus-premium-pro.vercel.app`, e filas WhatsApp pos-deploy `pending/processing/media = 0/0/0`; falta smoke real gerar evento de reparo em producao.
- [x] Teste controlado com `openai/gpt-5.4-nano` via OpenRouter aprovado para RMC/Credcesta: tenant real passou a usar `sales_llm_testbench.default_model = openai/gpt-5.4-nano` e o modelo foi inserido em `candidate_models`; smoke local com contexto de contracheque/Credcesta respondeu em `10605ms`, portugues correto, sem vazamento de idioma estrangeiro, sem perguntar se o desconto ainda existe, `should_auto_send = true` e `requires_approval = false`. Tambem foi corrigido o silencio quando o runtime cai em `non_agentic_reply_source` ou `deterministic_fallback_not_agentic`: o processor agora reabre `reply_processing_status = pending` para retry agentico controlado, registra motivo/tentativas e nao conta como processado enquanto nao houver resposta agentica ou limite de retry. Validado com `npm.cmd test -- src/lib/whatsapp/reply-processor.test.ts` (10 testes), suite focada `npm.cmd test -- src/lib/whatsapp/reply-processor.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts src/lib/agent/mayus-operating-partner.test.ts` (31 testes), `npm.cmd run build` com apenas warnings preexistentes, deploy Vercel `dpl_3HqH8Gs7W5DdtxEBprDWJ49Ck2LW` em `READY/PROMOTED`, aliasado em `https://mayus-premium-pro.vercel.app`, e filas pos-deploy `reply_pending_count: 0`, `reply_processing_count: 0`, `media_pending_count: 0`; falta smoke real Evolution com `Boa tarde`/RMC para confirmar comportamento no WhatsApp.
- [x] Auto-configuracao comercial por escritorio iniciada: criado `office_playbook_profile` neutro por tenant, com areas prioritarias, tese por area, cliente ideal, dores, oferta, perguntas de qualificacao, documentos minimos, promessas proibidas, regras de handoff, objecoes, proximos passos e perguntas que o MAYUS deve fazer ao dono. O RMC/Credcesta ficou tratado como playbook explicito do Dutra (`sales_playbook_template = rmc_dutra`), nao como default global por heuristica de nome/area. O Operating Partner agora recebe o playbook do escritorio e o Setup Doctor detecta lacunas, semeia perguntas para o dono e consolida `openai/gpt-5.4-nano` como default de SDR/WhatsApp no codigo. Validado com `npm.cmd test -- src/lib/setup/tenant-doctor.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts src/lib/growth/sales-llm-reply.test.ts src/lib/llm-router.test.ts src/lib/agent/mayus-operating-partner.test.ts` (45 testes), `npm.cmd run build`, `npx.cmd tsc --noEmit --pretty false`, deploy Vercel `dpl_A2NktkHv83gmPALYSY2w3kyFZgyM` em `READY/PROMOTED`, aliasado em `https://mayus-premium-pro.vercel.app`, filas pos-deploy zeradas, e tenant Dutra semeado com `office_playbook_profile.status = draft` para tese RMC/Credcesta; falta plugar UI/WhatsApp autorizado para coletar respostas do dono e ativar playbook por escritorio sem intervencao tecnica.
- [x] Entrevista de auto-configuracao comercial por WhatsApp autorizado implementada: comando interno `Mayus, configurar vendas do escritorio` inicia `office_playbook_profile.setup_session`, pergunta uma etapa por vez, salva respostas do dono em campos estruturados (`main_legal_areas`, `thesis_by_area`, `ideal_client`, `common_pains`, `offer_positioning`, `qualification_questions`, `required_documents`, `forbidden_claims`, `handoff_rules`, `next_best_actions`) e aceita `confirmar playbook` para marcar `status = active`. O fluxo usa apenas telefones autorizados em `daily_playbook.authorizedPhones`, bloqueia nao autorizados, registra evento interno e envia resposta pelo mesmo provider WhatsApp sem criar artifact de relatorio diario. Validado com `npm.cmd test -- src/lib/mayus/whatsapp-command-center.test.ts src/lib/mayus/whatsapp-command-runtime.test.ts src/app/api/evolution-webhook/route.test.ts src/app/api/whatsapp/webhook/route.test.ts src/lib/setup/tenant-doctor.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts` (37 testes), `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run build`, deploy Vercel `dpl_3DVDQrTJr65BvzCy9eVENXy7MmX4` em `READY/PROMOTED`, aliasado em `https://mayus-premium-pro.vercel.app`, e filas pos-deploy `pending/processing/media = 0/0/0`; falta smoke real com o telefone autorizado do dono.
- [~] Audio inbound Evolution deixou de cair direto no ACK generico de midia quando pode ser comando do dono: o webhook salva o audio, tenta `processPendingWhatsAppMediaBatch({ messageId, limit: 1 })` com janela maior, le `media_text` transcrito e chama `handleWhatsAppInternalCommand` antes de qualquer ACK. Se o comando interno for tratado, marca a mensagem com `audio_transcript_used_as_command`, atualiza `content` com a transcricao e nao enfileira resposta ao cliente nem manda ACK de contracheque; se nao for comando, o ACK de audio fica generico e nunca usa texto de contracheque. Tambem foi centralizado `humanizeDelivery` em `sendWhatsAppMessage` para Evolution texto, com `composing`, delay por tamanho, pulsos de digitando e `paused`; comandos internos e autoenvio do Operating Partner usam esse caminho. Validado com `npm.cmd test -- src/lib/whatsapp/send-message.test.ts src/lib/mayus/whatsapp-command-runtime.test.ts src/app/api/evolution-webhook/route.test.ts` (21 testes), `npm.cmd test -- src/lib/whatsapp/reply-processor.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts src/lib/agent/mayus-operating-partner.test.ts` (31 testes), `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run build` com warnings preexistentes de hooks/`<img>`, deploy Vercel `dpl_FkxvqNp2NfkWmAWVkdzBd4Cv5cvQ` em `READY`, aliasado em `https://mayus-premium-pro.vercel.app`, `vercel inspect` confirmando alias e `npm.cmd run verify:whatsapp-media` com `ok: true` e `pending_count: 0`; falta smoke real com audio `Mayus, relatorio do escritorio` e acionar processors protegidos quando `CRON_SECRET` estiver disponivel no ambiente de execucao.
- [x] Correcao pos-smoke de audio/digitando: audio de telefone autorizado do dono agora e marcado antes do processamento com `owner_audio_command_attempted`/`media_reply_suppressed = owner_audio`, e o `media-processor` suprime `prepareWhatsAppSalesReplyForContact` para esse caso, impedindo resposta de atendimento/contracheque mesmo quando a transcricao falha ou a intent nao e reconhecida. Nesses casos o MAYUS envia fallback interno seguro pedindo texto/comando explicito. `sendEvolutionPresence` foi corrigido para o payload oficial da Evolution (`number` + `options.delay/presence/number`) e `available`/`paused` viraram no-op para nao enviar presence invalida. Validado com `npm.cmd test -- src/app/api/evolution-webhook/route.test.ts src/lib/whatsapp/evolution-presence.test.ts src/lib/whatsapp/send-message.test.ts src/lib/whatsapp/media-processor.test.ts` (25 testes), `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run build`, deploy Vercel `dpl_AeBCCGCQ2385jpeJ8YiuvHEdvpYi` em `READY`, aliasado em `https://mayus-premium-pro.vercel.app`, e `npm.cmd run verify:whatsapp-media` com `ok: true`/`pending_count: 0`; falta repetir smoke real de audio e confirmar visualmente `digitando...` no aparelho.
- [x] Diagnostico real do audio pos-smoke: ultimas mensagens mostraram transcricoes como `E analise do escritorio, Marlos` e `Maius, relatorio do escritorio`, alem de ACK/Operating Partner antigos antes da correcao. A intent interna foi ampliada para reconhecer `analise do escritorio`, `diagnostico do escritorio` e variacoes de ASR como `Maius`/`Marlos`, evitando cair no atendimento comercial quando o dono pede analise/relatorio. Validado com `npm.cmd test -- src/lib/mayus/whatsapp-command-center.test.ts src/app/api/evolution-webhook/route.test.ts src/lib/whatsapp/evolution-presence.test.ts` (21 testes), `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run build`, deploy Vercel `dpl_Cs2gAmjHLuUkVBLdQvGiS8cHwUvF` em `READY`, aliasado em `https://mayus-premium-pro.vercel.app`, e `npm.cmd run verify:whatsapp-media` com `ok: true`/`pending_count: 0`; falta novo smoke real apos este deploy.
- [x] Playbook Premium em HTML plugado ao comando interno: `daily_playbook` ja gerava `htmlReport` no artifact, mas o WhatsApp despejava o texto completo. Agora o runtime registra o artifact `daily_playbook`, responde no WhatsApp apenas com `Playbook Premium gerado`, resumo curto e link; a pagina segura `/dashboard/mayus/playbooks/{artifactId}` carrega `brain_artifacts` do mesmo tenant e renderiza o HTML premium armazenado em `metadata.html_report`. Validado com `npm.cmd test -- src/lib/mayus/whatsapp-command-runtime.test.ts src/lib/mayus/daily-playbook.test.ts` (7 testes), `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run build` mostrando a rota dinamica `/dashboard/mayus/playbooks/[artifactId]`, deploy Vercel `dpl_J9DmdToN6ej4L9VrzE8zhDXraFtM` em `READY`, aliasado em `https://mayus-premium-pro.vercel.app`; falta smoke real por audio/texto e abrir o link autenticado.
- [x] Link publico premium do Playbook implementado: cada artifact `daily_playbook` passa a salvar `metadata.public_share_enabled`, `metadata.public_share_token` e `metadata.public_share_created_at`; o WhatsApp envia `/playbook/{token}` em vez de `/dashboard/mayus/playbooks/{artifactId}`, mantendo fallback interno apenas para artifacts antigos sem token. A nova rota publica server-side `/playbook/[token]` usa Supabase service role para buscar somente artifact `daily_playbook` com token habilitado e renderiza `metadata.html_report`, sem expor `artifactId` no WhatsApp. Validado com `npm.cmd test -- src/lib/mayus/whatsapp-command-runtime.test.ts src/lib/mayus/daily-playbook.test.ts` (7 testes), `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run build` mostrando `/playbook/[token]` como rota dinamica, deploy Vercel `dpl_s6GeeaZ8wtcM9c54WjDjukQvaWon` em `READY`, aliasado em `https://mayus-premium-pro.vercel.app`; falta smoke real abrindo o link recebido no WhatsApp.
- [x] Correcao do acesso publico ao Playbook: o link `/playbook/{token}` ja era gerado, mas o middleware global ainda tratava `/playbook` como rota protegida e redirecionava visitantes anonimos para `/login`. A rota `/playbook` foi adicionada em `publicRoutes`, mantendo `/dashboard/mayus/playbooks/{artifactId}` protegido. Validado com `npm.cmd test -- src/lib/mayus/whatsapp-command-runtime.test.ts src/lib/mayus/daily-playbook.test.ts` (7 testes), `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run build` mostrando `/playbook/[token]` dinamica e deploy Vercel `dpl_ARPfsaKcqM72FH4AA5dgoPTtdxPA` em `READY`, aliasado em `https://mayus-premium-pro.vercel.app`; falta smoke real abrir o link recebido no WhatsApp sem login.
- [x] Entrega do Playbook Premium como arquivo HTML anexado implementada: o HTML existente gerado por `daily_playbook` agora e salvo em bucket privado `brain-artifacts` no caminho `{tenantId}/daily_playbook/{artifactId}.html`, com signed URL de 30 dias para o provider baixar o documento. O runtime do comando interno passa a enviar o Playbook como `document` (`mayus-playbook-premium.html`, `text/html`) pelo WhatsApp, com legenda curta e sem depender de dominio/token no texto; `/playbook/{token}` fica apenas como fallback se o upload/anexo falhar. O artifact tambem recebe `storage_url`, `mime_type = text/html` e `metadata.html_file_*` quando o upload funciona. Validado com `npm.cmd test -- src/lib/mayus/whatsapp-command-runtime.test.ts src/lib/mayus/daily-playbook.test.ts src/lib/whatsapp/send-message.test.ts` (14 testes), `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run build`, deploy Vercel `dpl_HL5db8batTuzKgcNbCfKKRUs4hha` em `READY`, aliasado em `https://mayus-premium-pro.vercel.app`; falta smoke real verificar chegada do anexo HTML no WhatsApp.
- [x] Playbook Premium Robusto v1 implementado: o HTML anexado agora usa, alem de CRM e agenda, sinais de WhatsApp (`whatsapp_messages`), processos (`process_tasks`), financeiro (`financials`), vendas (`sales`), alertas de sistema (`system_event_logs`) e status do `office_playbook_profile`. Foram adicionados KPIs de WhatsApps pendentes, prazos juridicos criticos, financeiro vencido, vendas do mes, alertas MAYUS e score operacional; novas secoes no HTML: WhatsApp/front desk, Juridico/processos, Financeiro/recebiveis, Vendas/performance e Saude MAYUS. As queries sao tolerantes a falha para nao bloquear o playbook quando algum modulo ainda nao estiver configurado. Validado com `npm.cmd test -- src/lib/mayus/daily-playbook.test.ts src/lib/mayus/whatsapp-command-runtime.test.ts src/lib/mayus/whatsapp-command-center.test.ts src/lib/whatsapp/send-message.test.ts` (21 testes), `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run build` com warnings preexistentes, deploy Vercel `dpl_4LbpnMNbrM2bKSqh1Si9vuWLuL4z` em `READY`, aliasado em `https://mayus-premium-pro.vercel.app`; falta smoke real verificar o anexo robusto no WhatsApp.
- [~] Correcao de status processual por nome no WhatsApp: detectores agora aceitam `processo/processos/caso/casos do/da/de`, incluindo a frase real `COMO ESTA O PROCESSOS DO MARCIO DA SILVA MACHADO`; a referencia e extraida para busca por nome/titulo no tenant quando o telefone e autorizado, e o Operating Partner recebe `process_status` como intencao deterministica. O `reply-processor` tambem passou a manter pulso de `digitando...` (`composing`) durante processamento agentico longo, e o envio final continua com `humanizeDelivery`. Validado com `npm.cmd test -- src/lib/whatsapp/process-status-context.test.ts src/lib/agent/mayus-operating-partner.test.ts src/lib/whatsapp/reply-processor.test.ts src/lib/whatsapp/send-message.test.ts src/lib/whatsapp/evolution-presence.test.ts src/app/api/evolution-webhook/route.test.ts` (53 testes), `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run build` com warnings preexistentes e deploy Vercel `dpl_7ZFTFUDzgnzngV1MWTYyVWUmheYJ` (`https://mayus-premium-blm3720mx-vitorprocopio30-stars-projects.vercel.app`) em `Ready`, aliasado em `https://mayus-premium-pro.vercel.app`; falta smoke real Evolution confirmando resposta + visual do digitando.
- [~] Recepcao WhatsApp Maya/MAYUS: runtime agora aceita nome configuravel da assistente em `ai_features.whatsapp_agent.assistant_name` ou `office_knowledge_profile.assistant_name` (Dutra pode usar `Maya`), prompt orienta apresentacao breve apenas na primeira resposta, tom simpatico/prestativo, pedido de nome completo/CNJ quando o contato nao for identificado e cuidado para nao assumir que toda conversa e status de processo. Para suporte/outra demanda, o Operating Partner deve pedir o assunto, avisar que vai organizar retorno do advogado responsavel e criar `create_task` com resumo, proximo passo e ideias de encaminhamento. Contatos atribuidos podem receber autoenvio seguro quando nao houver risco e houver tarefa/resposta de suporte ou status verificado, evitando o bloqueio `assigned_contact_blocked` em recepcao segura. Validado com `npm.cmd test -- src/lib/agent/mayus-operating-partner.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts src/lib/whatsapp/process-status-context.test.ts src/lib/agent/mayus-operating-partner-actions.test.ts src/lib/whatsapp/reply-processor.test.ts src/lib/whatsapp/send-message.test.ts src/lib/whatsapp/evolution-presence.test.ts src/app/api/evolution-webhook/route.test.ts` (69 testes), `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run build` com warnings preexistentes e deploy Vercel `dpl_5DpdNcKgkEh7QWq6rdBdVmZ6CUg8` (`https://mayus-premium-obt4qfgje-vitorprocopio30-stars-projects.vercel.app`) em `Ready`, aliasado em `https://mayus-premium-pro.vercel.app`; tenant Dutra `a0000000-0000-0000-0000-000000000001` configurado com `whatsapp_agent.assistant_name = Maya` e `autonomy_mode = auto_respond_assigned`; falta smoke real Evolution com saudacao, processo sem identificacao e outra demanda.
- [~] Correcao pos-smoke Maya: saudacao pura (`Boa noite`, `Bom dia`, `Oi`) agora e normalizada sem retomar processo pelo historico; a primeira resposta apresenta `Maya` e pergunta como ajudar. Se o cliente enviar apenas o nome completo ou `O nome completo e ...` depois de a assistente pedir identificador, o contexto processual trata como continuacao do pedido, extrai a referencia e busca o processo por nome/titulo, inclusive com fallback sem acento (`Márcio` -> `Marcio`), em vez de pedir o mesmo dado de novo. O payload de `sendPresence` Evolution mudou para formato direto `{ number, presence: "composing", delay }`, o delay humanizado minimo subiu para disfarcar melhor o agente e cada presence com Supabase registra evento sanitizado `evolution_presence_sent`. Validado com `npm.cmd test -- src/lib/whatsapp/process-status-context.test.ts src/lib/whatsapp/evolution-presence.test.ts src/lib/whatsapp/send-message.test.ts src/lib/agent/mayus-operating-partner.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts src/lib/whatsapp/reply-processor.test.ts src/app/api/evolution-webhook/route.test.ts` (69 testes), `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run build` com warnings preexistentes e deploy Vercel `dpl_5MKqpyR1PaNaBRNKqiNgH8S6JUV5` (`https://mayus-premium-kkw8q0nmb-vitorprocopio30-stars-projects.vercel.app`) em `Ready`, aliasado em `https://mayus-premium-pro.vercel.app`; falta novo smoke real observando `digitando...` e resposta ao nome completo.
- [~] Correcao pos-smoke 2 Maya/painel WhatsApp: apresentacao da Maya agora considera janela recente (12h) em vez de qualquer apresentacao antiga do historico, evitando suprimir `Aqui e a Maya` em nova sessao; pedido generico como `Gostaria de saber sobre um processo` sem nome/CNJ/CPF e sem contexto verificado e sobrescrito para pedir identificador seguro, impedindo o modelo de reutilizar `Marcio` ou outro nome antigo do historico. A tela `/dashboard/conversas/whatsapp` passou a escutar `INSERT` e `UPDATE`, atualizar/mesclar mensagens recebidas, refazer contatos e usar polling leve a cada 4s + refetch no foco da janela para quando o Realtime perder evento. Validado com `npm.cmd test -- src/lib/agent/mayus-operating-partner.test.ts src/lib/growth/whatsapp-sales-reply-runtime.test.ts src/lib/whatsapp/process-status-context.test.ts src/lib/whatsapp/reply-processor.test.ts src/lib/whatsapp/send-message.test.ts src/lib/whatsapp/evolution-presence.test.ts src/app/api/evolution-webhook/route.test.ts` (70 testes), `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run build` com warnings preexistentes e deploy Vercel `dpl_62cc6Xi2V92vpaNqFFTERhBRAzNq` (`https://mayus-premium-j5kvzxfy5-vitorprocopio30-stars-projects.vercel.app`) em `Ready`, aliasado em `https://mayus-premium-pro.vercel.app`; falta novo smoke real.
- [~] Base de missao agentica processual consolidada para beta: `ProcessMissionContext` canonico em `src/lib/lex/process-mission-context.ts` consolida processo, fase, resumo, pendencias, memoria documental, minuta, fontes, confianca, acao recomendada, objetivo da missao e metodologia operacional do tenant quando existir. Em 2026-05-23, artifacts e approvals juridicos passaram a carregar o envelope beta com `processMissionContext`, `legalOperatorState`, `methodology`, `sources`, `gaps`, `recommendedAction`, `sideEffectGuardrail` e `agentic_governance` para preparar a virada de processos para missoes persistentes sem mudar a resposta externa. Validado com foco Lex/dispatcher/control-plane/typecheck; falta smoke real autenticado com dados do Brain.
- [~] Capability `legal_process_mission_plan` adicionada: o router, registry, prompt de chat e dispatcher agora permitem pedir uma missao agentica supervisionada de processo. O handler usa `getLegalCaseContextSnapshot` + `ProcessMissionContext`, cria artifact `process_mission_plan`, registra learning event `process_mission_plan_created`, retorna confianca, acao recomendada, objetivo, fontes, lacunas, proxima acao segura e motivo de bloqueio/liberacao, e bloqueia side effects externos por padrao. Validado com suite beta focada em 2026-05-23; ainda falta smoke autenticado pelo dashboard com tenant/processo controlado.
- [~] Capability `legal_process_mission_execute_next` adicionada: o router, registry, prompt de chat e dispatcher agora permitem executar o proximo passo seguro de uma missao processual. Nesta fase, `refresh_document_memory` roda automaticamente via `legal_document_memory_refresh` apenas quando a metodologia existente nao exige revisao; baixa confianca bloqueia a missao; e `generate_first_draft` nao chama a Draft Factory diretamente, abrindo approval humano supervisionado para `legal_first_draft_generate` com risco alto, processo, peca sugerida, objetivo, fontes, lacunas, contexto metodologico e motivo OpenClaw. O handler registra artifact `process_mission_step_result` e learning event `process_mission_step_executed`; falta smoke real autenticado em processo controlado antes de marcar como `[x]`.
- [~] Execucao deterministica da missao processual no chat e no Brain adicionada: `/api/ai/chat` agora executa diretamente `legal_process_mission_plan` e `legal_process_mission_execute_next` quando o router local identifica alta confianca sem ambiguidade, antes de depender do LLM chamar ferramenta. O router tambem passou a aceitar `proximo/proxima/acao` com acento e referencia textual como `processo da Maria da Silva`. `executeBrainTurn` propaga `taskId/runId/stepId`, atualiza `brain_tasks`/`brain_runs`/`brain_steps`, registra learning event, artifact `mission_result` quando conclui e `brain_approvals` quando o kernel retorna `awaiting_approval`. Validado em 2026-05-12 pela mesma suite focada Lex/Brain (82 testes), typecheck e build; falta smoke real pelo dashboard com processo controlado.
- [~] Inbox de aprovacoes juridicas supervisionadas enriquecido: `/dashboard/aprovacoes` agora destaca approvals de `legal_first_draft_generate` com processo, peca sugerida, acao proposta, objetivo juridico, motivo da aprovacao, motivo OpenClaw, fontes, lacunas e guardrails de beta que impedem protocolo/envio/publicacao. `/api/ai/approve` foi protegido para nao marcar como executada uma approval que cria nova approval supervisionada aninhada; nesse caso retorna `202 awaiting_approval` e mantem a missao aguardando decisao humana. Validado em suite beta focada e HTTP smoke local; falta confirmar visualmente em smoke autenticado que a nova approval aparece no inbox e que a Draft Factory so roda apos aprovar.
- [~] Coordenacao paralela Metodologia Individual + Juridico/Lex + Agentic Core atualizada em 2026-05-23: `LegalOperatorState` declara a Frente A como dona da missao processual, a Frente 0 como dona da metodologia do tenant e a Frente B como leitora/coordenadora via Paperclip/OpenClaw/Hermes. O Agent Control Plane expoe tres frentes, blockers de colisao, handoff Metodologia -> Lex -> Core, sinal `tenant_methodology`, superficie `legal_decision`, Hermes tenant-only e proximo passo coordenado; Configuracoes > Agente reconstrui `Missao processual Lex` a partir de artifact beta. Validado com testes focados de Lex, dispatcher e Control Plane; falta smoke visual autenticado nas superficies de supervisao.
- [x] Corte Beta Juridico + WhatsApp Agentic fechado em 2026-05-23: o router envia "monte a peca desse processo" para `legal_process_mission_plan`; `legal_process_mission_execute_next` abre approval `legal_first_draft_generate` sem chamar Draft Factory direto; approvals carregam `piece_context`, documentos, lacunas, checklist da minuta, guardrails e motivo OpenClaw; o WhatsApp Operating Partner classifica conversas em comercial/suporte/status/documentos/cobranca/comando/incerto e persiste `conversation_classification`, Paperclip, OpenClaw e Hermes no metadata/evento/rascunho. Validado com 159 testes focados, `npx.cmd tsc --noEmit --pretty false`, `git diff --check` nos arquivos do corte e HTTP smoke local de `/dashboard/aprovacoes` e `/dashboard/conversas/whatsapp`.
- [~] Smoke beta autenticado pendente: falta provar com tenant/processo controlado que Chat cria `process_mission_plan`, aprovar aciona apenas minuta interna da Draft Factory, e Evolution/WhatsApp real mostra resposta curta + rastro agentic. Nesta sessao, Configuracoes > Agente passou smoke real autenticado via API e o card de Aprovações passou smoke visual com fixture controlada; seguem pendentes o Chat/Lex ponta a ponta real e Evolution/WhatsApp real com canal controlado.
- [~] Tentativa de prova beta real em 2026-05-23: `npx.cmd vitest` focado passou com 159 testes e `npx.cmd tsc --noEmit --pretty false` passou; o HTTP smoke de `/dashboard/mayus`, `/dashboard/aprovacoes`, `/dashboard/conversas/whatsapp` e `/dashboard/configuracoes/agente` em dev server local retornou timeout, e `e2e/lex-approval-smoke.spec.ts` com `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001` tambem estourou timeout. Classificacao: bloqueio de ambiente/dev-server local antes de servir HTTP, nao bug comprovado do fluxo beta. Evolution/WhatsApp real segue bloqueado por ausencia de `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE` visiveis nesta sessao.
- [~] Case Brain 2.0 inicial implementado: nova capability `legal_case_brain_insights` gera cronologia estruturada, mapa de riscos, contradicoes/divergencias, fatos documentados, inferencias, hipoteses, proximos atos provaveis e lacunas de grounding sem side effects externos. O router, registry, prompt do chat, dispatcher e highlight do MAYUS foram conectados; a execucao cria artifact `legal_case_brain_insights` e learning event `legal_case_brain_insights_created`. Atualizacao: o dispatcher agora carrega evidencias reais tolerantes a falha de `process_documents`, `process_document_contents`, `process_movimentacoes` e `process_movimentacoes_inbox`, usando documentos extraidos, documentos sem extracao, arquivos fora da estrutura e movimentacoes que exigem acao para enriquecer cronologia, riscos, fatos e proximos atos. Atualizacao operacional: `legal_process_mission_execute_next` passou a consultar o Case Brain 2.0 antes de executar, bloqueando contradicao critica, movimentacao que exige acao e risco alto nao compativel com simples refresh documental; aprovacoes de minuta carregam contadores de risco/contradicao do Case Brain. Validado com `npm.cmd test -- src/lib/lex/case-brain-insights.test.ts src/lib/agent/capabilities/dispatcher.test.ts src/lib/agent/kernel/router.test.ts src/app/api/ai/chat/route.test.ts` (80 testes) e `npx.cmd tsc --noEmit --pretty false`; falta smoke autenticado com processo controlado e dados reais para marcar como `[x]`.
- [~] Corte Hermes + Agentes Publicos atualizado em 2026-05-23: Mission Control/Control Plane mostram avaliacao Hermes de completude minima, eventos faltantes, approval/lifecycle/memoria, metodologia tenant-only e proxima acao segura; Configuracoes > Agente mostra matriz `publicAgents` com Paperclip, OpenClaw e Hermes como primitivas internas e reconstrucao de missao processual Lex; Aprovacoes consome Mission Control/OpenClaw sem autoaprovar acao sensivel. Mantem `[~]` porque smoke com dados reais do Brain ainda depende de schema/ambiente real.
- [~] Frentes Agentes Publicos + Juridico/Lex integradas em 2026-05-26: `publicAgents` ganhou estado operacional por primitiva com status `working`/`awaiting_approval`/`blocked`/`needs_attention`/`read_only`, cobertura de modulos, ultimo sinal vivo, approvals, bloqueios, lacunas e proxima acao segura em Configuracoes > Agente. `ProcessMissionContext` passou a carregar `legalDuty` (polo representado, obrigacao, confianca, evidencias e lacunas), `LegalOperatorState` expoe esse bloco no resumo probatorio, e o envelope beta de approval juridico inclui `paperclipOwner`, OpenClaw, Hermes, fontes, gaps, motivo OpenClaw, trajectory e guardrail antes da Draft Factory. `/dashboard/aprovacoes` mostra Paperclip, Hermes e polo/obrigacao no card de `legal_first_draft_generate`. Validado com suites focadas de control-plane/dispatcher/router (91 testes), Lex/chat/approve (20 testes), rotinas (9 testes), `npx.cmd tsc --noEmit --pretty false` e `git diff --check` nos arquivos tocados; smoke HTTP local no dev server registrou `200` para `/dashboard/configuracoes/agente`, `/dashboard/aprovacoes`, `/dashboard/mayus` e `/dashboard/conversas/whatsapp`. Falta smoke visual autenticado com dados vivos antes de marcar como `[x]`.

Bloqueios antes de marcar como `[x]`:

- [x] Autenticacao e autorizacao de `/api/whatsapp/send`.
- [x] Bucket privado/signed URLs para midia juridica.
- [x] Processamento de midia fora dos webhooks.
- [x] Idempotencia de mensagem inbound.
- [~] Smoke real Meta Cloud/Evolution com texto, imagem, audio e documento: Evolution validou texto imediato para contracheque, texto fechado anterior e multimodal anterior; ACK de midia e recuperacao de locks foram deployados, falta repetir smoke privado fechado com PDF novo e Meta Cloud.
- [ ] Smoke real Meta Cloud ainda pendente; Evolution passou para texto, imagem, audio, PDF/DOCX e outbound texto.
- [~] Observabilidade de midia e resposta existe no processor, painel admin, notificacoes de falha e eventos sanitizados; locks antigos foram zerados, mas ainda falta smoke Meta Cloud, smoke privado fechado de ACK de midia e confirmar execucao automatica agendada do scheduler.
- [x] Aplicar migration `20260504120000_whatsapp_media_labels.sql` antes do smoke real.
- [x] Confirmar `CRON_SECRET` efetivo do projeto Vercel usado no smoke ou atualizar `.env.local`/Vercel para ficarem alinhados.
- [~] Observacao 2026-05-08: chamadas manuais locais para `/api/whatsapp/replies/process` e `/api/whatsapp/media/process` em producao retornaram `403`, apesar de `CRON_SECRET` existir no Vercel. Scheduler GitHub pode continuar valido, mas o secret local nao deve ser usado como evidencia de processor manual ate realinhar/confirmar o valor sem expor segredo.

Observacoes operacionais:

- [x] Deploy do commit `571351a` falhou no Vercel porque cron `*/5 * * * *` excedia limite Hobby; ajustado para diario em commit posterior.
- [x] Scheduler externo versionado em GitHub Actions chama `/api/whatsapp/media/process` e `/api/whatsapp/replies/process` a cada 5 minutos com `CRON_SECRET` em GitHub Secret; cron Vercel diario fica como fallback.
- [x] Workflow manual `WhatsApp processors` executou com sucesso no GitHub Actions no commit `0f50e60`, validando o scheduler e o secret sem expor `CRON_SECRET`.
- [ ] Se o projeto migrar para Vercel Pro, considerar voltar processors WhatsApp para frequencia de 5 minutos ou substituir por fila externa.

---

## 7. Documentos Historicos

Use estes arquivos apenas como detalhe tecnico, historico de rollout ou evidencia antiga:

- `docs/brain/MAYUS_AGENTIC_EXECUTION_CHECKLIST.md`
- `docs/brain/MAYUS_MASTER_BLUEPRINT.md`
- `docs/checklists/**/CHECKLIST.md`
- `docs/tracking/progress.md`
- `docs/brain/IMPLEMENTATION-PLAN-*.md`

Toda nova sessao de produto/roadmap deve comecar por este documento.
