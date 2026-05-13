# Implementation Plan - Voice Brain Execution

Status: planned
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
- transformar o `MAYUSOrb` em presenca visual agentica durante a execucao

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
- MAYUSOrb Streamer Mode com estados `idle`, `summoned`, `working` e `presenting`
- testes unitarios/integracao e fluxo observavel

### Out of scope
- acoes irreversiveis sem approval humano
- integracao com telefonia/URA externa
- atendimento por voz para usuarios nao executivos
- tabela paralela de `orb_events`; o controle deve reutilizar Brain runtime e fallback local

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

## MAYUSOrb Streamer Mode

Objetivo: transformar o MAYUSOrb em presenca visual agentica, no padrao "AI assistant como streamer": Orb como facecam e MAYUS executando a missao na tela.

Estados:
- `idle`: Orb pequeno no canto inferior direito.
- `summoned`: Orb centralizado, backdrop com blur e conversa face-to-face.
- `working`: Orb no canto superior esquerdo, MAYUS executando por tras, anel dourado pulsando.
- `presenting`: Orb volta ao centro para apresentar resultado, aprovacao necessaria ou erro.

Arquitetura:
- ElevenLabs permanece como camada de voz.
- MAYUS Brain permanece como camada de decisao e execucao.
- Frontend controla a presenca visual do Orb.
- `MAYUSOrb.tsx` deve ser refatorado para separar visual, voz e estado global.
- `OrbStateProvider/useOrbState` deve usar Context API, nao Zustand.
- `brain_steps` e fallback local do chat/voice bridge devem disparar as transicoes.
- `brain_tasks`, `brain_runs`, `brain_steps`, `brain_artifacts` e `learning_events` continuam sendo o substrato de execucao e auditoria; nao criar `orb_events`.

Aceite:
- O Orb narra por voz e muda visualmente para `working` durante execucao.
- A tela do MAYUS continua clicavel no modo `working`.
- Resultado, erro ou aprovacao levam o Orb para `presenting`.
- Nenhuma acao por voz bypassa tenant, permissao ou aprovacao humana.

---

## 5. File-by-file target list

- `src/app/api/agent/voice/brain-bridge/route.ts`
- `src/app/api/agent/voice/signed-url/route.ts`
- `src/components/dashboard/MAYUSOrb.tsx`
- `src/components/dashboard/orb-state.tsx`
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
- [ ] Implementar MAYUSOrb Streamer Mode com `idle`, `summoned`, `working` e `presenting`
- [ ] Separar estado visual do Orb do estado de voz ElevenLabs
- [ ] Fazer clientTools do ElevenLabs entrarem em `working` antes do `voice/brain-bridge`
- [ ] Fazer resultado, erro ou aprovacao entrarem em `presenting`
- [ ] Usar `brain_steps` via Realtime como gatilho principal e fallback local no chat/voice bridge
- [ ] Exibir missao de voz e status no `dashboard/mayus`

## Phase 5 - Tests
- [ ] Unit/integration tests
- [ ] Unit test do estado do Orb
- [ ] Teste do `MAYUSOrb`: ElevenLabs dispara `working` antes do brain bridge
- [ ] Teste do chat: envio entra em `working`, resposta entra em `presenting`
- [ ] Browser verification desktop/mobile do Orb Streamer Mode
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
