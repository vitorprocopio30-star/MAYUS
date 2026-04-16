"use client";

import Link from "next/link";
import Image from "next/image";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { 
  Sparkles, ArrowRight, ShieldCheck, Zap, Globe, 
  MessageSquare, Check, Cpu, Layers, Crown, 
  Binary, Eye, Lock, Terminal, Activity, 
  ChevronRight, ArrowUpRight
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import Spline from "@splinetool/react-spline";

import { FounderCounter } from "@/components/landing/FounderCounter";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["200", "300", "400", "500", "600", "700", "800"] });

const Reveal = ({ children, width = "fit-content", delay = 0.2, className = "" }: { children: JSX.Element; width?: string; delay?: number; className?: string }) => {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 30 },
        visible: { opacity: 1, y: 0 },
      }}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{ width }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.05], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.05], [1, 0.95]);

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!mounted) return <div className="min-h-screen bg-[#050505]" />;

  return (
    <div className={`min-h-screen bg-[#050505] text-[#e0e0e0] selection:bg-[#CCA761] selection:text-black overflow-x-hidden ${montserrat.className}`}>

      {/* Background Cinematic Shimmer */}
      <div className="fixed inset-0 z-0 pointer-events-none">
         <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#CCA761]/5 blur-[120px] animate-pulse" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#CCA761]/5 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />
      </div>

      {/* Header Elite */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-1000 px-6 lg:px-12 py-8 flex items-center justify-between ${scrolled ? 'bg-black/60 backdrop-blur-2xl border-b border-white/5 py-4' : ''}`}>
        <div className="flex items-center gap-4 group cursor-pointer">
           <div className="relative w-12 h-12 lg:w-16 lg:h-16 transition-transform duration-700 group-hover:scale-105 [perspective:1200px]">
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(204,167,97,0.10)_0%,rgba(204,167,97,0)_72%)] blur-lg" aria-hidden="true" />
              <div className="relative w-full h-full [transform-style:preserve-3d]" style={{ animation: 'mayusLandingPlateRotate 12s ease-in-out infinite' }}>
                <Image 
                  src="/mayus_logo.png" 
                  alt="MAYUS Logo" 
                  fill 
                  className="object-contain scale-[1.02] drop-shadow-[0_12px_24px_rgba(0,0,0,0.32)]"
                />
              </div>
           </div>
           <div className="flex flex-col">
              <span className={`text-xl lg:text-3xl font-black tracking-[0.4em] text-white uppercase leading-none ${cormorant.className} italic`}>MAYUS</span>
              <span className="text-[7px] lg:text-[9px] tracking-[0.6em] text-[#CCA761] font-bold uppercase mt-1">Soberania Digital</span>
            </div>
        </div>

        <div className="hidden lg:flex items-center gap-12 text-[10px] font-black tracking-[0.4em] uppercase text-gray-500">
          <a href="#vision" className="hover:text-[#CCA761] transition-colors relative group">
             O Conceito
             <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-[#CCA761] transition-all group-hover:w-full" />
          </a>
          <a href="#architecture" className="hover:text-[#CCA761] transition-colors relative group">
             Arquitetura
             <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-[#CCA761] transition-all group-hover:w-full" />
          </a>
          <a href="#founders" className="hover:text-[#CCA761] transition-colors relative group">
             Círculo Fundador
             <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-[#CCA761] transition-all group-hover:w-full" />
          </a>
        </div>

        <div className="flex items-center gap-6">
           <Link href="/login" className="hidden md:block text-[10px] font-black tracking-[0.3em] uppercase text-gray-400 hover:text-white transition-colors">
             Acesso Admin
           </Link>
           <Link href="/login" className="px-10 py-3.5 bg-gradient-to-r from-[#CCA761] to-[#8B7340] text-black rounded-lg text-[10px] font-black tracking-widest uppercase hover:brightness-110 transition-all shadow-[0_0_20px_rgba(204,167,97,0.2)]">
             Reclamar Convite
           </Link>
        </div>
      </nav>

      {/* Hero: Sovereign Era */}
      <section className="relative min-h-screen flex flex-col items-center justify-end w-full px-6 overflow-hidden bg-[#050505]">
        
        {/* Glow Effects */}
        <motion.div style={{ opacity, scale }} className="absolute inset-0 z-0 pointer-events-none">
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(ellipse_at_center,rgba(204,167,97,0.12)_0%,transparent_60%)]" />
        </motion.div>

        {/* Central 3D Spline (Z-10: Behind text) */}
        <div className="absolute inset-0 z-10 w-full h-full flex justify-center items-center pointer-events-none select-none overflow-hidden">
          <Reveal delay={0.3} width="100%" className="w-full h-full relative flex items-center justify-center">
             <div className="relative w-[150vw] h-[120vh] transition-all duration-1000 ease-out flex items-center justify-center translate-x-[5%] translate-y-[18%]">
                <Spline scene="https://prod.spline.design/antVG5gJ69HRFMFs/scene.splinecode" className="w-full h-full object-cover scale-[0.5] md:scale-[0.6] lg:scale-[0.7]" />
              </div>
          </Reveal>
        </div>

        {/* Huge Background Typography (Z-20: In front of Spline) */}
        <div className="absolute bottom-[8%] md:bottom-[12%] left-1/2 -translate-x-1/2 w-full text-center z-20 pointer-events-none flex flex-col items-center opacity-100">
          <Reveal delay={0.1} width="100%">
             <div className="flex flex-col items-center">
                <h1 className="text-[8vw] md:text-[6.5vw] font-[900] text-transparent bg-clip-text bg-gradient-to-b from-[#FFF5D1] via-[#EAAA23] to-[#A66E14] uppercase tracking-[-0.04em] leading-[1] drop-shadow-[0_10px_40px_rgba(234,170,35,0.25)] whitespace-nowrap pb-2">
                  PRIMEIRO MODELO<br/>AGÊNTICO DO DIREITO
                </h1>
             </div>
          </Reveal>
        </div>

        {/* Bottom Fade Gradient for smooth transition */}
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-[#050505] via-[#050505]/40 to-transparent z-20 pointer-events-none"></div>

        {/* Left Small Text Block */}
        <div className="hidden md:block absolute left-12 top-[35%] z-30 text-left max-w-[280px] pointer-events-none">
          <Reveal delay={0.4}>
            <div className="text-[10px] font-black uppercase text-gray-300 tracking-[0.15em] leading-loose">
              <span className="text-[#CCA761] mr-2">{"//"}</span> O SISTEMA MAYUS — A INTELIGÊNCIA ARTIFICIAL CONSTRUINDO ESTRUTURAS ROBUSTAS, TRANSFORMANDO BANCAS JURÍDICAS EM POTÊNCIAS DE ESCALA.
            </div>
          </Reveal>
        </div>

        {/* Right Small Text Block */}
        <div className="hidden md:block absolute right-12 top-[35%] z-30 text-right max-w-[220px] pointer-events-none">
          <Reveal delay={0.5}>
            <div className="text-[10px] font-black uppercase text-gray-300 tracking-[0.15em] leading-loose">
              <span className="text-[#CCA761] mr-2">{"//"}</span> ARQUITETURA DE DADOS QUE FALA PELA SUA MARCA
            </div>
          </Reveal>
        </div>

        {/* Bottom Bar: App Modules (Restored Design) */}
        <div className="absolute bottom-8 left-0 w-full px-6 md:px-12 z-40 flex flex-col md:flex-row items-center justify-center gap-6 pb-4">
          <Reveal delay={0.6}>
            <div className="flex flex-wrap justify-center md:items-center gap-8 md:gap-14 opacity-40 hover:opacity-100 transition-opacity duration-700 pointer-events-auto">
              {[
                { label: "MURAL" },
                { label: "GAMIFICAÇÃO" },
                { label: "AGENDA" },
                { label: "WHATSAPP" },
                { label: "MONITORAMENTO DE PROCESSO" },
              ].map((item, i) => (
                <span key={i} className={`text-xl md:text-2xl font-bold tracking-widest uppercase ${cormorant.className} italic text-white`}>
                  {item.label}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section id="founders" className="relative py-44 px-6 md:px-20 overflow-hidden">
         {/* Top Header: Headline + Button aligned */}
         <div className="relative z-20 flex flex-col md:flex-row justify-between items-start md:items-center mb-16 gap-10">
           <Reveal delay={0.1}>
              <h2 className={`text-3xl md:text-5xl text-[#CCA761] font-bold tracking-[0.2em] uppercase ${cormorant.className} italic`}>
                O Círculo dos <span className={`text-white font-black not-italic ${montserrat.className}`}>100</span>
              </h2>
           </Reveal>

           <Reveal delay={0.2}>
            <Link 
              href="/login" 
              className="group flex items-center gap-4 text-[11px] font-black tracking-[0.4em] text-white uppercase hover:text-[#CCA761] transition-colors pointer-events-auto"
            >
              <span className="hidden md:inline">{"//"} TORNAR-SE FUNDADOR</span>
              <span className="md:hidden">FUNDADOR</span>
              <div className="w-10 h-10 rounded-full border border-white/20 group-hover:border-[#CCA761] flex items-center justify-center transition-colors">
                <ArrowUpRight size={16} className="text-white group-hover:text-[#CCA761]" />
              </div>
            </Link>
           </Reveal>
         </div>

         <Reveal delay={0.3}>
            <div className="max-w-4xl mx-auto mb-24">
               <p className={`text-gray-400 text-lg md:text-2xl leading-loose italic ${cormorant.className} text-left`}>
                 Não somos apenas software. Somos uma fundação. <br className="hidden md:block"/>
                 Os primeiros 100 membros carimbam seu nome no código da MAYUS. Ao se tornar um fundador, você não está apenas adquirindo uma licença; você está reivindicando soberania sobre o seu ecossistema jurídico e garantindo seu lugar na arquitetura digital da próxima era.
               </p>
            </div>
         </Reveal>

         <Reveal delay={0.4}>
            <FounderCounter />
         </Reveal>
      </section>

      <style jsx global>{`
        @keyframes mayusLandingPlateRotate {
          0% {
            transform: rotateX(7deg) rotateY(0deg);
          }
          50% {
            transform: rotateX(7deg) rotateY(180deg);
          }
          100% {
            transform: rotateX(7deg) rotateY(360deg);
          }
        }
      `}</style>

      {/* Concept Architecture: Orb -> Kernel -> Skills */}
      <section id="architecture" className="relative py-44 overflow-hidden border-y border-white/5 bg-black/20">
        <div className="absolute right-[-10%] top-0 w-[500px] h-[500px] bg-[#CCA761]/5 blur-[150px] pointer-events-none" />
        
        <div className="relative z-10 px-6 lg:px-40 flex flex-col lg:flex-row items-center gap-32">
           <div className="lg:w-1/2">
              <Reveal>
                 <>
                    <h2 className={`text-6xl text-white mb-10 ${cormorant.className} italic leading-tight`}>
                       A <span className="text-[#CCA761]">Engenharia</span> <br/> da Soberania
                    </h2>
                    <p className="text-gray-400 font-light text-lg mb-16 leading-relaxed italic">
                      O MAYUS orquestra a inteligência artificial através de uma arquitetura triádica projetada para durar décadas.
                    </p>
                 </>
              </Reveal>

              <div className="space-y-12">
                 {[
                   { icon: Activity, title: "MAYUS ORB", desc: "A interface neural. Ativa por voz (ElevenLabs) ou intenção digital. A face da inteligência no seu escritório." },
                   { icon: Cpu, title: "KERNEL MULTI-LLM", desc: "Liberdade absoluta. Conecte suas próprias chaves (OpenAI, Claude, Llama). Controle de custos e performance total." },
                   { icon: Binary, title: "SKILLS JURÍDICAS", desc: "Ações concretas. Gerar petições em Massa, monitorar processos no Escavador, auditar prazos em segundos." }
                 ].map((item, i) => (
                   <Reveal key={i} delay={0.2 + (i * 0.1)}>
                      <div className="flex gap-8 group">
                         <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center shrink-0 group-hover:border-[#CCA761]/40 transition-colors">
                            <item.icon className="text-[#CCA761]" size={28} />
                         </div>
                         <div>
                            <h4 className="text-white text-xs font-black tracking-widest uppercase mb-3">{item.title}</h4>
                            <p className="text-gray-500 text-sm leading-relaxed font-light">{item.desc}</p>
                         </div>
                      </div>
                   </Reveal>
                 ))}
              </div>
           </div>
           
           <div className="lg:w-1/2 relative">
              <Reveal delay={0.5}>
                 <div className="relative w-full aspect-square max-w-[600px] mx-auto overflow-hidden rounded-[3rem] border border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent shadow-2xl p-12">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#CCA761]/30 to-transparent" />
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-8">
                       <Crown size={80} className="text-[#CCA761]/20" />
                       <div className="space-y-2">
                          <p className={`text-4xl text-white ${cormorant.className} italic`}>&quot;O Moat Decisivo&quot;</p>
                          <p className="text-[10px] text-[#CCA761] font-black tracking-[0.5em] uppercase">Memória Neural Coletiva</p>
                       </div>
                       <p className="text-gray-600 text-sm italic max-w-sm">
                         Quanto mais seu escritório usa o MAYUS, mais inteligente o sistema se torna. Seus dados criam um diferencial impossível de ser copiado.
                       </p>
                    </div>
                 </div>
              </Reveal>
           </div>
        </div>
      </section>

      {/* Membership Tiers: Founder Exclusive */}
      <section id="plans" className="py-56 px-6 bg-[#050505] relative overflow-hidden">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#CCA761]/10 blur-[200px] pointer-events-none opacity-30" />
         
         <div className="text-center mb-32 relative z-10">
            <Reveal>
               <>
                  <h2 className={`text-6xl lg:text-8xl text-white mb-8 ${cormorant.className} italic font-light tracking-tighter`}>Títulos de <span className="text-[#CCA761]">Membro</span></h2>
                  <p className="text-gray-600 uppercase tracking-[0.7em] text-[10px] font-black">Uma decisão única para o futuro da sua banca</p>
               </>
            </Reveal>
         </div>

         <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10 items-end">
            
            {/* Tier Prata */}
            <Reveal delay={0.2}>
               <div className="group relative p-1 pb-1 flex flex-col rounded-[2.5rem] bg-white/[0.03] border border-white/5 hover:border-[#CCA761]/20 transition-all transition-duration-700">
                  <div className="p-12 h-full flex flex-col">
                     <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase mb-10">Silver Early Adopter</span>
                     <div className="mb-12">
                        <div className="text-5xl font-light text-white mb-2">R$ 547<span className="text-sm opacity-30 italic">/mês</span></div>
                        <p className="text-[9px] text-[#CCA761] font-black uppercase tracking-widest leading-none">Benefício Fundador: 2 Anos de Licença</p>
                     </div>
                     <ul className="space-y-7 flex-1 mb-16 opacity-60">
                        <li className="flex items-center gap-4 text-xs text-white font-light"><Check size={14} className="text-[#CCA761]"/> Todas as Skills Premium</li>
                        <li className="flex items-center gap-4 text-xs text-white font-light"><Check size={14} className="text-[#CCA761]"/> Multi-LLM (BYOK)</li>
                        <li className="flex items-center gap-4 text-xs text-white font-light"><Check size={14} className="text-[#CCA761]"/> Memória Privada RAG</li>
                     </ul>
                     <button className="w-full py-6 rounded-2xl border border-white/10 text-[9px] font-black tracking-[0.4em] uppercase group-hover:bg-[#CCA761] group-hover:text-black group-hover:border-transparent transition-all">Garantir Vaga</button>
                  </div>
               </div>
            </Reveal>

            {/* Tier Cristal (Destaque) */}
            <Reveal delay={0.4}>
               <div className="relative group scale-110 z-20">
                  <div className="absolute -inset-[2px] bg-gradient-to-b from-[#CCA761] to-[#6d5932] rounded-[3rem] blur-sm opacity-50 group-hover:opacity-100 transition-opacity duration-1000" />
                  <div className="relative p-14 h-full flex flex-col items-center text-center rounded-[3rem] bg-[#0c0c0c] border border-[#CCA761]/20 shadow-[0_45px_100px_rgba(204,167,97,0.15)]">
                     <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2 px-6 py-2 bg-[#CCA761] text-black text-[9px] font-black uppercase tracking-[0.4em] rounded-full shadow-lg">Vagas 1 — 10</div>
                     
                     <Crown size={40} className="text-[#CCA761] mb-10 animate-pulse" />
                     <h3 className={`text-4xl text-white mb-10 ${cormorant.className} italic font-bold tracking-wide`}>Crystal Founder</h3>
                     
                     <div className="mb-12">
                        <div className="text-7xl font-[800] text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 mb-2 whitespace-nowrap">VITALÍCIO</div>
                        <p className="text-[10px] text-[#CCA761] font-black uppercase tracking-widest italic">A Glória Eterna do Código</p>
                     </div>
                     
                     <ul className="space-y-7 flex-1 mb-16 w-full">
                        <li className="flex items-center justify-center gap-4 text-xs text-white font-bold opacity-90"><ShieldCheck size={14} className="text-[#CCA761]"/> Taxa de Adesão Mista</li>
                        <li className="flex items-center justify-center gap-4 text-xs text-white font-bold opacity-90"><ShieldCheck size={14} className="text-[#CCA761]"/> Suporte Head-to-Head</li>
                        <li className="flex items-center justify-center gap-4 text-xs text-white font-bold opacity-90"><ShieldCheck size={14} className="text-[#CCA761]"/> Acesso Beta Eterno</li>
                        <li className="flex items-center justify-center gap-4 text-xs text-white font-bold opacity-90"><ShieldCheck size={14} className="text-[#CCA761]"/> Mentoria de IA Jurídica</li>
                     </ul>
                     
                     <button className="w-full py-7 bg-white text-black rounded-2xl text-[10px] font-black tracking-[0.5em] uppercase hover:shadow-[0_0_40px_rgba(255,255,255,0.3)] transition-all">Consagrar Soberania</button>
                  </div>
               </div>
            </Reveal>

            {/* Tier Ouro */}
            <Reveal delay={0.6}>
               <div className="group relative p-1 pb-1 flex flex-col rounded-[2.5rem] bg-white/[0.03] border border-white/5 hover:border-[#CCA761]/20 transition-all transition-duration-700">
                  <div className="p-12 h-full flex flex-col">
                     <span className="text-[10px] font-black tracking-[0.4em] text-[#CCA761] uppercase mb-10">Gold Legacy</span>
                     <div className="mb-12 text-left">
                        <div className="text-5xl font-light text-white mb-2">R$ 497<span className="text-sm opacity-30 italic">/mês</span></div>
                        <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest leading-none italic">Benefício Fundador: 5 Anos de Licença</p>
                     </div>
                     <ul className="space-y-7 flex-1 mb-20 opacity-60">
                        <li className="flex items-center gap-4 text-xs text-white font-light"><Check size={14} className="text-[#CCA761]"/> Onboarding VIP Concierge</li>
                        <li className="flex items-center gap-4 text-xs text-white font-light"><Check size={14} className="text-[#CCA761]"/> Mural Coletivo Ativo</li>
                        <li className="flex items-center gap-4 text-xs text-white font-light"><Check size={14} className="text-[#CCA761]"/> Backup Georedundante</li>
                     </ul>
                     <button className="w-full py-6 rounded-2xl border border-white/10 text-[9px] font-black tracking-[0.4em] uppercase group-hover:bg-[#CCA761] group-hover:text-black group-hover:border-transparent transition-all">Fazer História</button>
                  </div>
               </div>
            </Reveal>
         </div>
      </section>

      {/* Manifesto Footer */}
      <footer className="py-44 px-6 border-t border-white/10 flex flex-col items-center text-center bg-black relative">
         <Reveal>
            <div className="relative w-32 h-32 mb-16 opacity-80 cursor-pointer hover:scale-110 transition-transform duration-1000">
               <Image src="/logo_premium.png" alt="MAYUS Logo" fill className="object-contain grayscale hover:grayscale-0 transition-all" />
            </div>
         </Reveal>
         
         <Reveal delay={0.2}>
            <p className={`text-4xl lg:text-6xl text-gray-400 italic ${cormorant.className} mb-16 max-w-4xl leading-snug`}>
               &quot;A soberania não é um destino. <br/> É a ferramenta que separa os <br/> <span className="text-white">vencedores</span> dos apenas ocupados.&quot;
            </p>
         </Reveal>

         <Reveal delay={0.4}>
            <div className="flex gap-12 text-[9px] font-black tracking-[0.5em] text-gray-700 uppercase mb-20">
               <a href="#" className="hover:text-[#CCA761] transition-colors">Termos</a>
               <a href="#" className="hover:text-[#CCA761] transition-colors">Privacidade</a>
               <a href="#" className="hover:text-[#CCA761] transition-colors">Imprensa</a>
            </div>
         </Reveal>

         <div className="text-[9px] tracking-[1em] font-black text-gray-900 uppercase opacity-40">
            MAYUS NEURAL ARCHITECTURE • ESTREIA 2026 • BRASÍLIA / SÃO PAULO
         </div>
      </footer>
    </div>
  );
}
