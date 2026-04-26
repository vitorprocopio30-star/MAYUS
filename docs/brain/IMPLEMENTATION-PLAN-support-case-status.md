# Implementation Plan - Support Case Status

Status: in_progress
Owner: MAYUS / AGENTE MAYA
Primary source documents:
- docs/brain/MAYUS_MASTER_BLUEPRINT.md
- docs/architecture/document-brain-roadmap.md

---

## 1. Objective

Fechar a camada agentica de suporte para clientes que perguntam como esta o caso.

O sistema deve ser capaz de:

- identificar o processo certo a partir de nome, numero, cliente ou contexto
- resumir andamento, fase, proximo passo e pendencias em linguagem de suporte
- responder sem inventar fatos, prazos ou atos processuais
- registrar artifact e learning event de atendimento
- encaminhar para handoff humano quando houver baixa confianca

---

## 2. Why this layer now

Hoje o juridico interno do MAYUS ja cobre:

- contexto juridico do processo
- memoria documental
- primeira minuta
- revisao, approval e publicacao
- learning loop supervisionado

O maior gap agora e o atendimento continuo ao cliente ja convertido, que continua perguntando status do caso fora do fluxo interno de producao.

---

## 3. Scope

### In scope
- identificar o caso a partir de referencias ambigas quando possivel
- responder status do caso em linguagem curta, clara e operacional
- resumir proximo passo e pendencias documentais relevantes
- gerar artifact/evento interno do atendimento
- sinalizar necessidade de handoff humano

### Out of scope
- intake comercial completo de lead novo
- triagem de indicacoes fora do funil
- resposta por voz
- acoes externas irreversiveis sem approval humano

---

## 4. Existing implementation to reuse

- `src/lib/agent/capabilities/registry.ts`
- `src/lib/agent/capabilities/dispatcher.ts`
- `src/lib/lex/case-context.ts`
- `src/lib/skills/consulta-processo-whatsapp.ts`
- `src/app/dashboard/mayus/page.tsx`
- capability `legal_case_context`
- capability `whatsapp_process_query`

---

## 5. File-by-file target list

- `src/lib/agent/capabilities/registry.ts`
- `src/lib/agent/capabilities/dispatcher.ts`
- `src/lib/lex/case-context.ts`
- `src/lib/skills/consulta-processo-whatsapp.ts`
- `src/app/dashboard/mayus/page.tsx`
- `src/lib/agent/capabilities/dispatcher.test.ts`
- `e2e/mayus-authenticated.spec.ts`

---

## 6. Execution checklist

## Phase 1 - Support contract
- [x] Definir o contrato minimo de resposta de status do caso
- [x] Definir quando responder e quando escalar para handoff humano

## Phase 2 - Resolution
- [ ] Identificar processo por nome, numero ou cliente com seguranca razoavel
- [ ] Resumir andamento, fase, proximo passo e pendencias em linguagem de suporte

## Phase 3 - Auditability
- [ ] Registrar artifact do atendimento de status do caso
- [ ] Registrar learning event de suporte juridico

## Phase 4 - MAYUS visibility
- [ ] Exibir o atendimento de suporte no MAYUS
- [ ] Exibir sinais de handoff quando houver baixa confianca

## Phase 5 - Tests
- [ ] Unit tests
- [ ] E2E observavel

## Phase 6 - Validation
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:e2e`

---

## 7. Session continuity block

Current phase:
- [ ] not started
- [ ] phase 1
- [x] phase 2
- [ ] phase 3
- [ ] phase 4
- [ ] phase 5
- [ ] phase 6
- [ ] done

Last completed item:
- [x] Contrato minimo de `support_case_status` implementado no runtime com resposta curta, criterio de confianca e handoff humano quando faltar base suficiente.

Current blocker:
- [x] none

Files changed in current session:
- [x] docs/brain/IMPLEMENTATION-PLAN-support-case-status.md
- [x] src/lib/lex/case-context.ts
- [x] src/lib/lex/case-context.test.ts
- [x] src/lib/agent/capabilities/registry.ts
- [x] src/lib/agent/capabilities/dispatcher.ts
- [x] src/lib/agent/capabilities/dispatcher.test.ts
- [x] src/lib/agent/kernel/router.ts
- [x] src/lib/agent/kernel/router.test.ts
- [x] src/app/api/ai/chat/route.ts

Last validated commands:
- [x] `npm test -- --run src/lib/lex/case-context.test.ts src/lib/agent/kernel/router.test.ts src/lib/agent/capabilities/dispatcher.test.ts`
- [x] `npm run build`

Next exact action:
- [ ] Identificar processo por nome, numero ou cliente com seguranca razoavel e reaproveitar esse match no `support_case_status`.

---

## 8. Resume instruction for future sessions

Resume from:
`docs/brain/IMPLEMENTATION-PLAN-support-case-status.md`

Workflow for next session:
1. read this file first
2. inspect `Session continuity block`
3. continue from the next unchecked execution item only
4. update checklist and continuity block at the end of the session
