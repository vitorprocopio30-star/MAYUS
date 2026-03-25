"use client";

import { Trophy, Crown, Medal, TrendingUp, Award, Shield, Swords, Star, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Montserrat, Cormorant_Garamond } from "next/font/google";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });

const MOCK_RANKINGS = {
  Comercial: [
    { name: "Ana S. (Closer)", score: 2450, tasks: 45 },
    { name: "Vitor P.", score: 1250, tasks: 32 },
    { name: "Beto (SDR)", score: 820, tasks: 20 },
  ],
  Jurídico: [
    { name: "Dr. Marcos T.", score: 1550, tasks: 12 },
    { name: "Dra. Helena", score: 950, tasks: 9 },
    { name: "Suzi P.", score: 400, tasks: 5 },
  ],
  Marketing: [
    { name: "Caio V.", score: 1800, tasks: 25 },
    { name: "Julia (Social)", score: 900, tasks: 18 },
  ]
};

export default function HallDaFamaPage() {
  return (
    <div className={`min-h-screen bg-[#050505] text-white p-6 md:p-10 relative overflow-hidden ${montserrat.className}`}>
      {/* Background Decorativo */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#CCA761]/5 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#CCA761]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-12 pb-20">
        
        {/* HEADER DO HALL DA FAMA */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-[#CCA761]/30 pb-6">
          <div>
            <Link href="/dashboard/agenda-global" className="flex items-center gap-2 text-gray-500 hover:text-[#CCA761] transition-colors mb-4 w-fit px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:border-[#CCA761]/30">
              <ChevronLeft size={16} /> <span className="text-[10px] font-bold uppercase tracking-widest">Voltar para a Base</span>
            </Link>
            <h1 className={`text-5xl lg:text-7xl text-[#CCA761] mb-2 font-bold tracking-tight ${cormorant.className} italic drop-shadow-[0_0_20px_rgba(204,167,97,0.4)]`}>
              Hall da Fama
            </h1>
            <p className="text-[#a1a1aa] text-xs font-medium tracking-widest uppercase ml-1 flex items-center gap-2">
              <Crown size={14} className="text-[#FFD700]" /> A Elite do Escritório MAYUS
            </p>
          </div>
          
          <div className="bg-[#111] border border-[#CCA761]/20 p-4 rounded-xl shadow-[0_5px_20px_rgba(204,167,97,0.1)] flex items-center gap-6">
             <div className="flex flex-col items-end">
               <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 mb-1">Rodada Atual</span>
               <span className="text-[#CCA761] font-bold tracking-widest text-sm">MARÇO / SEMANA 4</span>
             </div>
             <div className="w-px h-8 bg-[#CCA761]/20" />
             <div className="flex flex-col items-center">
               <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#ef4444] animate-pulse mb-1">Fim da Temporada em</span>
               <span className="text-white font-black tracking-widest text-sm">2 Dias</span>
             </div>
          </div>
        </div>

        {/* LIGAS POR DEPARTAMENTO (PÓDIOS) */}
        <div className="pt-8">
          <h2 className="text-xl font-bold tracking-widest uppercase mb-8 flex items-center gap-3 text-white border-b border-white/5 pb-4">
            <Swords className="text-[#CCA761]" size={24} /> Pódios Departamentais
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* PÓDIO COMERCIAL */}
            <div className="bg-[#111] border border-[#CCA761]/20 rounded-2xl p-6 shadow-lg flex flex-col h-full transform transition hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(204,167,97,0.1)]">
              <div className="flex justify-between items-center border-b border-[#CCA761]/20 pb-4 mb-6">
                <h3 className="text-lg font-black tracking-widest text-[#CCA761] uppercase flex items-center gap-2">
                  <TrendingUp size={18} /> Comercial
                </h3>
              </div>
              <div className="flex-1 flex justify-center items-end gap-2 h-64 pb-0 pt-4">
                {/* 2ND PLACE */}
                <div className="flex flex-col items-center flex-1 z-10 w-1/3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#0a0a0a] border-2 border-gray-400 flex items-center justify-center font-black text-gray-400 text-sm mb-2 shadow-[0_0_10px_rgba(156,163,175,0.2)]">
                    {MOCK_RANKINGS.Comercial[1]?.name ? MOCK_RANKINGS.Comercial[1].name.charAt(0) : '-'}
                  </div>
                  <span className="text-[10px] sm:text-xs font-bold text-gray-300 truncate w-full text-center px-1" title={MOCK_RANKINGS.Comercial[1]?.name}>{MOCK_RANKINGS.Comercial[1]?.name || '---'}</span>
                  <span className="text-[9px] sm:text-[10px] text-gray-400 mb-2 font-bold">{MOCK_RANKINGS.Comercial[1]?.score || 0} MC</span>
                  <div className="w-full bg-gradient-to-t from-[#0a0a0a] to-gray-400/10 border-t border-gray-400/30 rounded-t-lg h-24 flex items-start justify-center pt-2 font-black text-gray-500 text-xl shadow-[inset_0_5px_15px_rgba(156,163,175,0.05)]">
                    2º
                  </div>
                </div>
                {/* 1ST PLACE */}
                <div className="flex flex-col items-center flex-1 z-20 w-1/3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#0a0a0a] border-2 border-[#CCA761] flex items-center justify-center font-black text-[#CCA761] text-lg mb-2 shadow-[0_0_15px_rgba(204,167,97,0.4)] relative">
                    <Crown size={18} className="text-[#CCA761] absolute -top-5 drop-shadow-[0_0_5px_rgba(204,167,97,0.8)] animate-pulse" />
                    {MOCK_RANKINGS.Comercial[0]?.name ? MOCK_RANKINGS.Comercial[0].name.charAt(0) : '-'}
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-white truncate w-full text-center px-1" title={MOCK_RANKINGS.Comercial[0]?.name}>{MOCK_RANKINGS.Comercial[0]?.name || '---'}</span>
                  <span className="text-[10px] sm:text-xs text-[#CCA761] font-black italic mb-2">{MOCK_RANKINGS.Comercial[0]?.score || 0} MC</span>
                  <div className="w-full bg-gradient-to-t from-[#0a0a0a] to-[#CCA761]/20 border-t-2 border-[#CCA761]/50 rounded-t-lg h-36 flex items-start justify-center pt-3 font-black text-[#CCA761] text-3xl shadow-[inset_0_10px_20px_rgba(204,167,97,0.15)] relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent"></div>
                    1º
                  </div>
                </div>
                {/* 3RD PLACE */}
                <div className="flex flex-col items-center flex-1 z-10 w-1/3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#0a0a0a] border-2 border-[#cd7f32] flex items-center justify-center font-black text-[#cd7f32] text-sm mb-2 shadow-[0_0_10px_rgba(205,127,50,0.2)]">
                    {MOCK_RANKINGS.Comercial[2]?.name ? MOCK_RANKINGS.Comercial[2].name.charAt(0) : '-'}
                  </div>
                  <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 truncate w-full text-center px-1" title={MOCK_RANKINGS.Comercial[2]?.name}>{MOCK_RANKINGS.Comercial[2]?.name || '---'}</span>
                  <span className="text-[8px] sm:text-[9px] text-[#cd7f32] mb-2 font-bold">{MOCK_RANKINGS.Comercial[2]?.score || 0} MC</span>
                  <div className="w-full bg-gradient-to-t from-[#0a0a0a] to-[#cd7f32]/10 border-t border-[#cd7f32]/30 rounded-t-lg h-16 flex items-start justify-center pt-1.5 font-black text-[#cd7f32] text-lg shadow-[inset_0_5px_10px_rgba(205,127,50,0.05)]">
                    3º
                  </div>
                </div>
              </div>
            </div>

            {/* PÓDIO JURÍDICO */}
            <div className="bg-[#111] border border-blue-500/20 rounded-2xl p-6 shadow-lg flex flex-col h-full transform transition hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(59,130,246,0.1)]">
              <div className="flex justify-between items-center border-b border-blue-500/20 pb-4 mb-6">
                <h3 className="text-lg font-black tracking-widest text-blue-500 uppercase flex items-center gap-2">
                  <Shield size={18} /> Jurídico
                </h3>
              </div>
              <div className="flex-1 flex justify-center items-end gap-2 h-64 pb-0 pt-4">
                {/* 2ND PLACE */}
                <div className="flex flex-col items-center flex-1 z-10 w-1/3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#0a0a0a] border-2 border-gray-400 flex items-center justify-center font-black text-gray-400 text-sm mb-2 shadow-[0_0_10px_rgba(156,163,175,0.2)]">
                    {MOCK_RANKINGS.Jurídico[1]?.name ? MOCK_RANKINGS.Jurídico[1].name.charAt(0) : '-'}
                  </div>
                  <span className="text-[10px] sm:text-xs font-bold text-gray-300 truncate w-full text-center px-1" title={MOCK_RANKINGS.Jurídico[1]?.name}>{MOCK_RANKINGS.Jurídico[1]?.name || '---'}</span>
                  <span className="text-[9px] sm:text-[10px] text-gray-400 mb-2 font-bold">{MOCK_RANKINGS.Jurídico[1]?.score || 0} MC</span>
                  <div className="w-full bg-gradient-to-t from-[#0a0a0a] to-gray-400/10 border-t border-gray-400/30 rounded-t-lg h-24 flex items-start justify-center pt-2 font-black text-gray-500 text-xl shadow-[inset_0_5px_15px_rgba(156,163,175,0.05)]">
                    2º
                  </div>
                </div>
                {/* 1ST PLACE */}
                <div className="flex flex-col items-center flex-1 z-20 w-1/3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#0a0a0a] border-2 border-blue-500 flex items-center justify-center font-black text-blue-500 text-lg mb-2 shadow-[0_0_15px_rgba(59,130,246,0.4)] relative">
                    <Crown size={18} className="text-blue-500 absolute -top-5 drop-shadow-[0_0_5px_rgba(59,130,246,0.8)] animate-pulse" />
                    {MOCK_RANKINGS.Jurídico[0]?.name ? MOCK_RANKINGS.Jurídico[0].name.charAt(0) : '-'}
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-white truncate w-full text-center px-1" title={MOCK_RANKINGS.Jurídico[0]?.name}>{MOCK_RANKINGS.Jurídico[0]?.name || '---'}</span>
                  <span className="text-[10px] sm:text-xs text-blue-500 font-black italic mb-2">{MOCK_RANKINGS.Jurídico[0]?.score || 0} MC</span>
                  <div className="w-full bg-gradient-to-t from-[#0a0a0a] to-blue-500/20 border-t-2 border-blue-500/50 rounded-t-lg h-36 flex items-start justify-center pt-3 font-black text-blue-500 text-3xl shadow-[inset_0_10px_20px_rgba(59,130,246,0.15)] relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent"></div>
                    1º
                  </div>
                </div>
                {/* 3RD PLACE */}
                <div className="flex flex-col items-center flex-1 z-10 w-1/3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#0a0a0a] border-2 border-[#cd7f32] flex items-center justify-center font-black text-[#cd7f32] text-sm mb-2 shadow-[0_0_10px_rgba(205,127,50,0.2)]">
                    {MOCK_RANKINGS.Jurídico[2]?.name ? MOCK_RANKINGS.Jurídico[2].name.charAt(0) : '-'}
                  </div>
                  <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 truncate w-full text-center px-1" title={MOCK_RANKINGS.Jurídico[2]?.name}>{MOCK_RANKINGS.Jurídico[2]?.name || '---'}</span>
                  <span className="text-[8px] sm:text-[9px] text-[#cd7f32] mb-2 font-bold">{MOCK_RANKINGS.Jurídico[2]?.score || 0} MC</span>
                  <div className="w-full bg-gradient-to-t from-[#0a0a0a] to-[#cd7f32]/10 border-t border-[#cd7f32]/30 rounded-t-lg h-16 flex items-start justify-center pt-1.5 font-black text-[#cd7f32] text-lg shadow-[inset_0_5px_10px_rgba(205,127,50,0.05)]">
                    3º
                  </div>
                </div>
              </div>
            </div>

            {/* PÓDIO MARKETING */}
            <div className="bg-[#111] border border-purple-500/20 rounded-2xl p-6 shadow-lg flex flex-col h-full transform transition hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(168,85,247,0.1)]">
              <div className="flex justify-between items-center border-b border-purple-500/20 pb-4 mb-6">
                <h3 className="text-lg font-black tracking-widest text-purple-500 uppercase flex items-center gap-2">
                  <Star size={18} /> Marketing
                </h3>
              </div>
              <div className="flex-1 flex justify-center items-end gap-2 h-64 pb-0 pt-4">
                {/* 2ND PLACE */}
                <div className="flex flex-col items-center flex-1 z-10 w-1/3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#0a0a0a] border-2 border-gray-400 flex items-center justify-center font-black text-gray-400 text-sm mb-2 shadow-[0_0_10px_rgba(156,163,175,0.2)]">
                    {MOCK_RANKINGS.Marketing[1]?.name ? MOCK_RANKINGS.Marketing[1].name.charAt(0) : '-'}
                  </div>
                  <span className="text-[10px] sm:text-xs font-bold text-gray-300 truncate w-full text-center px-1" title={MOCK_RANKINGS.Marketing[1]?.name}>{MOCK_RANKINGS.Marketing[1]?.name || '---'}</span>
                  <span className="text-[9px] sm:text-[10px] text-gray-400 mb-2 font-bold">{MOCK_RANKINGS.Marketing[1]?.score || 0} MC</span>
                  <div className="w-full bg-gradient-to-t from-[#0a0a0a] to-gray-400/10 border-t border-gray-400/30 rounded-t-lg h-24 flex items-start justify-center pt-2 font-black text-gray-500 text-xl shadow-[inset_0_5px_15px_rgba(156,163,175,0.05)]">
                    2º
                  </div>
                </div>
                {/* 1ST PLACE */}
                <div className="flex flex-col items-center flex-1 z-20 w-1/3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#0a0a0a] border-2 border-purple-500 flex items-center justify-center font-black text-purple-500 text-lg mb-2 shadow-[0_0_15px_rgba(168,85,247,0.4)] relative">
                    <Crown size={18} className="text-purple-500 absolute -top-5 drop-shadow-[0_0_5px_rgba(168,85,247,0.8)] animate-pulse" />
                    {MOCK_RANKINGS.Marketing[0]?.name ? MOCK_RANKINGS.Marketing[0].name.charAt(0) : '-'}
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-white truncate w-full text-center px-1" title={MOCK_RANKINGS.Marketing[0]?.name}>{MOCK_RANKINGS.Marketing[0]?.name || '---'}</span>
                  <span className="text-[10px] sm:text-xs text-purple-500 font-black italic mb-2">{MOCK_RANKINGS.Marketing[0]?.score || 0} MC</span>
                  <div className="w-full bg-gradient-to-t from-[#0a0a0a] to-purple-500/20 border-t-2 border-purple-500/50 rounded-t-lg h-36 flex items-start justify-center pt-3 font-black text-purple-500 text-3xl shadow-[inset_0_10px_20px_rgba(168,85,247,0.15)] relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent"></div>
                    1º
                  </div>
                </div>
                {/* 3RD PLACE */}
                <div className="flex flex-col items-center flex-1 z-10 w-1/3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#0a0a0a] border-2 border-[#cd7f32] flex items-center justify-center font-black text-[#cd7f32] text-sm mb-2 shadow-[0_0_10px_rgba(205,127,50,0.2)]">
                    {MOCK_RANKINGS.Marketing[2]?.name ? MOCK_RANKINGS.Marketing[2].name.charAt(0) : '-'}
                  </div>
                  <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 truncate w-full text-center px-1" title={MOCK_RANKINGS.Marketing[2]?.name}>{MOCK_RANKINGS.Marketing[2]?.name || '---'}</span>
                  <span className="text-[8px] sm:text-[9px] text-[#cd7f32] mb-2 font-bold">{MOCK_RANKINGS.Marketing[2]?.score || 0} MC</span>
                  <div className="w-full bg-gradient-to-t from-[#0a0a0a] to-[#cd7f32]/10 border-t border-[#cd7f32]/30 rounded-t-lg h-16 flex items-start justify-center pt-1.5 font-black text-[#cd7f32] text-lg shadow-[inset_0_5px_10px_rgba(205,127,50,0.05)]">
                    3º
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
