# Implementation Plan - Learning Loop Capture

Status: completed
Owner: MAYUS / AGENTE MAYA
Primary source documents:
- docs/brain/MAYUS_MASTER_BLUEPRINT.md
- docs/architecture/document-brain-roadmap.md

---

## 1. Objective

Comecar a fechar o Learning Loop do MAYUS com supervisao real do escritorio.

O sistema deve ser capaz de:

- captar a diferenca entre minuta planejada e versao final publicada
- registrar os principais tipos de edicao humana
- transformar esse delta em sinais estruturados
- preparar a promocao supervisionada de padroes do escritorio

---

## 2. Why this layer now

O fluxo juridico operacional ja cobre:

- contexto juridico
- sync documental
- primeira minuta
- revisao orientada
- loop supervisionado por secao
- aprovacao
- publicacao
- artifact premium em PDF no Drive

O maior gap agora e evitar que o MAYUS repita erros ou ignore refinamentos humanos relevantes.

---

## 3. Scope

### In scope
- captar o delta entre versao formal e artifact final publicado
- estruturar categorias de edicao humana
- registrar evidencias do learning loop
- expor isso em artifacts/eventos internos
- testes unitarios e E2E do fluxo observavel

### Out of scope
- promocao automatica sem supervisao
- ajuste automatico de regras do escritorio em producao
- treinamento autonomo irrestrito

---

## 4. File-by-file target list

- `src/lib/agent/capabilities/registry.ts`
- `src/lib/agent/capabilities/dispatcher.ts`
- `src/lib/lex/draft-versions.ts`
- `src/lib/juridico/publish-piece-premium.ts`
- `src/app/dashboard/documentos/page.tsx`
- `src/app/dashboard/mayus/page.tsx`
- `src/lib/agent/capabilities/dispatcher.test.ts`
- `e2e/mayus-authenticated.spec.ts`

---

## 5. Execution checklist

## Phase 1 - Capture model
- [x] Definir o modelo de delta entre minuta e artifact final
- [x] Definir categorias iniciais de edicao humana

## Phase 2 - Persistence
- [x] Registrar o delta no processo / artifacts
- [x] Criar event do learning loop

## Phase 3 - MAYUS visibility
- [x] Exibir o capture no MAYUS
- [x] Exibir o capture no fluxo de Documentos se fizer sentido

## Phase 4 - Tests
- [x] Unit tests
- [x] E2E observavel

## Phase 5 - Validation
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run test:e2e`

---

## 6. Session continuity block

Current phase:
- [ ] not started
- [ ] phase 1
- [ ] phase 2
- [ ] phase 3
- [ ] phase 4
- [ ] phase 5
- [x] done

Last completed item:
- [x] Migrations remotas aplicadas; camada validada com `npm test`, `npm run build`, `npm run test:e2e` completo, blueprint atualizado e novo plano `voice_brain_execution` aberto.

Current blocker:
- [x] none

Files changed in current session:
- [x] docs/brain/IMPLEMENTATION-PLAN-learning-loop-capture.md
- [x] src/lib/lex/draft-versions.ts
- [x] src/lib/lex/draft-versions.test.ts
- [x] src/app/api/documentos/processos/[taskId]/minutas/route.ts
- [x] src/app/api/documentos/processos/[taskId]/minutas/route.test.ts
- [x] src/app/api/documentos/processos/[taskId]/exportar-peca/route.ts
- [x] src/app/api/documentos/processos/[taskId]/exportar-peca/route.test.ts
- [x] src/lib/juridico/publish-piece-premium.ts
- [x] src/lib/agent/capabilities/dispatcher.ts
- [x] src/lib/agent/capabilities/dispatcher.test.ts
- [x] src/lib/agent/capabilities/registry.ts
- [x] src/lib/brain/server.ts
- [x] src/app/api/ai/chat/route.ts
- [x] src/app/api/ai/approve/route.ts
- [x] src/app/api/ai/approve/route.test.ts
- [x] src/app/dashboard/documentos/page.tsx
- [x] src/app/dashboard/mayus/page.tsx
- [x] e2e/helpers/document-fixture.ts
- [x] e2e/documentos-authenticated.spec.ts
- [x] e2e/mayus-authenticated.spec.ts
- [x] supabase/migrations/20260422230500_secure_legal_artifact_publish_premium.sql
- [x] supabase/migrations/20260422231500_process_draft_versions_explicit_parent_guard.sql

Last validated commands:
- [x] `npm test -- --run src/lib/lex/draft-versions.test.ts src/app/api/documentos/processos/[taskId]/minutas/route.test.ts src/app/api/documentos/processos/[taskId]/minutas/[versionId]/route.test.ts src/app/api/documentos/processos/[taskId]/exportar-peca/route.test.ts`
- [x] `npm test -- --run src/lib/agent/capabilities/dispatcher.test.ts`
- [x] `npm test`
- [x] `npm test -- --run src/lib/lex/draft-versions.test.ts src/lib/agent/capabilities/dispatcher.test.ts`
- [x] `npx playwright test e2e/documentos-authenticated.spec.ts -g "artifact premium da versao publicada"`
- [x] `npx playwright test e2e/documentos-authenticated.spec.ts -g "revisao humana como nova versao formal"`
- [x] `npx playwright test e2e/mayus-authenticated.spec.ts -g "artifact premium por chat"`
- [x] `npm run build`
- [x] `npm run test:e2e`

Next exact action:
- [x] Abrir o proximo plano executavel do blueprint para a camada seguinte: `docs/brain/IMPLEMENTATION-PLAN-support-case-status.md`.

---

## 7. Resume instruction for future sessions

Resume from:
`docs/brain/IMPLEMENTATION-PLAN-learning-loop-capture.md`

Workflow for next session:
1. read this file first
2. inspect `Session continuity block`
3. continue from the next unchecked execution item only
4. update checklist and continuity block at the end of the session
