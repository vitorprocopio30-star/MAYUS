# Sessoes de Desenvolvimento MAYUS

Log central das sessoes de desenvolvimento. Cada sessao registra briefing, feitos, pendencias e proximos passos.

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
