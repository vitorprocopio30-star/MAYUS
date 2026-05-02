# Plano: Demo Tenant, Super Admin e WhatsApp Multi-Conta

Objetivo:
permitir demonstrar o MAYUS para clientes sem expor dados reais, operar suporte MAYUS por uma conta super admin com WhatsApp proprio e manter o escritorio Dutra com WhatsApp separado, usando tenant isolation, auditoria e aprovacao humana.

## Principios

- Demo nunca usa cliente, processo, documento, telefone, email, conversa ou pagamento real.
- Demo deve parecer completa: CRM, processos, documentos, prazos, financeiro, marketing, artifacts, missoes, WhatsApp e configuracoes.
- Super admin nao e usuario comum de tenant; e papel de suporte da plataforma MAYUS.
- Atendimento MAYUS pelo WhatsApp da plataforma nao mistura com WhatsApp de escritorio cliente.
- Dutra e qualquer outro tenant tem numero, credenciais, conversas, artifacts e logs isolados.
- Nenhuma troca de tenant, impersonacao, envio externo ou acesso sensivel ocorre sem motivo, escopo e auditoria.

## Modelo Alvo

### 1. Tenant demo

Criar um tenant modelo, por exemplo `MAYUS Demo`, marcado como `demo_mode=true`.

Requisitos:

- dataset 100% sintetico com nomes ficticios, processos ficticios, documentos de exemplo e conversas simuladas;
- seed versionado para restaurar o mesmo estado antes de cada demonstracao;
- reset seguro via painel admin;
- banner visual permanente: `Ambiente de demonstracao`;
- bloqueio de integracoes externas reais;
- provedores simulados para WhatsApp, Drive, Escavador, Asaas e ZapSign;
- artifacts e missoes pre-carregados para mostrar o MAYUS trabalhando;
- tarefas, prazos, CRM e financeiro com numeros plausiveis, mas falsos;
- nenhum dado vindo de Dutra ou de clientes reais.

Dados sugeridos:

- 8 a 12 leads ficticios em diferentes fases;
- 4 processos ficticios com timeline, documentos, prazos e resumo;
- 2 minutas juridicas demonstrativas;
- 1 cobranca ficticia;
- 1 proposta e 1 contrato ficticios;
- 1 playbook diario gerado;
- 1 campanha de marketing ficticia;
- 1 conversa WhatsApp simulada com rascunho MAYUS.

### 2. Super admin MAYUS

Criar papel operacional separado, por exemplo `mayus_support_admin`.

Permissoes:

- ver tenants, status de setup, integracoes configuradas/pendentes e saude geral;
- abrir caso de suporte de um tenant;
- acessar dados do tenant somente com grant temporario e motivo registrado;
- executar Doctor/diagnosticos sem expor segredos;
- atender clientes do MAYUS pelo WhatsApp oficial da plataforma;
- nunca usar WhatsApp de um escritorio cliente para suporte MAYUS.

Guardrails:

- acesso read-only por padrao;
- acao mutavel exige motivo e trilha em `system_event_logs`;
- suporte cross-tenant precisa de grant com expiracao;
- toda visualizacao sensivel deve registrar `support_access_viewed`;
- toda acao operacional deve registrar `support_action_executed`;
- sem exibicao de tokens, service role, DB URL, webhook secret ou credenciais.

### 3. WhatsApp multi-conta

Separar contas de WhatsApp por dono operacional:

- `mayus_support`: WhatsApp oficial da MAYUS para atendimento dos clientes da plataforma;
- `tenant`: WhatsApp do escritorio cliente, como Dutra;
- `demo`: WhatsApp simulado para demonstracao.

Regra de roteamento:

- inbound do numero MAYUS vai para inbox de suporte MAYUS;
- inbound do numero Dutra vai para conversas do tenant Dutra;
- inbound do demo vai para tenant demo/simulador;
- outbound usa sempre a mesma conta que recebeu a conversa;
- um tenant nunca enxerga conversas, numeros ou rascunhos de outro tenant.

Campos conceituais:

- `whatsapp_accounts.id`
- `owner_type`: `mayus_support`, `tenant`, `demo`
- `tenant_id`: obrigatorio para `tenant`, nulo/controlado para `mayus_support`, demo para ambiente modelo
- `provider`: Meta Cloud, Evolution ou simulator
- `provider_account_id`
- `phone_label`
- `status`
- `last_health_check_at`

## Fases de Implementacao

### Fase 1 - Contrato de seguranca

- Registrar esta frente no blueprint/checklist principal.
- Definir `demo_mode`, `support_admin` e `whatsapp_account.owner_type`.
- Definir o que super admin pode ver sem grant e o que exige grant.
- Definir evento de auditoria para visualizacao, acao e envio de suporte.

### Fase 2 - Demo tenant e dataset sintetico

- [x] Criar seed idempotente do tenant demo.
Evidencia 2026-05-02: `src/lib/demo/demo-tenant-reset.ts` gera dataset deterministico de 100 casos, com 12 casos vitrine e 88 casos de volume.
- [~] Criar factory de dados ficticios para CRM, processos, documentos, prazos, financeiro, marketing e artifacts.
Evidencia 2026-05-02: primeira factory cobre processos, memoria documental simulada, tarefas internas, OAB ficticia `SP/123456`, cache Escavador demo, inbox de movimentacoes e conversas WhatsApp simuladas. Faltam CRM comercial, financeiro, marketing e artifacts agenticos pre-carregados.
- [x] Criar reset do demo para estado padrao.
Evidencia 2026-05-02: `POST /api/admin/demo/reset` tem dry-run padrao, confirmacao textual para reset real e bloqueio se `demo_mode` nao estiver ativo.
- [x] Criar OAB ficticia que carrega dados demonstraveis.
Evidencia 2026-05-02: `src/lib/demo/demo-oab-flow.ts` define `SP/123456` com advogada ficticia, 100 processos sinteticos, movimentacoes e payload de organizacao demo.
- Adicionar banner/flag visual de ambiente demo.
- [~] Bloquear provedores externos reais quando `demo_mode=true`.
Evidencia 2026-05-02: `POST /api/escavador/buscar-completo` retorna a OAB demo sem chave Escavador e `POST /api/agent/processos/organizar` usa resultado deterministico para processo demo, sem chamada externa de IA/Escavador. Faltam simuladores para todos os demais provedores.

### Fase 3 - Super admin e suporte MAYUS

- Criar papel `mayus_support_admin`.
- Criar painel admin de tenants/clientes.
- Criar grants temporarios de suporte por tenant.
- Criar logs de acesso e acao.
- Criar inbox de suporte MAYUS separado dos tenants.

### Fase 4 - WhatsApp multi-conta

- Criar modelo de contas WhatsApp por dono.
- Resolver tenant/owner por `provider_account_id` ou numero receptor, nao por texto livre.
- Separar inbox MAYUS, inbox tenant e inbox demo.
- Garantir outbound pela conta correta.
- Adicionar health/status por conta.

### Fase 5 - Validacao e demonstracao

- Testar que demo nao contem dado real.
- Testar que usuario tenant nao acessa suporte/admin.
- Testar que super admin sem grant nao edita tenant.
- Testar roteamento WhatsApp MAYUS vs Dutra vs demo.
- Testar reset de demo.
- Testar que logs/artifacts nao carregam segredo.

## Criterios de Aceite

- Cliente em demonstracao ve uma conta completa, mas 100% ficticia.
- Reset da conta demo restaura dados padrao sem tocar tenants reais.
- Super admin atende clientes MAYUS pelo WhatsApp da plataforma.
- Dutra usa outro numero, isolado no tenant Dutra.
- Webhooks roteiam pela conta provedora correta.
- Nenhum dado real aparece no demo.
- Nenhum segredo aparece em log, artifact, UI ou resposta de API.
- Toda acao super admin tem ator, motivo, tenant, timestamp e resultado.
- Toda acao externa continua supervisionada.

## Ordem Recomendada

1. Criar contrato/tipos e flags.
2. Criar seed/reset demo.
3. Criar isolamento visual e bloqueios de provedores reais no demo.
4. Criar papel super admin e grants temporarios.
5. Criar modelo WhatsApp multi-conta.
6. Plugar roteamento inbound/outbound.
7. Criar painel de suporte e health.
8. Rodar testes de isolamento, demo e WhatsApp.
