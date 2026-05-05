# MAYUS 100 Percent Final Checklist

Fonte oficial atual para decidir o que falta para o MAYUS chegar a 100%.

Atualizado em: 2026-05-05

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
| MAYUS geral | 74% | Produto forte, WhatsApp multimodal, observabilidade, alertas e fila de resposta evoluiram, mas ainda nao e o socio virtual completo. |
| Produto juridico/base SaaS | 78% | Dashboard, CRM, documentos, juridico, agenda, marketing e permissoes ja existem. |
| Maturidade agentica | 52% | Ha runtime, artifacts, skills e auditoria, mas ainda falta um operador central continuo. |
| WhatsApp vendas/suporte | 82% | Evolution passou smoke real multimodal, ganhou observabilidade, painel, alertas e resposta assincrona; falta Meta Cloud, scheduler frequente e conversas longas. |
| Growth/vendas | 70% | Intake, qualificacao, follow-up, reativacao e sales profile existem; falta fechar execucao real ponta a ponta. |
| Juridico/Lex | 82% | Base juridica e documental esta forte; faltam contradicoes, cronologia, riscos e mais automacao segura. |
| Financeiro | 48% | Asaas/fluxo planejado existem, mas cobranca operacional completa ainda precisa smoke e UX. |
| Auto-configuracao | 45% | Setup Doctor e sales profile existem; falta onboarding completo do escritorio. |
| UX sem curso | 60% | WhatsApp ganhou controles melhores, mas o usuario ainda precisa entender demais o sistema. |
| Integracoes e operacao real | 68% | WhatsApp Evolution tem smoke, observabilidade, alerta de falha e job assincrono; faltam Meta Cloud, scheduler frequente e smokes sensiveis finais. |

### O que ja e usavel

- [x] Dashboard operacional com modulos principais.
- [x] CRM e Growth com artifacts, proximo passo e planos supervisionados.
- [x] WhatsApp com atendimento supervisionado e resposta MAYUS no composer.
- [~] WhatsApp multimodal com preview de imagem/audio/video/documento, leitura/transcricao parcial e etiqueta editavel por contato.
- [x] Suporte de status de caso com resposta segura, artifact e handoff.
- [x] Document Brain, Draft Factory, publicacao, export e learning loop juridico.
- [x] Auto Setup Doctor inicial com artifact e defaults seguros.
- [x] Marketing OS com perfil, referencias, calendario, aprovados e copy supervisionada.
- [x] Auditoria e eventos em `agent_audit_logs` / `system_event_logs` em varios fluxos.

### O que ainda impede o 100%

- [ ] MAYUS Operating Partner ainda nao domina todos os modulos como motor unico.
- [ ] WhatsApp ainda precisa se comportar como vendedor/suporte real em conversas longas.
- [ ] WhatsApp multimodal ainda precisa smoke real Meta Cloud, scheduler frequente e validacao em conversa longa.
- [ ] Acoes reais supervisionadas ainda nao cobrem todo o ciclo CRM -> contrato -> cobranca -> caso.
- [ ] Auto-configuracao ainda nao cobre juridico, documentos, equipe, permissoes, agenda, financeiro e playbooks.
- [ ] Memoria e aprendizado ainda nao governam a proxima decisao em todos os fluxos.
- [ ] Smokes reais de integracoes sensiveis ainda faltam para producao confiavel.
- [ ] Experiencia ainda tem inconsistencias visuais e operacionais entre modulos.

---

## 2. Tese do Produto

O MAYUS nao deve ser apenas um software juridico com IA. O produto final e um `Revenue-to-Case OS`: um socio operacional de IA que conecta captacao, atendimento, venda, contrato, cobranca, abertura do caso, execucao juridica, comunicacao com cliente, documentos, agenda, metricas e aprendizado.

Frase mae:

**Para o advogado iniciante, o MAYUS e a estrutura que ele ainda nao tem. Para o escritorio grande, e o controle que ele esta perdendo.**

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
- [ ] Fazer o Operating Partner ser o motor padrao de decisao nos modulos criticos.
- [ ] Criar estado de missao reconstruivel: objetivo, contexto, etapa, ferramentas usadas, bloqueios, fontes e proxima acao.
- [ ] Criar streaming/status incremental de missao na UI.
- [ ] Criar retry/cancelamento por step com motivo e ator.
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
- [~] Webhooks Meta/Evolution preparam resposta em background, mas envio real segue supervisionado.
- [~] Fallback deterministico foi endurecido, mas o caminho normal deve ser agente conversacional real.
- [~] Reconstruir estado conversacional por contato: fase, fatos, objecoes, urgencia, documentos, decisor, suporte e proxima acao.
- [ ] Conduzir lead multi-turn ate fechamento humano/comercial sem discurso generico.
- [ ] Separar lead novo, cliente atual, suporte, status de processo, cobranca e pergunta fora de escopo.
- [~] Autoenviar somente quando confianca, risco e politica permitirem; ainda falta smoke real e revisao de politica por tenant.
- [~] Registrar por resposta: fonte, modelo, fase, confianca, risco, proxima acao e resultado esperado.
- [x] Proteger `POST /api/whatsapp/send` com autenticacao, sessao e validacao de tenant/contact.
- [x] Trocar `whatsapp-media` de publico para privado com signed URLs ou rota proxy autenticada.
- [x] Processar download, OCR/visao, transcricao e extracao documental fora do webhook para evitar timeout/reenvio.
- [x] Se o download de midia Meta falhar, salvar `media_url = null` e manter o ID apenas em metadata.
- [x] Criar idempotencia por `tenant_id` + `message_id_from_evolution` antes de inserir mensagem.
- [x] Ignorar ou tratar `messages.update` da Evolution como atualizacao de status, nao como nova mensagem.
- [ ] Validar com conversas reais de venda, suporte, objecao, fechamento e cliente irritado/confuso.
- [ ] Smoke real com texto, imagem, audio, PDF/DOCX e envio manual em Meta Cloud e Evolution.

### 3.3 CRM e Growth

- [x] `lead_intake`, referral intake, qualificacao, follow-up, agendamento e reativacao existem como skills/artifacts.
- [x] CRM identifica lead sem proximo passo e o MAYUS organiza canal, horario, responsavel, objetivo e checklist.
- [x] Sales profile setup auto-configura cliente ideal, solucao, PUV, pilares e anti-cliente.
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
- [ ] Preparar cobranca com valor, vencimento, descricao e aprovacao.
- [ ] Confirmar pagamento e abrir caso juridico com checklist documental.
- [ ] Registrar artifact unico do ciclo revenue-to-case.
- [ ] Rodar smoke real em ambiente controlado para ZapSign, Asaas e abertura de caso.

### 3.5 Juridico / Lex Brain

- [x] Contexto juridico do processo por chat.
- [x] Primeira minuta, retry, historico formal, aprovacao, publicacao, Word e PDF.
- [x] Revisao juridica orientada e learning loop capture.
- [x] Support case status cobre andamento, fase, proximo passo, pendencias, inferencias e handoff.
- [~] Mapa de teses e auditor ainda estao parciais.
- [ ] Timeline estruturada do caso.
- [ ] Mapa de riscos e proximos atos provaveis.
- [ ] Apontar contradicoes nos documentos e na narrativa.
- [ ] Gerar cronologia do caso.
- [ ] Promover padroes aprovados para memoria institucional supervisionada.
- [ ] Protocolo externo nunca executa sem aprovacao humana.

### 3.6 Documentos / Drive

- [x] Repositorio de documentos, pasta por processo, subpastas, listagem e sincronizacao.
- [x] Leitura de PDFs/DOCX, classificacao, resumo incremental e memoria documental.
- [x] Memoria documental entra no chat e na geracao de pecas.
- [~] Drive Scanner tem base forte, mas depende de revisao/aprovacao para movimentos reais.
- [ ] Apontar documentos contraditorios, duplicados, antigos ou fora do processo.
- [ ] Criar cronologia documental.
- [ ] Organizar Drive legado com fila auditavel de revisao e revert seguro.
- [ ] Criar estrutura documental padrao por area e tipo de processo via auto-configuracao.

### 3.7 Financeiro

- [x] Skill de cobranca Asaas existe.
- [x] Cobranca sensivel exige aprovacao humana.
- [~] Webhook Asaas e logs existem em parte, mas faltam smokes reais e artifacts completos.
- [ ] Comando "Mayus, cobre a entrada do cliente X" encontra contexto, monta cobranca, pede aprovacao e registra artifact.
- [ ] Validar valor, vencimento, descricao, contrato/aceite e risco antes de aprovacao.
- [ ] Registrar artifact de cobranca com link, status, vencimento e responsavel.
- [ ] Conectar pagamento confirmado a abertura/execucao do caso.
- [ ] Criar forecast por funil, proposta, contrato, cobranca e inadimplencia.
- [ ] Mostrar risco financeiro por tenant e por cliente.

### 3.8 Marketing

- [x] Marketing OS, perfil/canais, referencias, calendario, kanban e aprovados existem.
- [x] Copy juridica responsavel por canal existe com guardrails eticos.
- [x] Conteudos aprovados podem gerar rascunho final supervisionado.
- [x] Marketing pode criar tarefa interna quando fizer sentido.
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
- [~] Doctor identifica perfil comercial incompleto e orienta acao humana.
- [ ] Onboarding conversacional completo: areas, equipe, tom, permissoes, objetivos e rotina.
- [ ] Pipeline juridico padrao por area de atuacao e objetivo do escritorio.
- [ ] Estrutura documental padrao por area/tipo de processo.
- [ ] Playbooks de atendimento, marketing, agenda e cobranca sugeridos pelo MAYUS.
- [ ] Score de prontidao do escritorio com proximo melhor passo.
- [ ] Aprovar/rejeitar configuracoes sugeridas em lote.

### 3.10 Memoria e aprendizado

- [x] Memoria institucional entra no prompt do chat.
- [x] Learning events existem para varios artifacts.
- [x] Delta entre minuta e artifact final ja e capturado em parte.
- [~] Aprendizado ainda nao governa todas as proximas decisoes.
- [ ] Memoria por usuario com consentimento e revogacao.
- [ ] Memoria procedural para passos recorrentes.
- [ ] Memoria de falhas para evitar erro repetido.
- [ ] Registrar origem, confianca, escopo e motivo de cada memoria.
- [ ] Promocao supervisionada: sugestao -> aprovacao -> ativa.
- [ ] Aprender com lead ganho/perdido, objecao, suporte, peca aprovada e cobranca.

### 3.11 Governanca e aprovacoes

- [x] Skills sensiveis ja entram em aprovacao em partes do runtime.
- [x] Side effects externos ficam bloqueados em varios planos/artifacts.
- [x] Eventos e artifacts carregam fontes e sinais em fluxos importantes.
- [~] Runtime WhatsApp agora exige `enabled: true` explicito para ativar LLM/MAYUS e bloqueia side effects CRM/tarefa abaixo de `auto_execute`.
- [~] Politicas por risco ainda nao estao uniformes em todos os modulos.
- [ ] Nenhuma rota server-side de envio externo pode aceitar `tenant_id` do body sem autenticar sessao e conferir permissao.
- [ ] Buckets com dados juridicos/WhatsApp devem ser privados por padrao; acesso por signed URL/proxy autenticado.
- [ ] Separar politicas por risco: low, medium, high, critical.
- [ ] Bloquear critical sem aprovador executivo e MFA/sessao recente.
- [ ] Registrar motivo de rejeicao de approval.
- [ ] Criar budget por tenant, skill e dia.
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
- [ ] Exibir feedback operacional claro no MAYUSOrb.

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
- [x] Tirar preparacao pesada de resposta de texto do webhook e enfileirar para processamento interno protegido.
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

- [ ] Onboarding conversacional do escritorio.
- [ ] Defaults por area juridica.
- [ ] Playbooks de atendimento, marketing, agenda, documentos e financeiro.
- [ ] Score de prontidao por modulo.
- [ ] Aprovar/rejeitar sugestoes em lote.

### Fase 4 - Subir de 92% para 97%

Foco: memoria, aprendizado e governanca.

- [ ] Memorias por usuario, procedimento, falha e padrao institucional.
- [ ] Promocao supervisionada de memoria.
- [ ] Health por skill, custo e fallback.
- [ ] Politicas de risco e aprovacao uniformes.
- [ ] Dashboard de missoes e observabilidade.

### Fase 5 - Subir de 97% para 100%

Foco: voz, deploy, validacao real e acabamento.

- [ ] MAYUSOrb como canal real do mesmo Brain.
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
- [x] Deploy correto `mayus-premium-pro` do commit `3ea6b7d` ficou `READY/PROMOTED`; rotas protegidas retornaram `403` sem segredo, processor de midia retornou `picked: 0` e processor de respostas retornou `picked: 0` com `CRON_SECRET` de producao sem expor o valor.

Bloqueios antes de marcar como `[x]`:

- [x] Autenticacao e autorizacao de `/api/whatsapp/send`.
- [x] Bucket privado/signed URLs para midia juridica.
- [x] Processamento de midia fora dos webhooks.
- [x] Idempotencia de mensagem inbound.
- [ ] Smoke real Meta Cloud/Evolution com texto, imagem, audio e documento.
- [ ] Smoke real Meta Cloud ainda pendente; Evolution passou para texto, imagem, audio, PDF/DOCX e outbound texto.
- [~] Observabilidade de midia e resposta existe no processor, painel admin e notificacoes de falha; ainda falta smoke Meta Cloud e scheduler frequente.
- [x] Aplicar migration `20260504120000_whatsapp_media_labels.sql` antes do smoke real.
- [x] Confirmar `CRON_SECRET` efetivo do projeto Vercel usado no smoke ou atualizar `.env.local`/Vercel para ficarem alinhados.

Observacoes operacionais:

- [x] Deploy do commit `571351a` falhou no Vercel porque cron `*/5 * * * *` excedia limite Hobby; ajustado para diario em commit posterior.
- [ ] No plano Hobby, configurar scheduler externo seguro para chamar `/api/whatsapp/media/process` e `/api/whatsapp/replies/process` a cada 1-5 minutos com `CRON_SECRET`; cron Vercel diario fica como fallback.
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
