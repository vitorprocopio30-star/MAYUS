"use client";

import { useState } from "react";
import { X, CheckCircle2, Loader2, DollarSign, User, FileText } from "lucide-react";
import { formatDocument, isValidDocument } from "@/lib/utils/validators";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/useUserProfile";

type WinLeadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (value: number, clientId: string) => void;
  defaultName?: string;
};

export default function WinLeadModal({ isOpen, onClose, onSuccess, defaultName = "" }: WinLeadModalProps) {
  const { profile } = useUserProfile();
  const supabase = createClient();
  
  const [isLoading, setIsLoading] = useState(false);
  const [type, setType] = useState<"PF" | "PJ">("PF");
  const [document, setDocument] = useState("");
  const [name, setName] = useState(defaultName);
  const [value, setValue] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.tenant_id) return;

    if (!document || !isValidDocument(document, type)) {
      toast.error(type === "PF" ? "CPF inválido." : "CNPJ inválido.");
      return;
    }
    
    const numericValue = parseFloat(value.replace(/[^0-9,.-]/g, '').replace(',', '.'));
    if (isNaN(numericValue) || numericValue <= 0) {
      toast.error("Insira um valor de fechamento válido.");
      return;
    }

    if (!name.trim()) {
      toast.error("O nome do cliente é obrigatório.");
      return;
    }

    setIsLoading(true);
    try {
      // Verifica se já existe
      const { data: existing } = await supabase
        .from("clients")
        .select("id")
        .eq("tenant_id", profile.tenant_id)
        .eq("document", document)
        .single();

      let finalClientId = existing?.id;

      if (!existing) {
        // Cria o novo cliente já como "Cliente" (convertido)
        const { data: newClient, error: clientErr } = await supabase
          .from("clients")
          .insert({
            tenant_id: profile.tenant_id,
            responsible_id: profile.id,
            type,
            document,
            name,
            status: 'Cliente'
          })
          .select("id")
          .single();

        if (clientErr) throw clientErr;
        finalClientId = newClient.id;
        toast.success("Cliente cadastrado automaticamente!");
      } else {
        toast.info("Este cliente já existia na base. Vínculo realizado.");
      }

      onSuccess(numericValue, finalClientId);
      
    } catch (err: any) {
      toast.error(err.message || "Erro ao converter lead em cliente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={!isLoading ? onClose : undefined} />
      <div className="relative w-full max-w-md bg-[#0a0a0a] border border-[#CCA761]/30 rounded-2xl shadow-[0_0_60px_rgba(204,167,97,0.15)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Neon Top Bar */}
        <div className="absolute top-0 left-0 w-full h-[2px] shadow-[0_0_15px_#CCA761] bg-[#CCA761]" />

        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-[#111]">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CheckCircle2 className="text-[#CCA761]" size={20} /> Convertendo Lead
          </h2>
          <button onClick={onClose} disabled={isLoading} className="text-gray-500 hover:text-white p-1 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
           <div className="p-4 bg-[#CCA761]/10 border border-[#CCA761]/20 rounded-xl text-sm text-[#CCA761] mb-2 leading-relaxed">
             Para mover esta oportunidade para &quot;Fechado&quot;, precisamos convertê-lo oficialmente em um Cliente no sistema MAYUS.
           </div>

           <div className="space-y-4">
             {/* Tipo de Cliente */}
             <div className="flex bg-[#1a1a1a] rounded-lg p-1 border border-white/5">
                <button type="button" onClick={() => setType("PF")} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${type === "PF" ? "bg-[#CCA761] text-black shadow-sm" : "text-gray-400 hover:text-white"}`}>Pessoa Física</button>
                <button type="button" onClick={() => setType("PJ")} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${type === "PJ" ? "bg-[#CCA761] text-black shadow-sm" : "text-gray-400 hover:text-white"}`}>Pessoa Jurídica</button>
             </div>

             {/* Documento */}
             <div className="space-y-1.5">
               <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                 <FileText size={14} /> {type === "PF" ? "CPF" : "CNPJ"}
               </label>
               <input 
                 type="text" required
                 value={document} onChange={e => setDocument(formatDocument(e.target.value))}
                 className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors"
                 placeholder={type === "PF" ? "000.000.000-00" : "00.000.000/0000-00"}
               />
             </div>

             {/* Nome */}
             <div className="space-y-1.5">
               <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                 <User size={14} /> {type === "PF" ? "Nome Completo" : "Razão Social"}
               </label>
               <input 
                 type="text" required
                 value={name} onChange={e => setName(e.target.value)}
                 className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#CCA761]/50 transition-colors"
                 placeholder={type === "PF" ? "Nome do cliente" : "Nome da empresa"}
               />
             </div>

             {/* Valor */}
             <div className="space-y-1.5">
               <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                 <DollarSign size={14} /> Valor do Contrato (R$)
               </label>
               <input 
                 type="text" required
                 value={value} onChange={e => setValue(e.target.value)}
                 className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#CCA761] font-bold text-lg rounded-lg px-4 py-3 focus:outline-none focus:border-[#CCA761]/50 transition-colors"
                 placeholder="Consulte o valor final fechado"
               />
             </div>
           </div>

           <div className="pt-4 flex gap-3">
             <button type="button" onClick={onClose} disabled={isLoading} className="flex-1 px-4 py-3 rounded-lg font-semibold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors">
               Cancelar
             </button>
             <button type="submit" disabled={isLoading} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-bold text-black bg-gradient-to-r from-[#CCA761] to-[#e3c27e] hover:brightness-110 transition-all shadow-[0_0_20px_rgba(204,167,97,0.3)]">
               {isLoading ? <Loader2 size={18} className="animate-spin" /> : "Confirmar Fechamento"}
             </button>
           </div>
        </form>
      </div>
    </div>
  );
}
