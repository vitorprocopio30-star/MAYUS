# Implementation Plan - Artifact Publish Premium

Status: completed
Owner: MAYUS / AGENTE MAYA
Primary source documents:
- docs/brain/MAYUS_MASTER_BLUEPRINT.md
- docs/architecture/document-brain-roadmap.md

---

## 1. Objective

Fechar a camada premium final do artifact juridico.

O MAYUS deve ser capaz de:

- exportar a minuta formal em `.pdf`
- publicar a versao final no Drive do processo
- registrar o artifact publicado no processo
- refletir o estado premium de publicacao em Documentos e no chat do MAYUS

---

## 2. Why this layer now

Hoje o fluxo juridico principal ja cobre:

- contexto juridico
- sync documental
- primeira minuta
- revisao orientada
- loop supervisionado da minuta
- aprovacao
- publicacao
- export `.docx`

O maior gap agora e a ultima milha premium do artifact:

- saida final em formato extra-portavel
- publicacao operacional no Drive
- registro completo do produto final no processo

---

## 3. Scope

### In scope
- export `.pdf` da minuta final
- publisher do artifact no Drive do processo
- registro automatico do artifact publicado no processo
- visibilidade dessa publicacao em Documentos e MAYUS
- testes unitarios e E2E

### Out of scope
- protocolo automatico em tribunal
- distribuicao automatica para terceiros
- learning loop automatizado

---

## 4. Existing implementation to reuse

- `src/app/api/documentos/processos/[taskId]/exportar-peca/route.ts`
- `src/lib/services/google-drive-tenant.ts`
- `src/app/dashboard/documentos/page.tsx`
- `src/app/dashboard/mayus/page.tsx`
- historico formal de `process_draft_versions`

---

## 5. Target capability / package focus

Package name:
`artifact_publish_premium`

Direction:
- may remain partly API/UI driven
- if exposed as chat skill, define dedicated capability later in this package

---

## 6. File-by-file target list

- `src/lib/agent/capabilities/registry.ts`
- `src/lib/agent/capabilities/dispatcher.ts`
- `src/app/api/documentos/processos/[taskId]/exportar-peca/route.ts`
- `src/lib/services/google-drive-tenant.ts`
- `src/app/dashboard/documentos/page.tsx`
- `src/app/dashboard/mayus/page.tsx`
- `src/lib/agent/capabilities/dispatcher.test.ts`
- `e2e/documentos-authenticated.spec.ts`
- `e2e/mayus-authenticated.spec.ts`

---

## 7. Execution checklist

## Phase 1 - Export premium
- [x] Definir estrategia de export `.pdf`
- [x] Implementar export premium reutilizavel

## Phase 2 - Publish to Drive
- [x] Definir pasta/alvo de publicacao no Drive
- [x] Enviar artifact premium para o processo

## Phase 3 - Process registration
- [x] Registrar artifact publicado no processo
- [x] Refletir metadados de publicacao

## Phase 4 - UI and MAYUS visibility
- [x] Atualizar Documentos
- [x] Atualizar MAYUS

## Phase 5 - Tests
- [x] Unit tests
- [x] E2E de Documentos
- [x] E2E do MAYUS se houver skill/chat

## Phase 6 - Validation
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run test:e2e`

---

## 8. Session continuity block

Current phase:
- [ ] not started
- [ ] phase 1
- [ ] phase 2
- [ ] phase 3
- [ ] phase 4
- [ ] phase 5
- [ ] phase 6
- [x] done

Last completed item:
- [x] Package entregue com export `.pdf`, publish no Drive, registro no processo e cobertura automatizada.

Current blocker:
- [x] none

Files changed in current session:
- [x] docs/brain/MAYUS_MASTER_BLUEPRINT.md
- [x] docs/brain/IMPLEMENTATION-PLAN-artifact-publish-premium.md
- [x] src/lib/juridico/export-piece-pdf.ts
- [x] src/lib/juridico/publish-piece-premium.ts
- [x] src/app/api/documentos/processos/[taskId]/exportar-peca/route.ts
- [x] src/lib/agent/capabilities/registry.ts
- [x] src/lib/agent/kernel/router.ts
- [x] src/lib/agent/kernel/router.test.ts
- [x] src/app/api/ai/chat/route.ts
- [x] src/lib/agent/capabilities/dispatcher.ts
- [x] src/lib/agent/capabilities/dispatcher.test.ts
- [x] src/app/dashboard/documentos/page.tsx
- [x] src/app/dashboard/mayus/page.tsx
- [x] e2e/helpers/document-fixture.ts
- [x] e2e/documentos-authenticated.spec.ts
- [x] e2e/mayus-authenticated.spec.ts

Last validated commands:
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run test:e2e`

Next exact action:
- [x] Abrir o proximo plano: `docs/brain/IMPLEMENTATION-PLAN-learning-loop-capture.md`.

---

## 9. Resume instruction for future sessions

Resume from:
`docs/brain/IMPLEMENTATION-PLAN-artifact-publish-premium.md`

Workflow for next session:
1. read this file first
2. inspect `Session continuity block`
3. continue from the next unchecked execution item only
4. update checklist and continuity block at the end of the session
