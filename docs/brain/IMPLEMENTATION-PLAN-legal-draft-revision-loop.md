# Implementation Plan - Legal Draft Revision Loop

Status: completed
Owner: MAYUS / AGENTE MAYA
Primary source documents:
- docs/brain/MAYUS_MASTER_BLUEPRINT.md
- docs/architecture/document-brain-roadmap.md

---

## 1. Objective

Transformar a revisao juridica da minuta em um loop supervisionado por secao.

O MAYUS deve ser capaz de:

- identificar blocos fracos da versao atual
- propor reforcos objetivos por secao
- sugerir uma sequencia de melhoria antes da aprovacao
- opcionalmente preparar uma nova versao formal `Vn+1` com checkpoint humano

---

## 2. Why this layer now

O refresh documental via chat ja foi entregue.

Hoje o MAYUS ja consegue:

- sincronizar o acervo do processo
- resolver contexto juridico
- gerar a primeira minuta
- revisar a minuta com guidance orientado
- aprovar e publicar a versao formal

O maior gap agora e sair de:

- "a minuta precisa de reforco"

para:

- "aqui estao os blocos fracos, aqui esta o plano de reforco, aqui esta a proxima versao supervisionada"

---

## 3. Scope

### In scope
- nova capability `legal_draft_revision_loop`
- roteamento de comandos de melhoria da minuta
- analise por secao da versao formal atual
- plano de revisao estruturado
- artifact e event do loop de revisao
- possibilidade de preparar `Vn+1` supervisionada
- testes unitarios e E2E

### Out of scope
- publicacao automatica sem checkpoint
- aprendizagem automatica com base na edicao humana
- protocolo automatico
- refresh completo do Case Brain como side effect obrigatorio

---

## 4. Existing implementation to reuse

- `src/lib/agent/capabilities/dispatcher.ts`
- `src/lib/lex/draft-versions.ts`
- `src/lib/lex/case-context.ts`
- `src/lib/juridico/piece-catalog.ts`
- `src/app/dashboard/mayus/page.tsx`

Base existente que devemos aproveitar:

- `legal_draft_review_guidance`
- `legal_draft_workflow`
- historico formal de versoes
- heuristicas de qualidade e grounding

---

## 5. Target capability

### Capability name
`legal_draft_revision_loop`

### Handler type
`lex_draft_revision_loop`

### Suggested profile
- risk level: `medium`
- allowed channel: `chat`
- requires human confirmation: `false` para plano
- se gerar `Vn+1`, exigir checkpoint antes de consolidar a nova versao

---

## 6. Expected user commands

- "melhore a minuta por secao"
- "reforce a argumentacao da V2"
- "monte um plano de revisao da minuta"
- "o que voce mudaria na minuta antes de aprovar?"
- "prepare uma nova versao da minuta com base na revisao"

---

## 7. Technical direction

### Step 1
Separar a minuta em blocos/sections.

### Step 2
Avaliar cada secao com base em:

- qualidade estrutural
- densidade argumentativa
- grounding documental
- prontidao para citacao
- guidance do template do escritorio

### Step 3
Produzir um plano de revisao com:

- secao
- problema
- reforco sugerido
- prioridade

### Step 4
Opcionalmente gerar uma nova versao formal `Vn+1` com base nesse plano.

---

## 8. File-by-file target list

- `src/lib/agent/capabilities/registry.ts`
- `src/lib/agent/kernel/router.ts`
- `src/app/api/ai/chat/route.ts`
- `src/lib/agent/capabilities/dispatcher.ts`
- `src/lib/lex/draft-versions.ts`
- `src/lib/lex/case-context.ts`
- `src/app/dashboard/mayus/page.tsx`
- `src/lib/agent/kernel/router.test.ts`
- `src/lib/agent/capabilities/dispatcher.test.ts`
- `e2e/mayus-authenticated.spec.ts`

---

## 9. Execution checklist

## Phase 1 - Capability
- [x] Add `legal_draft_revision_loop` to `registry.ts`
- [x] Define `handler_type: "lex_draft_revision_loop"`
- [x] Set `risk_level: "medium"`

## Phase 2 - Router
- [x] Add revision-loop intent in `router.ts`
- [x] Support prompts for section-by-section improvement
- [x] Add router tests

## Phase 3 - Dispatcher analysis
- [x] Resolve target formal version
- [x] Segment draft into sections
- [x] Score weak sections
- [x] Build structured revision plan

## Phase 4 - Artifact and event
- [x] Register artifact for revision loop
- [x] Register learning event for revision loop

## Phase 5 - Optional Vn+1
- [x] Decide whether package will stop at revision plan or create supervised `Vn+1`
- [ ] If yes, integrate with formal version history

## Phase 6 - MAYUS UI
- [x] Add event label
- [x] Add artifact label
- [x] Add highlights for revision loop output

## Phase 7 - Tests
- [x] Add dispatcher unit tests
- [x] Add MAYUS E2E for revision loop

## Phase 8 - Validation
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run test:e2e`

---

## 10. Decisions to confirm before implementation

- [x] This package stops at a structured revision plan only
- [ ] Or this package already materializes supervised `Vn+1`

Recommended default:
- start with structured revision plan
- add `Vn+1` only if the integration remains small and deterministic

---

## 11. Session continuity block

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
- [x] done

Last completed item:
- [x] Package entregue com capability, plano por secao, artifact/event e cobertura automatizada.

Current blocker:
- [x] none

Files changed in current session:
- [x] docs/brain/MAYUS_MASTER_BLUEPRINT.md
- [x] docs/brain/IMPLEMENTATION-PLAN-legal-draft-revision-loop.md
- [x] src/lib/agent/capabilities/registry.ts
- [x] src/lib/agent/kernel/router.ts
- [x] src/lib/agent/kernel/router.test.ts
- [x] src/app/api/ai/chat/route.ts
- [x] src/lib/agent/capabilities/dispatcher.ts
- [x] src/lib/agent/capabilities/dispatcher.test.ts
- [x] src/app/dashboard/mayus/page.tsx
- [x] e2e/mayus-authenticated.spec.ts

Last validated commands:
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run test:e2e`

Next exact action:
- [x] Abrir o proximo plano: `docs/brain/IMPLEMENTATION-PLAN-artifact-publish-premium.md`.

---

## 12. Resume instruction for future sessions

Resume from:
`docs/brain/IMPLEMENTATION-PLAN-legal-draft-revision-loop.md`

Workflow for next session:
1. read this file first
2. inspect `Session continuity block`
3. continue from the next unchecked execution item only
4. update checklist and continuity block at the end of the session
