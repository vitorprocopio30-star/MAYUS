"use client";

import { useState, useEffect, useRef } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { 
  Search, ChevronDown, MoreVertical, Phone, Mail, Send, Paperclip, 
  Smile, User, MessageCircle, Bot, Lock, CheckCircle2, 
  MapPin, Briefcase, Zap, Info, Filter, FileText, Mic, Clock, Plus, X
} from "lucide-react";
import { toast } from "sonner";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });

export default function TodasConversasPage() {
  const { profile } = useUserProfile();
  const supabase = createClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState("minhas");
  const [inputMode, setInputMode] = useState("responder");
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Estados de Nova Conversa
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState("");

  // Estados de Dados (Supabase Realtime)
  const [contacts, setContacts] = useState<any[]>([]);
  const [activeContact, setActiveContact] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [evolutionConfig, setEvolutionConfig] = useState<any>(null);

  // 1. Carregar Configurações e Contatos Iniciais
  useEffect(() => {
    if (!profile?.tenant_id) return;

    const loadInitialData = async () => {
       // Buscar Configuração da Evolution API
       const { data: evoData } = await supabase
         .from("tenant_integrations")
         .select("*")
         .eq("tenant_id", profile.tenant_id)
         .eq("provider", "evolution")
         .single();
         
       if (evoData) setEvolutionConfig(evoData);

       // Buscar Lista de Contatos
       fetchContacts();
    };

    loadInitialData();
  }, [profile?.tenant_id]);

  const fetchContacts = async () => {
     const { data, error } = await supabase
       .from("whatsapp_contacts")
       .select("*")
       .eq("tenant_id", profile!.tenant_id)
       .order("last_message_at", { ascending: false });
       
     if (data) {
        setContacts(data);
        if (data.length > 0 && !activeContact) {
           setActiveContact(data[0]); // Seleciona o primeiro por padrão
        }
     }
  };

  // 2. Carregar Mensagens do Contato Ativo
  useEffect(() => {
    if (!profile?.tenant_id || !activeContact) return;

    const fetchMessages = async () => {
       const { data } = await supabase
         .from("whatsapp_messages")
         .select("*")
         .eq("tenant_id", profile.tenant_id)
         .eq("contact_id", activeContact.id)
         .order("created_at", { ascending: true });
         
       if (data) {
          setMessages(data);
          scrollToBottom();
       }
    };

    fetchMessages();

    // 3. OUVINTE SUPABASE REALTIME (Magia Córtex)
    const channel = supabase
       .channel(`chat_${activeContact.id}`)
       .on(
         "postgres_changes",
         { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `contact_id=eq.${activeContact.id}` },
         (payload) => {
           setMessages((current) => [...current, payload.new]);
           scrollToBottom();
         }
       )
       .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeContact]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  // 4. DISPARO DA ARMA (Enviar mensagem via Servidor MAYUS)
  const handleSendMessage = async () => {
    if (!inputText.trim() || !activeContact || isSending) return;
    
    if (inputMode === "nota") {
       toast.success("Nota interna salva com sucesso!");
       setInputText("");
       return;
    }

    setIsSending(true);
    const messageToSend = inputText;
    setInputText(""); // Limpa imediatamente pra melhor UX

    try {
       // O Servidor agora decide inteligentemente se usa Meta Oficial ou Evolution!
       const response = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
             tenant_id: profile!.tenant_id,
             contact_id: activeContact.id,
             phone_number: activeContact.phone_number,
             text: messageToSend
          })
       });

       const resData = await response.json();

       if (!response.ok) {
          throw new Error(resData.error || "Erro desconhecido ao disparar");
       }

       // Mostra pop-up comemorativo de motor:
       if (resData.motor === "meta_cloud") {
          toast.success("Disparo de Ouro! (Meta Cloud Oficial) 🟢", { style: { background: "#CCA761", color: "black", border: "none" }});
       } else {
          toast.success("Disparo enviado! (Evolution API)", { style: { background: "#25D366", color: "black", border: "none" }});
       }

       // A Bolha do Chat já vai aparecer porque o Supabase Realtime vai interceptar a inserção no banco!
       fetchContacts(); // Sobe o contato na lista

    } catch (error: any) {
       console.error("Erro no Disparo:", error);
       toast.error("Falha no envio: " + error.message);
       setInputText(messageToSend); // Devolve o texto caso falhe
    } finally {
       setIsSending(false);
    }
  };

  const handleCreateContact = async () => {
     let cleanPhone = newContactPhone.replace(/\D/g, ''); // Remover não-números
     if (cleanPhone.length < 10) {
        toast.error("Insira um número válido com DDD e País (Ex: 551199999999)");
        return;
     }
     
     // O padrão Baileys Evolution é 551199999999@s.whatsapp.net
     const fullJid = `${cleanPhone}@s.whatsapp.net`;

     // Checar se já existe no banco
     const existente = contacts.find(c => c.phone_number === fullJid || c.phone_number === cleanPhone);
     if (existente) {
        setActiveContact(existente);
        setIsAddingContact(false);
        setNewContactPhone("");
        toast.info("Contato já existe na sua base.");
        return;
     }

     const toastId = toast.loading("Registrando novo Lead...");

     const { data: newContact, error: insertErr } = await supabase
       .from("whatsapp_contacts")
       .insert([{ 
          tenant_id: profile!.tenant_id, 
          phone_number: fullJid, 
          name: cleanPhone // Usando o número como nome provisório
       }])
       .select()
       .single();

     if (insertErr) {
        toast.error("Erro ao salvar contato", { id: toastId });
        return;
     }

     toast.success("Novo alvo engatilhado!", { id: toastId });
     setContacts([newContact, ...contacts]);
     setActiveContact(newContact);
     setIsAddingContact(false);
     setNewContactPhone("");
     setInputText((prev) => !prev ? "Olá! Aqui é da equipe MAYUS." : prev); // Helper initial message
  };

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const rightPanels = [
    { name: "Kanban (CRM)", icon: Briefcase },
    { name: "Insights da Equipe Neural", icon: Bot },
    { name: "Mensagens Agendadas", icon: Clock },
    { name: "Ações da Conversa", icon: Zap },
    { name: "Atributos do Contato", icon: Info },
    { name: "Notas do Contato", icon: FileText },
  ];

  return (
    <div className={`h-[calc(100vh-6rem)] w-full flex bg-[#050505] rounded-tl-3xl border-t border-l border-white/5 overflow-hidden ${montserrat.className} text-sm`}>
      
      {/* ----------------- PAINEL ESQUERDO (LISTA DE CONVERSAS) ----------------- */}
      <div className="w-[320px] flex-shrink-0 border-r border-white/5 bg-[#0a0a0a] flex flex-col h-full relative z-10">
        
        {/* Header Esquerdo */}
        <div className="p-4 border-b border-white/5 bg-[#050505] flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h2 className="text-white font-bold flex items-center gap-2 text-lg">
              Conversas <ChevronDown size={14} className="text-gray-500" />
            </h2>
            <div className="flex gap-2">
              <button 
                onClick={() => setIsAddingContact(!isAddingContact)}
                className={`p-1.5 rounded-md transition-colors ${isAddingContact ? "bg-[#CCA761] text-black" : "hover:bg-white/5 text-gray-400"}`}
                title="Nova Conversa"
              >
                 <Plus size={16} />
              </button>
              <button className="p-1.5 hover:bg-white/5 rounded-md text-gray-400">
                 <Filter size={16} />
              </button>
            </div>
          </div>
          
          {/* Painel Nova Conversa (Deslizante) */}
          {isAddingContact && (
            <div className="animate-in slide-in-from-top-2 flex gap-2">
               <input 
                 type="text" 
                 placeholder="Ex: 551199999999"
                 value={newContactPhone}
                 onChange={(e) => setNewContactPhone(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleCreateContact()}
                 className="flex-1 bg-[#111] border border-[#CCA761]/30 rounded text-xs px-3 py-2 text-white outline-none focus:border-[#CCA761]"
               />
               <button 
                 onClick={handleCreateContact}
                 className="bg-[#CCA761] text-black px-3 rounded font-bold text-xs"
               >
                 Criar
               </button>
            </div>
          )}

          <div className="flex gap-4 border-b border-white/5 pb-0">
             <button className="pb-2 text-xs font-bold uppercase tracking-widest relative text-[#CCA761]">
                Minhas <span className="bg-[#CCA761]/20 text-[#CCA761] px-1.5 py-0.5 rounded ml-1 text-[9px]">{contacts.length}</span>
                <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#CCA761]" />
             </button>
          </div>
        </div>

        {/* Lista de Contatos Reais */}
        <div className="flex-1 overflow-y-auto hide-scrollbar p-2 space-y-1">
          {contacts.map((contact) => (
             <div 
               key={contact.id} 
               onClick={() => setActiveContact(contact)}
               className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${activeContact?.id === contact.id ? "bg-[#CCA761]/10 border border-[#CCA761]/30 shadow-[inset_0_0_20px_rgba(204,167,97,0.05)]" : "hover:bg-white/5 border border-transparent"}`}
             >
                <div className="relative">
                   <div className="w-10 h-10 rounded-full border border-gray-700 bg-[#111] flex items-center justify-center text-gray-400 font-bold text-lg overflow-hidden">
                      {contact.profile_pic_url ? (
                         <img src={contact.profile_pic_url} alt={contact.name} className="w-full h-full object-cover" />
                      ) : (
                         contact.name ? contact.name.substring(0, 2).toUpperCase() : "WA"
                      )}
                   </div>
                   <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#25D366] rounded-full flex items-center justify-center border border-[#0a0a0a]">
                      <MessageCircle size={10} className="text-white fill-current" />
                   </div>
                </div>
                <div className="flex-1 min-w-0">
                   <div className="flex justify-between items-center mb-1">
                      <h4 className={`font-bold truncate text-sm ${activeContact?.id === contact.id ? "text-white" : "text-gray-300"}`}>{contact.name || contact.phone_number}</h4>
                      <span className="text-[10px] text-gray-500">{contact.last_message_at ? formatTime(contact.last_message_at) : ''}</span>
                   </div>
                   <p className="text-gray-400 text-xs truncate">Toque para ver histórico</p>
                </div>
             </div>
          ))}

          {contacts.length === 0 && (
            <div className="text-center p-6 mt-10">
               <div className="w-16 h-16 mx-auto bg-[#111] border border-white/5 rounded-full flex items-center justify-center mb-4">
                  <Bot size={24} className="text-gray-500" />
               </div>
               <p className="text-gray-400 text-sm font-bold">Nenhuma conversa encontrada</p>
               <p className="text-gray-500 text-xs mt-2">Envie uma mensagem para a sua Evolution para iniciar.</p>
            </div>
          )}
        </div>
      </div>

      {/* ----------------- PAINEL CENTRAL (CHAT ATIVO) ----------------- */}
      <div className="flex-1 flex flex-col min-w-[400px] h-full relative bg-[#0a0a0a]/50">
         <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #CCA761 0%, transparent 60%)' }} />

         {activeContact ? (
            <>
               {/* Header Central */}
               <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0a] z-10">
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-full bg-[#111] border border-white/10 flex items-center justify-center text-white font-bold overflow-hidden">
                        {activeContact.profile_pic_url ? (
                           <img src={activeContact.profile_pic_url} alt={activeContact.name} className="w-full h-full object-cover" />
                        ) : (
                           activeContact.name ? activeContact.name.substring(0, 2).toUpperCase() : "WA"
                        )}
                     </div>
                     <div>
                       <h2 className="text-white font-bold tracking-wide flex items-center gap-2">
                          {activeContact.name || activeContact.phone_number}
                          <span className="bg-[#25D366]/20 text-[#25D366] text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest border border-[#25D366]/30">WhatsApp</span>
                       </h2>
                     </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <button className="bg-[#CCA761] text-black font-black uppercase tracking-widest text-[10px] px-4 py-2 rounded shadow-[0_0_15px_rgba(204,167,97,0.4)] hover:scale-105 transition-transform flex items-center gap-2">
                        <CheckCircle2 size={14} /> Resolver
                     </button>
                  </div>
               </div>

               {/* Área de Mensagens Reais */}
               <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 z-10 scroll-smooth">
                  {messages.length === 0 && (
                     <div className="flex justify-center my-10 animate-fade-in-up">
                        <span className="bg-[#CCA761]/10 border border-[#CCA761]/20 text-[#CCA761] px-4 py-2 rounded-full text-xs font-bold tracking-wide shadow-[0_0_15px_rgba(204,167,97,0.1)]">
                           Novo contato detectado. Diga olá!
                        </span>
                     </div>
                  )}

                  {messages.map((msg, idx) => {
                     const isMe = msg.direction === 'outbound';
                     return (
                        <div key={msg.id || idx} className={`flex gap-4 ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                           {!isMe && (
                              <div className="w-8 h-8 rounded-full bg-[#111] border border-white/10 shrink-0 flex items-center justify-center text-xs font-bold text-gray-400">
                                 {activeContact.name ? activeContact.name.substring(0, 2).toUpperCase() : "WA"}
                              </div>
                           )}
                           
                           <div className={`flex flex-col gap-1 max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                              <div className={`p-3 rounded-2xl text-sm shadow-md whitespace-pre-wrap ${
                                 isMe 
                                 ? 'bg-[#CCA761] text-black font-medium border border-[#b89552] rounded-tr-sm' 
                                 : 'bg-[#1a1a1a] border border-white/5 text-gray-200 rounded-tl-sm'
                              }`}>
                                 {msg.content}
                              </div>
                              <span className="text-[9px] text-gray-500 font-bold tracking-widest uppercase mt-0.5 px-1">
                                 {formatTime(msg.created_at)}
                              </span>
                           </div>

                           {isMe && (
                              <div className="w-8 h-8 rounded-full bg-[#050505] border border-white/10 shrink-0 flex items-center justify-center text-xs font-bold text-[#CCA761]">
                                 EU
                              </div>
                           )}
                        </div>
                     );
                  })}
                  <div ref={messagesEndRef} />
               </div>

               {/* Composer de Resposta */}
               <div className="p-4 bg-[#0a0a0a] border-t border-white/5 z-10">
                  <div className="flex gap-4 mb-3 border-b border-white/5 pb-0 w-fit">
                     <button 
                        onClick={() => setInputMode("responder")}
                        className={`pb-2 text-xs font-black uppercase tracking-widest relative ${inputMode === "responder" ? "text-white" : "text-gray-500 hover:text-gray-300"}`}
                     >
                        <span className="flex items-center gap-1.5"><MessageCircle size={14} /> Responder</span>
                        {inputMode === "responder" && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-white transition-all" />}
                     </button>
                     <button 
                        onClick={() => setInputMode("nota")}
                        className={`pb-2 text-xs font-black uppercase tracking-widest relative ${inputMode === "nota" ? "text-[#f59e0b]" : "text-gray-500 hover:text-gray-300"}`}
                     >
                        <span className="flex items-center gap-1.5"><Lock size={14} /> Nota Privada</span>
                        {inputMode === "nota" && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#f59e0b] transition-all" />}
                     </button>
                  </div>
                  
                  <div className={`rounded-xl border transition-colors focus-within:ring-1 ${inputMode === "nota" ? "bg-[#f59e0b]/5 border-[#f59e0b]/30 focus-within:ring-[#f59e0b]/50" : "bg-[#111] border-white/10 focus-within:ring-white/30"}`}>
                     <textarea 
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                             e.preventDefault();
                             handleSendMessage();
                          }
                        }}
                        disabled={isSending}
                        placeholder={inputMode === "nota" ? "Adicione uma nota interna invisível... (Enter)" : "Digite a mensagem para o Zap... (Enter para enviar)"}
                        className={`w-full bg-transparent border-none text-white text-sm px-4 py-4 outline-none resize-none min-h-[80px] placeholder:text-gray-600 ${isSending ? 'opacity-50' : ''}`}
                     />
                     <div className="flex justify-between items-center p-2 border-t border-white/5 bg-black/20 rounded-b-xl">
                       <div className="flex gap-1">
                         <button className="p-2 text-gray-400 hover:text-white transition-colors rounded hover:bg-white/5"><Smile size={18} strokeWidth={2} /></button>
                         <button className="p-2 text-gray-400 hover:text-[#CCA761] transition-colors rounded hover:bg-white/5"><Mic size={18} strokeWidth={2} /></button>
                       </div>
                       <button 
                          onClick={handleSendMessage}
                          disabled={isSending || !inputText.trim()}
                          className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded shadow-sm hover:scale-105 transition-transform flex items-center gap-2 ${inputMode === "nota" ? "bg-[#f59e0b] text-black" : "bg-[#25D366] text-black disabled:opacity-50"}`}
                       >
                         {inputMode === "nota" ? "Salvar Nota" : (isSending ? "Enviando..." : "Enviar (↵)")} <Send size={14} />
                       </button>
                     </div>
                  </div>
               </div>
            </>
         ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 z-10">
               <div className="w-24 h-24 bg-[#111] border border-white/10 rounded-full flex items-center justify-center mb-6 shadow-2xl">
                  <Bot size={40} className="text-[#CCA761] opacity-50" />
               </div>
               <h2 className="text-2xl font-bold text-white mb-2 font-serif italic">Nenhum Contato Ativo</h2>
               <p className="text-gray-500 max-w-sm">Mande uma mensagem do seu celular para a Evolution API ou aguarde um Lead entrar em contato para o córtex interceptar.</p>
            </div>
         )}
      </div>

      {/* ----------------- PAINEL DIREITO (INFO DO CONTATO) ----------------- */}
      <div className="w-[320px] flex-shrink-0 border-l border-white/5 bg-[#0a0a0a] flex flex-col h-full z-10 overflow-y-auto hide-scrollbar">
         {activeContact && (
            <>
               <div className="p-6 border-b border-white/5 flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full border-2 border-[#CCA761] bg-[#1a1a1a] flex items-center justify-center text-2xl font-black text-white relative mb-4 overflow-hidden">
                     {activeContact.profile_pic_url ? (
                        <img src={activeContact.profile_pic_url} alt="Profile" className="w-full h-full object-cover" />
                     ) : (
                        activeContact.name ? activeContact.name.substring(0, 2).toUpperCase() : "WA"
                     )}
                     <div className="absolute bottom-0 right-0 w-5 h-5 bg-[#25D366] rounded-full border-4 border-[#0a0a0a]" title="Online"></div>
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight text-center">{activeContact.name || activeContact.phone_number}</h3>
                  <span className="text-gray-500 text-[10px] font-black tracking-[0.2em] uppercase mt-1">Contato Externo</span>
                  
                  <div className="w-full mt-6 space-y-3">
                     <div className="flex items-center gap-3 text-sm text-gray-400">
                        <Phone size={14} className="text-[#CCA761]" /> +{activeContact.phone_number.split('@')[0]}
                     </div>
                  </div>
               </div>

               <div className="p-4 space-y-2">
                  {rightPanels.map((panel, idx) => {
                     const Icon = panel.icon;
                     return (
                        <div key={idx} className="border border-white/5 rounded-lg bg-[#050505] hover:border-white/10 transition-colors cursor-pointer group">
                           <div className="p-3 flex justify-between items-center text-gray-300 group-hover:text-white">
                              <div className="flex items-center gap-3">
                                 <Icon size={16} className={`text-gray-500 group-hover:text-[#CCA761] transition-colors`} />
                                 <span className="text-[11px] font-black uppercase tracking-wider">{panel.name}</span>
                              </div>
                              <ChevronDown size={14} className="text-gray-600 group-hover:text-gray-400" />
                           </div>
                        </div>
                     );
                  })}
               </div>
            </>
         )}
      </div>
    </div>
  );
}
