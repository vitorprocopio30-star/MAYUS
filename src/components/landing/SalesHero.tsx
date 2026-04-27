"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { Cormorant_Garamond } from "next/font/google";
import { ChevronRight, ShieldCheck, Sparkles } from "lucide-react";

const cormorant = Cormorant_Garamond({ 
  subsets: ["latin"], 
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"]
});

export function SalesHero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden py-20 px-4">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <Image 
          src="/landing/hero-bg.png" 
          alt="Luxury Office" 
          fill 
          className="object-cover opacity-40 brightness-50"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#030303] via-transparent to-[#030303]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#030303] via-transparent to-[#030303]" />
      </div>

      {/* Light Beams */}
      <div className="beam-light opacity-30" />
      <div className="beam-light opacity-20" style={{ left: '50%', animationDelay: '2s' }} />

      <div className="relative z-10 max-w-6xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="space-y-8"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#CCA761]/10 border border-[#CCA761]/30 backdrop-blur-md">
            <Sparkles size={14} className="text-[#CCA761]" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#CCA761]">
              A Revolução do Direito Agêntico
            </span>
          </div>

          {/* Main Title */}
          <h1 className={`${cormorant.className} text-5xl md:text-8xl font-light text-gray-900 dark:text-white leading-tight`}>
            O Primeiro <span className="text-luxury">AI Operating System</span> <br />
            para Grandes Bancas
          </h1>

          {/* Subtitle */}
          <p className="max-w-2xl mx-auto text-gray-400 text-lg md:text-xl font-light leading-relaxed">
            Não é apenas IA. É o sistema operacional completo que opera seu atendimento, 
            processos e comercial através de agentes inteligentes proativos.
          </p>

          {/* Buttons */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 pt-4">
            <button className="group relative px-10 py-5 bg-[#CCA761] text-black font-bold uppercase tracking-[0.2em] text-xs overflow-hidden transition-all hover:scale-105 active:scale-95">
              <span className="relative z-10 flex items-center gap-2">
                Garantir Acesso Founder <ChevronRight size={16} />
              </span>
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity" />
            </button>

            <button className="px-10 py-5 border border-gray-200 dark:border-white/10 hover:border-white/30 text-gray-900 dark:text-white font-bold uppercase tracking-[0.2em] text-xs transition-all backdrop-blur-sm">
              Ver Demonstração
            </button>
          </div>

          {/* Trust Indicators */}
          <div className="pt-12 flex flex-wrap justify-center items-center gap-8 opacity-50 grayscale">
             <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-[#CCA761]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-900 dark:text-white">LGPD Compliant</span>
             </div>
             <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-[#CCA761]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-900 dark:text-white">Byok Architecture</span>
             </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
