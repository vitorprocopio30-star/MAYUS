# MAYUS Lex Checklist

> Arquivo historico. A fonte oficial atual do roadmap e checklist final do MAYUS e `docs/brain/MAYUS_100_PERCENT_FINAL_CHECKLIST.md`.
> Use este arquivo apenas como evidencia tecnica por frente.

Objetivo: criar o melhor cerebro juridico operacional para escritorio de advocacia no Brasil, com grounding, memoria do caso, artifacts e revisao humana.

## Case Brain

- [x] Contexto juridico por processo existe.
- [x] Memoria documental alimenta geracao de pecas.
- [x] Pendencias documentais aparecem no fluxo juridico.
- [ ] Criar timeline estruturada do caso.
- [ ] Criar mapa de teses por parte.
- [ ] Criar mapa de riscos.
- [ ] Criar proximos atos provaveis com confianca e fonte.
- [ ] Criar diferenca entre fato documentado, inferencia e hipotese.

## Document Brain

- [x] Google Drive por processo existe.
- [x] Sync documental manual existe.
- [x] Leitura de PDF/DOCX existe.
- [ ] Criar sync incremental automatico por evento.
- [ ] Criar deduplicacao por hash de arquivo.
- [ ] Criar detector de documentos contraditorios.
- [ ] Criar checklist documental por area do direito.
- [ ] Criar alerta quando documento critico faltar antes da minuta.

## Legal Grounding

- [x] Source packs e citacoes estruturadas ja aparecem no roadmap.
- [ ] Bloquear peca final com fonte juridica duvidosa.
- [ ] Separar fontes internas, lei, jurisprudencia e doutrina.
- [ ] Validar artigo e tribunal antes de citar.
- [ ] Registrar fonte e trecho usado em cada argumento.
- [ ] Criar painel de lacunas de grounding.

## Draft Factory

- [x] Primeira minuta, historico, aprovacao, publicacao e export existem.
- [x] Artifact premium final em PDF no Drive existe no roadmap atual.
- [x] Lex proativo prepara replica automaticamente quando movimentacao de contestacao gera prazo/card.
Evidencia 2026-04-24: `src/lib/lex/proactive-movement-draft.ts` classifica contestacao protocolada, chama Draft Factory com `movement_auto_draft_factory`, força nova minuta de `Replica` e grava artifact `lex_proactive_movement_draft_request` com `requires_human_review`.
- [x] Registry de eventos proativos Lex/Escavador existe.
Evidencia 2026-04-24: `src/lib/agent/proactive-events/registry.ts` centraliza playbooks para contestacao, sentenca, recurso, citacao e audiencia.
- [x] Audiencia gera artifact/checklist proativo sem minuta formal.
Evidencia 2026-04-24: playbook `lex.escavador.audiencia_designada` cria `lex_proactive_hearing_checklist` via missao artifact-only.
- [ ] Criar expander premium por secao.
- [ ] Criar auditor juridico com score por robustez, prova, tese, pedido e citacao.
- [ ] Criar comparador entre minuta gerada e versao final humana.
- [ ] Promover padroes de escrita aprovados para Style Memory.
- [ ] Criar regra: protocolo externo nunca e executado sem aprovacao humana.

## Suporte de Status do Caso

- [x] `support_case_status` existe como skill.
- [x] Contrato minimo de resposta curta e handoff existe em teste.
- [x] Resposta de status cobre andamento, fase, proximo passo e pendencias.
Evidencia 2026-04-27: validacao focada confirmou separacao entre base confirmada e inferencias operacionais antes da resposta ao cliente.
- [ ] Conectar resposta segura em WhatsApp.
- [ ] Registrar artifact de atendimento de status.
- [ ] Criar politicas de linguagem para cliente: claro, curto, sem prometer resultado.

## Criterios de aceite

- [ ] Comando "Mayus, faca a replica do caso X" gera plano, fontes, minuta, auditoria, Word/PDF e salvamento no Drive.
- [x] Evento "contestacao protocolada" pode preparar replica sem comando manual, mantendo revisao humana obrigatoria antes de uso externo.
- [x] Eventos de sentenca, recurso, citacao e audiencia possuem playbook proativo inicial.
- [ ] Toda citacao juridica tem fonte rastreavel.
- [ ] Todo output juridico relevante exige revisao humana antes de uso externo.
