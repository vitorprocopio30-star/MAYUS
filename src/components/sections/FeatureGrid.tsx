"use client";

import { motion } from "framer-motion";
import { Shield, Brain, Cpu, MessageSquare, Scale, Zap } from "lucide-react";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";

const FEATURES = [
  {
    icon: Shield,
    title: "Monitoramento Ativo",
    desc: "Captura automática de movimentações em todos os tribunais e diários oficiais. Nada passa sem ser visto.",
  },
  {
    icon: Brain,
    title: "Memória Institucional",
    desc: "O sistema aprende com o histórico da sua banca, padronizando a inteligência e o know-how jurídico.",
  },
  {
    icon: Zap,
    title: "Lex Proativo",
    desc: "Rascunhos de peças e respostas gerados no momento em que a intimação é detectada. Saia na frente.",
  },
  {
    icon: MessageSquare,
    title: "Agente WhatsApp",
    desc: "Atendimento e consulta processual via voz ou texto diretamente no WhatsApp dos seus clientes.",
  },
  {
    icon: Scale,
    title: "Soberania de Dados",
    desc: "Tecnologia BYOK. Suas chaves, seus dados, sua inteligência. Total autonomia para o escritório.",
  },
  {
    icon: Cpu,
    title: "Neural Engine",
    desc: "Processamento de linguagem natural focado em terminologia jurídica complexa e prazos processuais.",
  },
];

export function FeatureGrid() {
  return (
    <section className="relative z-10 py-32 px-6 bg-[#060606]">
      <div className="max-w-[1240px] mx-auto">
        <div className="flex flex-col items-center text-center mb-20">
          <EyebrowBadge>ARQUITETURA // MAYUS V2</EyebrowBadge>
          <h2 className="mt-6 text-4xl md:text-6xl font-sans font-semibold tracking-tighter text-white">
            A infraestrutura das <br />
            <span className="text-[#CCA761]">Bancas de Elite.</span>
          </h2>
          <p className="mt-6 max-w-2xl text-zinc-400 text-sm md:text-base leading-relaxed">
            O MAYUS não é apenas um software, é uma camada de inteligência autônoma que se integra à alma da sua operação jurídica.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, idx) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1, duration: 0.5 }}
              className="group relative p-8 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-[#CCA761]/30 transition-all duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#CCA761]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
              
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <f.icon size={24} className="text-[#CCA761]" />
                </div>
                <h3 className="text-xl font-sans font-medium text-white mb-3">{f.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed group-hover:text-zinc-300 transition-colors">
                  {f.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
