"use client";

import { useState, useEffect } from "react";
import { Cormorant_Garamond } from "next/font/google";
import { Settings2, Trophy, Save, SwitchCamera } from "lucide-react";
import { useGamification } from "@/hooks/useGamification";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });

export default function ConfiguracoesPage() {
  const { enabled, toggleGamification } = useGamification();
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Local state for toggles before saving
  const [draftGamification, setDraftGamification] = useState(enabled);

  useEffect(() => {
    setDraftGamification(enabled);
  }, [enabled]);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      toggleGamification(draftGamification);
      setIsSaving(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }, 800);
  };

  return (
    <div className="flex-1 overflow-auto bg-[#050505] min-h-screen text-white p-6 sm:p-10 hide-scrollbar">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 bg-gradient-to-tr from-[#CCA761]/30 to-transparent flex items-center justify-center rounded-2xl border border-[#CCA761]/20">
            <Settings2 size={28} className="text-[#CCA761]" />
          </div>
          <div>
            <h1 className={`text-3xl font-bold tracking-wider uppercase text-white ${cormorant.className} drop-shadow-md`}>
              Configurações Globais
            </h1>
            <p className="text-gray-400 text-sm tracking-widest mt-1">Gerencie as preferências principais do seu escritório</p>
          </div>
        </div>

        <div className="space-y-6 animate-fade-in-up">
          {/* PAINEL GAMIFICAÇÃO */}
          <div className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-white/5 p-6 rounded-2xl shadow-xl flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-full bg-[#CCA761]/10 border border-[#CCA761]/30 flex items-center justify-center shrink-0">
                  <Trophy size={20} className="text-[#CCA761]" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Módulo de Gamificação</h3>
                  <p className="text-sm text-gray-400 max-w-xl">
                    Habilita o Hall da Fama, ranking diário, medalhas, recompensas e &quot;MAYUS Coins&quot; (MC) nas agendas operacionais do escritório. Desative se o seu modelo for 100% individual.
                  </p>
                </div>
              </div>

              {/* Botão Liga/Desliga */}
              <button
                onClick={() => setDraftGamification(!draftGamification)}
                className={`w-14 h-7 flex items-center shrink-0 rounded-full p-1 transition-colors duration-300 ${
                  draftGamification ? "bg-[#CCA761]" : "bg-gray-800"
                }`}
              >
                <div
                  className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-300 ${
                    draftGamification ? "translate-x-7" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            
            <div className="border-t border-white/5 pt-4 flex justify-between items-center text-xs text-gray-500">
               <span>Status Atual: <strong className={draftGamification ? "text-[#CCA761]" : "text-gray-500"}>{draftGamification ? "ATIVADA" : "DESATIVADA"}</strong></span>
               <span className="italic">Afeta diretamente a &quot;Agenda Global&quot; e a &quot;Agenda Pessoal&quot;</span>
            </div>
          </div>

          {/* PAINEL PLACEHOLDER SE PRECISAR MAIS OPÇÕES DEPOIS */}
          {/* <div className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-white/5 p-6 rounded-2xl shadow-xl opacity-50 pointer-events-none">...</div> */}

        </div>

        {/* BOTTOM ACTIONS */}
        <div className="mt-10 flex border-t border-white/10 pt-6 justify-end items-center">
           <button
             onClick={handleSave}
             disabled={isSaving}
             className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-[#CCA761] to-[#eadd87] text-[#0a0a0a] rounded-xl font-black uppercase tracking-[0.2em] text-xs shadow-[0_0_20px_rgba(204,167,97,0.3)] hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
           >
              {isSaving ? (
                <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin"/>
              ) : success ? (
                "ATUALIZADO!"
              ) : (
                <><Save size={16}/> SALVAR PREFERÊNCIAS</>
              )}
           </button>
        </div>
      </div>
    </div>
  );
}
