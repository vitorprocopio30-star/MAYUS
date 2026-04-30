# MAYUS Design System & Premium UI Guidelines

Este documento serve como a diretriz mestre para qualquer agente de IA ou desenvolvedor que realize alterações na interface do sistema **MAYUS**. O objetivo é manter a estética de "Premium Legal Operating System" / "Command Center".

## 1. Tipografia (Obrigatório)

O MAYUS utiliza uma hierarquia tipográfica específica que combina o clássico jurídico com a modernidade tecnológica:

*   **Títulos de Página e Cabeçalhos de Impacto:**
    *   **Fonte:** `Cormorant Garamond` (Serif).
    *   **Estilo:** `Italic` (Itálico).
    *   **Cor:** `#CCA761` (Ouro MAYUS) ou `White`.
    *   **Exemplo:** `text-4xl font-cormorant italic tracking-tight text-[#CCA761]`.

*   **UI Funcional, Labels, Botões e Corpo de Texto:**
    *   **Fonte:** `Montserrat`.
    *   **Peso:** `Bold` ou `Black` para labels; `Medium` para leitura.
    *   **Estilo:** `Normal`.
    *   **Exemplo:** `font-montserrat font-black uppercase tracking-widest`.

## 2. Paleta de Cores e Fundo

*   **Fundo Principal (Background):** `#050505` (Preto profundo).
*   **Fundo de Cards/Seções:** `#0a0a0a` (Levemente mais claro que o fundo).
*   **Cor de Destaque (Accent):** `#CCA761` (Gold).
*   **Bordas (Borders):** `rgba(255, 255, 255, 0.05)` (Branco ultra-translúcido).

## 3. Estética de Interface (Glassmorphism)

Todos os elementos de interface devem parecer "camadas de vidro" sobre um fundo escuro:

*   **Cards:** 
    *   `bg-[#0a0a0a]` ou `bg-white/[0.02]`.
    *   `backdrop-blur-xl`.
    *   `border border-white/5`.
    *   `rounded-3xl` (Cantos arredondados generosos).
*   **Efeitos de Hover:**
    *   Leve brilho na borda: `hover:border-[#CCA761]/30`.
    *   Transição suave: `transition-all duration-300`.

## 4. Estrutura de Cabeçalho de Página (Header Pattern)

Toda página deve seguir este padrão de cabeçalho para consistência:

```tsx
<header className="mb-12">
  {/* Link de Volta (Breadcrumb simplificado) */}
  <Link href="..." className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 hover:text-[#CCA761] transition-colors mb-6 flex items-center gap-2 group">
    <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
    Voltar
  </Link>
  
  {/* Label de Categoria */}
  <div className="flex items-center gap-2 mb-1">
    <Icon size={16} className="text-[#CCA761]" />
    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#CCA761]/60">NOME DO MÓDULO</span>
  </div>
  
  {/* Título Principal */}
  <h1 className="text-4xl lg:text-5xl text-[#CCA761] font-cormorant italic tracking-tight">
    Título da Página
  </h1>
  
  {/* Linha Divisória Ouro */}
  <div className="mt-2 h-[1px] w-64 bg-gradient-to-r from-[#CCA761]/50 to-transparent" />
</header>
```

## 5. Inputs e Formulários

*   **Inputs:** Devem ser minimalistas.
    *   `bg-white/[0.02]` ou `bg-[#050505]`.
    *   `border border-white/5`.
    *   `focus:border-[#CCA761]/50`.
*   **Botões Primários:**
    *   `bg-[#CCA761]` (Fundo ouro).
    *   `text-black` (Texto preto para contraste).
    *   `font-black uppercase tracking-[0.2em]`.
    *   `shadow-[0_0_20px_rgba(204,167,97,0.3)]` (Brilho externo suave).

---

*Assinado: Antigravity - Premium AI Engineering*
