# MAYUS Proactive Events Workstream

Status: em execucao pelo Codex atual.
Data: 2026-04-24.

## Ownership

Esta frente pertence ao Codex atual ate novo alinhamento.

Arquivos sob ownership direto:

- `src/lib/agent/proactive-events/registry.ts`
- `src/lib/lex/proactive-movement-draft.ts`
- `src/lib/lex/proactive-movement-draft.test.ts`
- `src/lib/lex/draft-factory.ts`
- `src/lib/juridico/analisador.ts`
- `docs/checklists/lex/CHECKLIST.md`
- `docs/checklists/core/CHECKLIST.md`
- `docs/checklists/ops-quality/CHECKLIST.md`
- `docs/operations/proactive-events-workstream.md`

## Objetivo

Transformar eventos relevantes do MAYUS em missoes proativas: detectar, escolher playbook, preparar minuta/artifact/checklist, registrar evidencias e bloquear qualquer acao externa ate revisao/OK humano quando houver risco.

## Contrato Atual

Registry canonico:

- `resolveProactiveEventPlaybook(input)`
- Entrada: dominio, fonte, tipo do evento, texto, descricao e metadata.
- Saida: playbook com `actionType`, `recommendedPieceInput`, `artifactType`, `riskLevel`, checklist e flags de revisao humana.

Actions atuais:

- `draft_factory`: chama Draft Factory e gera minuta formal versionada.
- `artifact_only`: cria missao, run, step e artifact operacional para revisao humana.

## Playbooks Ativos

- `lex.escavador.contestacao_protocolada` -> `Replica`.
- `lex.escavador.sentenca_publicada` -> `Apelacao`.
- `lex.escavador.apelacao_interposta` -> `Contrarrazoes de Apelacao`.
- `lex.escavador.recurso_interposto` -> `Manifestacao`.
- `lex.escavador.citacao_recebida` -> `Contestacao`.
- `lex.escavador.audiencia_designada` -> artifact `lex_proactive_hearing_checklist`.

## Nao Colidir

Outro agente pode continuar:

- Vault em integracoes.
- `agent_audit_logs` vs `system_event_logs`.
- Migration `20260424110000_system_event_logs.sql`.
- Smoke Google Drive.
- Smoke Escavador `novo_processo`.
- Typecheck global e blockers de integracao.

Outro agente nao deve alterar os arquivos de ownership acima sem alinhamento.

## Proximas Expansoes Planejadas

- CRM: lead qualificado -> proposta, contrato e cobranca supervisionados.
- Financeiro: pagamento atrasado -> cobranca sugerida com politica de risco.
- Drive: documento novo -> classificacao, memoria do caso e lacunas.
- WhatsApp: pedido de status -> resposta segura ou rascunho para revisao.
- Voz: comando executivo -> plano e handoff seguro de approval.
