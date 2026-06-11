# Monitoring + Legal 100% Rollout

Data: 2026-06-08

## Implementado neste corte

- Cockpit persistente de monitoramento em `GET /api/monitoramento/cockpit`.
- Painel visivel em `/dashboard/operacoes/monitoramento` com limite incluso, excedente, pico, previsao, consumo Escavador, fila e kill-switch.
- Kill-switch operacional para bloquear chamadas externas quando houver inadimplencia, termos/pagamento pendentes, cobranca de excedente falha/vencida, pico de erro na fila ou consumo Escavador anomalo.
- Kill-switch aplicado nas rotas pagas `POST /api/monitoramento/importar-lote` e `POST /api/processos/ativar-monitoramento`, antes de `requireTenantApiKey` e antes de qualquer chamada Escavador.
- Fechamento mensal de excedente registra `platform_overage_charges` e `platform_billing_events`; cobranca Asaas real fica opt-in por `execute_real_charges`, com provider/API key obrigatorio.
- Gate juridico de fonte em `draft-source-gate`: aprovacao/publicacao/publish premium travam quando existem validacoes externas pendentes; publish premium tambem trava com documento faltante, alerta de fonte ou revisao humana pendente.
- Override humano explicito para o gate juridico, com justificativa e evento `legal_piece_source_gate_override`.
- Contrato persistente de analise de movimentacao em `legal_movement_analysis_contracts`, mantendo `analise_json` como compatibilidade.
- Estrutura dedicada de snapshot do Case Brain 2.0 em `legal_case_brain_insight_snapshots`, plugada no dispatcher `lex_case_brain_insights` com fallback auditavel em `system_event_logs`.

## Pendente para considerar producao real

- Selecionar tenant sandbox controlado antes de qualquer smoke real de Escavador/Asaas.
- Rodar smoke real controlado do Escavador para `novo_processo`, `nova_movimentacao`, cancelamento, resumo pago/cooldown e fila.
- Rodar sandbox Asaas/plataforma com `execute_real_charges=true` para confirmar criacao real, webhook e reconciliacao ponta a ponta.

## Evidencia remota de schema

Verificacao executada em 2026-06-08 com `npm.cmd run verify:monitoring-legal`.

- Supabase REST remoto respondeu para o projeto `agqjhiyoirtvsksvvenu`.
- Credenciais locais existem para Supabase service role, Playwright, Asaas API e Asaas webhook.
- `system_event_logs` existe e respondeu `200`.
- `tenants` existe, mas ainda nao possui `monitoring_included_process_limit` no schema remoto (`42703`).
- `platform_usage_snapshots`, `platform_overage_charges`, `platform_billing_events`, `legal_movement_analysis_contracts` e `legal_case_brain_insight_snapshots` retornaram `PGRST205`.
- Gate operacional: smokes reais de Escavador/Asaas ficam bloqueados ate aplicar as migrations remotas; smokes autenticados de UI podem rodar com fixtures/mocks.
- Resultado atualizado em 2026-06-08T17:51:36.900Z: `ok=false`, `can_run_monitoring_escavador_smoke=false`, `can_run_asaas_reconciliation_smoke=false`, `can_run_authenticated_ui_smokes=true`.
- Resultado atualizado em 2026-06-08T18:03:33.518Z: `ok=false`; o remoto continua bloqueado por `42703` em `tenants.monitoring_included_process_limit` e `PGRST205` nas tabelas novas.
- Resultado atualizado em 2026-06-08T19:01:32.989Z: `ok=false`; Supabase remoto continua acessivel, mas as migrations de billing/overage, Lex e Case Brain ainda nao foram aplicadas no schema remoto.
- Resultado atualizado em 2026-06-09T17:32:16.504Z: `ok=false`; o remoto continua com `42703` em `tenants.monitoring_included_process_limit`, `PGRST205` nas tabelas novas e `system_event_logs` confirmado com `200`.
- Resultado atualizado em 2026-06-09T18:28:23.346Z: `ok=false`; o remoto continua com os mesmos bloqueios (`42703` em `tenants` e `PGRST205` nas tabelas novas), entao smokes reais de Escavador/Asaas/Lex permanecem bloqueados.
- Tentativa no SQL Editor em 2026-06-09 falhou em `check_monitoramento_capacity(uuid)` com `42P13 cannot change return type of existing function`; migration corrigida com `DROP FUNCTION IF EXISTS public.check_monitoramento_capacity(uuid);` antes do novo `CREATE OR REPLACE FUNCTION`.
- Nova tentativa no SQL Editor em 2026-06-09 falhou nas policies Lex com `42883 function public.current_user_tenant_id() does not exist`; migrations Lex corrigidas para usar o helper existente `public.get_current_tenant_id()`.
- `npm.cmd run verify:monitoring-legal` em 2026-06-09T20:16:04.558Z confirmou billing/overage e Case Brain aplicados, mas bloqueou por `42703` em `legal_movement_analysis_contracts.human_decision`; migration corrigida para criar/preservar a coluna `human_decision jsonb`.
- `npm.cmd run verify:monitoring-legal` em 2026-06-09T20:23:01.111Z retornou `ok=true`; todas as tabelas/colunas criticas responderam `200` e os gates `can_run_monitoring_escavador_smoke`, `can_run_asaas_reconciliation_smoke` e `can_run_authenticated_ui_smokes` ficaram `true`.
- `npm.cmd run verify:monitoring-legal` em 2026-06-09T21:23:14.133Z retornou `ok=true`; Supabase remoto `agqjhiyoirtvsksvvenu` respondeu `200` para `tenants`, `platform_usage_snapshots`, `platform_overage_charges`, `platform_billing_events`, `legal_movement_analysis_contracts`, `legal_case_brain_insight_snapshots` e `system_event_logs`.
- Consulta read-only em 2026-06-09 encontrou apenas 1 tenant remoto: `Dutra Advocacia`, `status=ativo`, `monitoring_overage_status=excedente_bloqueado`, `monitoring_payment_method_status=cartao_pendente`, sem `asaas_customer_id` e sem indicio de sandbox. Smokes reais de Escavador/Asaas permanecem bloqueados ate criar/selecionar tenant sandbox.
- Checagem de aplicacao remota em 2026-06-09: nao ha `psql`, `SUPABASE_ACCESS_TOKEN`, `DATABASE_URL`, `SUPABASE_DB_PASSWORD` ou `SUPABASE_PROJECT_REF`; `npx.cmd supabase projects list` falhou por falta de access token; OpenAPI/PostgREST retornou 20 RPCs e nenhum RPC de `exec_sql`/DDL/schema. Caminho seguro continua sendo Supabase SQL Editor.
- Aplicacao remota nao executada neste runtime: `supabase_cli=false` e nao ha `SUPABASE_ACCESS_TOKEN`, `DATABASE_URL`, `SUPABASE_DB_PASSWORD` ou `SUPABASE_PROJECT_REF` no ambiente.
- `npm.cmd run verify:monitoring-legal` em 2026-06-09T23:50:55.913Z retornou `ok=true`; Supabase remoto `agqjhiyoirtvsksvvenu` respondeu `200` para todas as tabelas/colunas criticas e os gates `can_run_monitoring_escavador_smoke`, `can_run_asaas_reconciliation_smoke` e `can_run_authenticated_ui_smokes` ficaram `true`.

## Gate final de chamadas pagas Escavador

Atualizado em 2026-06-09T23:50:51.6790962Z.

- Gate compartilhado `requireEscavadorPaidActionAllowed` aplicado antes de chave/API externa em resumo IA, webhook Escavador, importacao/ativacao de monitoramento, busca/sincronizacao OAB, busca por numero/CPF, backfill/update agent, organizacao de processo e dispatcher de capacidades Escavador.
- Cancelamento/remocao/arquivamento seguem sem gate pago porque reduzem custo externo em vez de criar nova chamada paga.
- Bloqueios gravam `system_event_logs` com `provider=escavador`, `status=blocked`, tenant, origem, acao e motivo. Bloqueio por kill-switch preserva `event_name=monitoring_kill_switch_blocked`; bloqueios de budget/pagamento usam `escavador_paid_action_blocked`.
- Scripts internos adicionados:
  - `npm.cmd run smoke:monitoring-legal:prepare-sandbox`
  - `npm.cmd run smoke:monitoring-legal:real`
- O prepare cria/reusa apenas o tenant `MAYUS Sandbox - Monitoramento Legal`, aborta se `ASAAS_ENV=production`, se faltar `ASAAS_API_KEY` ou `MAYUS_SMOKE_ESCAVADOR_API_KEY`, ou se o alvo nao contiver `Sandbox`.
- O smoke real exige `MAYUS_SMOKE_BASE_URL`, `MAYUS_SANDBOX_EMAIL`, `MAYUS_SANDBOX_PASSWORD`, `MAYUS_SMOKE_ESCAVADOR_API_KEY`, `MAYUS_SMOKE_CNJ`, `MAYUS_SMOKE_OAB_UF`, `MAYUS_SMOKE_OAB_NUMBER` e `MAYUS_SMOKE_EXECUTE_REAL_CHARGES=true`; tambem aborta em `ASAAS_ENV=production` e nunca aceita tenant com `Dutra` no nome.
- Smokes reais ainda devem ser executados somente contra o tenant sandbox. Nenhum smoke real foi executado contra `Dutra Advocacia`.

## Evidencia operacional em 2026-06-10

- `npm.cmd run verify:monitoring-legal` em 2026-06-10T15:47:09.622Z retornou `ok=true`; Supabase remoto `agqjhiyoirtvsksvvenu` respondeu `200` para `tenants`, `platform_usage_snapshots`, `platform_overage_charges`, `platform_billing_events`, `legal_movement_analysis_contracts`, `legal_case_brain_insight_snapshots` e `system_event_logs`.
- `npx.cmd tsc --noEmit --pretty false` passou em 2026-06-10 sem erros.
- Presenca de env em 2026-06-10T12:49:18.8442387-03:00: Supabase, Asaas sandbox e webhook Asaas estao presentes em `.env.local`; `ASAAS_ENV=sandbox`.
- O smoke real permanece bloqueado por seguranca operacional porque as envs explicitas de sandbox ainda nao estao configuradas neste runtime: `MAYUS_SMOKE_BASE_URL`, `MAYUS_SANDBOX_EMAIL`, `MAYUS_SANDBOX_PASSWORD`, `MAYUS_SMOKE_ESCAVADOR_API_KEY`, `MAYUS_SMOKE_CNJ`, `MAYUS_SMOKE_OAB_UF`, `MAYUS_SMOKE_OAB_NUMBER` e `MAYUS_SMOKE_EXECUTE_REAL_CHARGES`.
- `npm.cmd run smoke:monitoring-legal:prepare-sandbox` foi executado em 2026-06-10 e abortou antes de criar tenant/customer/integracao com `ok=false`: `MAYUS_SMOKE_ESCAVADOR_API_KEY e obrigatoria para preparar o sandbox.`
- Conclusao: schema remoto e typecheck estao liberados; sandbox real ainda nao foi criado neste corte e nenhum smoke real foi executado contra `Dutra Advocacia`.
- Nova tentativa em 2026-06-10T12:58:21.5690347-03:00 confirmou o mesmo estado seguro: `npm.cmd run verify:monitoring-legal` retornou `ok=true`, `npx.cmd tsc --noEmit --pretty false` passou, `ASAAS_ENV=sandbox`, mas `npm.cmd run smoke:monitoring-legal:prepare-sandbox` abortou antes de efeitos externos por ausencia de `MAYUS_SMOKE_ESCAVADOR_API_KEY`.

## Checks locais

- `$env:PORT='3108'; $env:PLAYWRIGHT_BASE_URL='http://localhost:3108'; npx.cmd playwright test monitoring-cockpit-authenticated.spec.ts` passou em 2026-06-08.
- `npm.cmd test -- --run src\lib\finance\monitoring-cockpit.test.ts src\lib\finance\monitoring-overage.test.ts src\lib\lex\draft-source-gate.test.ts src\lib\lex\draft-versions.test.ts src\lib\juridico\movement-analysis-contract.test.ts src\lib\lex\case-brain-insights.test.ts src\app\api\documentos\processos\[taskId]\exportar-peca\route.test.ts src\app\api\monitoramento\importar-lote\route.test.ts src\app\api\processos\ativar-monitoramento\route.test.ts src\app\api\juridico\movement-reviews\route.test.ts src\lib\juridico\analisador.test.ts` passou em 2026-06-08 com 83 testes.
- `npm.cmd test -- --run src\app\api\monitoramento\importar-lote\route.test.ts src\app\api\processos\ativar-monitoramento\route.test.ts src\app\api\juridico\movement-reviews\route.test.ts src\lib\juridico\analisador.test.ts`
- `npm.cmd test -- --run src\lib\finance\monitoring-overage.test.ts src\lib\finance\monitoring-cockpit.test.ts src\app\api\monitoramento\importar-lote\route.test.ts src\app\api\processos\ativar-monitoramento\route.test.ts src\lib\lex\case-brain-insights.test.ts src\lib\agent\capabilities\dispatcher.test.ts -t "Case Brain|overage|monitoramento|kill-switch|ativacao|importacao|cobranca|pico|bloqueio"`
- `npm.cmd run verify:monitoring-legal` executou e bloqueou corretamente os smokes reais por schema remoto ausente.
- `npm.cmd run --silent sql:monitoring-legal` gera o SQL puro para aplicar pelo Supabase SQL Editor.
- `$out = Join-Path $env:TEMP 'mayus-monitoring-legal.sql'; npm.cmd run sql:monitoring-legal > $out` passou em 2026-06-08 e gerou bundle de 46156 bytes.
- `$out = Join-Path $env:TEMP 'mayus-monitoring-legal.sql'; npm.cmd run sql:monitoring-legal > $out` passou em 2026-06-09 e gerou bundle de 46156 bytes em `C:\Users\vitor\AppData\Local\Temp\mayus-monitoring-legal.sql`.
- `$out = Join-Path $env:TEMP 'mayus-monitoring-legal.sql'; npm.cmd run --silent sql:monitoring-legal > $out` passou em 2026-06-09 e gerou bundle SQL puro de 45972 bytes em `C:\Users\vitor\AppData\Local\Temp\mayus-monitoring-legal.sql`.
- Bundle SQL puro regenerado em 2026-06-09 apos correcao da funcao `check_monitoramento_capacity`: 46112 bytes em `C:\Users\vitor\AppData\Local\Temp\mayus-monitoring-legal.sql`.
- Bundle SQL puro regenerado em 2026-06-09 apos correcao das policies Lex: 46100 bytes, zero ocorrencias de `current_user_tenant_id` e 6 ocorrencias de `get_current_tenant_id`.
- Patch SQL minimo para o remoto em 2026-06-09: `ALTER TABLE public.legal_movement_analysis_contracts ADD COLUMN IF NOT EXISTS human_decision jsonb;`.
- Bundle SQL completo regenerado apos `human_decision`: 46362 bytes em `C:\Users\vitor\AppData\Local\Temp\mayus-monitoring-legal.sql`.
- `npm.cmd test -- --run src\lib\juridico\movement-analysis-contract.test.ts` passou em 2026-06-09 com 2 testes.
- `$env:PORT='3115'; $env:PLAYWRIGHT_BASE_URL='http://localhost:3115'; npx.cmd playwright test monitoring-cockpit-authenticated.spec.ts aprovacoes-legal-source-context-smoke.spec.ts documentos-source-gate-override-smoke.spec.ts` passou em 2026-06-08 com 3 smokes autenticados.
- `$env:PORT='3115'; $env:PLAYWRIGHT_BASE_URL='http://localhost:3115'; npx.cmd playwright test monitoring-cockpit-authenticated.spec.ts aprovacoes-legal-source-context-smoke.spec.ts documentos-source-gate-override-smoke.spec.ts` rodou em 2026-06-09: Documentos e cockpit passaram; Aprovações teve timeout de rede no bootstrap Supabase (`UND_ERR_CONNECT_TIMEOUT`) antes de carregar a tela.
- `$env:PORT='3116'; $env:PLAYWRIGHT_BASE_URL='http://localhost:3116'; npx.cmd playwright test aprovacoes-legal-source-context-smoke.spec.ts` passou em 2026-06-09 no rerun isolado.
- `$env:PORT='3121'; $env:PLAYWRIGHT_BASE_URL='http://localhost:3121'; npx.cmd playwright test documentos-source-gate-override-smoke.spec.ts` passou em 2026-06-09 com 1 smoke autenticado apos instalar os mocks antes do login.
- `$env:PORT='3122'; $env:PLAYWRIGHT_BASE_URL='http://localhost:3122'; npx.cmd playwright test monitoring-cockpit-authenticated.spec.ts aprovacoes-legal-source-context-smoke.spec.ts documentos-source-gate-override-smoke.spec.ts` estourou timeout em execucao paralela; os artefatos mostraram competicao do perfil autenticado `ui-harness` e queda em dados reais antes dos mocks.
- `$env:PORT='3123'; $env:PLAYWRIGHT_BASE_URL='http://localhost:3123'; npx.cmd playwright test monitoring-cockpit-authenticated.spec.ts aprovacoes-legal-source-context-smoke.spec.ts documentos-source-gate-override-smoke.spec.ts --workers=1` passou em 2026-06-09 com 3 smokes autenticados em 4.0m.
- `$env:PORT='3130'; $env:PLAYWRIGHT_BASE_URL='http://localhost:3130'; npx.cmd playwright test monitoring-cockpit-authenticated.spec.ts aprovacoes-legal-source-context-smoke.spec.ts documentos-source-gate-override-smoke.spec.ts --workers=1` passou em 2026-06-09 com 3 smokes autenticados em 3.5m.
- `npm.cmd test -- --run src\lib\lex\draft-source-gate.test.ts src\lib\lex\draft-versions.test.ts src\app\api\documentos\processos\[taskId]\exportar-peca\route.test.ts src\app\api\documentos\processos\[taskId]\minutas\[versionId]\route.test.ts` passou em 2026-06-08 com 28 testes.
- `npm.cmd test -- --run src\lib\finance\monitoring-cockpit.test.ts src\lib\finance\monitoring-overage.test.ts src\app\api\monitoramento\importar-lote\route.test.ts src\app\api\processos\ativar-monitoramento\route.test.ts src\app\api\juridico\movement-reviews\route.test.ts src\lib\juridico\analisador.test.ts src\lib\juridico\movement-analysis-contract.test.ts src\lib\lex\draft-source-gate.test.ts src\lib\lex\draft-versions.test.ts src\lib\lex\case-brain-insights.test.ts src\lib\agent\capabilities\dispatcher.test.ts` passou em 2026-06-09 com 122 testes; uma execucao concorrente anterior teve timeout isolado em `analisador.test.ts`, e o arquivo passou sozinho em seguida.
- `npm.cmd test -- --run src\lib\services\escavador-paid-action-gate.test.ts src\lib\services\escavador-ia.test.ts` passou em 2026-06-09 com 7 testes.
- `npm.cmd test -- --run src\app\api\monitoramento\importar-lote\route.test.ts src\app\api\processos\ativar-monitoramento\route.test.ts src\app\api\agents\update-processos\route.test.ts src\app\api\escavador\buscar-completo\route.test.ts src\app\api\agent\processos\organizar\route.test.ts src\app\api\agent\processos\resumo-ia\route.test.ts` passou em 2026-06-09 com 27 testes.
- `npm.cmd test -- --run src\lib\finance\monitoring-cockpit.test.ts src\lib\finance\monitoring-overage.test.ts src\lib\services\escavador-paid-action-gate.test.ts src\lib\services\escavador-ia.test.ts src\app\api\monitoramento\importar-lote\route.test.ts src\app\api\processos\ativar-monitoramento\route.test.ts src\app\api\agents\update-processos\route.test.ts src\app\api\escavador\buscar-completo\route.test.ts src\app\api\agent\processos\organizar\route.test.ts src\app\api\agent\processos\resumo-ia\route.test.ts src\app\api\webhooks\asaas\route.test.ts src\lib\juridico\movement-analysis-contract.test.ts src\lib\lex\case-brain-insights.test.ts src\lib\agent\capabilities\dispatcher.test.ts` passou em 2026-06-09 com 102 testes.
- `npx.cmd tsc --noEmit --pretty false` passou em 2026-06-08.
- `npx.cmd tsc --noEmit --pretty false` passou em 2026-06-09.
- `npx.cmd tsc --noEmit --pretty false` passou em 2026-06-09 apos o gate final e scripts de sandbox/smoke.
- `npm.cmd run build` passou em 2026-06-08; restaram apenas warnings preexistentes de hooks/imagens fora da frente Monitoramento/Juridico.
- `npm.cmd run build` passou em 2026-06-09; restaram apenas warnings preexistentes de hooks/imagens fora da frente Monitoramento/Juridico.
- `npm.cmd run build` passou novamente em 2026-06-09 apos os ajustes de smoke autenticado; os warnings restantes continuam fora da frente Monitoramento/Juridico.
- `npm.cmd run build` passou em 2026-06-09 apos o gate final e os scripts de sandbox/smoke; a primeira tentativa com timeout de 3m nao retornou erro, e o rerun com janela maior compilou com sucesso. Warnings restantes continuam preexistentes e fora da frente Monitoramento/Juridico.

## Corte Juridico/Lex sem API key em 2026-06-10

Atualizado em 2026-06-10T16:22:18.6388504-03:00.

- Nenhum smoke real de Escavador/Asaas foi executado neste corte; a frente ficou restrita a Juridico, Lex, Documentos, Aprovacoes, auditoria e testes.
- Contrato `legal_movement_analysis_contracts`: falha de persistencia deixou de ser apenas `console.warn`; agora gera auditoria em `system_event_logs` e propaga erro para nao esconder perda de contrato juridico.
- Revisao humana em `movement-reviews`: decisoes `approved` e `ignored` atualizam `human_decision`, status de revisao e vinculos disponiveis de prazo/card/minuta.
- Matriz juridica local: cobertura reforcada para `EXTINCAO` e `CUMPRIMENTO`; side effects automaticos continuam bloqueados quando a obrigacao nao e segura ou a confianca exige revisao humana.
- Publish premium/documentos: override de source gate carrega responsavel autenticado, justificativa e evento proprio de auditoria para publicacao premium.
- `/dashboard/documentos`: painel de fontes passou a exibir documentos usados com link, documentos faltantes, validacoes pendentes, lacunas externas, referencias legais/jurisprudenciais e documentos relevantes nao usados quando vierem no metadata.
- `/dashboard/aprovacoes`: smoke autenticado com mocks cobre contexto juridico de polo, obrigacao, evidencia, OpenClaw/Hermes, fontes/lacunas e side effects bloqueados.

Checks executados neste corte:

- `npm.cmd test -- --run src\lib\juridico\movement-analysis-contract.test.ts src\lib\juridico\publish-piece-premium.test.ts src\lib\juridico\analisador.test.ts src\lib\lex\draft-source-gate.test.ts src\lib\lex\draft-versions.test.ts src\lib\lex\case-brain-insights.test.ts src\app\api\juridico\movement-reviews\route.test.ts src\app\api\documentos\processos\[taskId]\exportar-peca\route.test.ts src\app\api\documentos\processos\[taskId]\minutas\[versionId]\route.test.ts` passou com 9 arquivos e 73 testes.
- `npx.cmd tsc --noEmit --pretty false` passou sem erros.
- `git diff --check` nos arquivos tocados passou; restaram apenas avisos de normalizacao LF/CRLF.
- `$env:PLAYWRIGHT_BASE_URL='http://localhost:3141'; npx.cmd playwright test documentos-source-gate-override-smoke.spec.ts --workers=1 --reporter=line` passou com 1 smoke.
- `$env:PLAYWRIGHT_BASE_URL='http://localhost:3141'; npx.cmd playwright test aprovacoes-legal-source-context-smoke.spec.ts --workers=1 --reporter=line` passou com 1 smoke.
- `$env:PLAYWRIGHT_BASE_URL='http://localhost:3141'; npx.cmd playwright test aprovacoes-legal-source-context-smoke.spec.ts documentos-source-gate-override-smoke.spec.ts --workers=1 --reporter=line` passou com 2 smokes.

Diagnostico de E2E/build:

- O E2E de Documentos inicialmente travou porque o mock catch-all interceptava chamadas que deveriam cair nos handlers especificos de `/api/documentos/processos/:taskId/minutas`; o spec foi corrigido para usar `route.fallback()` e preservar `/profiles`.
- O dev server dedicado na porta 3141 compilou `/dashboard/documentos` lentamente na primeira carga, mas os smokes passaram depois do aquecimento.
- O dev server dedicado da porta 3141 foi encerrado antes do build limpo.
- `npm.cmd run build` passou em 2026-06-10 apos encerrar Playwright/dev server concorrentes; restaram apenas warnings preexistentes de hooks/imagens fora deste corte.

## Corte Juridico/Lex matriz e recuperacao em 2026-06-10

Atualizado em 2026-06-10T17:15:16.5980279-03:00.

- `CONTRARRAZOES` passou a ser tratado como evento juridico proprio no analisador, preservando a logica recursal de polo representado e obrigacao.
- Eventos sensiveis sem regra operacional segura (`AUDIENCIA`, `CITACAO`, `SENTENCA`, `CUMPRIMENTO`, `CONTRARRAZOES`) agora caem em revisao humana sem criar prazo, card ou minuta automaticamente.
- Recuperacao de revisao travada (`recover`) tambem atualiza `legal_movement_analysis_contracts` com `review_status=review_required`, `human_decision` e auditoria `movement_review_recovery`.
- Testes novos cobrem audiencia futura sem regra, sentenca sem prazo confiavel, citacao direcionada ao cliente, contrarrazoes sem regra, cumprimento e extincao sem side effect automatico.

Checks executados neste corte:

- `npm.cmd test -- --run src\lib\juridico\analisador.test.ts src\app\api\juridico\movement-reviews\route.test.ts` passou com 2 arquivos e 39 testes.
- `npx.cmd tsc --noEmit --pretty false` passou sem erros.
- `npm.cmd test -- --run src\lib\juridico\movement-analysis-contract.test.ts src\lib\juridico\publish-piece-premium.test.ts src\lib\juridico\analisador.test.ts src\lib\lex\draft-source-gate.test.ts src\lib\lex\draft-versions.test.ts src\lib\lex\case-brain-insights.test.ts src\app\api\juridico\movement-reviews\route.test.ts src\app\api\documentos\processos\[taskId]\exportar-peca\route.test.ts src\app\api\documentos\processos\[taskId]\minutas\[versionId]\route.test.ts` passou com 9 arquivos e 77 testes.
- `$env:PLAYWRIGHT_BASE_URL='http://localhost:3142'; npx.cmd playwright test aprovacoes-legal-source-context-smoke.spec.ts --workers=1 --reporter=line` passou com 1 smoke.
- `$env:PLAYWRIGHT_BASE_URL='http://localhost:3142'; npx.cmd playwright test documentos-source-gate-override-smoke.spec.ts --workers=1 --reporter=line` passou com 1 smoke.
- `$env:PLAYWRIGHT_BASE_URL='http://localhost:3142'; npx.cmd playwright test aprovacoes-legal-source-context-smoke.spec.ts documentos-source-gate-override-smoke.spec.ts --workers=1 --reporter=line` passou com 2 smokes.
- `git diff --check` nos arquivos tocados passou; restaram apenas avisos LF/CRLF.
- `npm.cmd run build` passou em 2026-06-10 apos encerrar o dev server dedicado da porta 3142; warnings restantes sao preexistentes e fora deste corte.

## Corte Evidencia Visual Case Brain + Fonte Juridica em 2026-06-11

Atualizado em 2026-06-11T16:28:05.4181098-03:00.

- Nenhum smoke real de Escavador/Asaas foi executado neste corte; nenhuma API key externa foi usada.
- `/dashboard/aprovacoes`: revisoes juridicas agora exibem evidencia operacional com contrato persistente, `human_decision`, responsavel, justificativa, Case Brain, riscos, contradicoes, lacunas, fontes e side effects protegidos.
- `/dashboard/documentos`: minutas agora exibem o Case Brain usado pela versao contra o Case Brain atual, aviso de base stale, resumo de riscos/gaps/documentos faltantes/documentos relevantes nao usados e vinculo source gate/override premium.
- Os smokes autenticados mockados foram ajustados para provar a visibilidade de contrato, decisao humana, Case Brain, source gate, override humano e bloqueio de side effects sem depender de Escavador, Asaas ou tenant real.
- A primeira tentativa de `npm.cmd run build` em 2026-06-11 ficou sem evidencia final porque o comando foi interrompido por timeout do runner; o processo terminou depois, mas a saida ficou perdida.
- O build foi rerodado com stdout/stderr em `scratch\build-20260611-162154.out.log` e `scratch\build-20260611-162154.err.log`; o rerun gerou a tabela final de rotas, incluindo `/dashboard/aprovacoes` e `/dashboard/documentos`, sem stderr.

Checks executados neste corte:

- `npm.cmd test -- --run src\lib\juridico\movement-analysis-contract.test.ts src\lib\juridico\publish-piece-premium.test.ts src\lib\juridico\analisador.test.ts src\lib\lex\draft-source-gate.test.ts src\lib\lex\draft-versions.test.ts src\lib\lex\case-brain-insights.test.ts src\app\api\juridico\movement-reviews\route.test.ts src\app\api\documentos\processos\[taskId]\exportar-peca\route.test.ts src\app\api\documentos\processos\[taskId]\minutas\[versionId]\route.test.ts` passou com 9 arquivos e 77 testes.
- `npx.cmd tsc --noEmit --pretty false` passou sem erros.
- `$env:PLAYWRIGHT_BASE_URL='http://localhost:3145'; npx.cmd playwright test aprovacoes-legal-source-context-smoke.spec.ts --workers=1 --reporter=line` passou com 1 smoke.
- `$env:PLAYWRIGHT_BASE_URL='http://localhost:3145'; npx.cmd playwright test documentos-source-gate-override-smoke.spec.ts --workers=1 --reporter=line` passou com 1 smoke.
- `$env:PLAYWRIGHT_BASE_URL='http://localhost:3145'; npx.cmd playwright test aprovacoes-legal-source-context-smoke.spec.ts documentos-source-gate-override-smoke.spec.ts --workers=1 --reporter=line` passou com 2 smokes.
- `git diff --check -- src/app/dashboard/aprovacoes/page.tsx src/app/dashboard/documentos/page.tsx e2e/aprovacoes-legal-source-context-smoke.spec.ts e2e/documentos-source-gate-override-smoke.spec.ts docs/operations/monitoring-legal-100-rollout.md` passou; restaram apenas avisos LF/CRLF nos arquivos TSX.
- `npm.cmd run build` passou no rerun auditavel de 2026-06-11; stderr vazio.
