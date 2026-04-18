# Bugs Conhecidos MAYUS

Lista centralizada dos bugs abertos, com prioridade e status.

---

## Criticos

### BUG-001 - Webhook de movimentacao nao processa evento esperado
- Status: aberto
- Impacto: movimentacoes podem nao gerar cards/prazos
- Causa provavel: mismatch entre evento recebido e evento tratado no handler
- Acao: alinhar validacao para `nova_movimentacao`
- Arquivo alvo: `src/app/api` (handler de webhook Escavador)

### BUG-002 - Cards duplicados no Kanban juridico
- Status: aberto
- Impacto: ruido operacional e tarefas em duplicidade
- Causa provavel: instancia de client/reactividade no componente
- Acao: estabilizar instancia de client e fluxo de render

### BUG-003 - Anotacoes em cards nao persistem
- Status: aberto
- Impacto: perda de historico e contexto
- Causa provavel: policy RLS bloqueando `INSERT/UPDATE` em `process_tasks`
- Acao: revisar e corrigir policy para papeis permitidos

---

## Altos

### BUG-004 - Prazo fantasma `d155f6e9`
- Status: aberto
- Impacto: inconsistencias visuais e operacionais
- Acao: validar origem e remover registro indevido

### BUG-005 - Dropdown de responsavel nao lista todos os usuarios ativos
- Status: aberto
- Impacto: atribuicao incompleta de prazos
- Acao: listar por `is_active = true`, sem filtro indevido de role
- Arquivo alvo: `src/app/dashboard/operacoes/prazos/page.tsx`

### BUG-006 - Botao "Remover Responsavel" nao funciona
- Status: aberto
- Impacto: impossibilidade de desatribuir prazos
- Acao: validar update para `responsavel_id = null`

### BUG-007 - Upload de avatar falhando
- Status: aberto
- Impacto: experiencia de perfil incompleta
- Acao: validar integracao com bucket `avatars`
- Arquivo alvo: `src/app/dashboard/configuracoes/usuarios/page.tsx`

---

## Medios/Baixos

### BUG-008 - `cliente_nome` ausente em parte dos cards
- Status: aberto
- Impacto: contexto incompleto no card
- Acao: garantir populacao do campo no fluxo de importacao/sincronizacao

### BUG-009 - Texto bruto do Escavador em algumas descricoes
- Status: aberto
- Impacto: baixa legibilidade
- Acao: padronizar template de resumo

---

## Resolvidos Recentemente

- Ajustes de normalizacao de role para `admin`
- Backfill de IDs de monitoramento
- Ajustes de frequencia/cache no fluxo Escavador
