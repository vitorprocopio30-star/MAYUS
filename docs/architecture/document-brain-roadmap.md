# Cerebro Documental do Processo - Roadmap MAYUS

## Objetivo

Transformar o MAYUS em um sistema que nao apenas organiza cards e prazos, mas que tambem mantem um repositorio documental vivo por processo, alimenta a memoria juridica do caso e usa esse contexto para gerar pecas melhores, resumos mais precisos e operacao mais inteligente.

## Visao

Cada processo deve ter uma estrutura documental propria, organizada e compreendida pelo MAYUS.

Fluxo ideal:

1. O processo e criado no MAYUS.
2. O MAYUS cria automaticamente a pasta do processo no Google Drive.
3. O sistema organiza subpastas padronizadas.
4. Suporte e advogados alimentam essas pastas com documentos do cliente e pecas do caso.
5. O MAYUS indexa esse conteudo, extrai contexto e mantem uma memoria processual viva.
6. Ao gerar peca, resumo ou orientacao, o MAYUS usa o acervo documental real do processo.

## Problema que isso resolve

Hoje o contexto juridico costuma ficar espalhado entre cards, WhatsApp, PDFs, Drive, pecas antigas, decisoes e memoria humana do advogado.

Isso gera:

- resumos fracos
- perda de contexto
- retrabalho
- pecas menos precisas
- dependencia de quem "lembra" do caso

A proposta resolve isso transformando o acervo documental em contexto operacional estruturado.

## Principios do projeto

- Google Drive como repositorio oficial documental do processo.
- MAYUS como camada de organizacao, leitura, memoria e inteligencia.
- O advogado nao deve precisar explicar tudo de novo ao sistema.
- O agente deve trabalhar com contexto real, nao apenas com prompts manuais.
- A experiencia precisa ser simples: subir documento, organizar, resumir e usar.

## Estado atual identificado

Ja existe:

- conexao OAuth com Google Drive por tenant
- definicao de pasta raiz do escritorio
- criacao de pasta por processo
- subpastas padrao por processo
- campo `drive_link` e `drive_folder_id` no processo
- pagina operacional de documentos
- upload de documentos pelo MAYUS
- upload multiplo com organizacao automatica inicial
- listagem de documentos do processo
- leitura/indexacao de PDFs, DOCX e TXT
- memoria documental do processo em `process_document_memory`
- inventario em `process_documents` e `process_document_contents`
- geracao de pecas usando contexto documental
- botao de organizar acervo por processo
- historico operacional basico em `system_event_logs`
- base agentica para artifacts, memorias e eventos

Ainda falta:

- deduplicacao forte por hash/conteudo para acervos migrados
- matching mais robusto entre documentos soltos, processos, OAB, cliente e partes
- aplicacao supervisionada com registro reversivel do antes/depois
- metricas historicas de aprovacao/rejeicao para aprendizado do matching
- knowledge base interna global mais completa do MAYUS para orientar o agente sem expor codigo
- fallback de IA aplicado nos outros fluxos agenticos sensiveis alem do organizar processo

Bloqueios e riscos atuais:

- validacao funcional real do Google Drive ainda depende de OAuth/credenciais validas no ambiente
- scans grandes podem bater quota do Google sem paginacao, limites e retomada
- documentos sensiveis nao devem ter texto bruto persistido antes de aprovacao
- baixa confianca nunca deve mover documento automaticamente
- alteracoes fisicas no Drive precisam de preview, aprovacao e trilha auditavel

## Nova frente: Scanner Agentico de Acervo do Drive

Documento executivo da frente:

- `docs/brain/IMPLEMENTATION-PLAN-drive-document-scanner.md`

Objetivo:

Criar uma camada agentica acima da organizacao por processo, capaz de analisar uma pasta grande do Google Drive, reconhecer documentos antigos ou soltos, cruzar com processos/OAB, propor a organizacao correta, aplicar somente com aprovacao e alimentar o cerebro do MAYUS.

Fluxo alvo:

1. Usuario escolhe uma pasta raiz do Drive.
2. MAYUS executa scan seguro sem mover nada.
3. MAYUS cria preview com acoes propostas e nivel de confianca.
4. Usuario revisa alta/media/baixa confianca.
5. MAYUS aplica somente acoes aprovadas.
6. MAYUS atualiza Drive, `process_documents`, `process_document_memory`, artifacts, learning events e memorias.
7. Pendencias ficam numa fila inteligente de revisao.

Percentual estimado:

- Projeto MAYUS geral: 83% pronto, 17% faltante.
- Cerebro documental por processo: 87% pronto, 13% faltante.
- Nova frente Scanner Agentico de Acervo do Drive: 95% pronta, 5% faltante.

## Hipotese de produto

Se cada processo tiver uma pasta estruturada e o MAYUS conseguir ler e organizar os documentos relevantes, entao:

- os resumos ficam mais ricos
- o agente fica sempre contextualizado
- a geracao de pecas fica mais precisa
- a operacao do escritorio fica mais padronizada
- a troca de responsavel deixa de quebrar o contexto do caso

## Estrutura sugerida por processo

Pasta principal:

- `CLIENTE - NUMERO_PROCESSO - TITULO`

Subpastas padrao:

- `01-Documentos do Cliente`
- `02-Inicial`
- `03-Contestacao`
- `04-Manifestacoes`
- `05-Decisoes e Sentencas`
- `06-Provas`
- `07-Prazos e Audiencias`
- `08-Recursos`
- `09-Pecas Finais`
- `10-Administrativo`

## Fluxo operacional desejado

### 1) Criacao do processo

- Usuario cria o processo no MAYUS.
- MAYUS salva o card.
- MAYUS cria a pasta do processo no Drive.
- MAYUS cria subpastas padrao.
- MAYUS grava o link da pasta no processo.

### 2) Alimentacao documental

- Suporte recolhe documentos do cliente.
- Advogado sobe inicial, contestacao, decisoes, sentenca e demais arquivos.
- O processo passa a ter repositorio centralizado.

### 3) Sincronizacao e leitura

- MAYUS lista arquivos da pasta.
- MAYUS identifica tipo documental.
- MAYUS extrai texto.
- MAYUS gera resumo incremental.
- MAYUS atualiza memoria estruturada do processo.

### 4) Uso pelo agente

- Ao pedir resumo, o agente le memoria + documentos relevantes.
- Ao pedir peca, o agente usa o acervo do processo.
- Ao pedir orientacao, o agente considera fase, documentos, partes e historico.

## MVP recomendado

### Fase 1 - Base operacional

- Corrigir erro de salvamento de `process_tasks`
- Unificar a integracao do Google Drive na pagina correta do menu
- Criar pagina `Repositorio de Documentos`
- Criar pasta automatica por processo salvo
- Criar subpastas padrao
- Mostrar no repositorio: processo, link da pasta, status de sincronizacao, quantidade de documentos e ultima atualizacao

### Fase 2 - Ingestao documental

- Listar arquivos do Drive por processo
- Permitir sincronizacao manual
- Ler PDFs e DOCX
- Classificar documentos por tipo
- Gerar resumo documental incremental
- Salvar memoria documental estruturada no banco

### Fase 3 - Cerebro juridico

- Injetar memoria documental no gerador de pecas
- Permitir comandos como:
  - gerar contestacao com base na inicial e documentos
  - resumir processo
  - listar documentos faltantes
  - apontar contradicoes
  - gerar cronologia do caso
- Usar isso no chat do MAYUS e no gerador de pecas

## Dados que o MAYUS deve extrair dos documentos

- partes
- fatos relevantes
- pedidos
- fundamentos juridicos
- cronologia do caso
- provas mencionadas
- decisoes importantes
- tese da parte autora
- tese da parte re
- pontos controvertidos
- valores
- prazos
- pendencias documentais

## Memoria estruturada desejada por processo

Cada processo deve ter um estado resumido com:

- identificacao do caso
- cliente
- numero do processo
- fase atual
- resumo mestre
- linha do tempo
- pecas existentes
- decisoes relevantes
- documentos-chave
- tese principal
- tese adversa
- provas disponiveis
- provas faltantes
- riscos processuais
- proximos passos sugeridos

## Papel dos usuarios

### Suporte

- recolher documentos do cliente
- subir documentos iniciais
- manter checklist documental

### Advogado

- subir pecas e documentos relevantes
- consultar o repositorio
- usar o agente para resumo e geracao de peca

### MAYUS

- organizar
- classificar
- resumir
- manter memoria
- sugerir proximos passos
- gerar pecas com contexto

## Riscos e cuidados

- Nao basta guardar arquivo; e preciso entender o conteudo.
- Sem boa classificacao documental, a memoria vira ruido.
- E preciso respeitar isolamento por tenant.
- Documentos sensiveis exigem controle rigoroso de acesso.
- O sistema deve deixar claro quando a resposta foi baseada em documento real e quando foi inferencia.
- Para `support_case_status`, a resposta ao cliente deve explicitar essa fronteira na pratica: andamento, fase, proximo passo e pendencias podem ser respondidos a partir da base confirmada, enquanto inferencias operacionais precisam ser marcadas como inferencia e manter handoff humano quando a confianca for baixa. Evidencia 2026-04-27: validacao focada do pacote.

## Metricas de sucesso

- percentual de processos com pasta criada automaticamente
- percentual de processos com repositorio alimentado
- quantidade media de documentos por processo
- qualidade percebida dos resumos
- qualidade percebida das pecas
- reducao de retrabalho
- reducao de pedidos repetidos de contexto ao advogado
- tempo para preparar peca inicial ou manifestacao

## Decisao de produto recomendada

Modelo recomendado: hibrido.

- Google Drive como repositorio oficial
- MAYUS como camada de indexacao, memoria e inteligencia

## Pendencias imediatas

- corrigir criacao de processo
- mover Google Drive para a tela de integracoes do menu
- criar a pagina `Repositorio de Documentos`
- ligar criacao de pasta a criacao do processo
- definir estrutura padrao de subpastas
- definir modelo de memoria documental no banco
- planejar ingestao de PDF/DOCX
- plugar memoria documental ao agente e ao gerador de pecas

## Conclusao

A ideia faz total sentido e pode se tornar um dos principais diferenciais do MAYUS.

O valor real nao esta apenas em guardar arquivos, mas em transformar o acervo documental do processo em memoria operacional viva, contexto juridico confiavel e inteligencia pratica para gerar pecas, resumos e decisoes melhores.
