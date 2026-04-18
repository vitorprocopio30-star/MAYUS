# Deploy MAYUS

Guia operacional de deploy e validacoes basicas.

---

## 1) Stack de Deploy

- Aplicacao: Vercel
- Banco/Auth/Storage: Supabase
- Codigo-fonte: GitHub (`origin`)

---

## 2) Fluxo Recomendado

1. Atualizar branch local.
2. Rodar validacoes (`lint` e `build`).
3. Commitar mudancas da sessao.
4. Push para remoto.
5. Confirmar deploy na Vercel.

---

## 3) Comandos Uteis

```bash
npm run lint
npm run build
git status
git add .
git commit -m "mensagem"
git push origin main
```

---

## 4) Checklist de Release

- [ ] Sem erros de lint
- [ ] Build gerando com sucesso
- [ ] Fluxos criticos testados (login, dashboard, prazos, monitoramento)
- [ ] Migrations revisadas/aplicadas
- [ ] Variaveis de ambiente conferidas
- [ ] Webhooks e cron conferidos

---

## 5) Observacoes de Seguranca

- Nao versionar chaves/token em arquivos de docs.
- Evitar qualquer segredo em HTMLs de referencia.
- Priorizar criptografia de `tenant_integrations`.
