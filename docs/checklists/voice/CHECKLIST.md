# MAYUS Voice Checklist

> Arquivo historico. A fonte oficial atual do roadmap e checklist final do MAYUS e `docs/brain/MAYUS_100_PERCENT_FINAL_CHECKLIST.md`.
> Use este arquivo apenas como evidencia tecnica por frente.

Objetivo: voz deve ser apenas outro canal do mesmo Brain, nao um cerebro separado.

## Canal

- [x] Infra de voz aparece no projeto.
- [ ] Toda chamada de voz deve virar `brain_task`.
- [ ] Transcript deve ser salvo com tenant, usuario, canal e consentimento.
- [ ] Voz deve usar as mesmas skills do chat.
- [ ] Voz deve respeitar as mesmas politicas de aprovacao.
- [ ] Falha de ASR/TTS deve gerar handoff para texto.

## UX de Voz

- [ ] Criar comandos curtos: status, resumo, proxima tarefa, cobrar, gerar minuta.
- [ ] Criar confirmacao verbal antes de acoes sensiveis.
- [ ] Criar leitura de resumo executivo em ate 30 segundos.
- [ ] Criar modo "ditado juridico" com revisao antes de salvar.
- [ ] Criar interrupcao segura: "pare", "cancele", "mande para humano".

## Seguranca

- [ ] Exigir MFA ou sessao recente para aprovacoes por voz.
- [ ] Nunca aceitar aprovacao critica apenas por audio sem confirmacao na UI.
- [ ] Reduzir dados sensiveis falados em ambiente incerto.
- [ ] Criar retention policy para audio/transcript.

## Criterios de aceite

- [ ] Comando por voz executa o mesmo fluxo auditado do chat.
- [ ] A voz nao cria bypass de permissao, aprovacao ou tenant.
- [ ] Usuario entende o que o MAYUS fez e qual e o proximo passo.

