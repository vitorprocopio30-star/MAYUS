# Implementation Plan - Drive Document Scanner Agentico

## Objetivo

Transformar o MAYUS em um agente capaz de analisar um acervo documental inteiro do Google Drive, cruzar arquivos com processos/OAB, propor uma organizacao segura, aplicar somente com aprovacao e alimentar o cerebro do caso sem expor codigo ou detalhes tecnicos ao usuario.

Esta frente amplia o Document Brain atual. Ela nao substitui a organizacao por processo; ela cria uma camada superior para sanear pastas antigas, acervos migrados de sistema anterior e drives com documentos soltos.

## Estado atual

Base ja entregue:

- Google Drive por tenant e por processo.
- Criacao de pasta e subpastas padrao por processo.
- Upload multiplo com organizacao automatica.
- Botao de organizar acervo do processo.
- Sync documental com PDF, DOCX e TXT.
- `process_documents`, `process_document_contents` e `process_document_memory`.
- Integracao com memoria juridica e geracao de pecas.
- Base agentica com `brain_tasks`, `brain_runs`, `brain_steps`, `brain_artifacts`, `brain_memories` e `learning_events`.
- Roteador de LLM por tenant com provedores configuraveis.

Gaps principais agora:

- Deduplicacao forte por hash/metadados.
- Aplicacao supervisionada com rollback metadata.
- Matching mais robusto entre documentos, processos, OAB, cliente e partes.
- Metricas historicas de qualidade por aprovacao/rejeicao e aprendizado do matching.
- Knowledge base interna global mais completa para o agente saber capacidades e caminhos do MAYUS.
- Fallback de IA aplicado gradualmente nos outros fluxos agenticos alem do `organizar_processo`.

## Percentual estimado

- Projeto MAYUS geral: 83% pronto, 17% faltante.
- Cerebro documental por processo: 87% pronto, 13% faltante.
- Nova frente Drive Document Scanner: 95% pronto, 5% faltante.

Esses numeros sao estimativas operacionais, nao metricas automaticas. Eles consideram codigo entregue, validacao ja feita, superficie de produto visivel e riscos ainda pendentes.

Entregue em 2026-04-28 nesta frente:

- migration das tabelas `drive_scan_runs`, `drive_scan_items`, `drive_scan_actions`, `drive_scan_item_matches` e `mayus_internal_knowledge`;
- seed interno da capability `drive_document_scanner`;
- servico `drive-document-scanner` com scan/preview sem side effects;
- scoring inicial por numero CNJ, cliente, titulo/caminho e tipo documental;
- deteccao inicial de duplicidade por nome, MIME type e tamanho;
- endpoint `POST /api/documentos/drive-scan/preview`;
- criacao de `brain_task`, `brain_run`, `brain_step`, artifact `drive_document_organization_plan`, `learning_event` e evento operacional seguro;
- endpoint `POST /api/documentos/drive-scan/apply` para aplicar acoes propostas/aprovadas de alta confianca;
- aplicacao conservadora com skip para baixa/media confianca, duplicados e revisao humana;
- criacao/reuso da estrutura documental do processo antes de mover;
- movimentacao no Drive com parent original registrado;
- sincronizacao de `process_documents` e `process_document_memory` apos apply;
- artifact `drive_document_organization_result` e evento `drive_document_organization_applied`;
- UI inicial em Documentos com botao `Analisar Drive`, preview de contadores, primeiras acoes e botao `Aplicar Seguras`;
- campo para informar ID ou link de uma pasta raiz especifica antes do scan;
- selecao individual de acoes seguras no preview;
- area de revisao humana separada para baixa/media confianca, duplicados ou acoes nao aplicaveis automaticamente;
- endpoint `GET/POST /api/documentos/drive-scan/review` para listar, aprovar ou rejeitar pendencias persistidas;
- fila persistente de revisao no produto com acoes `Abrir`, `Aprovar e aplicar` e `Rejeitar`;
- filtros por confianca/tipo de pendencia e selecao em lote na fila de revisao;
- metricas operacionais da fila de revisao: pendentes, movimentaveis, duplicados e sem processo;
- decisao em lote na API e aplicacao supervisionada agrupada por scan;
- apply supervisionado permitindo acao de media/baixa confianca somente depois de aprovacao humana explicita;
- historico simples das ultimas analises globais do Drive;
- testes focados do scanner, preview, apply, skips, duplicados e falha parcial.
- fundacao de fallback IA/credito com `getLLMClientCandidates`, classificador de falhas e wrapper `callLLMWithFallback`;
- mensagens publicas sanitizadas para ausencia de chave, credito/quota, rate limit, modelo indisponivel e fallback usado;
- `Organizar com IA` usando fallback seguro entre provedores configurados, sem expor chave, endpoint ou erro bruto ao usuario.

## Arquitetura alvo

### 1. Scanner sem side effects

Criar `src/lib/services/drive-document-scanner.ts`.

Responsabilidades:

- Ler uma pasta raiz informada/configurada.
- Respeitar limite de profundidade, quantidade de arquivos e paginas do Drive.
- Ignorar lixeira e arquivos inacessiveis.
- Coletar metadados seguros.
- Detectar sinais no nome, pasta, MIME type e pequenos trechos quando permitido.
- Cruzar com `process_tasks`, processos/OAB e estruturas de Drive existentes.
- Gerar candidatos de processo com score e razao explicavel.
- Gerar acoes propostas sem mover arquivos.

### 2. Preview persistido

O primeiro endpoint deve criar apenas um plano:

`POST /api/documentos/drive-scan/preview`

Saida esperada:

- run do scanner.
- contadores por status.
- lista de acoes propostas.
- pendencias de revisao humana.
- artifact `drive_document_organization_plan`.

Nada deve ser movido no Drive durante o preview.

### 3. Aplicacao supervisionada

Endpoint:

`POST /api/documentos/drive-scan/apply`

Regras:

- Exigir `runId` e aprovacao explicita.
- Permitir aplicar somente acoes selecionadas.
- Alta confianca pode entrar no lote aprovado.
- Media confianca deve aparecer destacada para revisao.
- Baixa confianca nunca move automaticamente.
- Salvar parents originais antes de mover.
- Cada acao aplicada deve ser idempotente.
- Falhas parciais nao devem quebrar a execucao inteira.

### 4. Integracao com o cerebro

Cada scan deve criar ou atualizar:

- `brain_tasks`
- `brain_runs`
- `brain_steps`
- `brain_artifacts`
- `brain_memories`
- `learning_events`

Artifacts/eventos sugeridos:

- artifact: `drive_document_organization_plan`
- artifact: `drive_document_organization_result`
- event: `drive_document_scan_preview_created`
- event: `drive_document_organization_applied`
- memory type: `drive_document_patterns`

### 5. Integracao com Document Brain

Quando uma acao for aplicada:

- criar/reutilizar pasta do processo;
- criar/reutilizar subpastas padrao;
- mover arquivo para a pasta correta;
- upsert em `process_documents`;
- extrair conteudo quando permitido;
- atualizar `process_document_memory`;
- registrar lacunas documentais;
- criar evento operacional seguro em `system_event_logs`.

### 6. Knowledge base interna global

Criar uma base interna para o agente entender o que o MAYUS faz, sem mostrar codigo ao usuario.

Tabela sugerida: `mayus_internal_knowledge`.

Campos:

- `id`
- `scope`
- `module`
- `capability_key`
- `title`
- `summary`
- `routing_hints`
- `constraints`
- `required_integrations`
- `safe_user_explanation`
- `internal_notes`
- `tags`
- `version`
- `status`
- `created_at`
- `updated_at`

Regras:

- Usuario comum nao deve ter SELECT direto nessa tabela.
- O agente usa via service role/server.
- Conteudo deve ser operacional, sem codigo bruto, tokens, nomes de segredos ou detalhes sensiveis.
- Explicacoes ao usuario devem usar apenas `safe_user_explanation` ou resumo sanitizado.

### 7. Fallback de IA e credito

Melhorar o contrato do LLM runtime para diferenciar:

- ausencia de chave;
- chave invalida;
- falta de credito;
- rate limit;
- quota;
- modelo indisponivel;
- provider indisponivel.

Saida interna esperada:

- `providerAttempted`
- `modelAttempted`
- `fallbackProvider`
- `fallbackModel`
- `fallbackReason`
- `degradedMode`
- `technicalReason`
- `userNotice`

Mensagem ao usuario deve ser simples:

"Nao consegui usar o modelo principal porque a integracao de IA precisa de credito ou configuracao. Posso continuar em modo limitado para organizar por nome, pasta e sinais basicos."

## Migrations propostas

### `drive_scan_runs`

Guarda cada execucao do scanner.

Campos principais:

- `id`
- `tenant_id`
- `created_by`
- `root_folder_id`
- `root_folder_name`
- `status`
- `mode`
- `max_depth`
- `max_items`
- `counters`
- `brain_task_id`
- `brain_run_id`
- `brain_artifact_id`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

### `drive_scan_items`

Guarda arquivos e pastas encontrados.

Campos principais:

- `id`
- `tenant_id`
- `scan_run_id`
- `drive_file_id`
- `parent_folder_id`
- `name`
- `mime_type`
- `size_bytes`
- `modified_at`
- `web_view_link`
- `item_kind`
- `detected_signals`
- `candidate_process_task_id`
- `candidate_process_number`
- `candidate_client_name`
- `confidence`
- `review_reason`
- `status`

### `drive_scan_actions`

Guarda acoes propostas e aplicadas.

Campos principais:

- `id`
- `tenant_id`
- `scan_run_id`
- `scan_item_id`
- `action_type`
- `target_process_task_id`
- `target_folder_label`
- `target_drive_folder_id`
- `before_payload`
- `after_payload`
- `confidence`
- `reason`
- `status`
- `applied_at`
- `error_message`

### `drive_scan_item_matches`

Opcional para multiplos candidatos.

Campos principais:

- `id`
- `tenant_id`
- `scan_item_id`
- `process_task_id`
- `score`
- `signals`
- `reason`

## UI alvo

Em Documentos:

- botao `Analisar Drive`;
- selecao da pasta raiz;
- preview com filtros;
- lista de acoes propostas;
- grupo de alta confianca;
- grupo de revisar antes;
- grupo de duplicados;
- grupo de sem processo encontrado;
- botao `Aplicar organizacao`;
- historico de execucoes;
- pendencias inteligentes.

Em Configuracoes/Integracoes:

- status do Google Drive;
- status dos provedores de IA;
- aviso de credito/configuracao;
- modelo secundario quando configurado.

## Seguranca e privacidade

- Nunca escanear o Drive inteiro sem pasta raiz.
- Nao persistir texto bruto no preview.
- Salvar apenas sinais, metadados e excerpts curtos quando necessario.
- Nao mover documento com baixa confianca.
- RLS por tenant em todas as tabelas novas.
- Knowledge base interna sem SELECT para usuario comum.
- Logs sem tokens, chaves, refresh token ou payload sensivel.
- Respeitar quotas do Google Drive com paginacao, limites e retomada.
- Toda acao externa precisa de trilha auditavel.

## Fases de execucao

### Fase 1 - Dados e contrato

- [x] Criar migrations `drive_scan_runs`, `drive_scan_items`, `drive_scan_actions` e `mayus_internal_knowledge`.
- [x] Adicionar RLS e indices por tenant/status/root/process.
- [x] Definir tipos TypeScript do scan.
- [x] Semear primeiros registros internos da knowledge base.

### Fase 2 - Scanner e preview

- [x] Criar `drive-document-scanner.ts`.
- [x] Implementar scoring por CNJ, cliente, nome da pasta/titulo e tipo documental.
- [x] Implementar dedupe por metadados inicialmente.
- [x] Criar endpoint preview.
- [x] Criar artifact `drive_document_organization_plan`.
- [x] Testar sem side effects.
- [ ] Enriquecer matching com partes/OAB quando o schema de origem estiver confirmado.
- [ ] Adicionar retomada/checkpoint para acervos grandes.

### Fase 3 - Apply supervisionado

- [x] Criar endpoint apply.
- [x] Criar/reutilizar pasta do processo.
- [x] Mover arquivos com parents originais salvos.
- [x] Atualizar `process_documents` e `process_document_memory`.
- [x] Criar learning events por acao aplicada.
- [x] Criar artifact de resultado da aplicacao.
- [x] Registrar falhas parciais e pendencias.
- [ ] Criar undo/revert operacional a partir dos parents originais.
- [x] Criar testes de servico com mocks de movimentacao real.
- [ ] Refinar idempotencia para arquivo ja movido por outra execucao.

### Fase 4 - UI operacional

- [x] Adicionar botao `Analisar Drive`.
- [x] Criar painel inicial de preview.
- [x] Criar fluxo para aplicar acoes seguras do preview.
- [x] Criar selecao individual de acoes.
- [x] Mostrar historico simples de scans globais.
- [ ] Mostrar historico completo com detalhe por run.
- [ ] Mostrar pendencias inteligentes em uma fila dedicada.
- [ ] Exibir avisos de Drive/IA sem detalhe tecnico.

### Fase 5 - Fallback IA

- [x] Criar wrapper de chamada LLM com classificacao de erro.
- [x] Adicionar lista de candidatos sem quebrar `getLLMClient`.
- [x] Retornar notice limpo e sem erro bruto do provider.
- [x] Plugar o wrapper nas rotas de IA mais criticas.
Evidencia 2026-04-29: `/api/monitoramento/resumir`, chat geral OpenAI-compatible, chat Anthropic com tool-use, `generate-piece`, `analisador` de movimentacoes, moderador do mural, organizador de processo e `/api/ai/ping` passaram a usar `callLLMWithFallback` ou classificacao compartilhada de falhas, retornando mensagens/erros sanitizados quando faltar chave, credito/limite ou provedor disponivel e preservando trace sem chave. Validacoes: testes focados de resumo/mural/ping/organizador/analisador + `llm-fallback` + `llm-router` passaram; typecheck passou.
- [ ] Adicionar configuracao explicita de modelo secundario/free por tenant.
- [ ] Registrar detalhes tecnicos somente em log interno/evento seguro.

## Testes obrigatorios

- Scanner: match por CNJ, cliente, pasta e OAB.
- Scanner: baixa confianca nao gera acao automatica.
- Scanner: limite de profundidade e quantidade.
- Scanner: nao sai da pasta raiz.
- Scanner: duplicados nao viram multiplos documentos confirmados.
- Preview: nao move arquivo no Drive.
- Apply: exige aprovacao.
- Apply: movimento idempotente.
- Apply: falha parcial registra erro sem perder a run.
- Apply: salva parents originais.
- Rotas: sem Drive conectado.
- Rotas: OAuth expirado com refresh.
- Rotas: tenant errado.
- LLM fallback: sem chave, chave invalida, credito/quota, fallback disponivel, fallback indisponivel.
- RLS: outro tenant nao enxerga scan.
- Knowledge base: usuario comum nao le conteudo interno.

## Criterios de aceite

- Usuario consegue apontar uma pasta raiz de documentos antigos.
- MAYUS gera preview sem mover nada.
- MAYUS cruza documentos com processos/OAB e mostra confianca.
- Usuario consegue aplicar somente acoes aprovadas.
- Documentos aplicados aparecem no acervo do processo correto.
- Memoria do processo e atualizada.
- Cerebro do MAYUS registra artifact, eventos e memorias.
- Falta de credito/chave de IA vira aviso amigavel e modo limitado.
- Nada sensivel e exposto ao usuario.

## Percentual por fase

- Fase 1: 100% entregue nesta frente nova.
- Fase 2: 70% entregue nesta frente nova.
- Fase 3: 85% entregue nesta frente nova.
- Fase 4: 70% entregue nesta frente nova.
- Fase 5: 45% entregue nesta frente nova.

Base reaproveitavel ja existente para acelerar a frente: incorporada na estimativa de 84%.

## Proxima acao recomendada

Avancar para plugar `callLLMWithFallback` nas rotas juridicas criticas, completar pendencias inteligentes, historico detalhado por run e undo/revert operacional.
