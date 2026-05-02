# Deploy Target: MAYUS Premium Pro

Este documento define onde este trabalho deve ser commitado, enviado e promovido.

## Repositorio Local Correto

Todos os commits e pushes deste trabalho devem ser feitos a partir desta pasta:

```powershell
C:\Users\vitor\MAYUS
```

Branch correta:

```powershell
codex-whatsapp-evolution-playbook
```

Remote correto:

```powershell
origin https://github.com/vitorprocopio30-star/MAYUS.git
```

Comandos de referencia:

```powershell
git status --short --branch
git add <arquivos-do-escopo>
git commit -m "<mensagem-do-commit>"
git push origin codex-whatsapp-evolution-playbook
```

## Projeto Vercel Correto

O projeto correto para validar, deployar e promover este trabalho e:

```text
mayus-premium-pro
```

Project ID:

```text
prj_F7t2zuYUV1FiQ8qcAnImjpPHnYKP
```

URL de producao correta:

```text
https://mayus-premium-pro.vercel.app
```

Alias/URL que deve ser testado pelo usuario:

```text
https://mayus-premium-pro.vercel.app/dashboard/conversas/whatsapp
```

## Nao Usar Para Este Fluxo

Nao promover este trabalho no projeto Vercel abaixo:

```text
mayus
```

Project ID que nao deve ser usado para esta entrega:

```text
prj_AYWhmvraed3cx9dq1hIHx78RdgTM
```

## Regra De Conferencia Antes De Promover

Antes de promover para producao, confirmar que o deployment pertence ao projeto:

```text
mayus-premium-pro
```

E que o deployment esta ligado ao commit esperado do branch:

```text
codex-whatsapp-evolution-playbook
```

Se o deployment estiver no projeto `mayus`, nao promover.
