# Plano Mestre do Beta Agentico MAYUS

Atualizado em: 2026-05-19

## Direcao do Produto

O MAYUS e o sistema operacional do escritorio juridico brasileiro AI First.

O beta nao e um chatbot generico e tambem nao e autonomia total sem supervisao. O beta e um socio operacional juridico supervisionado que configura o escritorio, organiza o trabalho, cria artifacts, pede aprovacao, executa acoes internas seguras e aprende com revisao humana.

O objeto central do produto e o MAYUS Operating Partner. Agentes especializados sao frentes internas que servem ao Operating Partner, nao produtos separados.

O loop oficial de melhoria do beta e `Observa -> Aprende -> Corrige -> Aplica`: eventos reais alimentam aprendizado supervisionado, padroes repetidos geram proposta de memoria/correcao, e somente correcoes de baixo risco podem ser aplicadas antes de efeito externo. Correcao juridica, financeira, operacional sensivel ou externa continua virando aprovacao, bloqueio ou artifact supervisionado. Em 2026-05-19, o ciclo de auto-correcao passou smoke autenticado real na tela de Memoria: 3 eventos `self_correction_failed` -> rotina `mayus-self-improvement-review` -> proposta `self_improvement_loop` -> aprovacao humana -> entrada `office_institutional_memory.enforced=true`, com cleanup.

## Aproveitamento de Codigo de Agentes Publicos

Esta nao e uma frente apenas de inspiracao. O MAYUS vai extrair primitivas comprovadas de agentes publicos, adaptar essas primitivas ao Operating Partner juridico supervisionado e rejeitar explicitamente qualquer coisa que quebre isolamento de tenant, LGPD, BYOK, auditabilidade ou aprovacao humana.

Regras de adocao:

- Paperclip e a principal base para operar agentes como uma organizacao.
- OpenClaw e a referencia de seguranca, configuracao e politica.
- Hermes e a referencia de memoria, skills, scheduler e aprendizado.
- Nao importar runtimes terceiros inteiros.
- Nao copiar codigo antes de verificar licenca, atribuicao, encaixe de runtime e premissas de tratamento de segredos.
- Nao trazer runtime de shell/dispositivo, armazenadores locais de credenciais, autonomia irrestrita, segredos crus em prompts ou side effects externos sem auditoria para dentro do MAYUS.

### Paperclip

Fonte: https://github.com/paperclipai/paperclip

Usar primeiro. O Paperclip e o mais proximo do que o MAYUS precisa para operar uma empresa de agentes:

- governanca e aprovacoes
- politicas de budget e travas duras
- heartbeat runs e rotinas recorrentes
- log de atividade e trilhas de auditoria
- portabilidade de agente/empresa com remocao de segredos
- modelo de trabalho/tarefa com bloqueios e ownership

Adaptacao para o MAYUS:

- mapear conceitos de governanca do Paperclip para `brain_tasks`, `brain_runs`, `brain_steps`, `brain_artifacts`, `brain_approvals`, `learning_events` e `tenant_settings.ai_features`.
- manter Supabase e isolamento de tenant como fonte da verdade.
- nao importar o runtime inteiro.

### OpenClaw

Fonte: https://github.com/openclaw/openclaw
Documento de referencia: https://github.com/openclaw/openclaw/blob/main/docs/tools/multi-agent-sandbox-tools.md

Usar seletivamente para configuracao e guardrails:

- perfis de agente
- politica allow/deny de ferramentas
- validacao de schema de configuracao
- referencias a segredos
- padroes de aprovacao de execucao
- modelo mental de sandbox

Regra de rejeicao no MAYUS:

- nao importar runtime local de shell/dispositivo/mobile.
- nao permitir exposicao de segredos crus em prompts ou telas de configuracao.
- acoes externas continuam travadas por aprovacoes MAYUS.

### Hermes Agent

Fonte: https://github.com/NousResearch/hermes-agent

Usar por porte seletivo para TypeScript:

- gerenciador de memoria
- motor de contexto
- ciclo de vida de skills
- doctor/health checks
- scheduler
- trajetoria e loop de aprendizado

Adaptacao para o MAYUS:

- promocao de memoria precisa ser supervisionada.
- limites de tenant e LGPD vencem qualquer autoaperfeicoamento.
- skills viram procedimentos operacionais com dono, escopo, confianca e revogacao.

## Matriz de Extracao de Agentes Publicos

| Fonte | Primitiva upstream | O que o MAYUS extrai | Alvo no MAYUS | Status de implementacao | Frente dona | Rejeitar / nao copiar |
| --- | --- | --- | --- | --- | --- | --- |
| Paperclip | Governanca e aprovacoes | Etapas de aprovacao em estilo board, motivo de aprovacao, decisao do revisor, semantica de pausar/retomar/encerrar e trava antes de execucao sensivel. | `brain_approvals`, politica do executor agentico, `/dashboard/aprovacoes`, `system_event_logs`. | `[~]` Politica e filtros de aprovacao existem; smoke do centro de aprovacoes e motivos completos de rejeicao ainda pendentes. | Paperclip Extraction Agent + MAYUS Integrator | Nao copiar UX generica de board corporativo que esconda risco juridico ou permissoes de tenant. |
| Paperclip | Politicas de budget e travas duras | Politica compartilhada de custo, limite de alerta, trava mensal dura, evento de custo e motivo de bloqueio antes de acao paga. | Politica de budget do Escavador, futuros budgets de modelo/ferramenta em `tenant_settings.ai_features`, eventos de custo. | `[~]` Rotas pagas do Escavador estao protegidas por budget em codigo/testes; smoke real e budgets por skill/dia pendentes. | Paperclip Extraction Agent + Monitoring Agent | Nao gastar creditos de provider automaticamente nem expor API keys em contexto de budget. |
| Paperclip | Heartbeat runs | Contrato de wakeup: identidade do agente, papel, missao, budget, bloqueios, approval id e proxima acao. | `brain_tasks`, `brain_runs`, `brain_steps`, wakeups de rotina, daily office run. | `[~]` `runMayusRoutineHeartbeat` cria missoes internas reconstruiveis com artifact/event/trajectory; rota/workflow do scheduler estao versionados localmente, Configuracoes > Agente passou smoke real de API e existe verificador dry-run, mas rota/workflow ainda nao estao no alias publico. | Paperclip Extraction Agent | Nao criar agentes de fundo escondidos sem historico visivel de missao/run. |
| Paperclip | Rotinas e agendas | Rotinas recorrentes que criam trabalho rastreado e acordam o agente responsavel. | Rotinas do escritorio para financeiro, follow-up CRM, revisao Escavador, prazos e daily playbook. | `[~]` `/api/agent/routines` suporta agendamento global com `CRON_SECRET` a partir de tenant settings habilitados e pula rotinas nao vencidas/manuais; `npm run verify:agent-routines` classifica o alias publico atual como rota nao deployada, entao a observacao real do workflow ainda esta pendente. | Paperclip Extraction Agent + MAYUS Integrator | Nao criar trabalho apenas por cron sem artifact, dono, budget e trilha de auditoria. |
| Paperclip | Log de atividade e ownership | Atividade duravel para acoes mutantes, comentarios, produto de trabalho, bloqueio, dono e proximo passo. | `system_event_logs`, `learning_events`, timeline de missao, dashboard "MAYUS organizou". | `[~]` Eventos/artifacts existem em varios fluxos; Inbox do Brain agora rotula auto-correcao, self-improvement e repair patterns no feed canonico e oferece filtro `Correcoes MAYUS`; timeline unificada de atividade ainda pendente. | Paperclip Extraction Agent + MAYUS Integrator | Nao manter trabalho importante do agente apenas em texto de chat ou console log. |
| Paperclip | Portabilidade da empresa | Exportar/importar configuracao da organizacao com remocao de segredos e tratamento de colisoes. | Pacote de portabilidade do tenant: settings, agentes, skills, playbooks, rotinas e memorias sem segredos. | `[ ]` Nao implementado. | Paperclip Extraction Agent | Nao exportar credenciais cruas, PII de cliente por padrao ou documentos juridicos sem revisao. |
| OpenClaw | Perfis de agente | Perfil por agente com papel, workspace/escopo, superficie de ferramenta, modo de autonomia e canal. | `mayus_agentic_policy`, autonomia por modulo, frentes internas: Setup, Legal, Monitoring, Client Service, Growth, Finance. | `[~]` Politica basica existe; schema completo de perfis e UI/debug ainda pendentes. | OpenClaw Extraction Agent + MAYUS Integrator | Nao criar produtos/agentes separados que contornem o Operating Partner. |
| OpenClaw | Precedencia allow/deny de ferramentas | Cadeia restritiva de politica: global, tenant, modulo, agente, ferramenta e canal; cada nivel so pode restringir. | `decideMayusAutonomy`, helper de politica do tenant, gates de aprovacao/budget. | `[~]` Executor usa politica; matriz formal de precedencia e debugger de motivo bloqueado pendentes. | OpenClaw Extraction Agent | Nao permitir que configuracao de nivel inferior recupere permissao negada em nivel superior. |
| OpenClaw | Modelo mental de sandbox | Pensar em superficies delimitadas: leitura/escrita interna, mensagem externa, financeiro, decisao juridica, permissao, publicacao, busca paga. | Superficies de politica MAYUS e classificacao de risco. | `[~]` Classificacao de superficie existe; todas as ferramentas ainda precisam de mapeamento completo. | OpenClaw Extraction Agent | Nao importar runtime de desktop/shell/dispositivo para dentro do SaaS MAYUS. |
| OpenClaw | Referencias a segredos | Guardar referencia/status/saude do provider, nunca segredos crus em prompts, UI, logs ou artifacts. | Status BYOK, saude de integracoes, `requireTenantApiKey`, Setup Doctor redigido. | `[~]` Varios fluxos estao redigidos; schema global de referencia de segredos pendente. | OpenClaw Extraction Agent | Nao copiar armazenamento local de perfil auth ou tokens OAuth entre agentes. |
| OpenClaw | Validacao de configuracao e Doctor | Falhar de forma clara quando ferramenta/perfil obrigatorio estiver ausente; explicar por que bloqueou e como corrigir. | Auto Setup Doctor, debugger de politica, modulos de readiness. | `[~]` Doctor/readiness existe; UX completa de debug de politica/ferramenta ainda falta. | OpenClaw Extraction Agent + Setup Agent | Nao degradar silenciosamente uma ferramenta ausente para comportamento apenas textual. |
| Hermes | Gerenciador de memoria | Memoria persistente com origem, confianca, escopo, revogacao e promocao supervisionada. | `brain_memories`, propostas de memoria, Configuracoes > Memoria. | `[~]` Fluxo de proposta/aprovacao de memoria, painel de auto-correcao e revisao manual de self-improvement existem; smoke real autenticado validou proposta gerada por `self_correction_failed` virando memoria institucional enforced. Uso cross-module ainda pendente. | Hermes Extraction Agent + MAYUS Integrator | Nao deixar autoaperfeicoamento escrever verdade automaticamente. |
| Hermes | Skills procedurais e ciclo de vida | Skills como memoria operacional de "como fazer": criar, versionar, testar, aprovar, revogar e promover. | Registry de skills MAYUS, playbooks do escritorio, procedimentos juridicos/financeiros/CRM. | `[~]` Helpers de lifecycle constroem payloads persistiveis de memoria/aprendizado sem autoaprovacao, e `POST /api/agent/memory` cria propostas supervisionadas de lifecycle Hermes em `brain_memories` e `learning_events`; smoke autenticado de tenant com cleanup passou. | Hermes Extraction Agent | Nao instalar skills terceiros sem revisao na execucao do tenant. |
| Hermes | Doctor/setup | Wizard de setup e health checks que configuram providers, ferramentas, canais e comportamento do workspace. | Auto-Configuracao AI First, conversa de setup, readiness. | `[~]` Doctor/readiness/conversa de setup existem, e `office_setup_conversation` roda pelo caminho deterministico do Chat MAYUS para onboarding confirmado, com permissoes, agenda, politica financeira, notas de playbook e `practice_area_playbooks` para defaults de pipeline/documentos por area; smoke autenticado com backend real e cleanup passou, enquanto a validacao completa por area/equipe ainda esta pendente. | Hermes Extraction Agent + Setup Agent | Nao expor segredos nem exigir conhecimento tecnico do dono no onboarding. |
| Hermes | Scheduler | Automacoes agendadas em linguagem natural entregues ao canal certo. | Rotinas/heartbeat para operacoes do escritorio, checagem de prazos, follow-ups e revisao financeira. | `[~]` Endpoint unificado de scheduler de rotinas existe e e invocado pelo workflow local de processors do GitHub Actions; verificador dry-run existe; prova de workflow manual/producao continua pendente ate deploy/merge. | Hermes Extraction Agent + Paperclip Extraction Agent | Nao rodar acoes sensiveis sem politica/aprovacao. |
| Hermes | Trajetoria e loop de aprendizado | Guardar trajetoria de missao, licoes comprimiveis, falhas e procedimentos bem-sucedidos. | `brain_steps`, `learning_events`, futuro conjunto supervisionado de treino/avaliacao. | `[~]` Helpers de trajetoria existem e routine heartbeat carrega Hermes trajectory; uso de avaliacao cross-module ainda pendente. | Hermes Extraction Agent | Nao tratar trajetoria como conselho juridico visivel ao cliente ou fato final. |
| Hermes | Continuidade multicanal | Mesma memoria/contexto do agente entre CLI, chat, WhatsApp e outros canais. | Operating Partner em dashboard, chat, WhatsApp e futura voz. | `[~]` WhatsApp/chat compartilham partes do contexto; continuidade unificada de canais pendente. | Hermes Extraction Agent + Client Service Agent | Nao deixar um canal contornar aprovacoes, escopo de tenant ou consentimento do usuario. |

## Frentes Paralelas de Extracao

- `Paperclip Extraction Agent`: extrair governanca, aprovacoes, travas de budget, heartbeat runs, rotinas, log de atividade, ownership de trabalho e portabilidade de empresa/tenant.
- `OpenClaw Extraction Agent`: extrair schema de politica de ferramentas, precedencia allow/deny, perfis por agente, modelo mental de sandbox, motivos de bloqueio, validacao segura de configuracao e referencias a segredos.
- `Hermes Extraction Agent`: extrair gerenciador de memoria, skills procedurais, ciclo de vida de skills, setup doctor, scheduler, trajetoria/loop de aprendizado e continuidade multicanal.
- `MAYUS Integrator`: conectar primitivas extraidas ao Operating Partner, `brain_tasks`, `brain_runs`, `brain_steps`, `brain_artifacts`, `brain_approvals`, `learning_events`, Configuracoes, Aprovacoes e Doctor.

## Arquitetura-Alvo

Agente principal:

- `MAYUS Operating Partner`

Frentes internas:

- `Setup Agent`: auto-configuracao, readiness, defaults e perguntas pendentes.
- `Legal Operations Agent`: prazos, contexto de caso, documentos, minutas e revisoes.
- `Monitoring Agent`: Escavador, eventos, politica de busca paga e controle de custo.
- `Client Service Agent`: WhatsApp, pedidos de status, handoff e suporte.
- `Growth Agent`: leads, CRM, follow-up e playbooks comerciais.
- `Finance Agent`: preparacao de cobranca, margem, recebiveis e forecast.

Toda execucao significativa precisa ser reconstruivel:

- objetivo
- contexto
- fontes
- etapa
- ferramenta usada
- bloqueio
- custo estimado
- status de aprovacao
- proxima acao
- artifact ou learning event

## Modos de Autonomia

- `draft_only`: MAYUS apenas prepara.
- `supervised`: MAYUS prepara e pede aprovacao para execucao sensivel.
- `auto_low_risk`: MAYUS pode executar acoes internas seguras e de baixo risco.
- `blocked`: a acao precisa de credencial, politica, decisao do dono ou handoff humano.

Acoes sensiveis sempre exigem aprovacao:

- mensagem externa
- cobranca ou charge
- mudanca de permissao
- tratamento de credencial ou segredo
- busca paga no Escavador
- publicacao ou protocolo
- decisao juridica final

## Primeira Fatia de Implementacao do Beta

A primeira versao deve evitar migrations remotas e usar tabelas existentes.

Superficie implementada nesta fatia:

- `src/lib/agent/runtime/policy.ts`
- `src/lib/agent/runtime/governance.ts`
- `src/lib/agent/runtime/readiness.ts`
- `src/lib/setup/tenant-doctor.ts`
- `src/app/api/setup/doctor/route.ts`
- `src/app/dashboard/configuracoes/page.tsx`
- `src/app/dashboard/configuracoes/agente/page.tsx`

O Doctor precisa retornar:

- score de readiness agentico
- readiness por modulo
- perguntas pendentes para o dono
- plano de setup aplicavel
- proxima melhor acao
- metadata sanitizada de artifact

## Criterios de Aceite do Beta

- Um escritorio novo recebe diagnostico claro de setup em minutos.
- MAYUS diz o que esta pronto, o que falta, o que ele pode corrigir e o que precisa do humano.
- Usuario pode escolher autonomia por modulo.
- Toda tarefa importante vira missao, artifact, aprovacao ou evento.
- BYOK aparece como provider/model/status, nunca como chave crua.
- Escavador e cache-first, orcado, confirmado antes de busca paga e logado.
- Dashboard mostra o que o MAYUS organizou e o que precisa de aprovacao.
- WhatsApp, juridico, monitoramento, documentos, financeiro, CRM e setup passam pelo Operating Partner.

## Proxima Fila de Trabalho

- [x] Conectar decisoes de politica ao executor agentico existente para que toda capability receba uma decisao comum de autonomia, gate de presenca de credencial e contexto de auditoria sanitizado.
- [~] Converter endpoints pagos do Escavador para a politica compartilhada de budget antes de qualquer busca paga; `buscar-completo`, `sincronizar-oab` e `importar-lote` estao protegidos em codigo/testes, incluindo guard cache-first, mas smoke real ainda esta pendente.
- [~] Adicionar capability de conversa de setup que escreve respostas aprovadas em `tenant_settings.ai_features`; `office_setup_conversation` agora coleta respostas do perfil do escritorio, incluindo permissoes, agenda, politica financeira e notas de playbook, cria `practice_area_playbooks` em draft com perguntas de intake, documentos, pipeline e estrutura de pastas por area, persiste `office_knowledge_profile` confirmado, registra artifact/evento, propoe memorias, roda pelo caminho deterministico do Chat MAYUS para onboarding explicito e passou smoke autenticado com backend real mais cleanup; validacao por area/equipe ainda esta pendente.
- [~] Adicionar filtros do centro de aprovacoes para setup, juridico, financeiro, Escavador e mensagens externas; `/dashboard/aprovacoes` ja filtra aprovacoes pendentes/recentes por skill, handler, modulo e superficie de policy, mas smoke visual autenticado ainda esta pendente.
- [~] Adicionar fluxo de promocao de memoria: `brain_memories` recebe propostas supervisionadas com origem/confianca, `/api/agent/memory` aprova/rejeita/revoga com learning events sanitizados, expoe resumo de `self_correction_*`, propoe entradas de lifecycle Hermes, Configuracoes > Memoria mostra propostas pendentes, painel de auto-correcao e botao de revisao manual `mayus-self-improvement-review`, Inbox do Brain mostra auto-correcao/self-improvement no feed canonico com filtro `Correcoes MAYUS`, office setup validado cria lotes de proposta, API Hermes lifecycle passou autenticada com cleanup, e o smoke real `e2e/configuracoes-memoria-self-correction-real-smoke.spec.ts` validou auto-correcao -> self-improvement -> aprovacao -> memoria enforced. Uso cross-module de aprendizado ainda pendente.
- [~] Rodar smoke autenticado para telas Configuracoes e Agente; `e2e/configuracoes-agente-smoke.spec.ts` cobre mocks de UI harness e `e2e/configuracoes-agente-real-smoke.spec.ts` passou com APIs reais de backend para Configuracoes > Agente. Observacao de workflow em producao segue pendente porque o workflow/alias remoto `main` ainda nao tem a nova rota de routines.

## Backlog de Extracao

- [~] Paperclip governanca/budget/atividade: politica, helpers de governanca, filtros de aprovacao, budget Escavador, rotinas heartbeat, rota/workflow do scheduler, verificador, artifacts e eventos existem; faltam observacao do scheduler em producao apos deploy, portabilidade e timeline unificada de atividade.
- [~] OpenClaw perfis de politica: executor usa politica de tenant e superficies seguras; faltam schema formal de perfil, debugger de motivo bloqueado, matriz completa de ferramentas e docs de precedencia na UI.
- [~] Hermes memoria/doctor: readiness, Doctor, conversa deterministica de setup no chat, captura de permissoes/agenda/financeiro/playbook, playbooks por area em draft, propostas de memoria e route wiring de lifecycle existem; Hermes lifecycle tenant smoke e office setup chat smoke passaram com cleanup; falta uso cross-module completo.
- [~] Paperclip heartbeat/rotinas: runtime, dry-run API/UI, workflow de scheduler e verificador agora transformam rotinas habilitadas em missoes internas reconstruiveis com dono, budget, bloqueio, approval id e proxima acao; smoke real autenticado de Configuracoes > Agente passou, mas observacao de workflow em producao ainda esta pendente porque o alias publico retorna 404 para `/api/agent/routines`.
- [ ] Paperclip portabilidade: exportar/importar configuracao do escritorio com remocao de segredos, tratamento de colisao de tenant e revisao humana antes de importar.
- [~] Hermes skill lifecycle: criar, versionar, propor, aprovar, revogar e construir propostas persistiveis de memoria/aprendizado do tenant; `POST /api/agent/memory` persiste entradas propostas de lifecycle sem autoaprovacao, e `e2e/agent-memory-hermes-lifecycle-smoke.spec.ts` passou com backend real mais cleanup; pendente uso cross-module antes de governar execucao.
- [~] Hermes trajetoria: registrar trajetoria de missao para aprendizado e avaliacao supervisionados, nunca como verdade automatica; pendente uso de avaliacao cross-module mais amplo.
