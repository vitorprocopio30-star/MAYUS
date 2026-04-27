"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Play, Plus } from "lucide-react";
import { Cormorant_Garamond } from "next/font/google";
import { AgenticComparisonBackdrop } from "@/components/sections/AgenticComparisonBackdrop";
import { Hero } from "@/components/sections/Hero";
import { CinematicReveal } from "@/components/sections/CinematicReveal";
import { ShaderAnimation } from "@/components/ui/shader-animation";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

const tickerItems = [
  "PRIMEIRO MODELO AGÊNTICO DO DIREITO",
  "100 VAGAS FUNDADORAS",
  "SOBERANIA DIGITAL PARA ESCRITÓRIOS JURÍDICOS",
  "MONITORAMENTO · PRAZOS · KANBAN · WHATSAPP · VOZ AGÊNTICA",
];

const agentFlow = [
  "OBSERVA: monitoramento 24h",
  "PLANEJA: define a próxima ação",
  "EXECUTA: skill jurídica",
  "OBSERVA O RESULTADO",
  "REPLANEJA E RECOMECA",
];

const painPoints = [
  {
    n: "01",
    title: "Você descobre a derrota pelo seu cliente",
    text: "Movimentações passam em branco. Prazos descobertos tarde. O cliente liga sabendo antes de você. Isso não é descuido, é ausência de um sistema que aja sem ser chamado.",
  },
  {
    n: "02",
    title: "Seus dados não trabalham para você",
    text: "Sistemas isolados, dados fragmentados. Você não sabe o que está acontecendo no seu próprio escritório até que alguém pergunte, ou até que algo quebre.",
  },
  {
    n: "03",
    title: "Sua hora vale muito mais do que você cobra por ela",
    text: "Redigir minutas, preencher planilhas e encaminhar tarefas manualmente consome tempo que deveria estar em estratégia, cliente e decisão.",
  },
  {
    n: "04",
    title: "IA genérica não sabe o que é o seu escritório",
    text: "ChatGPT não conhece seus clientes, seus processos e sua forma de atuar. O MAYUS tem memória institucional privada e aprende com cada caso.",
  },
];

const pillars = [
  {
    n: "01 / 03",
    title: "Agêntico por natureza",
    text: "O MAYUS age. Monitora em tempo real, classifica urgências, atualiza kanban e avisa pelo WhatsApp sem você precisar pedir.",
  },
  {
    n: "02 / 03",
    title: "Memória institucional viva",
    text: "Cada caso, movimentação e decisão alimenta uma base privada do escritório. Com o tempo, o sistema opera com contexto de sócio sênior.",
  },
  {
    n: "03 / 03",
    title: "Um escritório, uma assinatura",
    text: "Usuários ilimitados. Sem cobrar por cabeça. Sem cobrar por módulo. A mesma inteligência agêntica do sócio ao estagiário.",
  },
];

const modules = [
  {
    badge: "Controle",
    result: "Nunca mais descobrir uma derrota pelo seu cliente.",
    title: "Monitoramento de Processos",
    text: "Integração com tribunais e Diário Oficial. Cada movimentação capturada antes que qualquer humano perceba.",
    feats: [
      "Alerta proativo via WhatsApp em tempo real",
      "Classificação automática de urgência por IA",
      "Linha do tempo completa de movimentacoes",
      "100 processos incluídos no plano",
    ],
  },
  {
    badge: "Gestão",
    result: "Sua equipe sabe exatamente o que fazer amanhã de manhã.",
    title: "Kanban Jurídico",
    text: "Pipeline visual com fases processuais reais. Importação automática via OAB em menos de um minuto.",
    feats: [
      "Importação via número OAB",
      "Fases configuradas para o direito brasileiro",
      "Responsáveis e prazos por card",
      "Integração com agenda e tarefas",
    ],
  },
  {
    badge: "Urgência",
    result: "Seus prazos não dependem mais de verificação manual.",
    title: "Central de Prazos",
    text: "Visão consolidada de tudo que vence com priorização inteligente. D-3, D-1 e D-0 avisados automaticamente.",
    feats: [
      "Contagem regressiva em tempo real",
      "Filtro por responsável, área e urgência",
      "Notificacoes escalonadas",
      "Exportação direta para agenda",
    ],
  },
  {
    badge: "Comunicação",
    result: "Seu cliente recebe atualização antes de precisar te ligar.",
    title: "Agente WhatsApp",
    text: "Não é chatbot de dúvidas. Consulta processo em tempo real, envia atualização proativa e escala para você com contexto.",
    feats: [
      "Consulta processual em tempo real",
      "Atualização proativa sem solicitação",
      "Triagem de novos leads",
      "Disponivel 24h por dia",
    ],
  },
  {
    badge: "Inteligência",
    result: "Consulte um caso, dite uma tarefa, peça uma análise.",
    title: "MAYUSOrb - Voz Agêntica",
    text: "Interface de voz com personalidade jurídica e memória contextual. A voz mais inteligente que um escritório jurídico já teve.",
    feats: [
      "Síntese de voz com ElevenLabs",
      "Terminologia jurídica brasileira",
      "Execução de skills por comando",
      "Memória contextual da sessão",
    ],
  },
  {
    badge: "Cultura",
    result: "Sua equipe compete por produtividade real.",
    title: "Mural & Gamificação",
    text: "Mural institucional, ranking de produtividade e XP por resultado. Escritórios que jogam juntos, crescem juntos.",
    feats: [
      "Comunicados e avisos fixados",
      "XP e níveis por produtividade",
      "Ranking por equipe e membro",
      "Celebração automática de conquistas",
    ],
  },
];

const architectureStats = [
  ["100%", "Dados no Brasil"],
  ["BYOK", "Sua própria chave de IA"],
  ["7+", "Skills jurídicas ativas"],
  ["∞", "Usuários incluídos"],
];

const architectureLayers = [
  ["CAMADA 01 - INTERFACE", "Chat · WhatsApp · MAYUSOrb"],
  ["CAMADA 02 - ORQUESTRAÇÃO", "Planner → Executor → Observer → Replanner"],
  ["CAMADA 03 - SKILLS JURÍDICAS", "consultar_processo · monitorar · kanban_update"],
  ["CAMADA 04 - MEMÓRIA", "pgvector RAG · memória institucional"],
  ["CAMADA 05 - DADOS", "Supabase · tribunais · Asaas · ZapSign"],
];

const competitors = [
  {
    n: "01",
    name: "Gestão de Processos",
    gives: "Capturam movimentações, controlam prazos e organizam documentos.",
    limit: "Organizam. Não agem. A IA sugere; você ainda executa cada passo.",
  },
  {
    n: "02",
    name: "Gestão de Equipe",
    gives: "Distribuem tarefas, medem desempenho e registram horas.",
    limit: "Falam de gestão, não de direito. A prática se adapta à ferramenta, não o contrário.",
  },
  {
    n: "03",
    name: "Atendimento Comercial",
    gives: "Qualificam leads, enviam contratos e fazem follow-up no WhatsApp.",
    limit: "Atendem na entrada e somem depois. Não evoluem com o caso.",
  },
];

const comparisonRows = [
  ["Monitoramento automático de processos", "Parcial", "-", "-", "Nativo"],
  ["Alertas proativos via WhatsApp", "E-mail", "-", "-", "Nativo"],
  ["Gestão com fases processuais reais", "Básico", "Sim", "-", "Kanban jurídico"],
  ["Atendimento de cliente no WhatsApp com IA", "-", "-", "Sim", "24h integrado"],
  ["Consulta de processo em tempo real", "-", "-", "-", "Integrado"],
  ["Agente autônomo que age sem ser chamado", "-", "-", "-", "Agêntico"],
  ["Memória institucional do escritório", "-", "-", "-", "RAG privado"],
  ["Interface por voz com contexto jurídico", "-", "-", "-", "MAYUSOrb"],
  ["Usuários ilimitados no plano", "Por usuário", "Por usuário", "Por usuário", "Ilimitado"],
  ["Dados 100% no Brasil e LGPD nativo", "-", "-", "-", "sa-east-1"],
  ["Gamificação de equipe", "-", "Básico", "-", "XP + ranking"],
];

const plans = [
  {
    name: "Mensal",
    badge: "Plano padrão",
    desc: "Acesso completo sem fidelidade.",
    price: "647",
    note: "/ mês · sem fidelidade",
    featured: false,
    feats: [
      "Usuários ilimitados no escritório",
      "100 processos monitorados",
      "Todos os modulos ativos",
      "Agente WhatsApp + MAYUSOrb",
      "Suporte por WhatsApp",
    ],
  },
  {
    name: "Fundador",
    badge: "Círculo fundador",
    desc: "Preço congelado para sempre. Acesso antecipado a tudo.",
    price: "397",
    note: "/ mês · cobrado anualmente",
    featured: true,
    feats: [
      "Tudo do plano mensal",
      "Preço congelado enquanto ativo",
      "Acesso antecipado a novos modulos",
      "Voto em prioridade de desenvolvimento",
      "Canal direto com o fundador",
    ],
  },
  {
    name: "Anual",
    badge: "Plano anual",
    desc: "Melhor custo-benefício fora do Círculo Fundador.",
    price: "497",
    note: "/ mês · cobrado anualmente",
    featured: false,
    feats: [
      "Usuários ilimitados no escritório",
      "100 processos monitorados",
      "Todos os modulos ativos",
      "Agente WhatsApp + MAYUSOrb",
      "Suporte por WhatsApp",
    ],
  },
];

const faqs = [
  {
    q: "Qual a diferença entre agente e sistema agêntico?",
    a: "Um agente responde quando chamado. Um sistema agêntico observa, planeja, executa e replaneja em loop contínuo, sem precisar ser chamado. O MAYUS é agêntico: ele age antes de você perceber que precisava.",
  },
  {
    q: "Preciso trocar meu sistema atual para usar o MAYUS?",
    a: "Não necessariamente. O MAYUS pode operar em paralelo com sistemas existentes. Você começa pelo monitoramento, importa os processos via OAB e expande conforme a equipe se adapta.",
  },
  {
    q: "O que é BYOK e por que isso importa?",
    a: "BYOK significa Bring Your Own Key: você usa sua própria chave de IA. Seus dados ficam sob sua política, e você controla os custos de uso diretamente.",
  },
  {
    q: "O preço fundador realmente trava para sempre?",
    a: "Sim. Enquanto sua assinatura estiver ativa e você renovar anualmente, o preço fundador permanece travado.",
  },
  {
    q: "Em quanto tempo meu escritório está operando?",
    a: "O onboarding foi desenhado para começar em menos de uma hora: OAB, importação, pipelines e monitoramento inicial.",
  },
  {
    q: "O agente WhatsApp consulta processos em tempo real?",
    a: "Sim. Ele usa o monitoramento do MAYUS para responder com informação atualizada e escalar para humano quando precisar de critério jurídico.",
  },
  {
    q: "Se eu quiser sair, levo meus dados?",
    a: "Sempre. Processos, tarefas, histórico de movimentações e memória institucional devem permanecer exportáveis pelo escritório.",
  },
];

const revealTransition = {
  duration: 0.68,
  ease: [0.16, 1, 0.3, 1] as const,
};

const Reveal = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 34, scale: 0.99, filter: "blur(7px)" }}
    whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
    viewport={{ once: true, amount: 0.18 }}
    transition={{ ...revealTransition, delay }}
  >
    {children}
  </motion.div>
);

const Stagger = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <motion.div
    className={className}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.16 }}
    variants={{
      hidden: {},
      visible: {
        transition: { staggerChildren: 0.08, delayChildren: 0.08 },
      },
    }}
  >
    {children}
  </motion.div>
);

const StaggerItem = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    variants={{
      hidden: { opacity: 0, y: 28, filter: "blur(7px)" },
      visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: revealTransition },
    }}
  >
    {children}
  </motion.div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-[#C4A35A]">
    {children}
  </p>
);

const Divider = () => (
  <div className="relative z-10 flex h-16 items-center gap-4 px-6">
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#C4A35A]/35 to-transparent" />
    <div className="h-3 w-3 rotate-45 border border-[#C4A35A]/40" />
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#C4A35A]/35 to-transparent" />
  </div>
);

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [showVideoPulse, setShowVideoPulse] = useState(false);
  const [luxCursor, setLuxCursor] = useState({ x: 50, y: 42 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setShowVideoPulse((s) => !s), 1500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`${cormorant.variable} min-h-screen overflow-x-clip bg-[#06050A] font-sans text-[#F5F0E8]`}>
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[#07060D]" />
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_40%_at_78%_0%,rgba(180,175,210,0.07)_0%,transparent_65%),radial-gradient(ellipse_70%_55%_at_50%_45%,rgba(140,105,40,0.06)_0%,transparent_60%),radial-gradient(ellipse_50%_40%_at_10%_90%,rgba(180,90,20,0.08)_0%,transparent_60%)]" />
      </div>

      <nav
        className={`fixed top-0 z-50 w-full transition-all duration-500 ${
          scrolled
            ? "bg-[#080808]/62 py-4 backdrop-blur-md"
            : "bg-gradient-to-b from-[#080808]/85 to-transparent py-6"
        }`}
      >
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 lg:px-12">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 transition-transform duration-500 hover:scale-[1.05] [perspective:900px]">
              <div
                className="relative h-full w-full [transform-style:preserve-3d]"
                style={{ animation: "mayusPlateRotate 12s ease-in-out infinite" }}
              >
                <Image
                  src="/mayus_logo.png"
                  alt="MAYUS Monograma"
                  fill
                  sizes="48px"
                  className="object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
                  priority
                />
              </div>
            </div>
            <div className="leading-none">
              <p className="font-display text-2xl font-semibold tracking-[0.22em]">MAYUS</p>
              <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.24em] text-[#F5F0E8]/50">
                IA jurídica agêntica
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-10 font-mono text-[10px] uppercase tracking-[0.2em] text-[#F5F0E8]/60 lg:flex">
            <a href="#conceito" className="hover:text-[#C4A35A]">Conceito</a>
            <a href="#arquitetura" className="hover:text-[#C4A35A]">Arquitetura</a>
            <a href="#circulo-fundador" className="hover:text-[#C4A35A]">Fundadores</a>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login" className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-[#F5F0E8]/60 hover:text-[#C4A35A] md:block">
              Entrar
            </Link>
            <a href="#cta" className="rounded-full bg-gradient-to-r from-[#E2C97E] via-[#C4A35A] to-[#8B6E35] px-6 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-black transition hover:brightness-110">
              Solicitar convite
            </a>
          </div>
        </div>
      </nav>

      <Hero />
      <CinematicReveal />

      <div
        className="post-cinematic-luxury relative z-10"
        style={{
          "--lux-x": `${luxCursor.x}%`,
          "--lux-y": `${luxCursor.y}%`,
        } as React.CSSProperties}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setLuxCursor({
            x: ((event.clientX - rect.left) / rect.width) * 100,
            y: ((event.clientY - rect.top) / rect.height) * 100,
          });
        }}
      >
      <div className="lux-cursor-glow" />

      <div className="relative z-10 overflow-hidden bg-[#C4A35A] py-3">
        <div className="inline-flex animate-[ticker_32s_linear_infinite] whitespace-nowrap font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black">
          {Array.from({ length: 2 }).map((_, pass) => (
            <span key={pass} className="inline-flex">
              {tickerItems.flatMap((item) => [item, "|"]).map((item, idx) => (
                <span key={`${pass}-${idx}`} className="px-8">{item}</span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <section className="lux-bg-demo relative z-10 overflow-hidden px-6 py-28">
        <div className="pointer-events-none absolute inset-0 z-0 opacity-45 mix-blend-screen">
          <ShaderAnimation />
        </div>
        <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(90deg,rgba(5,5,5,0.92)_0%,rgba(5,5,5,0.56)_46%,rgba(5,5,5,0.9)_100%),radial-gradient(ellipse_70%_45%_at_50%_52%,rgba(226,201,126,0.10)_0%,transparent_68%)]" />
        <div className="relative z-10 mx-auto max-w-[1180px]">
          <Reveal>
            <div className="mb-14 text-center">
              <SectionLabel>Ver em operação</SectionLabel>
              <h2 className="font-display mt-4 text-5xl font-semibold leading-[1.02] md:text-7xl">
                Veja o MAYUS <span className="text-[#E2C97E]">operando por dentro.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-[#F5F0E8]/60">
                Um escritório real. Processos se monitorando, prazos se classificando, o advogado decidindo e a máquina executando.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="relative aspect-video overflow-hidden rounded-[26px] border border-[#C4A35A]/25 bg-gradient-to-br from-[#0E0C09] to-[#070605] shadow-[0_35px_90px_rgba(0,0,0,0.55)]">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_35%_at_50%_50%,rgba(196,163,90,0.12)_0%,transparent_70%)]" />
              <div className="absolute left-8 top-7 font-mono text-[9px] uppercase tracking-[0.25em] text-[#F5F0E8]/45">Demo · MAYUS OS · escritório real</div>
              <div className="absolute right-8 top-7 font-mono text-[9px] uppercase tracking-[0.25em] text-[#F5F0E8]/45">06:42</div>
              <button
                type="button"
                aria-label="Reproduzir video"
                className={`absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-br from-[#E2C97E] to-[#C4A35A] text-black shadow-[0_0_40px_rgba(196,163,90,0.45)] transition-transform ${showVideoPulse ? "scale-105" : "scale-100"}`}
              >
                <Play size={30} className="ml-1" fill="currentColor" />
              </button>
              <div className="absolute bottom-8 left-8 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#C4A35A]">
                <span className={`h-2 w-2 rounded-full bg-[#C4A35A] ${showVideoPulse ? "opacity-100" : "opacity-40"}`} />
                Demonstração pronta
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      <section className="agentic-comparison-section scroll-animation lux-bg-agentic relative z-10 h-[190vh] overflow-visible border-y border-[#C4A35A]/15">
        <div className="sticky top-0 min-h-[100dvh] overflow-hidden px-6 py-8 md:-top-56 md:py-10">
          <AgenticComparisonBackdrop />
          <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-5rem)] max-w-[1550px] flex-col justify-center md:min-h-[calc(100dvh+4rem)]">
          <Reveal>
            <div className="mx-auto mb-7 max-w-3xl text-center md:mb-9">
                <SectionLabel>A distinção que muda tudo</SectionLabel>
              <h2 className="font-display mt-3 text-4xl font-semibold leading-[1.02] md:text-6xl">
                Agente é uma coisa. <span className="text-[#E2C97E]">Agêntico é outra.</span>
              </h2>
              <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-[#F5F0E8]/60">
                A maioria vende agentes de IA que são chatbots sofisticados. O MAYUS é um sistema agêntico: observa, planeja, executa e replaneja.
              </p>
            </div>
          </Reveal>

          <div className="grid items-stretch gap-5 lg:grid-cols-[1fr_auto_1fr]">
            <Reveal>
              <article className="agentic-static-card h-full min-h-[380px] rounded-2xl border border-[#C4A35A]/20 bg-[#050505]/95 p-6 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025),0_28px_80px_rgba(0,0,0,0.72)] md:min-h-[510px] md:p-7">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#F5F0E8]/55">Modelo reativo</p>
                <h3 className="font-display mt-3 text-5xl font-semibold md:text-6xl">Agente</h3>
                <p className="mt-1 text-[#C4A35A]">Responde quando chamado.</p>
                <p className="mt-5 text-sm leading-6 text-[#F5F0E8]/65">
                  Espera uma instrução, executa uma tarefa isolada, devolve um resultado e para. Se você não pedir, nada acontece.
                </p>
              </article>
            </Reveal>
            <div className="hidden flex-col items-center justify-center px-4 font-mono text-xs uppercase tracking-[0.3em] text-[#C4A35A]/80 lg:flex">
              <div className="h-16 w-px bg-gradient-to-b from-transparent to-[#C4A35A]" />
              VS
              <div className="h-16 w-px bg-gradient-to-t from-transparent to-[#C4A35A]" />
            </div>
            <Reveal delay={0.1}>
              <article className="agentic-static-card lux-prime-card h-full min-h-[380px] rounded-2xl border border-[#C4A35A]/50 bg-[#050505]/95 p-6 shadow-[inset_0_0_0_1px_rgba(226,201,126,0.04),0_0_50px_rgba(196,163,90,0.15),0_28px_80px_rgba(0,0,0,0.72)] md:min-h-[510px] md:p-7">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#E2C97E]">Modelo autônomo</p>
                <h3 className="font-display mt-3 text-5xl font-semibold text-[#E2C97E] md:text-6xl">Agêntico</h3>
                <p className="mt-1 text-[#E2C97E]/90">Age sem precisar ser chamado.</p>
                <div className="mt-5 space-y-2">
                  {agentFlow.map((step) => (
                    <div key={step} className="rounded-lg border border-[#C4A35A]/20 bg-black/70 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#F5F0E8]/72">
                      {step}
                    </div>
                  ))}
                </div>
              </article>
            </Reveal>
          </div>

          <Reveal delay={0.2}>
            <p className="font-display mx-auto mt-6 max-w-3xl text-center text-2xl font-semibold leading-tight md:mt-8 md:text-4xl">
              Enquanto seus concorrentes <span className="text-[#F5F0E8]/50">pedem</span>, o MAYUS <span className="text-[#E2C97E]">já executou.</span>
            </p>
          </Reveal>
          </div>
        </div>
      </section>

      <Divider />

      <section id="conceito" className="lux-bg-origin relative z-10 px-6 py-28">
        <div className="mx-auto grid max-w-[1240px] gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <Reveal>
            <div>
              <SectionLabel>A origem</SectionLabel>
              <h2 className="font-display mt-4 text-5xl font-semibold leading-[1.02] md:text-7xl">
                Um escritório perdeu um processo por um prazo que <span className="text-[#E2C97E]">nenhum sistema capturou.</span>
              </h2>
              <div className="mt-8 space-y-5 text-sm leading-7 text-[#F5F0E8]/62">
                <p>
                  Não faltava esforço nem competência. Faltava um sistema que agisse no lugar certo, na hora certa, sem precisar ser chamado.
                </p>
                <p>
                  Três sistemas. Três cobranças. Zero integração. Zero autonomia. O MAYUS nasceu dessa frustração: não como mais um software jurídico, mas como o sistema operacional que nenhum deles ousou ser.
                </p>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <blockquote className="font-display rounded-2xl border border-[#C4A35A]/25 bg-black/35 p-8 text-3xl font-semibold leading-tight text-[#F5F0E8] md:text-5xl">
              “Não criei uma ferramenta para advogados. Criei o sócio de IA que todo escritório jurídico deveria ter.”
              <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.28em] text-[#C4A35A]">Manifesto MAYUS</p>
            </blockquote>
          </Reveal>
        </div>
      </section>

      <section className="lux-bg-diagnostic relative z-10 px-6 py-28">
        <div className="mx-auto grid max-w-[1200px] gap-16 lg:grid-cols-2">
          <Reveal>
            <div>
              <SectionLabel>O diagnostico</SectionLabel>
              <h2 className="font-display mt-4 text-5xl font-semibold leading-[1.02] md:text-7xl">
                O escritório jurídico ainda vive no <span className="text-[#E2C97E]">século XX.</span>
              </h2>
              <p className="mt-6 text-sm leading-7 text-[#F5F0E8]/62">
                Planilhas, post-its e WhatsApp como sistema de gestão. O advogado que deveria construir teses passa horas em tarefas que uma máquina resolveria em segundos.
              </p>
            </div>
          </Reveal>
          <div className="space-y-4">
            {painPoints.map((item, idx) => (
              <Reveal key={item.n} delay={idx * 0.06}>
                <div className="grid grid-cols-[52px_1fr] gap-4 border-t border-[#C4A35A]/20 pt-5">
                  <p className="font-mono text-3xl leading-none text-[#C4A35A]/60">{item.n}</p>
                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#F5F0E8]">{item.title}</h4>
                    <p className="mt-2 text-xs leading-6 text-[#F5F0E8]/58">{item.text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lux-bg-manifest relative z-10 border-y border-[#C4A35A]/20 px-6 py-24">
        <div className="mx-auto max-w-[1100px] text-center">
          <Reveal>
            <blockquote className="font-display text-4xl font-semibold leading-tight md:text-6xl">
              “O escritório que não opera com inteligência agêntica hoje está competindo com um <span className="text-[#E2C97E]">braço amarrado nas costas.</span>”
            </blockquote>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.28em] text-[#C4A35A]">Manifesto MAYUS - soberania digital</p>
          </Reveal>
        </div>
      </section>

      <section className="lux-bg-os relative z-10 px-6 py-28">
        <div className="mx-auto max-w-[1240px]">
          <Reveal>
            <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-end">
              <div>
                <SectionLabel>O que é o MAYUS</SectionLabel>
                <h2 className="font-display mt-4 text-5xl font-semibold leading-[1.02] md:text-7xl">
                  Não é um software. É um <span className="text-[#E2C97E]">sistema operacional</span> para seu escritório.
                </h2>
              </div>
              <div className="space-y-4 text-sm leading-7 text-[#F5F0E8]/62">
                <p>
                  O MAYUS é o primeiro AI Operating System projetado para escritórios de advocacia brasileiros. Ele não substitui o advogado; elimina tudo que não deveria ser feito por um advogado.
                </p>
                <p>
                  Agentes autônomos monitoram, classificam, priorizam e executam. Você dirige. A máquina opera. Seu escritório escala sem contratar no mesmo ritmo.
                </p>
              </div>
            </div>
          </Reveal>
          <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
            {pillars.map((pillar) => (
              <StaggerItem key={pillar.n}>
                <article className="h-full rounded-2xl border border-[#C4A35A]/20 bg-[#0A0A0A]/70 p-7">
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#C4A35A]/70">{pillar.n}</p>
                  <h3 className="font-display mt-4 text-3xl font-semibold text-[#F5F0E8]">{pillar.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-[#F5F0E8]/58">{pillar.text}</p>
                </article>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <Divider />

      <section className="lux-bg-modules relative z-10 px-6 py-28" id="arquitetura">
        <div className="mx-auto max-w-[1240px]">
          <Reveal>
            <div className="mx-auto mb-16 max-w-3xl text-center">
              <SectionLabel>Módulos ativos</SectionLabel>
              <h2 className="font-display mt-4 text-5xl font-semibold leading-[1.02] md:text-7xl">
                Cada modulo resolve um problema <span className="text-[#E2C97E]">real da rotina.</span>
              </h2>
              <p className="mt-5 text-sm leading-7 text-[#F5F0E8]/60">
                Não são features genéricas. São resultados desenhados a partir das maiores dores dos escritórios jurídicos brasileiros.
              </p>
            </div>
          </Reveal>
          <Stagger className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((module) => (
              <StaggerItem key={module.title}>
                <article className="lux-module-card h-full rounded-2xl border border-[#C4A35A]/20 bg-[#0A0A0A]/80 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[#C4A35A]/45">
                  <span className="inline-block rounded-full border border-[#C4A35A]/35 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[#C4A35A]">{module.badge}</span>
                  <p className="mt-5 text-lg font-semibold leading-snug text-[#E2C97E]">{module.result}</p>
                  <h3 className="font-display mt-5 text-4xl font-semibold text-[#F5F0E8]">{module.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#F5F0E8]/62">{module.text}</p>
                  <ul className="mt-5 space-y-2">
                    {module.feats.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-xs text-[#F5F0E8]/62">
                        <span className="text-[#C4A35A]">→</span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="lux-bg-architecture relative z-10 border-y border-[#C4A35A]/15 px-6 py-28">
        <div className="mx-auto grid max-w-[1240px] gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <Reveal>
            <div>
              <SectionLabel>Arquitetura</SectionLabel>
              <h2 className="font-display mt-4 text-5xl font-semibold leading-[1.02] md:text-7xl">
                Construído para <span className="text-[#E2C97E]">durar décadas.</span>
              </h2>
              <p className="mt-6 text-sm leading-7 text-[#F5F0E8]/62">
                O MAYUS não é wrapper de ChatGPT com tema jurídico. É uma arquitetura de dados multicamada com memória institucional privada, roteamento inteligente de modelos e infraestrutura que escala com você.
              </p>
              <div className="mt-8 grid grid-cols-2 gap-2">
                {architectureStats.map(([n, label]) => (
                  <div key={n} className="border border-[#C4A35A]/18 bg-[#0E0D0A]/75 p-5">
                    <p className="font-mono text-4xl leading-none text-[#C4A35A]">{n}</p>
                    <p className="mt-2 text-[11px] leading-5 text-[#F5F0E8]/55">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="space-y-2 rounded-2xl border border-[#C4A35A]/25 bg-[#0D0C0A]/85 p-6">
              {architectureLayers.map(([tag, title], idx) => (
                <div key={tag} className={`rounded-lg border p-4 ${idx === 0 ? "border-[#C4A35A]/55 bg-[#C4A35A]/5" : "border-[#C4A35A]/20 bg-black/20"}`}>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#C4A35A]/80">{tag}</p>
                  <p className="mt-1 text-sm text-[#F5F0E8]">{title}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="lux-bg-comparison relative z-10 px-6 py-28">
        <div className="mx-auto max-w-[1240px]">
          <Reveal>
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <SectionLabel>Por que MAYUS</SectionLabel>
              <h2 className="font-display mt-4 text-5xl font-semibold leading-[1.02] md:text-7xl">
                Seu escritório já paga por <span className="text-[#E2C97E]">três sistemas separados.</span>
              </h2>
              <p className="mt-5 text-sm leading-7 text-[#F5F0E8]/60">
                Nenhum deles conversa com os outros. Nenhum age sem você pedir. Você paga três cobranças para continuar operando no escuro.
              </p>
            </div>
          </Reveal>
          <Stagger className="grid gap-5 lg:grid-cols-3">
            {competitors.map((item) => (
              <StaggerItem key={item.n}>
                <article className="h-full rounded-2xl border border-[#C4A35A]/20 bg-black/35 p-7">
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-3xl text-[#C4A35A]/70">{item.n}</span>
                    <h3 className="font-display text-3xl font-semibold">{item.name}</h3>
                  </div>
                  <p className="mt-5 text-sm leading-7 text-[#F5F0E8]/62">{item.gives}</p>
                  <div className="mt-6 rounded-xl border border-red-400/15 bg-red-500/5 p-4">
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-red-200/70">Onde param</p>
                    <p className="mt-2 text-sm leading-6 text-[#F5F0E8]/62">{item.limit}</p>
                  </div>
                </article>
              </StaggerItem>
            ))}
          </Stagger>
          <Reveal delay={0.2}>
            <div className="lux-comparison-table mt-16 overflow-hidden rounded-2xl border border-[#C4A35A]/25 bg-[#080705]/82 shadow-[0_40px_110px_rgba(0,0,0,0.48)]">
              <div className="border-b border-[#C4A35A]/18 px-6 py-9 text-center md:px-10">
                <SectionLabel>Comparativo operacional</SectionLabel>
                <h3 className="font-display mx-auto mt-4 max-w-4xl text-4xl font-semibold leading-tight md:text-6xl">
                  Um sistema que opera nas <span className="text-[#E2C97E]">três frentes ao mesmo tempo.</span>
                </h3>
                <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#F5F0E8]/60">
                  Enquanto ferramentas isoladas entregam partes da rotina, o MAYUS une processo, equipe e atendimento em uma operação agêntica.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#C4A35A]/25">
                      {["Capacidade", "Gestao processos", "Gestao equipe", "Atend. comercial", "MAYUS"].map((heading) => (
                        <th
                          key={heading}
                          className={`px-5 py-5 font-mono text-[9px] uppercase tracking-[0.24em] ${
                            heading === "MAYUS" ? "bg-[#C4A35A]/10 text-[#F5F0E8]" : "text-[#C4A35A]"
                          }`}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map(([capability, process, team, commercial, mayus]) => (
                      <tr key={capability} className="border-b border-white/[0.055] transition-colors hover:bg-[#C4A35A]/[0.045]">
                        <td className="px-5 py-4 text-sm text-[#F5F0E8]/68">{capability}</td>
                        {[process, team, commercial].map((value, index) => (
                          <td key={`${capability}-${index}`} className="px-5 py-4 font-mono text-[11px] uppercase tracking-[0.08em] text-[#F5F0E8]/42">
                            {value}
                          </td>
                        ))}
                        <td className="bg-[#C4A35A]/10 px-5 py-4 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#E2C97E]">
                            <span className="mr-2 text-[#F5F0E8]">✓</span>
                          {mayus}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap justify-center gap-5 px-6 py-5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#F5F0E8]/42">
                <span>✓ solução completa</span>
                <span>Parcial = solução limitada</span>
                <span>- não oferece</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="circulo-fundador" className="lux-bg-pricing relative z-10 px-6 py-28">
        <div className="mx-auto max-w-[1240px] text-center">
          <Reveal>
            <SectionLabel>A oferta</SectionLabel>
            <h2 className="font-display mt-4 text-5xl font-semibold leading-[1.02] md:text-7xl">
              Não compre o MAYUS. <span className="text-[#E2C97E]">Contrate uma equipe de IA</span> que custa menos que um estagiário.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-[#F5F0E8]/60">
              Um escritório que opera com inteligência agêntica fatura diferente. Entre como fundador antes que seu concorrente perceba que isso existe.
            </p>
          </Reveal>
          <Stagger className="mt-14 grid gap-5 text-left md:grid-cols-3">
            {plans.map((plan) => (
              <StaggerItem key={plan.name}>
                <article className={`lux-plan-card h-full rounded-2xl border p-7 ${plan.featured ? "lux-prime-card border-[#E2C97E]/65 bg-gradient-to-br from-[#221A0D]/80 to-[#100C06]/90 shadow-[0_0_60px_rgba(196,163,90,0.2)]" : "border-[#C4A35A]/20 bg-[#0C0A07]/75"}`}>
                  <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#C4A35A]">{plan.badge}</p>
                  <h3 className={`font-display mt-3 text-5xl font-semibold ${plan.featured ? "text-[#E2C97E]" : ""}`}>{plan.name}</h3>
                  <p className="mt-2 text-sm text-[#F5F0E8]/60">{plan.desc}</p>
                  <p className={`mt-6 font-mono text-4xl ${plan.featured ? "text-[#E2C97E]" : "text-[#F5F0E8]"}`}>
                    R$ {plan.price}<span className="text-xs text-[#F5F0E8]/45"> {plan.note}</span>
                  </p>
                  <ul className="mt-6 space-y-3">
                    {plan.feats.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-xs leading-5 text-[#F5F0E8]/62">
                        <span className="text-[#C4A35A]">✓</span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <a href="#cta" className={`mt-7 inline-flex rounded-full px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] transition ${plan.featured ? "bg-gradient-to-r from-[#E2C97E] to-[#C4A35A] text-black hover:brightness-110" : "border border-[#C4A35A]/35 text-[#F5F0E8]/70 hover:bg-[#C4A35A]/10 hover:text-[#E2C97E]"}`}>
                    {plan.featured ? "Entrar como fundador" : "Solicitar convite"}
                  </a>
                </article>
              </StaggerItem>
            ))}
          </Stagger>
          <Reveal delay={0.3}>
            <div className="mt-10 flex flex-col gap-6 rounded-2xl border border-[#C4A35A]/22 bg-[#0D0C0A]/75 p-7 text-left md:flex-row md:items-center md:justify-between">
              <div>
                <h4 className="font-display text-4xl font-semibold">Vagas do Círculo Fundador</h4>
                <p className="mt-2 text-sm text-[#F5F0E8]/60">100 escritórios. 92 vagas restantes. A janela não é urgência artificial: é limite operacional para acompanhar os fundadores de perto.</p>
              </div>
              <div className="w-full md:w-72">
                <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-[#F5F0E8]/65">
                  <span>8 de 100 preenchidas</span>
                  <span>8%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[8%] bg-gradient-to-r from-[#8B6E35] to-[#E2C97E]" />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="lux-bg-faq relative z-10 border-y border-[#C4A35A]/18 px-6 py-24">
        <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[1fr_1.5fr]">
          <Reveal>
            <div>
              <SectionLabel>Dúvidas</SectionLabel>
              <h2 className="font-display mt-4 text-6xl font-semibold">Perguntas frequentes.</h2>
              <p className="mt-4 text-sm leading-7 text-[#F5F0E8]/60">
                Se sua dúvida não estiver aqui, fale diretamente com a equipe MAYUS.
              </p>
            </div>
          </Reveal>
          <div>
            {faqs.map((faq, idx) => {
              const open = openFaq === idx;
              return (
                <div key={faq.q} className="border-b border-[#C4A35A]/18 py-4">
                  <button
                    type="button"
                    onClick={() => setOpenFaq((prev) => (prev === idx ? null : idx))}
                    className="flex w-full items-center justify-between gap-4 text-left"
                  >
                    <span className="text-sm text-[#F5F0E8]">{faq.q}</span>
                    <Plus className={`text-[#C4A35A] transition-transform ${open ? "rotate-45" : "rotate-0"}`} size={18} />
                  </button>
                  {open && <p className="mt-3 pr-10 text-sm leading-7 text-[#F5F0E8]/62">{faq.a}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="cta" className="relative z-10 bg-[radial-gradient(ellipse_60%_45%_at_50%_45%,rgba(196,163,90,0.1)_0%,transparent_70%),linear-gradient(180deg,#080706_0%,#050505_100%)] px-6 py-28 text-center">
        <Reveal>
          <SectionLabel>Decisao</SectionLabel>
          <h2 className="font-display mt-4 text-6xl font-semibold leading-[1.04] md:text-8xl">
            Seu escritório vai operar com <span className="text-[#E2C97E]">soberania digital.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-[#F5F0E8]/62">
            Os primeiros 100 escritórios entram pelo preço fundador e travam para sempre. O convite é limitado. A inteligência, não.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="mt-9 flex flex-wrap justify-center gap-4">
            <a href="#" className="rounded-full bg-gradient-to-r from-[#E2C97E] via-[#C4A35A] to-[#8B6E35] px-7 py-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-black transition hover:brightness-110">Entrar como fundador - R$397/mês</a>
            <a href="#" className="rounded-full border border-[#C4A35A]/45 px-7 py-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[#F5F0E8]/80 transition hover:bg-[#C4A35A]/10 hover:text-[#E2C97E]">Ver a plataforma</a>
          </div>
          <p className="mt-7 font-mono text-[9px] uppercase tracking-[0.2em] text-[#F5F0E8]/35">
            Sem taxa de setup · cancelamento a qualquer momento · dados sempre seus · LGPD nativo
          </p>
        </Reveal>
      </section>

      <footer className="relative z-10 border-t border-[#C4A35A]/15 bg-[#060606] px-6 py-14">
        <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="font-display text-3xl font-semibold tracking-[0.2em] text-[#C4A35A]">MAYUS</p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.3em] text-[#F5F0E8]/45">Soberania digital</p>
          </div>
          <div className="flex flex-wrap gap-5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#F5F0E8]/55">
            <a href="#conceito" className="hover:text-[#C4A35A]">O Conceito</a>
            <a href="#arquitetura" className="hover:text-[#C4A35A]">Arquitetura</a>
            <a href="#circulo-fundador" className="hover:text-[#C4A35A]">Círculo Fundador</a>
          </div>
        </div>
        <div className="mx-auto mt-8 flex max-w-[1240px] flex-wrap justify-between gap-3 border-t border-white/10 pt-5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#F5F0E8]/28">
          <span>© 2025 MAYUS Tecnologia · construído no Brasil para o direito brasileiro</span>
          <span>Todos os direitos reservados</span>
        </div>
      </footer>
      </div>

      <style jsx global>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes mayusPlateRotate {
          0% { transform: rotateX(7deg) rotateY(0deg); }
          50% { transform: rotateX(7deg) rotateY(180deg); }
          100% { transform: rotateX(7deg) rotateY(360deg); }
        }
        @keyframes lux-scan {
          0% { transform: translateY(-100%); opacity: 0; }
          12% { opacity: 0.32; }
          100% { transform: translateY(100%); opacity: 0; }
        }
        @keyframes lux-border {
          0%, 100% { opacity: 0.18; transform: translateX(-18%); }
          50% { opacity: 0.72; transform: translateX(18%); }
        }
        @keyframes lux-float {
          0%, 100% { transform: translate3d(0,0,0); opacity: 0.34; }
          50% { transform: translate3d(0,-10px,0); opacity: 0.85; }
        }
        .post-cinematic-luxury {
          background:
            radial-gradient(900px 520px at var(--lux-x, 50%) var(--lux-y, 42%), rgba(226,201,126,0.105), transparent 62%),
            linear-gradient(180deg, #050506 0%, #090806 42%, #050505 100%);
        }
        .post-cinematic-luxury::before {
          content: "";
          pointer-events: none;
          position: absolute;
          inset: 0;
          z-index: 0;
          opacity: 0.22;
          background-image:
            linear-gradient(rgba(196,163,90,0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(196,163,90,0.10) 1px, transparent 1px);
          background-size: 96px 96px;
          mask-image: linear-gradient(to bottom, transparent, black 8%, black 92%, transparent);
        }
        .lux-cursor-glow {
          pointer-events: none;
          position: fixed;
          left: var(--lux-x, 50%);
          top: var(--lux-y, 42%);
          z-index: 1;
          width: 34rem;
          height: 34rem;
          border-radius: 999px;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(226,201,126,0.09), rgba(196,163,90,0.035) 38%, transparent 70%);
          filter: blur(18px);
          mix-blend-mode: screen;
        }
        .post-cinematic-luxury section {
          isolation: isolate;
        }
        .post-cinematic-luxury section::after {
          content: "";
          pointer-events: none;
          position: absolute;
          left: 5%;
          right: 5%;
          top: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(226,201,126,0.38), transparent);
          animation: lux-border 7s ease-in-out infinite;
        }
        .post-cinematic-luxury section::before {
          content: "";
          pointer-events: none;
          position: absolute;
          inset: 0;
          z-index: -1;
          background: linear-gradient(180deg, transparent 0%, rgba(226,201,126,0.035) 48%, transparent 52%);
          animation: lux-scan 8s ease-in-out infinite;
          opacity: 0.28;
        }
        .post-cinematic-luxury article,
        .post-cinematic-luxury blockquote,
        .post-cinematic-luxury .lux-plan-card {
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(18px);
          transform: translateZ(0);
        }
        .post-cinematic-luxury article::before,
        .post-cinematic-luxury blockquote::before,
        .lux-prime-card::before {
          content: "";
          pointer-events: none;
          position: absolute;
          inset: -1px;
          opacity: 0;
          background:
            radial-gradient(380px 160px at 20% 0%, rgba(226,201,126,0.22), transparent 64%),
            linear-gradient(120deg, transparent 18%, rgba(255,255,255,0.08), transparent 42%);
          transition: opacity 500ms ease;
        }
        .post-cinematic-luxury article:hover::before,
        .post-cinematic-luxury blockquote:hover::before,
        .lux-prime-card:hover::before {
          opacity: 1;
        }
        .lux-module-card,
        .lux-plan-card {
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 70px rgba(0,0,0,0.34);
        }
        .lux-prime-card {
          animation: lux-float 5.8s ease-in-out infinite;
        }
        .agentic-comparison-section .agentic-static-card {
          animation: none;
        }
        .agentic-comparison-section .agentic-static-card::before {
          display: none;
        }
        .lux-comparison-table {
          position: relative;
          background:
            linear-gradient(180deg, rgba(12,10,8,0.92), rgba(5,5,7,0.96)),
            linear-gradient(90deg, rgba(196,163,90,0.08), transparent 40%, rgba(92,111,130,0.12));
          backdrop-filter: blur(18px);
        }
        .lux-comparison-table::before {
          content: "";
          pointer-events: none;
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, transparent 0%, rgba(226,201,126,0.08) 78%, transparent 100%),
            radial-gradient(520px 220px at 86% 20%, rgba(226,201,126,0.13), transparent 70%);
        }
        .lux-comparison-table > * {
          position: relative;
          z-index: 1;
        }
        .post-cinematic-luxury h2,
        .post-cinematic-luxury h3,
        .post-cinematic-luxury blockquote {
          text-wrap: balance;
        }
        .lux-bg-demo {
          background:
            linear-gradient(135deg, rgba(64,72,94,0.2) 0%, transparent 42%),
            radial-gradient(ellipse 70% 50% at 50% 18%, rgba(196,163,90,0.1) 0%, transparent 62%),
            linear-gradient(180deg, #07070a 0%, #0b0a0e 100%);
        }
        .lux-bg-agentic {
          background:
            linear-gradient(90deg, rgba(22,38,47,0.46) 0%, transparent 50%),
            linear-gradient(180deg, #0a090d 0%, #080808 100%);
        }
        .lux-bg-origin {
          background:
            linear-gradient(112deg, rgba(94,33,33,0.34) 0%, transparent 34%),
            linear-gradient(180deg, rgba(196,163,90,0.055) 0%, transparent 42%),
            repeating-linear-gradient(135deg, rgba(245,240,232,0.028) 0px, rgba(245,240,232,0.028) 1px, transparent 1px, transparent 46px),
            linear-gradient(180deg, #07070a 0%, #050505 100%);
        }
        .lux-bg-diagnostic {
          background:
            repeating-linear-gradient(90deg, rgba(245,240,232,0.035) 0px, rgba(245,240,232,0.035) 1px, transparent 1px, transparent 74px),
            repeating-linear-gradient(0deg, rgba(196,163,90,0.026) 0px, rgba(196,163,90,0.026) 1px, transparent 1px, transparent 52px),
            linear-gradient(160deg, rgba(18,32,36,0.72) 0%, rgba(5,5,5,0.96) 66%);
        }
        .lux-bg-manifest {
          background:
            linear-gradient(90deg, rgba(196,163,90,0.1), transparent 24%, rgba(64,72,94,0.16) 100%),
            radial-gradient(ellipse 90% 38% at 50% 50%, rgba(226,201,126,0.09), transparent 70%),
            #070706;
        }
        .lux-bg-os {
          background:
            linear-gradient(90deg, rgba(24,58,52,0.24), transparent 42%),
            repeating-linear-gradient(45deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 42px),
            linear-gradient(180deg, #07070a 0%, #0a0908 100%);
        }
        .lux-bg-modules {
          background:
            repeating-linear-gradient(90deg, rgba(196,163,90,0.035) 0px, rgba(196,163,90,0.035) 1px, transparent 1px, transparent 88px),
            linear-gradient(135deg, rgba(12,35,46,0.42) 0%, transparent 42%),
            linear-gradient(315deg, rgba(196,163,90,0.09) 0%, transparent 44%),
            #060607;
        }
        .lux-bg-architecture {
          background:
            repeating-linear-gradient(0deg, rgba(196,163,90,0.045) 0px, rgba(196,163,90,0.045) 1px, transparent 1px, transparent 66px),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.026) 0px, rgba(255,255,255,0.026) 1px, transparent 1px, transparent 66px),
            linear-gradient(180deg, #060607 0%, #090806 100%);
        }
        .lux-bg-comparison {
          background:
            repeating-linear-gradient(135deg, rgba(196,163,90,0.025) 0px, rgba(196,163,90,0.025) 1px, transparent 1px, transparent 58px),
            linear-gradient(180deg, rgba(92,111,130,0.18) 0%, transparent 38%),
            linear-gradient(135deg, rgba(94,33,33,0.2) 0%, transparent 40%),
            linear-gradient(180deg, #080807 0%, #050507 100%);
        }
        .lux-bg-pricing {
          background:
            repeating-linear-gradient(45deg, rgba(226,201,126,0.028) 0px, rgba(226,201,126,0.028) 1px, transparent 1px, transparent 54px),
            linear-gradient(180deg, rgba(196,163,90,0.12) 0%, transparent 54%),
            linear-gradient(180deg, #080707 0%, #0a0908 100%);
        }
        .lux-bg-faq {
          background:
            linear-gradient(135deg, rgba(64,72,94,0.18) 0%, transparent 44%),
            repeating-linear-gradient(0deg, rgba(245,240,232,0.02) 0px, rgba(245,240,232,0.02) 1px, transparent 1px, transparent 38px),
            linear-gradient(180deg, rgba(8,11,16,0.98) 0%, #070707 100%);
        }
      `}</style>
    </div>
  );
}
