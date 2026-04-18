# Arquitetura MAYUS

Documentacao tecnica consolidada do sistema.

---

## 1) Visao Geral

MAYUS e um AI Operating System para escritorios de advocacia. A plataforma integra atendimento, processos, equipe, comercial e operacao juridica em um unico fluxo.

- Frontend: Next.js 14 (App Router) + React 18 + TypeScript
- Estilo: Tailwind CSS + componentes customizados
- Backend: Supabase (Postgres, Auth, Storage, Realtime)
- Deploy: Vercel
- IA: OpenRouter (BYOK por tenant)

---

## 2) Estrutura de Projeto

- `src/app`: rotas e paginas do App Router
- `src/components`: componentes reutilizaveis
- `src/hooks`: hooks customizados
- `src/lib`: clients, servicos, utilitarios
- `src/types`: tipos de dominio
- `supabase/migrations`: migrations oficiais do schema
- `docs`: base de documentacao operacional
- `projeto-mayus`: artefatos de sessao e referencia executiva

---

## 3) Modulos Principais

- `dashboard/mayus`: chat e interacao com agente
- `dashboard/operacoes/monitoramento`: monitoramento de processos
- `dashboard/operacoes/prazos`: prazos e audiencias
- `dashboard/processos`: Kanban juridico
- `dashboard/crm` e `dashboard/vendas`: comercial
- `dashboard/equipe`, `mural`, `hall-da-fama`: gestao de equipe
- `dashboard/agenda` e `dashboard/agenda-global`: planejamento operacional
- `dashboard/configuracoes/*`: integracoes, agente, memoria, usuarios

---

## 4) Banco de Dados (Supabase)

Entidades-chave (resumo):

- `profiles`: usuarios e papeis
- `tenants`: isolamento multi-tenant
- `tenant_integrations`: chaves de integracao por tenant (BYOK)
- `monitored_processes`: processos monitorados
- `process_movimentacoes`: eventos recebidos
- `process_prazos`: prazos e audiencias
- `process_tasks`: cards do Kanban juridico
- `process_update_queue`: fila de processamento
- `agent_skills`, `agent_memory`: nucleo do agente
- `user_tasks`: agenda individual/global

Observacao: manter RLS consistente por `tenant_id` em todas as tabelas de dominio.

---

## 5) Fluxos Criticos

### Monitoramento juridico
Escavador -> webhook -> classificacao -> cria card -> cria prazo -> notifica equipe.

### Chat do agente
Usuario -> endpoint IA -> injecao de contexto do tenant -> dispatch de skill -> resposta.

### Auth e permissao
Supabase Auth -> middleware -> regras por role -> RLS no banco.

---

## 6) Seguranca e Riscos Atuais

Ja implementado:

- Auth via Supabase
- RLS multi-tenant
- Isolamento por tenant
- Webhooks com validacao

Pendente prioritario:

- Criptografia das chaves em `tenant_integrations`
- Rate limiting por tenant
- Auditoria completa das acoes do agente
