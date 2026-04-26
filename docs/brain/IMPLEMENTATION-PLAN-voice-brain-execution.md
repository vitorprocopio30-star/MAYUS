# Implementation Plan - Voice Brain Execution

Status: deferred
Owner: MAYUS / AGENTE MAYA
Primary source documents:
- docs/brain/MAYUS_MASTER_BLUEPRINT.md
- docs/architecture/document-brain-roadmap.md

---

## 1. Objective

Fechar a proxima camada operacional do Voice Brain do MAYUS.

O sistema deve ser capaz de:

- acionar missoes por voz no mesmo brain principal
- resumir estado do caso por voz com resposta curta e pronta para TTS
- encaminhar approvals de voz com seguranca executiva
- refletir a missao de voz no MAYUS e no inbox de aprovacoes

---

## 2. Why this layer now

Hoje a infraestrutura base de voz ja existe:

- shell de voz no `MAYUSOrb`
- signed URL protegida da ElevenLabs
- ponte `voice -> brain`
- `voice_turn_processed` no runtime do cerebro

O maior gap agora e transformar essa base em experiencia agentica operacional de verdade, sem quebrar os mesmos controles de seguranca do chat.

---

## 3. Scope

### In scope
- contrato claro entre shell de voz e mission engine
- respostas de voz curtas e operacionais para briefing/status
- trilha segura para approvals de voz
- visibilidade da missao de voz em MAYUS e Aprovacoes
- testes unitarios/integracao e fluxo observavel

### Out of scope
- acoes irreversiveis sem approval humano
- integracao com telefonia/URA externa
- atendimento por voz para usuarios nao executivos

---

## 4. Existing implementation to reuse

- `src/app/api/agent/voice/brain-bridge/route.ts`
- `src/app/api/agent/voice/signed-url/route.ts`
- `src/components/dashboard/MAYUSOrb.tsx`
- `src/lib/brain/turn.ts`
- `src/app/api/ai/approve/route.ts`
- `src/app/dashboard/mayus/page.tsx`
- `src/app/dashboard/aprovacoes/page.tsx`

---

## 5. File-by-file target list

- `src/app/api/agent/voice/brain-bridge/route.ts`
- `src/app/api/agent/voice/signed-url/route.ts`
- `src/components/dashboard/MAYUSOrb.tsx`
- `src/app/dashboard/mayus/page.tsx`
- `src/lib/brain/turn.ts`
- `src/app/api/ai/approve/route.ts`
- `src/app/dashboard/aprovacoes/page.tsx`
- `src/app/api/agent/voice/brain-bridge/route.test.ts`
- `src/app/api/agent/voice/signed-url/route.test.ts`
- `e2e/mayus-authenticated.spec.ts`

---

## 6. Execution checklist

## Phase 1 - Voice contract
- [ ] Definir o contrato minimo entre ElevenLabs shell e brain principal
- [ ] Definir resposta curta e pronta para TTS para briefing/status

## Phase 2 - Mission execution by voice
- [ ] Acionar missoes juridicas por voz no mesmo runtime
- [ ] Entregar resumo de caso/status por voz com contexto seguro

## Phase 3 - Voice approvals
- [ ] Definir o handoff seguro de approval vindo da voz
- [ ] Refletir isso no inbox e na trilha do cerebro

## Phase 4 - MAYUS / Orb visibility
- [ ] Fechar feedback operacional no `MAYUSOrb`
- [ ] Exibir missao de voz e status no `dashboard/mayus`

## Phase 5 - Tests
- [ ] Unit/integration tests
- [ ] E2E observavel

## Phase 6 - Validation
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:e2e`

---

## 7. Session continuity block

Current phase:
- [x] not started
- [ ] phase 1
- [ ] phase 2
- [ ] phase 3
- [ ] phase 4
- [ ] phase 5
- [ ] phase 6
- [ ] done

Last completed item:
- [x] Plan created and linked from the master blueprint.

Current blocker:
- [x] Repriorizado para depois de `support_case_status`, `referral_intake` e `growth_frontdoor`.

Files changed in current session:
- [x] docs/brain/MAYUS_MASTER_BLUEPRINT.md
- [x] docs/brain/IMPLEMENTATION-PLAN-voice-brain-execution.md

Last validated commands:
- [x] not run in this planning session

Next exact action:
- [ ] Retomar este plano somente depois que suporte e entrada comercial estiverem fechados.

---

## 8. Resume instruction for future sessions

Resume from:
`docs/brain/IMPLEMENTATION-PLAN-voice-brain-execution.md`

Workflow for next session:
1. read this file first
2. inspect `Session continuity block`
3. continue from the next unchecked execution item only
4. update checklist and continuity block at the end of the session
