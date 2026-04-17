"use client";

import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Check, Cpu, Activity, Binary, Play, Plus } from "lucide-react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "spline-viewer": any;
    }
  }
}

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const FAQS = [
  {
    q: "Qual a diferença entre agente e sistema agêntico?",
    a: "Um agente responde quando chamado. Um sistema agêntico observa, planeja, executa e replaneja sozinho, em loop. O MAYUS opera no segundo modelo: ele não espera ser perguntado para agir.",
  },
  {
    q: "Preciso trocar todo o meu sistema atual?",
    a: "Não. O MAYUS pode operar em paralelo com sistemas existentes, importando dados via OAB e número de processo. A transição é gradual: você começa pelo monitoramento e expande.",
  },
  {
    q: "O que é BYOK e por que isso importa?",
    a: "BYOK (Bring Your Own Key) significa que você usa sua própria chave de IA. Você controla custo, modelo e política de uso com autonomia total da banca.",
  },
  {
    q: "Quantos usuários posso adicionar?",
    a: "Usuários são ilimitados em qualquer plano. Sócios, advogados, estagiários e operação entram sem custo por assento.",
  },
  {
    q: "O preço fundador trava para sempre?",
    a: "Sim, enquanto a assinatura permanecer ativa no formato anual. Cancelou e voltou depois, entra pelo preço vigente do momento.",
  },
  {
    q: "Em quanto tempo estou operando?",
    a: "O onboarding leva menos de 1 hora para começar a gerar valor. Em seguida, o sistema evolui continuamente com sua memória institucional.",
  },
];

const MODULES = [
  {
    badge: "Controle",
    title: "Monitoramento de Processos",
    desc: "Integração nativa com tribunais e Diário Oficial. Cada movimentação capturada, classificada e transformada em tarefa.",
    feats: ["Alertas em tempo real via WhatsApp", "Classificação automática de urgência", "Histórico com linha do tempo", "100 processos incluídos no plano"],
  },
  {
    badge: "Gestão",
    title: "Kanban Jurídico",
    desc: "Pipeline visual com estágios da prática jurídica. Importação automática via OAB sem digitação manual.",
    feats: ["Importação via número OAB", "Movimentação por drag-and-drop", "Responsáveis e prazos por card", "Integração com agenda"],
  },
  {
    badge: "Urgência",
    title: "Central de Prazos",
    desc: "Visão consolidada de todos os prazos com priorização inteligente. Nunca mais um prazo passando em branco.",
    feats: ["Contagem regressiva automática", "Filtro por responsável e área", "Notificações D-3, D-1 e D-0", "Exportação para agenda"],
  },
  {
    badge: "Comunicação",
    title: "Agente WhatsApp",
    desc: "Assistente jurídico no WhatsApp que responde clientes, consulta processos e executa tarefas 24h.",
    feats: ["Consulta por voz ou texto", "Triagem de mensagens", "Criação de monitoramentos", "Integração com Evolution API"],
  },
  {
    badge: "Inteligência",
    title: "MAYUSOrb — Voz Agêntica",
    desc: "Interface por voz com personalidade jurídica. Consulte casos, dite tarefas e peça análises sem digitar.",
    feats: ["Síntese de voz com ElevenLabs", "Compreensão de terminologia jurídica", "Execução de skills por comando", "Memória contextual da sessão"],
  },
  {
    badge: "Engajamento",
    title: "Mural & Gamificação",
    desc: "Ambiente interno com mural de comunicados, pontuação e ranking. Equipes engajadas, cultura de performance.",
    feats: ["Mural com avisos fixados", "XP e níveis por produtividade", "Ranking interno por equipe", "Celebração de conquistas"],
  },
];

const Reveal = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.2 }}
    transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
  >
    {children}
  </motion.div>
);

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [showVideoPulse, setShowVideoPulse] = useState(false);

  const modules = useMemo(
    () => ["Mural", "Gamificação", "Agenda", "WhatsApp", "Monitoramento de Processo"],
    []
  );

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setShowVideoPulse((s) => !s);
    }, 1500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`min-h-screen bg-[#06050A] text-[#F5F0E8] overflow-x-hidden ${montserrat.className}`}>
      <Script
        type="module"
        src="https://unpkg.com/@splinetool/viewer@1.9.82/build/spline-viewer.js"
        strategy="afterInteractive"
      />

      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[#07060D]" />
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_40%_at_78%_0%,rgba(180,175,210,0.07)_0%,transparent_65%),radial-gradient(ellipse_70%_55%_at_50%_45%,rgba(140,105,40,0.06)_0%,transparent_60%),radial-gradient(ellipse_50%_40%_at_10%_90%,rgba(180,90,20,0.08)_0%,transparent_60%)]" />
      </div>

      <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${scrolled ? "bg-[#080808]/90 border-b border-[#C4A35A]/20 py-4" : "bg-gradient-to-b from-[#080808]/85 to-transparent py-6"}`}>
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`text-4xl leading-none text-[#C4A35A] ${cormorant.className}`}>M</span>
            <div className="leading-none">
              <p className={`text-lg tracking-[0.35em] ${cormorant.className}`}>MAYUS</p>
              <p className="text-[9px] tracking-[0.3em] text-[#F5F0E8]/60 mt-1">SOBERANIA DIGITAL</p>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-10 text-[10px] tracking-[0.2em] text-[#F5F0E8]/60">
            <a href="#conceito" className="hover:text-[#C4A35A]">O CONCEITO</a>
            <a href="#arquitetura" className="hover:text-[#C4A35A]">ARQUITETURA</a>
            <a href="#circulo-fundador" className="hover:text-[#C4A35A]">CÍRCULO FUNDADOR</a>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login" className="hidden md:block text-[10px] tracking-[0.2em] text-[#F5F0E8]/60 hover:text-[#C4A35A]">
              ACESSO ADMIN
            </Link>
            <a href="#cta" className="px-6 py-2.5 rounded-full text-[10px] tracking-[0.2em] text-black font-bold bg-gradient-to-r from-[#E2C97E] via-[#C4A35A] to-[#8B6E35] hover:brightness-110 transition">
              RECLAMAR CONVITE
            </a>
          </div>
        </div>
      </nav>

      <section className="relative min-h-screen flex flex-col justify-end pt-28 pb-14 z-10">
        <div className="absolute inset-0 pointer-events-none z-0 bg-[radial-gradient(ellipse_at_center,rgba(196,163,90,0.12)_0%,transparent_60%)]" />

        <div className="hidden md:flex absolute top-36 left-0 right-0 px-10 lg:px-16 justify-between z-20 pointer-events-none">
          <p className="text-[10px] tracking-[0.16em] text-[#F5F0E8]/55 uppercase leading-relaxed max-w-[230px]">• O SISTEMA MAYUS — A INTELIGÊNCIA ARTIFICIAL CONSTRUINDO ESTRUTURAS ROBUSTAS.</p>
          <p className="text-[10px] tracking-[0.16em] text-[#F5F0E8]/55 uppercase leading-relaxed text-right max-w-[220px]">ARQUITETURA DE DADOS QUE FALA PELA SUA MARCA •</p>
        </div>

        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="w-[min(900px,92vw)] h-[min(900px,92vh)] translate-y-8 pointer-events-auto">
            <spline-viewer
              url="https://prod.spline.design/antVG5gJ69HRFMFs/scene.splinecode"
              style={{ width: "100%", height: "100%", background: "transparent" }}
            />
          </div>
        </div>

        <div className="relative z-20 text-center px-4">
          <Reveal>
            <h1 className={`text-[clamp(42px,8vw,128px)] leading-[0.92] tracking-[-0.02em] bg-gradient-to-b from-[#FFF5D1] via-[#E2C97E] to-[#8B6E35] text-transparent bg-clip-text drop-shadow-[0_12px_50px_rgba(196,163,90,0.4)] ${cormorant.className}`}>
              PRIMEIRO MODELO<br />AGÊNTICO DO DIREITO
            </h1>
          </Reveal>

          <Reveal delay={0.2}>
            <div className={`mt-10 flex flex-wrap justify-center gap-8 md:gap-14 text-[#C4A35A] text-xl md:text-3xl ${cormorant.className} italic`}>
              {modules.map((item) => (
                <span key={item} className="opacity-80 hover:opacity-100 transition">{item}</span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <div className="relative z-10 bg-[#C4A35A] overflow-hidden py-3">
        <div className="inline-flex whitespace-nowrap animate-[ticker_32s_linear_infinite] text-black text-[10px] tracking-[0.2em] font-semibold">
          {Array.from({ length: 2 }).map((_, pass) => (
            <span key={pass} className="inline-flex">
              {[
                "PRIMEIRO MODELO AGÊNTICO DO DIREITO",
                "✦",
                "100 VAGAS FUNDADORAS",
                "✦",
                "SOBERANIA DIGITAL PARA BANCAS JURÍDICAS",
                "✦",
                "MONITORAMENTO · PRAZOS · KANBAN · WHATSAPP · VOZ",
                "✦",
              ].map((item, idx) => (
                <span key={`${pass}-${idx}`} className="px-8">{item}</span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <section className="relative z-10 py-28 px-6 bg-[radial-gradient(ellipse_80%_55%_at_50%_20%,rgba(196,163,90,0.08)_0%,transparent_60%),linear-gradient(180deg,#07070A_0%,#0B0A0E_100%)]">
        <div className="max-w-[1180px] mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-[10px] tracking-[0.3em] text-[#C4A35A] uppercase">• Ver em operação</p>
              <h2 className={`mt-4 text-5xl md:text-6xl leading-tight ${cormorant.className}`}>Veja o MAYUS <em className="italic text-[#E2C97E]">operando por dentro.</em></h2>
              <p className="mt-5 max-w-2xl mx-auto text-[#F5F0E8]/60 text-sm leading-7">Seis minutos de uma banca real operando com inteligência agêntica. Processos se monitorando sozinhos, prazos se classificando, o advogado decidindo — a máquina executando.</p>
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="relative aspect-video rounded-[26px] border border-[#C4A35A]/25 bg-gradient-to-br from-[#0E0C09] to-[#070605] overflow-hidden shadow-[0_35px_90px_rgba(0,0,0,0.55)]">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_35%_at_50%_50%,rgba(196,163,90,0.1)_0%,transparent_70%)]" />
              <div className="absolute top-7 left-8 text-[9px] tracking-[0.25em] text-[#F5F0E8]/45 uppercase">• Demo · MAYUS 1.0</div>
              <div className="absolute top-7 right-8 text-[9px] tracking-[0.25em] text-[#F5F0E8]/45 uppercase">06:42</div>

              <button
                type="button"
                className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-gradient-to-br from-[#E2C97E] to-[#C4A35A] text-black flex items-center justify-center shadow-[0_0_40px_rgba(196,163,90,0.45)] transition-transform ${showVideoPulse ? "scale-105" : "scale-100"}`}
                aria-label="Reproduzir vídeo"
              >
                <Play size={30} className="ml-1" fill="currentColor" />
              </button>

              <div className="absolute bottom-8 left-8 flex items-center gap-3 text-[10px] tracking-[0.2em] text-[#C4A35A] uppercase">
                <span className={`w-2 h-2 rounded-full bg-[#C4A35A] ${showVideoPulse ? "opacity-100" : "opacity-40"}`} />
                Aguardando reprodução
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative z-10 py-28 px-6 bg-[linear-gradient(180deg,#0A090D_0%,#080808_100%)] border-y border-[#C4A35A]/15">
        <div className="max-w-[1240px] mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-[10px] tracking-[0.3em] text-[#C4A35A] uppercase">• A distinção que muda tudo</p>
              <h2 className={`mt-4 text-5xl md:text-6xl leading-tight ${cormorant.className}`}>Agente é uma coisa.<br /><em className="italic text-[#E2C97E]">Agêntico é outra.</em></h2>
            </div>
          </Reveal>

          <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-7 items-stretch">
            <Reveal>
              <article className="border border-[#C4A35A]/20 bg-[#0A0A0A]/70 p-8 rounded-2xl">
                <p className="text-[10px] tracking-[0.28em] text-[#F5F0E8]/55 uppercase">● Modelo Reativo</p>
                <h3 className={`${cormorant.className} text-5xl mt-4`}>Agente</h3>
                <p className="italic text-[#C4A35A] mt-1">Responde quando chamado.</p>
                <p className="text-sm text-[#F5F0E8]/65 leading-7 mt-6">Um agente de IA é reativo. Espera uma instrução, executa uma tarefa isolada e para. Se você não pedir, nada acontece.</p>
              </article>
            </Reveal>

            <div className="hidden lg:flex flex-col items-center justify-center px-4 text-[#C4A35A]/80 text-xs tracking-[0.3em] uppercase">
              <div className="w-px h-16 bg-gradient-to-b from-transparent to-[#C4A35A]" />
              VS
              <div className="w-px h-16 bg-gradient-to-t from-transparent to-[#C4A35A]" />
            </div>

            <Reveal delay={0.1}>
              <article className="border border-[#C4A35A]/50 bg-gradient-to-br from-[#19140A]/65 to-[#0A0804]/75 p-8 rounded-2xl shadow-[0_0_50px_rgba(196,163,90,0.15)]">
                <p className="text-[10px] tracking-[0.28em] text-[#E2C97E] uppercase">● Modelo Autônomo</p>
                <h3 className={`${cormorant.className} text-5xl mt-4 text-[#E2C97E]`}>Agêntico</h3>
                <p className="italic text-[#E2C97E]/90 mt-1">Age sem precisar ser chamado.</p>
                <p className="text-sm text-[#F5F0E8]/70 leading-7 mt-6">Um sistema agêntico observa continuamente, planeja, executa, observa o resultado e replaneja. Ele age antes de você perceber que precisava.</p>
              </article>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="conceito" className="relative z-10 py-28 px-6 bg-[radial-gradient(ellipse_60%_40%_at_10%_90%,rgba(196,163,90,0.06)_0%,transparent_70%),linear-gradient(180deg,#07070A_0%,#050505_100%)]">
        <div className="max-w-[1200px] mx-auto grid lg:grid-cols-2 gap-16">
          <Reveal>
            <div>
              <p className="text-[10px] tracking-[0.3em] text-[#C4A35A] uppercase">• O diagnóstico</p>
              <h2 className={`mt-4 text-5xl md:text-6xl leading-tight ${cormorant.className}`}>O escritório jurídico ainda vive no <em className="italic text-[#E2C97E]">século XX.</em></h2>
              <p className="mt-6 text-sm leading-7 text-[#F5F0E8]/62">Enquanto o mundo automatiza, a maioria das bancas jurídicas ainda opera com planilhas, post-its e WhatsApp como sistema de gestão.</p>
            </div>
          </Reveal>

          <div className="space-y-4">
            {[
              ["01", "PROCESSOS PERDIDOS NO RUÍDO", "Movimentações passam em branco. Prazos descobertos tarde."],
              ["02", "DADOS QUE NÃO FALAM COM VOCÊ", "Sistemas isolados e nenhuma visão consolidada."],
              ["03", "TEMPO MAL APLICADO", "Horas de resultado desperdiçadas em operação braçal."],
              ["04", "IA GENÉRICA", "Ferramenta sem contexto jurídico real da sua banca."],
            ].map((item, idx) => (
              <Reveal key={item[0]} delay={idx * 0.08}>
                <div className="border-t border-[#C4A35A]/20 pt-5 grid grid-cols-[44px_1fr] gap-4">
                  <p className="text-3xl leading-none text-[#C4A35A]/60 mono">{item[0]}</p>
                  <div>
                    <h4 className="text-sm tracking-[0.06em] text-[#F5F0E8]">{item[1]}</h4>
                    <p className="text-xs leading-6 text-[#F5F0E8]/58 mt-1">{item[2]}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-24 px-6 border-y border-[#C4A35A]/20 bg-[linear-gradient(180deg,rgba(196,163,90,0.05)_0%,transparent_100%)]">
        <div className="max-w-[1100px] mx-auto text-center">
          <Reveal>
            <blockquote className={`${cormorant.className} italic text-3xl md:text-5xl leading-tight`}>
              &quot;O escritório que não opera com inteligência agêntica em 2025<br />estará competindo com um <em className="not-italic text-[#E2C97E]">braço amarrado nas costas.</em>&quot;
            </blockquote>
          </Reveal>
        </div>
      </section>

      <section className="relative z-10 py-28 px-6 bg-[linear-gradient(180deg,#07070A_0%,#0A0908_100%)]">
        <div className="max-w-[1240px] mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <p className="text-[10px] tracking-[0.3em] text-[#C4A35A] uppercase">• Módulos ativos</p>
              <h2 className={`${cormorant.className} text-5xl md:text-6xl mt-4`}>Cada peça construída para <span className="text-[#E2C97E]">advogados brasileiros.</span></h2>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {MODULES.map((module, idx) => (
              <Reveal key={module.title} delay={idx * 0.04}>
                <article className="h-full bg-[#0A0A0A]/80 border border-[#C4A35A]/20 rounded-2xl p-7 hover:border-[#C4A35A]/45 hover:-translate-y-1 transition-all duration-300">
                  <span className="inline-block text-[9px] tracking-[0.2em] uppercase text-[#C4A35A] border border-[#C4A35A]/35 px-3 py-1 rounded-full">{module.badge}</span>
                  <h3 className={`${cormorant.className} text-3xl mt-4 text-[#F5F0E8]`}>{module.title}</h3>
                  <p className="text-sm text-[#F5F0E8]/62 leading-7 mt-3">{module.desc}</p>
                  <ul className="mt-5 space-y-2">
                    {module.feats.map((feat) => (
                      <li key={feat} className="text-xs text-[#F5F0E8]/62 flex items-start gap-2">
                        <span className="text-[#C4A35A]">→</span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="arquitetura" className="relative z-10 py-28 px-6 bg-[radial-gradient(ellipse_80%_60%_at_85%_30%,rgba(196,163,90,0.08)_0%,transparent_70%),linear-gradient(180deg,#060607_0%,#090806_100%)] border-y border-[#C4A35A]/15">
        <div className="max-w-[1240px] mx-auto grid lg:grid-cols-[1fr_1.1fr] gap-12 items-center">
          <Reveal>
            <div>
              <p className="text-[10px] tracking-[0.3em] text-[#C4A35A] uppercase">• Arquitetura</p>
              <h2 className={`${cormorant.className} text-5xl md:text-6xl mt-4 leading-tight`}>Construído para <span className="text-[#E2C97E]">durar décadas.</span></h2>
              <p className="mt-6 text-sm text-[#F5F0E8]/62 leading-7">Não é wrapper de IA genérica. É arquitetura multicamada com memória institucional privada, roteamento inteligente de LLMs e infraestrutura que escala com você.</p>
              <div className="mt-8 grid grid-cols-2 gap-2">
                {["100%", "BYOK", "07+", "∞"].map((n, idx) => (
                  <div key={n} className="bg-[#0E0D0A]/75 border border-[#C4A35A]/18 p-5">
                    <p className="text-4xl text-[#C4A35A] mono leading-none">{n}</p>
                    <p className="text-[11px] text-[#F5F0E8]/55 mt-2 leading-5">{["Dados no Brasil", "Sua própria chave", "Skills agênticas", "Usuários incluídos"][idx]}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="bg-[#0D0C0A]/85 border border-[#C4A35A]/25 p-6 rounded-2xl space-y-2">
              {[
                ["CAMADA 01 — INTERFACE", "Chat · WhatsApp · MAYUSOrb (Voz)"],
                ["CAMADA 02 — ORQUESTRAÇÃO", "Planner → Executor → Observer → Replanner"],
                ["CAMADA 03 — SKILLS", "consultar_processo · monitorar · kanban_update"],
                ["CAMADA 04 — MEMÓRIA", "pgvector RAG · Memória Institucional"],
                ["CAMADA 05 — DADOS", "Supabase · Tribunais · ASAAS · ZapSign"],
              ].map((layer, idx) => (
                <div key={layer[0]} className={`border p-4 rounded-lg ${idx === 0 ? "border-[#C4A35A]/55 bg-[#C4A35A]/5" : "border-[#C4A35A]/20 bg-black/20"}`}>
                  <p className="text-[9px] tracking-[0.18em] text-[#C4A35A]/80 uppercase">{layer[0]}</p>
                  <p className="text-sm text-[#F5F0E8] mt-1">{layer[1]}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section id="circulo-fundador" className="relative z-10 py-28 px-6 bg-[linear-gradient(180deg,#080707_0%,#0A0908_100%)]">
        <div className="max-w-[1240px] mx-auto text-center">
          <Reveal>
            <p className="text-[10px] tracking-[0.3em] text-[#C4A35A] uppercase">• A oferta</p>
            <h2 className={`${cormorant.className} text-5xl md:text-6xl mt-4`}>Entre agora. Pelo <span className="text-[#E2C97E]">preço de fundador.</span></h2>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-5 mt-14 text-left">
            <Reveal>
              <article className="h-full border border-[#C4A35A]/20 bg-[#0C0A07]/75 rounded-2xl p-7">
                <p className="text-[9px] tracking-[0.2em] text-[#C4A35A] uppercase">PLANO PADRÃO</p>
                <h3 className={`${cormorant.className} text-4xl mt-3`}>Mensal</h3>
                <p className="mt-2 text-sm text-[#F5F0E8]/60">Acesso completo sem fidelidade.</p>
                <p className="mt-6 text-4xl text-[#F5F0E8] mono">R$ 647<span className="text-xs text-[#F5F0E8]/45">/mês</span></p>
              </article>
            </Reveal>

            <Reveal delay={0.1}>
              <article className="h-full border border-[#E2C97E]/65 bg-gradient-to-br from-[#221A0D]/80 to-[#100C06]/90 rounded-2xl p-7 shadow-[0_0_60px_rgba(196,163,90,0.2)]">
                <p className="text-[9px] tracking-[0.2em] text-[#E2C97E] uppercase">CÍRCULO FUNDADOR</p>
                <h3 className={`${cormorant.className} text-4xl mt-3 text-[#E2C97E]`}>Fundador</h3>
                <p className="mt-2 text-sm text-[#F5F0E8]/68">Preço congelado para sempre.</p>
                <p className="mt-6 text-4xl text-[#E2C97E] mono">R$ 397<span className="text-xs text-[#F5F0E8]/45">/mês</span></p>
              </article>
            </Reveal>

            <Reveal delay={0.2}>
              <article className="h-full border border-[#C4A35A]/20 bg-[#0C0A07]/75 rounded-2xl p-7">
                <p className="text-[9px] tracking-[0.2em] text-[#C4A35A] uppercase">PLANO ANUAL</p>
                <h3 className={`${cormorant.className} text-4xl mt-3`}>Anual</h3>
                <p className="mt-2 text-sm text-[#F5F0E8]/60">Melhor custo-benefício sem ser fundador.</p>
                <p className="mt-6 text-4xl text-[#F5F0E8] mono">R$ 497<span className="text-xs text-[#F5F0E8]/45">/mês</span></p>
              </article>
            </Reveal>
          </div>

          <Reveal delay={0.3}>
            <div className="mt-10 border border-[#C4A35A]/22 bg-[#0D0C0A]/75 rounded-2xl p-7 text-left flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <h4 className={`${cormorant.className} text-3xl`}>Vagas do Círculo Fundador</h4>
                <p className="text-sm text-[#F5F0E8]/60 mt-2">Apenas 100 bancas terão acesso ao preço fundador de R$397/mês.</p>
              </div>
              <div className="w-full md:w-72">
                <div className="flex justify-between text-[10px] tracking-[0.12em] text-[#F5F0E8]/65 uppercase mb-2">
                  <span>8 de 100 preenchidas</span>
                  <span>8%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full w-[8%] bg-gradient-to-r from-[#8B6E35] to-[#E2C97E]" />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative z-10 py-24 px-6 border-y border-[#C4A35A]/18 bg-[linear-gradient(180deg,#0A0908_0%,#070707_100%)]">
        <div className="max-w-[1180px] mx-auto grid lg:grid-cols-[1fr_1.5fr] gap-12">
          <Reveal>
            <div>
              <p className="text-[10px] tracking-[0.3em] text-[#C4A35A] uppercase">• Dúvidas</p>
              <h2 className={`${cormorant.className} text-5xl mt-4`}>Perguntas frequentes.</h2>
            </div>
          </Reveal>

          <div>
            {FAQS.map((faq, idx) => {
              const open = openFaq === idx;
              return (
                <div key={faq.q} className="border-b border-[#C4A35A]/18 py-4">
                  <button
                    type="button"
                    onClick={() => setOpenFaq((prev) => (prev === idx ? null : idx))}
                    className="w-full text-left flex items-center justify-between gap-4"
                  >
                    <span className="text-sm text-[#F5F0E8]">{faq.q}</span>
                    <Plus className={`text-[#C4A35A] transition-transform ${open ? "rotate-45" : "rotate-0"}`} size={18} />
                  </button>
                  {open && <p className="text-sm text-[#F5F0E8]/62 mt-3 leading-7 pr-10">{faq.a}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="cta" className="relative z-10 py-28 px-6 text-center bg-[radial-gradient(ellipse_60%_45%_at_50%_45%,rgba(196,163,90,0.1)_0%,transparent_70%),linear-gradient(180deg,#080706_0%,#050505_100%)]">
        <Reveal>
          <h2 className={`${cormorant.className} text-5xl md:text-7xl leading-[1.04]`}>
            Sua banca vai operar com <span className="text-[#E2C97E]">soberania digital.</span>
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mt-5 text-sm text-[#F5F0E8]/62 max-w-2xl mx-auto leading-7">As primeiras 100 bancas entram pelo preço fundador e travam para sempre. O convite é limitado. A inteligência, não.</p>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="mt-9 flex flex-wrap justify-center gap-4">
            <a href="#" className="px-7 py-4 rounded-full text-[10px] tracking-[0.2em] text-black font-bold bg-gradient-to-r from-[#E2C97E] via-[#C4A35A] to-[#8B6E35] hover:brightness-110 transition">ENTRAR COMO FUNDADOR</a>
            <a href="#" className="px-7 py-4 rounded-full text-[10px] tracking-[0.2em] border border-[#C4A35A]/45 text-[#F5F0E8]/80 hover:text-[#E2C97E] hover:bg-[#C4A35A]/10 transition">VER A PLATAFORMA</a>
          </div>
        </Reveal>
      </section>

      <footer className="relative z-10 py-14 px-6 border-t border-[#C4A35A]/15 bg-[#060606]">
        <div className="max-w-[1240px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <p className={`${cormorant.className} text-2xl tracking-[0.28em] text-[#C4A35A]`}>MAYUS</p>
            <p className="text-[9px] tracking-[0.3em] text-[#F5F0E8]/45 mt-1">SOBERANIA DIGITAL</p>
          </div>

          <div className="flex flex-wrap gap-5 text-[10px] tracking-[0.15em] text-[#F5F0E8]/55 uppercase">
            <a href="#conceito" className="hover:text-[#C4A35A]">O Conceito</a>
            <a href="#arquitetura" className="hover:text-[#C4A35A]">Arquitetura</a>
            <a href="#circulo-fundador" className="hover:text-[#C4A35A]">Círculo Fundador</a>
          </div>
        </div>

        <div className="max-w-[1240px] mx-auto mt-8 pt-5 border-t border-white/10 text-[10px] tracking-[0.12em] text-[#F5F0E8]/28 uppercase flex flex-wrap gap-3 justify-between">
          <span>© 2025 MAYUS TECNOLOGIA · BRASIL</span>
          <span>TODOS OS DIREITOS RESERVADOS</span>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
