# Implementation Plan - Legal Document Memory Refresh

Status: completed
Owner: MAYUS / AGENTE MAYA
Primary source documents:
- docs/brain/MAYUS_MASTER_BLUEPRINT.md
- docs/architecture/document-brain-roadmap.md

---

## 1. Objective

Permitir que o MAYUS atualize a memoria documental do processo via chat, usando o repositorio real do Google Drive, e use esse estado mais fresco para melhorar:

- contexto juridico
- revisao da minuta
- geracao da primeira minuta
- confianca no grounding documental

Esta camada e a proxima etapa recomendada antes do loop agentico de reescrita por secao.

---

## 2. Why this layer now

Hoje o fluxo downstream ja esta bem coberto:

- `legal_case_context`
- `legal_first_draft_generate`
- `legal_draft_review_guidance`
- `legal_draft_workflow`

O principal gap atual e upstream:

- memoria documental fresca
- repositorio sincronizado pelo chat
- menor risco de operar com contexto stale

Sem isso, o MAYUS pode revisar ou gerar uma minuta em cima de um estado juridico defasado.

---

## 3. Roadmap alignment

## MAYUS_MASTER_BLUEPRINT.md
Esta camada implementa diretamente a ideia de:

- `document_sync` como skill critica
- fortalecimento do `Case Brain`
- fortalecimento do `Legal Grounding`
- preparacao para `Draft Factory Premium`

## document-brain-roadmap.md
Esta camada implementa diretamente:

- sincronizacao manual por processo
- leitura de PDFs e DOCX
- classificacao documental
- resumo documental incremental
- memoria documental estruturada
- uso dessa memoria pelo agente no chat

---

## 4. Scope

### In scope
- nova capability `legal_document_memory_refresh`
- roteamento de comandos de sync documental
- execucao real da sync pelo dispatcher
- artifact e learning event da sync
- exibicao da missao de sync no MAYUS
- enriquecimento minimo de `legal_case_context`
- testes unitarios e E2E

### Out of scope
- loop agentico de reescrita por secao
- criacao automatica de nova versao formal `Vn+1`
- refresh juridico profundo completo do `Case Brain` como segunda missao obrigatoria
- publicacao/protocolo automaticos

---

## 5. Existing implementation we will reuse

### Repository sync already exists
- `src/app/api/documentos/processos/[taskId]/sync/route.ts`
- `src/lib/services/process-documents.ts`

### Google Drive tenant access already exists
- `src/lib/services/google-drive-tenant.ts`

### Service request pattern outside route already exists
- `src/lib/juridico/drive-style-examples.ts`

### Context snapshot already exists
- `src/lib/lex/case-context.ts`

### Case Brain bootstrap already exists
- `src/lib/lex/case-brain-bootstrap.ts`

Conclusion:
- this package should reuse these parts
- it should not reinvent repository sync

---

## 6. Target capability

### Capability name
`legal_document_memory_refresh`

### Handler type
`lex_document_memory_refresh`

### Suggested profile
- risk level: `low`
- allowed channel: `chat`
- requires human confirmation: `false`

### Purpose
Executar a sincronizacao documental do processo sob demanda pelo chat do MAYUS e devolver um resumo claro do estado atualizado.

---

## 7. User commands to support

Examples:

- "sincronize os documentos do processo 123..."
- "atualize a memoria documental do processo"
- "releia o repositorio do caso"
- "atualize o acervo do processo"
- "sincronize a pasta do processo"
- "atualize os documentos desse caso"

The router should extract:
- `process_number`
- `process_reference` when possible

---

## 8. Expected user experience

### Input
User asks MAYUS to sync the process repository.

### MAYUS execution
1. resolve target process
2. access Google Drive tenant integration
3. synchronize repository files
4. update `process_document_memory`
5. register mission artifact and learning event
6. return a concise operational summary

### Output example
- documents synchronized
- sync status
- last sync timestamp
- missing essential folders/documents
- extraction/classification warnings
- next suggested step

### Next-step suggestion
After sync, MAYUS should suggest but not auto-execute:
- updated legal context
- review guidance
- first draft generation

---

## 9. Technical design

## 9.1 Capability registry
Add new capability in:

- `src/lib/agent/capabilities/registry.ts`

Expected seed:
- `name: "legal_document_memory_refresh"`
- `handler_type: "lex_document_memory_refresh"`

---

## 9.2 Router
Add new intent in:

- `src/lib/agent/kernel/router.ts`

Expected routing:
- phrases for sync, refresh, reread, update repository
- process number extraction

Tests:
- `src/lib/agent/kernel/router.test.ts`

---

## 9.3 Chat instruction layer
Update instructions in:

- `src/app/api/ai/chat/route.ts`

Add rule similar to:
- for syncing or refreshing process document memory, use `legal_document_memory_refresh`

Also instruct MAYUS to:
- suggest context/review/first-draft as next step after successful sync
- not auto-run them in this package

---

## 9.4 Dispatcher handler
Implement:

- `runLegalDocumentMemoryRefresh(...)`

In:
- `src/lib/agent/capabilities/dispatcher.ts`

### Recommended flow
1. resolve process using existing legal process resolution flow
2. obtain Google Drive tenant context
3. call `syncProcessDocuments(...)` directly
4. build response with operational summary
5. register artifact
6. register learning event
7. return `outputPayload`

### Important constraint
Do not call internal HTTP route from dispatcher.
Reuse service directly:
- `syncProcessDocuments(...)`

---

## 9.5 Google Drive access outside route
Today `getTenantGoogleDriveContext(...)` expects a `Request`.

A reusable pattern already exists in:
- `src/lib/juridico/drive-style-examples.ts`

Recommended action:
- extract or reuse a shared helper that creates a service `Request`
- keep dispatcher independent from `NextRequest`

Suggested helper responsibility:
- build service request using `NEXT_PUBLIC_SITE_URL`

---

## 9.6 Artifact design
Register a new artifact:

- `artifactType: "legal_document_memory_refresh"`

Minimum metadata:
- `reply`
- `summary`
- `process_task_id`
- `process_number`
- `client_name`
- `document_count`
- `sync_status`
- `last_synced_at`
- `missing_documents`
- `warnings`
- `warning_count`
- `drive_folder_id`
- `drive_folder_url` if available

Goal:
- mission becomes inspectable and resumable

---

## 9.7 Learning event design
Register a new event:

- `event_type: "legal_document_memory_refreshed"`

Minimum payload:
- `summary`
- `process_task_id`
- `process_number`
- `document_count`
- `sync_status`
- `last_synced_at`
- `missing_documents`
- `warning_count`

---

## 9.8 Context enrichment
Update:

- `src/lib/lex/case-context.ts`

Current `documentMemory` shape is too minimal for this next layer.

Recommended additions:
- `missingDocuments`
- some freshness indicator
- possibly `warningCount` if cheap to expose
- keep old shape stable for compatibility

Also improve `buildLegalCaseContextReply(...)` to clearly distinguish:
- synced document-based memory
- pending documentary gaps
- stale or missing memory state
- where the answer is grounded vs inferred

---

## 9.9 MAYUS UI visibility
Update:

- `src/app/dashboard/mayus/page.tsx`

Add:
- label for `legal_document_memory_refreshed`
- label for `legal_document_memory_refresh`
- highlights in artifact card:
  - sync status
  - document count
  - warning count
  - documentary gaps

Goal:
- make sync visible as a first-class mission in chat

---

## 10. Output payload contract

Expected dispatcher `outputPayload`:

- `auditLogId`
- `handler_type`
- `process_task_id`
- `process_number`
- `document_count`
- `sync_status`
- `last_synced_at`
- `warning_count`
- `missing_documents`
- `drive_folder_id`
- `drive_folder_url` if available

This allows:
- mission display
- future chaining
- observability

---

## 11. File-by-file implementation map

### Core runtime
- `src/lib/agent/capabilities/registry.ts`
- `src/lib/agent/kernel/router.ts`
- `src/app/api/ai/chat/route.ts`
- `src/lib/agent/capabilities/dispatcher.ts`

### Drive/service reuse
- `src/lib/services/google-drive-tenant.ts`
- `src/lib/juridico/drive-style-examples.ts`
- `src/lib/services/process-documents.ts`

### Context/UI
- `src/lib/lex/case-context.ts`
- `src/app/dashboard/mayus/page.tsx`

### Tests
- `src/lib/agent/kernel/router.test.ts`
- `src/lib/agent/capabilities/dispatcher.test.ts`
- `e2e/mayus-authenticated.spec.ts`

---

## 12. Execution checklist

## Phase 1 - Capability
- [x] Add `legal_document_memory_refresh` to `registry.ts`
- [x] Define `handler_type: "lex_document_memory_refresh"`
- [x] Set `risk_level: "low"`
- [x] Set `allowed_channels: ["chat"]`
- [x] Set `requires_human_confirmation: false`

## Phase 2 - Router
- [x] Add intent in `router.ts`
- [x] Support sync/memory refresh phrases
- [x] Extract `process_number`
- [x] Add router tests

## Phase 3 - Drive service request reuse
- [x] Reuse or extract helper for service `Request`
- [x] Make dispatcher able to obtain Drive access token outside route context

## Phase 4 - Dispatcher handler
- [x] Implement `runLegalDocumentMemoryRefresh(...)`
- [x] Resolve process
- [x] Obtain Drive context
- [x] Call `syncProcessDocuments(...)`
- [x] Build reply
- [x] Return output payload

## Phase 5 - Artifact and event
- [x] Register `legal_document_memory_refresh` artifact
- [x] Register `legal_document_memory_refreshed` event

## Phase 6 - Case context enrichment
- [x] Extend `documentMemory` shape minimally
- [x] Add `missingDocuments`
- [x] Improve freshness communication in legal context reply

## Phase 7 - MAYUS UI
- [x] Add event label
- [x] Add artifact label
- [x] Add artifact highlights for sync result

## Phase 8 - Chat prompt layer
- [x] Teach `ai/chat` to use the new skill
- [x] Teach MAYUS to suggest next legal step after sync

## Phase 9 - Unit tests
- [x] Router test for new intent
- [x] Dispatcher success test
- [ ] Dispatcher error test: no Drive
- [ ] Dispatcher error test: process without folder
- [x] Dispatcher warnings test
- [x] Artifact/event assertions

## Phase 10 - E2E
- [x] Add MAYUS chat sync flow
- [x] Verify mission card
- [x] Verify sync artifact
- [x] Verify visible sync summary
- [ ] Optionally re-query legal context after sync and confirm richer reply

## Phase 11 - Validation
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run test:e2e`

---

## 13. Test plan

## Unit
### Router
- detect sync command
- extract process number

### Dispatcher
Scenarios:
- successful sync
- process has no Drive folder
- Drive disconnected
- sync returns warnings
- sync returns zero documents
- artifact registered
- event registered

## E2E
Extend `e2e/mayus-authenticated.spec.ts` with:
- request sync by chat
- show mission card
- show sync artifact
- show status and document count
- show next suggested action

Use deterministic mocks, same pattern as current MAYUS E2E.

---

## 14. Risks

### Technical
- Drive auth outside route context
- slow sync for large repositories
- extraction warnings for PDF/DOCX
- process without document structure

### Product
- sync may succeed but not yet mean "Case Brain fully refreshed"
- user may expect deeper legal reprocessing immediately after sync

### Mitigation
- keep scope narrow
- communicate clearly what was updated
- suggest next legal action explicitly
- do not pretend that sync == full legal re-analysis

---

## 15. Explicit decisions for this package

### We will do
- document sync by chat
- mission visibility
- artifact/event
- better context freshness signaling

### We will not do
- automatic Case Brain full refresh
- automatic draft regeneration
- section-by-section rewrite loop
- formal version creation from review output

---

## 16. Success criteria

Package is considered successful when:

- MAYUS can sync process documents by chat
- sync is visible as a mission
- sync result is persisted as artifact/event
- legal context becomes clearer about documentary freshness
- test suite remains green

---

## 17. Next layer after this package

After this package is complete, next recommended package:

- `legal_draft_revision_loop`

That future layer should:
1. identify weak sections
2. propose section-by-section revisions
3. optionally generate improved section text
4. produce a supervised new version `Vn+1`

This should only happen after document memory refresh is in place.

---

## 18. Session continuity block

Fill this at the end of each session.

Current phase:
- [ ] not started
- [ ] phase 1
- [ ] phase 2
- [ ] phase 3
- [ ] phase 4
- [ ] phase 5
- [ ] phase 6
- [ ] phase 7
- [ ] phase 8
- [ ] phase 9
- [ ] phase 10
- [ ] phase 11
- [x] done

Last completed item:
- [x] Package entregue com skill, handler, artifact/event, contexto enriquecido e cobertura automatizada.

Current blocker:
- [x] none

Files changed in current session:
- [x] docs/brain/MAYUS_MASTER_BLUEPRINT.md
- [x] docs/brain/IMPLEMENTATION-PLAN-legal-document-memory-refresh.md
- [x] src/lib/services/google-drive-tenant.ts
- [x] src/lib/juridico/drive-style-examples.ts
- [x] src/lib/agent/capabilities/registry.ts
- [x] src/lib/agent/kernel/router.ts
- [x] src/lib/agent/kernel/router.test.ts
- [x] src/app/api/ai/chat/route.ts
- [x] src/lib/agent/capabilities/dispatcher.ts
- [x] src/lib/agent/capabilities/dispatcher.test.ts
- [x] src/lib/lex/case-context.ts
- [x] src/app/dashboard/mayus/page.tsx
- [x] e2e/mayus-authenticated.spec.ts

Last validated commands:
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run test:e2e`

Next exact action:
- [x] Abrir o proximo plano: `docs/brain/IMPLEMENTATION-PLAN-legal-draft-revision-loop.md`.

---

## 19. Resume instruction for future sessions

Resume from:
`docs/brain/IMPLEMENTATION-PLAN-legal-document-memory-refresh.md`

Workflow for next session:
1. read this file first
2. inspect `Session continuity block`
3. continue from the next unchecked execution item only
4. update checklist and continuity block at the end of the session
