# MAYUS Service Checklists

Gerado em 2026-04-24.

> Arquivo historico. A fonte oficial atual do roadmap e checklist final do MAYUS e `docs/brain/MAYUS_100_PERCENT_FINAL_CHECKLIST.md`.
> Use estes checklists por servico como evidencia tecnica e detalhe operacional; novas prioridades consolidadas devem refletir no documento mestre.

Esta pasta e o painel de execucao por servico do MAYUS. Cada subpasta tem um `CHECKLIST.md` com criterios objetivos para dar check. Marque `[x]` somente quando houver evidencia: teste, build, print, log, migration aplicada, endpoint validado ou aceite de produto.

## Como usar

- [ ] Abrir uma branch por pacote de trabalho.
- [ ] Escolher um servico em `docs/checklists/<servico>/CHECKLIST.md`.
- [ ] Converter cada item `[ ]` em issue/tarefa pequena.
- [ ] Registrar evidencia no proprio item antes de marcar `[x]`.
- [ ] Rodar ao menos `npm.cmd test` para mudancas de backend/agent e `npm.cmd run build` antes de release.
- [ ] Atualizar este indice quando um servico mudar de fase.

## Regra operacional permanente

- Todo pacote de trabalho deve identificar os checklists impactados antes de editar codigo.
- Toda entrega deve terminar com atualizacao de marcacao nos checklists impactados.
- Um item so vira `[x]` com evidencia real. Se ainda estiver em execucao, o item permanece `[ ]` e a evidencia parcial deve ser registrada no proprio checklist.

## Servicos

- [core](./core/CHECKLIST.md): Mission Engine, skills, aprovacoes, memoria e auditoria.
- [growth](./growth/CHECKLIST.md): captacao, qualificacao, follow-up, proposta e contrato.
- [lex](./lex/CHECKLIST.md): Case Brain, grounding juridico, Draft Factory e artifacts.
- [finance](./finance/CHECKLIST.md): cobranca, inadimplencia, forecast e revenue-to-case.
- [integrations](./integrations/CHECKLIST.md): Supabase, Drive, Escavador, WhatsApp, ZapSign, Asaas.
- [voice](./voice/CHECKLIST.md): voz como canal do mesmo Brain.
- [experience](./experience/CHECKLIST.md): UX agentica sem curso para o usuario.
- [security](./security/CHECKLIST.md): RLS, LGPD, secrets, webhooks, dependencies, logging.
- [ops-quality](./ops-quality/CHECKLIST.md): testes, build, e2e, observabilidade e release gates.

## Principios de produto

- [ ] O usuario nunca deve precisar aprender o sistema antes de obter valor.
- [ ] Toda tela critica deve ter um caminho agentico equivalente: "Mayus, faca isso por mim".
- [ ] Acoes juridicas, financeiras ou externas precisam de politica explicita de aprovacao.
- [ ] Todo resultado importante precisa virar artifact rastreavel.
- [ ] Toda memoria deve ter escopo por tenant, fonte, motivo e forma de revogacao.
- [ ] O MAYUS deve explicar o proximo passo operacional em linguagem simples.
- [ ] Quando a confianca for baixa, o sistema deve pedir contexto ou fazer handoff humano.

## Referencias analisadas sem copiar

Padroes aproveitados como inspiracao arquitetural:

- Hermes Agent: memoria persistente, skills reutilizaveis, um agente acessivel por varios canais e loop de aprendizagem.
- OpenClaw: capacidade de executar tarefas reais em multiplos ambientes; no MAYUS isso precisa ser limitado por menor privilegio, aprovacao e auditoria.
- Paperclip: control plane para agentes com orcamento, trilha de atividade, hierarquia e aprovacoes.

Fontes publicas usadas nesta analise:

- https://hermes-agent.org/
- https://paperclip.inc/
- https://openclaw-ai.net/

## Estado desta varredura

- [x] Executor agentico corrigido para aceitar papeis canonicos com acento/maiusculas.
- [x] Webhook Gateway endurecido para exigir segredo configurado e comparacao segura.
- [x] Webhook Escavador sem log bruto do payload completo.
- [x] API de chat com limite de tamanho de body, mensagem e historico.
- [x] Headers globais endurecidos em `next.config.mjs`.
- [x] `next` alinhado para `^14.2.35` no `package.json` e lockfile.
- [x] `npm audit fix` normal aplicado para reduzir vulnerabilidades sem breaking change.
- [x] Testes focados passaram: executor, router e dispatcher.
- [ ] Resolver vulnerabilidades restantes que exigem decisao de upgrade major.
- [ ] Rodar build completo e e2e antes de qualquer deploy.
