"use client";

import { useState, useEffect } from "react";
import { Mic, Waves, Scale } from "lucide-react";

export function MayosOrb() {
  const [isListening, setIsListening] = useState(false);

  // Simula a transição do wake word (Só para visualização interativa do painel inicial)
  const toggleListening = () => {
    setIsListening(!isListening);
  };

  return (
    <div className="fixed bottom-8 right-8 z-50 flex items-center justify-center">

      {/* Tooltip 'Wake Word' */}
      <div 
        className={`px-4 py-2 rounded-full border border-[#CCA761]/30 bg-[#111111]/90 backdrop-blur-md shadow-[0_0_15px_rgba(204,167,97,0.1)] transition-all duration-500 ease-out transform ${
          isListening ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <p className="text-[#CCA761] text-xs font-semibold tracking-[0.2em] uppercase flex items-center gap-2">
          <Waves size={14} className="animate-pulse" />
          Ouvindo o Doutor...
        </p>
      </div>

      {/* Botão Orb Sci-Fi Principal */}
      <button
        onClick={toggleListening}
        className="relative group flex items-center justify-center cursor-pointer outline-none w-24 h-24 mt-2"
        title="Mayus Principal"
      >
        {/* Glow de Fundo Constante */}
        <div className="absolute inset-x-0 h-full w-4 bg-gradient-to-b from-transparent via-[#CCA761]/20 to-transparent blur-md" />
        
        {/* Anel Externo Tracejado (Gira Lento) */}
        <div className={`absolute inset-0 rounded-full border-2 border-dashed border-[#CCA761]/40 transition-all duration-700 ${isListening ? "animate-[spin_4s_linear_infinite]" : "animate-[spin_12s_linear_infinite]"}`} />
        
        {/* Anel Médio Sólido (Gira Contrário) */}
        <div className={`absolute inset-2 rounded-full border border-[#CCA761]/60 border-t-transparent border-b-transparent transition-all duration-700 ${isListening ? "animate-[spin_3s_linear_infinite_reverse] scale-110 border-[#f1d58d] shadow-[0_0_20px_rgba(204,167,97,0.5)]" : "animate-[spin_8s_linear_infinite_reverse]"}`} />

        {/* Anel Interno Fino (Pulsa) */}
        <div className={`absolute inset-4 rounded-full border border-[#cca761]/80 transition-all duration-500 ${isListening ? "animate-pulse scale-90 border-[#f1d58d]" : ""}`} />

        {/* Decoração Tech Lateral (Circuitos fictícios) */}
        <div className="absolute -left-6 w-8 h-px bg-gradient-to-r from-transparent to-[#CCA761]/50" />
        <div className="absolute -left-8 w-4 h-px top-1/3 bg-[#CCA761]/30" />
        <div className="absolute -right-6 w-8 h-px bg-gradient-to-l from-transparent to-[#CCA761]/50" />
        <div className="absolute -right-8 w-4 h-px bottom-1/3 bg-[#CCA761]/30" />
        
        {/* Núcleo Circular Girando */}
         <div className={`relative w-10 h-10 flex items-center justify-center rounded-full bg-[#0a0a0a] border border-[#CCA761]/50 transition-all duration-500 z-10 ${
            isListening ? "shadow-[0_0_25px_rgba(204,167,97,0.4)] border-[#CCA761] animate-pulse" : "shadow-[inset_0_0_15px_rgba(204,167,97,0.2)] group-hover:border-[#CCA761]/80"
         }`}>
            <div className={`absolute w-6 h-6 rounded-full border border-dashed border-[#CCA761] animate-[spin_2s_linear_infinite] ${isListening ? "scale-125 opacity-100" : "opacity-30"}`} />
            
            {/* Ícone de Balança da Justiça Central */}
            <Scale size={18} className={`text-[#CCA761] transition-all duration-500 ${isListening ? "scale-110 animate-pulse" : "scale-100 opacity-80 group-hover:opacity-100 group-hover:scale-110"}`} />
         </div>

      </button>

      {/* Dica de texto estática */}
      {!isListening && (
        <span className="text-[10px] text-gray-500 tracking-widest uppercase font-semibold drop-shadow-md">
          Diga <span className="text-[#CCA761]">Olá, Mayus</span>
        </span>
      )}
    </div>
  );
}
