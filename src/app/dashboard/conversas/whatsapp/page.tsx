"use client";

import { useState, useEffect } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { 
  Smartphone, QrCode, Server, Key, Link as LinkIcon, RefreshCw, 
  CheckCircle2, AlertCircle, ShieldCheck, Cpu, ArrowRight, Zap, PlayCircle, Loader2, Phone, Settings
} from "lucide-react";
import Image from "next/image";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });

export default function WhatsAppEvolutionDashboard() {
  const [status, setStatus] = useState<"LOADING" | "CONNECTED" | "DISCONNECTED">("LOADING");
  const [evoData, setEvoData] = useState<{ url: string; name: string } | null>(null);
  const supabase = createClient();
  const { profile } = useUserProfile();

  useEffect(() => {
     if (profile?.tenant_id) {
        checkEvolutionLink();
     }
  }, [profile?.tenant_id]);

  const checkEvolutionLink = async () => {
     try {
       const { data, error } = await supabase
         .from("tenant_integrations")
         .select("*")
         .eq("tenant_id", profile!.tenant_id)
         .eq("provider", "evolution")
         .single();
         
       if (data && data.api_key && data.instance_name) {
          const parts = data.instance_name.split('|');
          const cleanUrl = parts[0].replace(/\/$/, '');
          const instanceName = parts[1];

          setEvoData({ url: cleanUrl, name: instanceName });

          // Verifica status real na API
          const statusRes = await fetch(`${cleanUrl}/instance/connectionState/${instanceName}`, {
             method: 'GET',
             headers: { 'apikey': data.api_key }
          });
          const resJson = await statusRes.json();
          if (resJson?.instance?.state === 'open') {
             setStatus("CONNECTED");
          } else {
             setStatus("DISCONNECTED");
          }
       } else {
          setStatus("DISCONNECTED");
       }
     } catch (e) {
       setStatus("DISCONNECTED");
     }
  };

  return (
    <div className={`min-h-[calc(100vh-6rem)] w-full flex flex-col items-center justify-center p-8 bg-[#020104] rounded-tl-3xl border-t border-l border-white/5 relative overflow-hidden ${montserrat.className}`}>
      
      {/* Background Matrix & Blur */}
      <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #CCA761 0%, transparent 50%)' }} />
      <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-[#CCA761]/5 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="relative z-10 w-full max-w-4xl flex flex-col items-center">
        
        {/* Header Título */}
        <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
           <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-14 h-14 bg-[#111] border border-[#CCA761]/30 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(204,167,97,0.15)] relative">
                 <Smartphone size={28} className="text-[#CCA761]" />
                 <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#020104] ${status === 'CONNECTED' ? 'bg-[#25D366]' : 'bg-red-500'}`}>
                   <Zap size={10} className="text-white fill-current" />
                 </div>
              </div>
           </div>
           <h1 className={`text-4xl md:text-5xl text-[#CCA761] mb-2 font-bold tracking-tight ${cormorant.className} italic drop-shadow-[0_0_15px_rgba(204,167,97,0.3)]`}>
             Sincronia WhatsApp
           </h1>
           <p className="text-gray-400 max-w-xl mx-auto font-medium">Painel de Monitoramento da API Evolution conectado ao fluxo Omnichannel.</p>
        </div>

        {/* LOADING STATE */}
        {status === "LOADING" && (
           <div className="w-full max-w-lg bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-12 text-center shadow-2xl flex flex-col items-center justify-center animate-pulse">
              <Loader2 size={48} className="text-[#CCA761] animate-spin mb-4" />
              <h2 className="text-white font-bold text-lg">Buscando Sinal do Servidor...</h2>
              <p className="text-gray-500 text-sm mt-2">Inspecionando túneis da Evolution API.</p>
           </div>
        )}

        {/* CONNECTED STATE */}
        {status === "CONNECTED" && evoData && (
           <div className="w-full max-w-2xl bg-[#0a0a0a]/90 backdrop-blur-xl border border-[#25D366]/30 rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(37,211,102,0.1)] relative animate-in fade-in zoom-in-95 duration-500">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#25D366] to-transparent opacity-80" />
              
              <div className="p-10 flex flex-col items-center text-center space-y-8">
                 <div className="w-24 h-24 rounded-full bg-[#25D366]/10 flex items-center justify-center border-2 border-[#25D366] shadow-[0_0_50px_rgba(37,211,102,0.2)] relative">
                    <div className="absolute inset-0 rounded-full border border-[#25D366] animate-ping opacity-30" />
                    <CheckCircle2 size={48} className="text-[#25D366]" />
                 </div>

                 <div>
                   <h2 className="text-3xl font-bold text-white mb-3">Linha Operacional!</h2>
                   <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
                     O núcleo do MAYUS está ancorado com sucesso à instância <strong className="text-white bg-white/10 px-2 py-0.5 rounded">[{evoData.name}]</strong>. O tráfego de entrada e saída já flui pelo protocolo de WebSockets.
                   </p>
                 </div>

                 <div className="flex flex-col gap-3 w-full">
                     <div className="flex items-center gap-3 bg-[#111] border border-[#25D366]/20 rounded-xl p-4 w-full">
                        <div className="w-12 h-12 bg-[#050505] rounded-full border border-white/5 flex items-center justify-center">
                           <Phone size={20} className="text-[#25D366]" />
                        </div>
                        <div className="text-left flex-1">
                           <div className="text-white font-bold text-sm">Status do Aparelho: <span className="text-[#25D366]">Sincronizado</span></div>
                           <div className="text-gray-500 text-xs">Rota: {evoData.url}</div>
                        </div>
                        <ShieldCheck size={24} className="text-[#25D366]" />
                     </div>

                     <button 
                        onClick={() => window.location.href = '/dashboard/conversas/todas'}
                        className="w-full bg-[#CCA761] hover:bg-[#b89554] text-black font-black uppercase tracking-widest py-4 rounded-xl shadow-[0_0_20px_rgba(204,167,97,0.3)] hover:scale-[1.02] transition-all flex items-center justify-center gap-3 mt-4"
                     >
                        <ArrowRight size={18} /> Acessar Omnichannel
                     </button>
                 </div>
              </div>
           </div>
        )}

        {/* DISCONNECTED / NOT CONFIGURED STATE */}
        {status === "DISCONNECTED" && (
           <div className="w-full max-w-2xl bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden relative animate-in fade-in duration-500">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#CCA761] to-transparent opacity-50" />
              
              <div className="p-12 flex flex-col items-center text-center space-y-6">
                 <div className="w-20 h-20 bg-white/5 rounded-full border border-white/10 flex items-center justify-center mb-2">
                    <AlertCircle size={36} className="text-gray-500" />
                 </div>
                 
                 <div>
                   <h2 className="text-3xl font-bold text-white mb-2">Ponte Desconectada</h2>
                   <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
                     O sistema detectou que o cabo do motor Evolution (WhatsApp API) está desplugado ou ausente. Para sua segurança e centralização, todas as configurações de integrações externas mudaram de andar.
                   </p>
                 </div>

                 <div className="bg-[#111] border border-white/10 rounded-xl p-5 w-full text-left flex items-start gap-4">
                    <Settings className="text-[#CCA761] mt-1 shrink-0" size={20} />
                    <div>
                       <h4 className="text-white font-bold text-sm mb-1">Engenharia Córtex Centralizada</h4>
                       <p className="text-xs text-gray-500 leading-relaxed">
                         Você precisa vincular seu servidor Evolution e plugar o QR Code dentro do painel oficial de Integrações e Dispositivos para liberar esta sala Omnichannel.
                       </p>
                    </div>
                 </div>

                 <button 
                    onClick={() => window.location.href = '/dashboard/configuracoes/integracoes'}
                    className="w-full bg-white text-black font-black uppercase tracking-widest py-4 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-3 mt-4"
                 >
                    <Settings size={18} /> Ir para o Painel de Integrações
                 </button>
              </div>
           </div>
        )}
        
        {/* Footer Seguro */}
        <div className="mt-8 text-center flex items-center gap-2 text-gray-600 text-[10px] font-bold uppercase tracking-widest">
           <ShieldCheck size={14} /> 
           Powered by MAYUS Internal Nodes &bull; Evolution API v2 Integration
        </div>

      </div>
    </div>
  );
}
