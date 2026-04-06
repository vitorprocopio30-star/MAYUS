# Million Dollar Designer & Animation Skill

Esta skill define os padrões de excelência estética e técnica para o projeto MAYUS, elevando-o ao nível de produções digitais de classe mundial (ex: Superpower, Apple, Stripe).

## Princípios de Design (Nível 1M)

### 1. Tipografia Dinâmica
- Nunca usar tamanhos de fonte estáticos sem intenção.
- Utilizar `Cormorant Garamond` para autoridade e `Montserrat` (ou Inter) com pesos 200/800 para contraste moderno.
- Aplicar `tracking` (espaçamento entre letras) generoso em cabeçalhos (0.4em a 0.8em).

### 2. Teoria das Cores (Luxo Silencioso)
- Base: Preto Absoluto (#050505) e Cinza Escuro Antracite.
- Destaque: Ouro Polido (#CCA761) e Ouro Latão (#8B7340).
- Usar gradientes radiais sutis em vez de fundos sólidos para criar profundidade de campo.

### 3. Animação e Movimento (Fluid UX)
- **Ease-in-out**: Utilizar curvas de Bezier customizadas: `[0.22, 1, 0.36, 1]` (fluxo suave).
- **Parallax Sutil**: Elementos de fundo devem reagir ao scroll com intensidades diferentes.
- **Transição de Portal**: Zoom exponencial focado em pontos de interesse (como a pupila do olho) para troca de contexto.

## Componentes Obrigatórios

### O Neural Portal (O Olho)
Um componente que serve como "Intro" ou "Locker". Deve usar uma imagem de 8k ou vídeo HQ de um olho cibernético. A pupila serve como ponto central (0,0) para a expansão do conteúdo.

### Founder Counter (Escassez Crítica)
Contador de vagas com animação de "tick" e tiers de benefício (Vitalício -> 5 anos -> 2 anos).

## Implementação Técnica (Next.js 14)
- **Framer Motion**: Padrão ouro para transições de componentes.
- **CSS Masking**: Usar `clip-path` para portais.
- **Hardware Acceleration**: Forçar `translateZ(0)` em animações pesadas.
