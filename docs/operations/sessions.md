# Sessoes de Desenvolvimento MAYUS

Log central das sessoes de desenvolvimento. Cada sessao registra briefing, feitos, pendencias e proximos passos.

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
