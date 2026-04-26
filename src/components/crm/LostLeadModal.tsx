"use client";

import { useState } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";

type LostLeadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (motivo: string) => void;
};

export default function LostLeadModal({ isOpen, onClose, onSuccess }: LostLeadModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [motivo, setMotivo] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) return;

    setIsLoading(true);
    // Call onSuccess which handles the Supabase update from the parent.
    await onSuccess(motivo);
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-200 dark:bg-black/80 backdrop-blur-sm" onClick={!isLoading ? onClose : undefined} />
      <div className="relative w-full max-w-md bg-white dark:bg-[#0a0a0a] border border-red-500/30 rounded-2xl shadow-[0_0_60px_rgba(239,68,68,0.15)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Neon Top Bar */}
        <div className="absolute top-0 left-0 w-full h-[2px] shadow-[0_0_15px_#ef4444] bg-red-500" />

        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-white/5 bg-gray-100 dark:bg-[#111]">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <AlertCircle className="text-red-500" size={20} /> Marcando como Perdido
          </h2>
          <button onClick={onClose} disabled={isLoading} className="text-gray-500 hover:text-gray-900 dark:text-white p-1 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
           <div className="space-y-1.5">
             <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">
               Motivo da Perda (Obrigatório)
             </label>
             <textarea 
               required
               value={motivo} onChange={e => setMotivo(e.target.value)}
               className="w-full bg-gray-100 dark:bg-[#1a1a1a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:border-red-500/50 transition-colors placeholder-gray-700 min-h-[120px] resize-none"
               placeholder="Descreva o motivo pelo qual esta oportunidade foi perdida... (Ex: Preço alto, Fechou com concorrente, Desistiu do processo)"
               autoFocus
             />
           </div>

           <div className="pt-4 flex gap-3">
             <button type="button" onClick={onClose} disabled={isLoading} className="flex-1 px-4 py-3 rounded-lg font-semibold text-gray-400 hover:text-gray-900 dark:text-white bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:bg-white/10 transition-colors">
               Cancelar
             </button>
             <button type="submit" disabled={isLoading || !motivo.trim()} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-bold text-gray-900 dark:text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-50">
               {isLoading ? <Loader2 size={18} className="animate-spin" /> : "Confirmar Perda"}
             </button>
           </div>
        </form>
      </div>
    </div>
  );
}
