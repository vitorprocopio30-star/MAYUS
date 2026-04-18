"use client";

import { SalesHero } from "@/components/landing/SalesHero";
import { FounderCounter } from "@/components/landing/FounderCounter";
import { motion } from "framer-motion";
import { Cormorant_Garamond } from "next/font/google";
import { 
  Bot, 
  Search, 
  GanttChartSquare, 
  Users2, 
  MessageSquare, 
  CreditCard 
} from "lucide-react";
import Image from "next/image";

const cormorant = Cormorant_Garamond({ 
  subsets: ["latin"], 
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"]
});

const features = [
  {
    title: "Agente IA (Kernel)",
    description: "Um cérebro central que planeja e executa tarefas sozinho. Atendimento, peças e consultas integradas.",
    icon: Bot
  },
  {
    title: "Monitoramento Ativo",
    description: "Sincronização em tempo real com tribunais. O Escavador detecta, a IA resume e o Kanban organiza.",
    icon: Search
  },
  {
    title: "Kanban Jurídico",
    description: "Gestão visual de processos com automação de prazos e cálculo de urgência por inteligência artificial.",
    icon: GanttChartSquare
  },
  {
    title: "Gestão de Equipe",
    description: "Gamificação com MAYUS Coins, mural de ideias e agenda global oculta até o check-in.",
    icon: Users2
  },
  {
    title: "Atendimento WhatsApp",
    description: "Agentes que vendem, fecham contratos e dão suporte aos clientes 24/7 de forma humanizada.",
    icon: MessageSquare
  },
  {
    title: "Financeiro Integrado",
    description: "Cobranças automáticas via ASAAS e assinaturas digitais via ZapSign centralizadas.",
    icon: CreditCard
  }
];

export default function VendasPage() {
  return (
    <main className="bg-[#030303] min-h-screen selection:bg-[#CCA761] selection:text-black">
      <SalesHero />

      {/* Campaign Section */}
      <section className="py-24 px-4 bg-gradient-to-b from-transparent via-[#CCA761]/5 to-transparent">
        <div className="max-w-6xl mx-auto text-center mb-16 space-y-4">
          <h2 className={`${cormorant.className} text-4xl md:text-6xl text-white font-light`}>
            A Campanha <span className="text-luxury">100 Founders</span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto font-light">
            Estamos selecionando apenas 100 escritórios para fazer parte do conselho fundador. 
            Benefícios vitalícios e valor fixo para sempre.
          </p>
        </div>
        
        <FounderCounter />
      </section>

      {/* Features Grid */}
      <section className="py-32 px-4 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -10 }}
              className="glass-card p-10 group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <f.icon size={80} className="text-[#CCA761]" />
              </div>
              
              <f.icon size={32} className="text-[#CCA761] mb-6" />
              <h3 className={`${cormorant.className} text-2xl text-white mb-4`}>{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-light">
                {f.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Pricing / Final CTA */}
      <section className="py-32 px-4 border-t border-white/5 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#CCA761]/10 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-4xl mx-auto glass-card p-12 md:p-20 text-center space-y-10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#CCA761] to-transparent" />
          
          <div className="space-y-4">
            <span className="text-[10px] font-black tracking-[0.4em] text-[#CCA761] uppercase">Preço Exclusivo Founder</span>
            <h2 className={`${cormorant.className} text-5xl md:text-7xl text-white`}>
               R$ <span className="text-luxury font-bold">397</span><span className="text-2xl text-gray-600">/mês</span>
            </h2>
            <p className="text-gray-400 italic">Preço travado para sempre enquanto mantiver a assinatura ativa.</p>
          </div>

          <div className="flex flex-col items-center gap-6">
             <button className="px-16 py-6 bg-[#CCA761] text-black font-black uppercase tracking-[0.3em] text-sm shadow-[0_0_30px_rgba(204,167,97,0.4)] transition-all hover:scale-105 active:scale-95">
               Quero ser um Founder
             </button>
             <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">
               Apenas 100 vagas disponíveis · Pagamento trimestral ou anual
             </p>
          </div>

          <div className="pt-8 flex justify-center gap-12 opacity-30 grayscale saturate-0">
             <Image src="/landing/founder-badge.png" alt="Founder Badge" width={120} height={120} className="object-contain" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-4 text-center border-t border-white/5">
        <div className={`${cormorant.className} italic text-2xl text-white/40 mb-4`}>
          M A Y U S
        </div>
        <p className="text-[9px] text-gray-600 uppercase tracking-[0.5em] font-medium">
          © 2026 · The AI Operating System for Law Firms
        </p>
      </footer>
    </main>
  );
}
