# Instagram Automation Smoke Checklist

Objetivo: validar o fluxo `comentario no post -> palavra-chave -> resposta publica -> Direct com link` sem expor tokens e sem depender de anexo direto.

## 1. Supabase

- [x] Aplicar a migration `supabase/migrations/20260511143000_instagram_automations.sql`.
- [x] Confirmar que as tabelas existem:
  - `instagram_automations`
  - `instagram_webhook_events`
- [x] Confirmar que o tenant tem uma integracao `instagram` em `tenant_integrations` depois de salvar pelo painel.

## 2. Variaveis de Ambiente

- [x] Definir `INSTAGRAM_VERIFY_TOKEN` no ambiente do deploy.
- [x] Definir `META_APP_SECRET` ou `INSTAGRAM_APP_SECRET` para validar `x-hub-signature-256`.
- [x] Confirmar que `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` existem no ambiente do webhook.

## 3. Meta App

- [x] Conectar uma conta Instagram profissional ao app Meta.
- [x] Obter o `Instagram Business Account ID`.
- [ ] Se o webhook enviar Page ID em `entry.id`, obter tambem o `Page ID`.
- [x] Assinar o webhook de comentarios do Instagram.
- [x] Configurar URL do webhook: `/api/instagram/webhook`.
- [x] Usar como verify token o mesmo valor de `INSTAGRAM_VERIFY_TOKEN`.
- [~] Confirmar permissoes necessarias para responder comentario e enviar private reply. `instagram_manage_comments` respondeu comentario via Graph API Explorer, mas o contador de uso permitido da Meta ainda pode levar ate 24h para atualizar.

## 4. MAYUS

- [x] Abrir `Configuracoes -> Integracoes`.
- [x] No card `Instagram Graph`, salvar:
  - token permanente da Meta;
  - `Instagram Business Account ID` no campo de ID;
  - se necessario, usar formato `IG_BUSINESS_ID|PAGE_ID`.
- [x] Criar automacao:
  - palavra-chave: `mayus`;
  - resposta publica: `Te enviei no direct.`;
  - mensagem no direct: `Aqui está o link de teste da MAYUS.`;
  - link: `https://mayus-premium-pro.vercel.app`.

## 4.1 Meta App Review

- [x] Criar usuario de review `review@mayus.ai` no tenant conectado, sem registrar senha neste documento.
- [x] Validar login da conta de review via Supabase Auth.
- [x] Confirmar que a conta de review tem perfil `admin`, `is_active = true` e acesso ao tenant `a0000000-0000-0000-0000-000000000001`.
- [x] Preencher tratamento de dados com Vercel Inc. e Supabase Inc. como operadores/provedores.
- [x] Cadastrar plataforma Website no app Meta com `https://mayus-premium-pro.vercel.app/`.
- [~] Envio final da App Review pendente de o bloco `Uso permitido` ficar verde na Meta.

## 5. Smoke Real

- [x] Comentar `mayus` em um post publico da conta conectada.
- [~] Confirmar resposta publica no comentario. A resposta `Teste de integração MAYUS.` foi criada manualmente via Graph API Explorer para cumprir `instagram_manage_comments`; ainda nao valida a automacao MAYUS.
- [ ] Confirmar Direct com mensagem e link.
- [ ] Verificar `instagram_webhook_events.status = sent`. Em 2026-05-12 a tabela ainda nao recebeu eventos do webhook.
- [ ] Se status ficar `ignored_no_keyword`, revisar palavra-chave e texto do comentario.
- [ ] Se log mostrar integracao nao encontrada, comparar `entry.id` real com `instance_name`, `metadata.instagram_business_account_id` e `metadata.page_id`.
- [ ] Se falhar com erro Graph API, revisar permissoes do app/token e modo dev/usuarios autorizados.

## 6. Criterio Para Marcar Como Validado

- [ ] Um comentario real disparou exatamente uma automacao.
- [ ] Nao houve duplicidade ao receber retry do webhook.
- [ ] O cliente recebeu link pelo Direct.
- [ ] Evento ficou auditavel em `instagram_webhook_events`.
- [ ] Nenhum token apareceu em log, resposta ou artifact.
