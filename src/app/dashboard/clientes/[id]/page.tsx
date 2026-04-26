"use client";

import { useState, useEffect, useCallback } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { ArrowLeft, User, Building2, MapPin, Landmark, Briefcase, Plus, FileText, Upload, Calendar, Send, Loader2, Download } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

export default function ClienteDetalhesPage() {
  const { tenantId, user, profile } = useUserProfile();
  const userId = user?.id;
  const full_name = profile?.full_name;
  const avatar_url = profile?.avatar_url;
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Timeline states
  const [newEventText, setNewEventText] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const loadClientData = useCallback(async () => {
    if (!tenantId || !clientId) return;
    setIsLoading(true);

    const [clientRes, eventsRes] = await Promise.all([
      supabase.from("clients").select(`
        *,
        responsible:profiles!clients_responsible_id_fkey(full_name)
      `).eq("id", clientId).eq("tenant_id", tenantId).single(),
      
      supabase.from("client_events").select(`
        *,
        author:profiles!client_events_author_id_fkey(full_name, avatar_url)
      `).eq("client_id", clientId).eq("tenant_id", tenantId).order("created_at", { ascending: false })
    ]);

    if (clientRes.error) {
      toast.error("Erro ao carregar cliente");
      router.push("/dashboard/clientes");
    } else {
      setClient(clientRes.data);
    }
    
    if (eventsRes.data) {
      setEvents(eventsRes.data);
    }
    
    setIsLoading(false);
  }, [tenantId, clientId, supabase, router]);

  useEffect(() => {
    if (tenantId) loadClientData();
  }, [tenantId, loadClientData]);

  const handlePostNote = async () => {
    if (!newEventText.trim() || !tenantId || !userId) return;
    setIsPosting(true);
    
    const { error } = await supabase.from("client_events").insert({
      tenant_id: tenantId,
      client_id: clientId,
      author_id: userId,
      event_type: "nota",
      content: { text: newEventText }
    });

    if (error) {
      toast.error("Erro ao adicionar nota: " + error.message);
    } else {
      setNewEventText("");
      loadClientData();
      toast.success("Nota adicionada!");
    }
    setIsPosting(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenantId || !userId) return;

    setIsUploading(true);
    toast.info("Fazendo upload do arquivo...");

    const fileExt = file.name.split('.').pop();
    const fileName = `${tenantId}/${clientId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError, data } = await supabase.storage
      .from("client-documents")
      .upload(fileName, file);

    if (uploadError) {
      toast.error("Erro no upload: " + uploadError.message);
      setIsUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("client-documents")
      .getPublicUrl(fileName);

    const { error: eventError } = await supabase.from("client_events").insert({
      tenant_id: tenantId,
      client_id: clientId,
      author_id: userId,
      event_type: "anexo",
      content: { 
        fileName: file.name,
        fileUrl: publicUrlData.publicUrl,
        fileType: file.type,
        size: file.size
      }
    });

    if (eventError) {
      toast.error("Erro ao registrar anexo na timeline.");
    } else {
      toast.success("Arquivo anexado com sucesso!");
      loadClientData();
    }
    
    setIsUploading(false);
  };

  if (isLoading || !client) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={40} className="text-[#CCA761] animate-spin" />
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${montserrat.className} max-w-7xl mx-auto pb-20`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/dashboard/clientes")} className="p-2 bg-gray-100 dark:bg-[#111] hover:bg-gray-100 dark:bg-white/5 border border-[#222] rounded-xl transition-colors">
            <ArrowLeft size={20} className="text-gray-400" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className={`text-2xl md:text-3xl text-gray-900 dark:text-white ${cormorant.className} italic font-bold`}>
                {client.name}
              </h1>
              <span className={`text-[10px] px-3 py-1 rounded-full border uppercase tracking-widest ${
                client.status === 'Cliente' ? 'text-green-400 border-green-400/20 bg-green-400/10' :
                client.status === 'Prospecção' ? 'text-blue-400 border-blue-400/20 bg-blue-400/10' :
                client.status === 'Qualificado' ? 'text-[#CCA761] border-[#CCA761]/20 bg-[#CCA761]/10' :
                'text-red-400 border-red-400/20 bg-red-400/10'
              }`}>
                {client.status}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-1 flex items-center gap-2">
              {client.type === 'PF' ? <User size={14} /> : <Building2 size={14} />} 
              {client.document} • Cadastrado em {new Date(client.created_at).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Coluna Esquerda: Detalhes do Cliente */}
        <div className="lg:col-span-1 space-y-6">
          
          <div className="bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-2xl p-6 backdrop-blur-sm">
            <h3 className="text-[#CCA761] font-bold text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
              <User size={14} /> Informações de Contato
            </h3>
            <div className="space-y-4 text-sm">
              <div>
                <span className="text-gray-500 text-[10px] uppercase block mb-1">E-mail Principal</span>
                <span className="text-gray-900 dark:text-white">{client.email || 'Não informado'}</span>
              </div>
              <div>
                <span className="text-gray-500 text-[10px] uppercase block mb-1">Telefone / WhatsApp</span>
                <span className="text-gray-900 dark:text-white font-mono">{client.phone || 'Não informado'}</span>
              </div>
              <div>
                <span className="text-gray-500 text-[10px] uppercase block mb-1">Responsável Interno</span>
                <span className="text-gray-900 dark:text-white bg-gray-100 dark:bg-white/5 py-1 px-3 rounded-full text-xs border border-gray-200 dark:border-white/10 inline-block">
                  {client.responsible?.full_name || 'Nenhum associado'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-2xl p-6 backdrop-blur-sm">
            <h3 className="text-[#CCA761] font-bold text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
              <MapPin size={14} /> Endereço
            </h3>
            {client.address?.cep ? (
              <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <p>{client.address.logradouro}, {client.address.numero} {client.address.complemento}</p>
                <p>{client.address.bairro}</p>
                <p>{client.address.cidade} - {client.address.uf}</p>
                <p className="text-gray-500 mt-2 font-mono">CEP: {client.address.cep}</p>
              </div>
            ) : (
              <p className="text-gray-500 text-sm italic">Endereço não cadastrado.</p>
            )}
          </div>

          <div className="bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-2xl p-6 backdrop-blur-sm">
            <h3 className="text-[#CCA761] font-bold text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
              <Landmark size={14} /> Dados Bancários (Reembolso)
            </h3>
            {client.bank_details?.banco || client.bank_details?.chave_pix ? (
              <div className="text-sm text-gray-700 dark:text-gray-300 space-y-3">
                {client.bank_details?.banco && (
                   <div className="grid grid-cols-2 gap-2">
                     <div>
                       <span className="text-gray-500 text-[10px] uppercase block">Banco</span>
                       {client.bank_details.banco}
                     </div>
                     <div>
                        <span className="text-gray-500 text-[10px] uppercase block">Ag / Conta</span>
                        {client.bank_details.agencia} / {client.bank_details.conta}
                     </div>
                   </div>
                )}
                {client.bank_details?.chave_pix && (
                  <div>
                    <span className="text-gray-500 text-[10px] uppercase block">Chave PIX</span>
                    <span className="font-mono text-[#CCA761]">{client.bank_details.chave_pix}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-sm italic">Dados bancários não cadastrados.</p>
            )}
          </div>

        </div>

        {/* Coluna Direita: Timeline Unificada */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-gray-100 dark:bg-[#111111] border border-[#222] rounded-2xl p-6 shadow-xl relative z-10 overflow-hidden">
             
             {/* Input Area */}
             <div className="flex gap-4 mb-8 relative">
               <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#CCA761] to-[#8B7340] flex items-center justify-center shrink-0 uppercase font-bold text-black border border-[#CCA761]">
                 {full_name?.[0] || 'U'}
               </div>
               <div className="flex-1 space-y-3">
                  <textarea 
                    value={newEventText}
                    onChange={(e) => setNewEventText(e.target.value)}
                    placeholder="Adicionar nota de atendimento, registro de ligação ou observação..."
                    className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors min-h-[100px] resize-y placeholder:text-gray-600"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-2">
                      <label className="cursor-pointer flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-gray-900 dark:text-white px-3 py-2 rounded-lg bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:bg-white/10 transition-colors">
                        {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        Anexar Arquivo
                        <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                      </label>
                    </div>
                    <button 
                      onClick={handlePostNote}
                      disabled={isPosting || !newEventText.trim()}
                      className="flex items-center gap-2 bg-[#CCA761] hover:bg-[#e3c27e] text-black font-bold py-2 px-6 rounded-xl transition-all disabled:opacity-50 text-xs tracking-wider"
                    >
                      {isPosting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      Registrar
                    </button>
                  </div>
               </div>
             </div>

             <div className="h-px w-full bg-gradient-to-r from-transparent via-[#222] to-transparent mb-8" />

             {/* Timeline Historico */}
             <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-[#CCA761]/30 before:via-[#111] before:to-transparent">
               
               {events.length === 0 ? (
                 <div className="text-center py-10 relative z-10">
                   <p className="text-gray-500 text-sm">Nenhum evento registrado ainda.</p>
                 </div>
               ) : (
                 events.map((ev) => (
                   <div key={ev.id} className="relative flex items-start justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                     <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-[#111] bg-white dark:bg-[#0a0a0a] text-[#CCA761] shadow z-10 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                       {ev.event_type === 'nota' ? <FileText size={16} /> : <FileText size={16} />}
                     </div>
                     <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2rem)] p-4 rounded-xl border border-gray-200 dark:border-white/5 bg-white dark:bg-[#0a0a0a] shadow-md group-hover:border-[#CCA761]/30 transition-colors">
                       <div className="flex items-center justify-between mb-2">
                         <span className="font-bold text-gray-800 dark:text-gray-200 text-xs flex items-center gap-2">
                           {ev.author?.full_name || 'Sistema'}
                         </span>
                         <span className="text-[10px] text-gray-500 flex items-center gap-1">
                           <Calendar size={10} />
                           {new Date(ev.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'})}
                         </span>
                       </div>
                       
                       {ev.event_type === 'nota' ? (
                         <div className="text-gray-400 text-sm whitespace-pre-wrap leading-relaxed">
                           {ev.content.text}
                         </div>
                       ) : ev.event_type === 'anexo' ? (
                         <div className="flex items-center justify-between mt-3 p-3 bg-gray-100 dark:bg-white/5 rounded-lg border border-gray-200 dark:border-white/5">
                           <div className="flex items-center gap-3 overflow-hidden">
                             <div className="p-2 bg-[#CCA761]/10 rounded-lg shrink-0">
                               <FileText size={16} className="text-[#CCA761]" />
                             </div>
                             <div className="truncate text-sm">
                               <p className="text-gray-900 dark:text-white truncate font-medium">{ev.content.fileName}</p>
                               <span className="text-[10px] text-gray-500 uppercase">{(ev.content.size / 1024 / 1024).toFixed(2)} MB</span>
                             </div>
                           </div>
                           <a href={ev.content.fileUrl} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-gray-100 dark:bg-white/10 rounded-lg text-gray-400 hover:text-[#CCA761] transition-colors shrink-0">
                             <Download size={16} />
                           </a>
                         </div>
                       ) : null}

                     </div>
                   </div>
                 ))
               )}

             </div>
          </div>

        </div>
      </div>
    </div>
  );
}
