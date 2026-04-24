# MAYUS Experience Checklist

Objetivo: o usuario nao precisa fazer curso. O proprio MAYUS orienta, executa, pede aprovacao e mostra resultado.

## Principio "sem curso"

- [ ] Toda pagina principal tem uma acao primaria clara.
Evidencia parcial 2026-04-24: `/dashboard/vendas/nova` agora tem aba "Novo Lead" e CTA "REGISTRAR LEAD" para entrada comercial; ainda falta validar todas as paginas principais.
- [ ] Toda pagina principal tem comando sugerido para o agente.
- [ ] Empty states mostram o proximo passo real, nao texto de marketing.
- [ ] Erros dizem como resolver, quem acionar ou qual dado falta.
- [ ] Fluxos longos podem ser iniciados por linguagem natural.

## Agentic UX

- [ ] Criar "Mayus, faca por mim" nos fluxos de CRM, processos, documentos e financeiro.
- [ ] Mostrar plano antes de executar tarefas complexas.
- [ ] Mostrar checklist de execucao em tempo real.
- [ ] Mostrar artifacts criados ao final.
- [ ] Mostrar botao de desfazer/cancelar quando for possivel.
- [ ] Mostrar handoff humano quando o agente nao tiver confianca.
Evidencia parcial 2026-04-24: o fluxo de Growth Intake retorna `needsHumanHandoff` e recomenda proximo passo para urgencia/status/contexto incompleto; ainda falta componente global agentico.

## Onboarding

- [x] Onboarding web autentica pela sessao do usuario, sem exigir token manual no browser.
Evidencia 2026-04-24: `src/app/api/onboarding/oab/route.ts` passou a usar `createServerClient` com cookies, compatível com `src/app/onboarding/page.tsx`.
- [ ] Onboarding pergunta OAB, areas, modelo de honorarios e tom do escritorio.
- [ ] Configuracao inicial cria memoria institucional supervisionada.
- [ ] Agente testa integracoes e mostra checklist de pendencias.
- [ ] Criar modo "primeira semana" com tarefas guiadas.
Evidencia 2026-04-24: onboarding atual salva OAB; areas, modelo de honorarios e tom do escritorio continuam pendentes.

## Acessibilidade e Clareza

- [ ] Textos de botoes cabem em mobile.
- [ ] Tabelas e kanbans tem estados de loading/empty/error.
- [ ] Contraste e foco de teclado validos.
- [ ] Icones tem tooltip quando a acao nao for obvia.
- [ ] Linguagem para cliente e para advogado ficam separadas.

## Criterios de aceite

- [ ] Usuario novo consegue cadastrar um lead, gerar proposta e abrir caso sem treinamento externo.
Evidencia parcial 2026-04-24: usuario consegue cadastrar lead em `/dashboard/vendas/nova`, com score e proximo passo gravados no CRM; proposta e abertura de caso seguem fora deste fluxo unico.
- [ ] Usuario consegue perguntar "o que eu devo fazer agora?" e recebe resposta contextual.
- [ ] O agente reduz cliques, nao cria mais burocracia.
