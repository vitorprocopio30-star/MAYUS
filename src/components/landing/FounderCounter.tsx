"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, ShieldCheck, Zap, Crown } from "lucide-react";

export function FounderCounter() {
  const [count, setCount] = useState(100);
  const [spotsTaken, setSpotsTaken] = useState(0);

  // Simulação de vagas sendo ocupadas para demonstração
  useEffect(() => {
    const targetSpots = 27; // Ex: 27 vagas já ocupadas
    let current = 0;
    const timer = setInterval(() => {
      if (current < targetSpots) {
        current++;
        setSpotsTaken(current);
        setCount(100 - current);
      } else {
        clearInterval(timer);
      }
    }, 50);
    return () => clearInterval(timer);
  }, []);

  const getActiveTier = () => {
    if (count > 90) return { name: "Tier Cristal", perk: "Acesso Vitalício" };
    if (count > 50) return { name: "Tier Ouro", perk: "5 Anos de Licença" };
    return { name: "Tier Prata", perk: "2 Anos de Licença" };
  };

  const tier = getActiveTier();

  return (
    <div className="relative group max-w-4xl mx-auto">
      {/* Background Atmosphere Glow */}
      <div className="absolute -inset-4 bg-gradient-to-r from-[#CCA761]/0 via-[#CCA761]/10 to-[#CCA761]/0 rounded-[40px] blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
      
      {/* Animated Border Container */}
      <div 
        className="relative w-full rounded-3xl overflow-hidden p-[1.5px] group-hover:scale-[1.01] transition-transform duration-700"
        style={{
          boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.8)"
        }}
      >
        {/* The Golden Beam (Rotating) */}
        <div 
          className="absolute inset-[-200%] animate-[spin_4s_linear_infinite] opacity-50 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: "conic-gradient(from 0deg, transparent 75%, #CCA761 100%)"
          }}
        />

        {/* Inner Content Card */}
        <div className="relative bg-[#0a0a0a] rounded-[22px] p-8 lg:p-12 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          {/* Left: Numbers and Urgency */}
          <div className="text-center lg:text-left space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#CCA761]/10 border border-[#CCA761]/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCA761] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CCA761]"></span>
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#CCA761]">Círculo Fundador Ativo</span>
            </div>

            <h3 className="text-4xl lg:text-5xl font-light text-white leading-tight">
              Apenas <span className="text-[#CCA761] font-black tabular-nums">{count}</span> vagas <br/>
              restantes no sistema.
            </h3>

            <div className="flex flex-wrap justify-center lg:justify-start gap-4">
               <div className="flex flex-col p-4 bg-white/5 border border-white/5 rounded-2xl min-w-[120px]">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-1">Membros</span>
                  <span className="text-2xl text-white font-light">{spotsTaken}/100</span>
               </div>
               <div className="flex flex-col p-4 bg-[#CCA761]/5 border border-[#CCA761]/20 rounded-2xl min-w-[200px]">
                  <span className="text-[10px] text-[#CCA761] uppercase tracking-widest font-black mb-1">Benefício Atual</span>
                  <span className="text-lg text-white font-bold italic">{tier.perk}</span>
               </div>
            </div>
          </div>

          {/* Right: Visual Progress Ring */}
          <div className="relative flex items-center justify-center">
             <div className="relative w-64 h-64">
                {/* SVG Ring Progress */}
               <svg className="w-full h-full transform -rotate-90">
                 <circle
                   cx="128"
                   cy="128"
                   r="110"
                   stroke="currentColor"
                   strokeWidth="8"
                   fill="transparent"
                   className="text-white/5"
                 />
                 <motion.circle
                   cx="128"
                   cy="128"
                   r="110"
                   stroke="currentColor"
                   strokeWidth="8"
                   strokeDasharray="691"
                   initial={{ strokeDashoffset: 691 }}
                   animate={{ strokeDashoffset: 691 - (691 * spotsTaken) / 100 }}
                   transition={{ duration: 2, ease: "easeOut" }}
                   fill="transparent"
                   strokeLinecap="round"
                   className="text-[#CCA761]"
                 />
               </svg>
               
               {/* Center Content */}
               <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={tier.name}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="flex flex-col items-center"
                    >
                       <Crown size={40} className="text-[#CCA761] mb-2 drop-shadow-[0_0_10px_rgba(204,167,97,0.5)]" />
                       <span className="text-[11px] font-black uppercase tracking-[0.3em] text-[#CCA761]">{tier.name}</span>
                    </motion.div>
                  </AnimatePresence>
               </div>
             </div>
          </div>
        </div>

        {/* Footnote Scarcity */}
        <div className="mt-12 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
           <div className="flex -space-x-3">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="w-10 h-10 rounded-full border-2 border-[#0a0a0a] bg-gray-800 flex items-center justify-center overflow-hidden">
                   <img src={`https://i.pravatar.cc/100?u=${i}`} alt="Avatar" className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all cursor-pointer" />
                </div>
              ))}
              <div className="w-10 h-10 rounded-full border-2 border-[#0a0a0a] bg-[#111] flex items-center justify-center text-[10px] text-[#CCA761] font-bold">
                +22
              </div>
           </div>
           <p className="text-[10px] text-gray-500 uppercase tracking-widest text-center md:text-right font-medium">
             Os benefícios são reduzidos conforme as vagas <br/> são preenchidas. Garanta sua posição agora.
           </p>
        </div>
      </div>
    </div>
  </div>
);
}
