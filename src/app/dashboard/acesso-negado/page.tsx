"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { ShieldOff, ArrowLeft } from "lucide-react";

const cormorant = Cormorant_Garamond({ 
  subsets: ["latin"], 
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});

const montserrat = Montserrat({ 
  subsets: ["latin"], 
  weight: ["300", "400", "500", "600", "700"],
});

export default function AcessoNegadoPage() {
  const router = useRouter();

  return (
    <div className={`min-h-[80vh] flex items-center justify-center ${montserrat.className}`}>
      <div className="relative w-full max-w-lg mx-4">
        
        {/* Card com glassmorphism */}
        <div 
          className="relative rounded-3xl overflow-hidden p-[1px]"
          style={{ boxShadow: "0 40px 100px -10px rgba(0, 0, 0, 0.6)" }}
        >
          {/* Border animada */}
          <div 
            className="absolute inset-[-100%] animate-[spin_6s_linear_infinite] opacity-30"
            style={{ background: "conic-gradient(from 0deg, transparent 80%, #ef4444 100%)" }}
          />

          <div className="relative w-full bg-[#0C0C0C]/90 backdrop-blur-xl rounded-[22px] p-10 md:p-14 text-center">
            
            {/* Ícone de cadeado */}
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 rounded-2xl bg-red-900/20 border border-red-800/30 flex items-center justify-center">
                <ShieldOff size={36} className="text-red-400" />
              </div>
            </div>

            {/* Headline */}
            <h1 className={`text-3xl md:text-4xl text-gray-900 dark:text-white mb-3 ${cormorant.className} italic font-bold`}>
              Acesso <span className="text-red-400">Negado</span>
            </h1>
            
            <p className="text-gray-400 text-sm leading-relaxed max-w-sm mx-auto mb-2">
              Você não possui permissão para acessar este módulo.
              Entre em contato com o administrador do seu escritório caso precise de acesso.
            </p>

            <p className="text-[10px] text-gray-600 uppercase tracking-[0.2em] mb-8">
              Incidente registrado para auditoria
            </p>

            {/* Botão de Retorno */}
            <button
              onClick={() => router.push("/dashboard")}
              className="relative inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#111111] font-[800] py-3 px-8 rounded-lg transition-all duration-300 transform active:scale-95 text-sm shadow-none overflow-hidden hover:-translate-y-[1px] tracking-widest"
            >
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12" />
              <ArrowLeft size={16} strokeWidth={2.5} className="relative z-10" />
              <span className="relative z-10">VOLTAR AO PAINEL</span>
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}
