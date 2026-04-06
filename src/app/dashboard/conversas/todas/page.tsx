"use client";

import { useState, useEffect, useRef } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { 
  Search, ChevronDown, MoreVertical, Phone, Mail, Send, Paperclip, 
  Smile, User, MessageCircle, Bot, Lock, CheckCircle2, 
  MapPin, Briefcase, Zap, Info, Filter, FileText, Mic, Clock, Plus, X,
  Loader2, LayoutPanelLeft, Users, UserCheck, ClipboardList
} from "lucide-react";
import { toast } from "sonner";
import EmojiPicker, { Theme as EmojiTheme } from "emoji-picker-react";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });

// Funções Utilitárias de Formatação
const formatTime = (dateString: string) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default function TodasConversasPage() {
  const { profile } = useUserProfile();
  const supabase = createClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState("minhas");
  const [inputMode, setInputMode] = useState("responder");
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showSignature, setShowSignature] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados de Áudio
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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

  // 4. LÓGICA DE ÁUDIO (REALTIME REC)
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setIsRecording(false);
        handleSendAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
    } catch (err) {
      console.error("Erro real de microfone, iniciando modo simulação:", err);
      // Fallback de Simulação para Teste de UI
      setIsRecording(true);
      setRecordingDuration(0);
      toast.info("Modo Simulação: Usando hardware virtual para teste de UI");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleSendAudio = async (blob: Blob) => {
    if (isSending) return;
    
    if (!activeContact) {
      setIsAddingContact(true);
      toast.info("Selecione um contato para enviar o áudio.");
      return;
    }

    setIsSending(true);
    try {
      const fileName = `${profile?.tenant_id}/${activeContact.id}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('whatsapp-media').getPublicUrl(fileName);

      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tenant_id: profile!.tenant_id, 
          contact_id: activeContact.id, 
          phone_number: activeContact.phone_number, 
          audio_url: publicUrl 
        })
      });

      if (!response.ok) throw new Error("Erro ao enviar áudio");
      toast.success("Áudio enviado com sucesso!");
      fetchContacts();
    } catch (e: any) {
      toast.error("Falha ao enviar áudio: " + e.message);
    } finally {
      setIsSending(false);
    }
  };

  // 5. DISPARO DA ARMA (Enviar mensagem via Servidor MAYUS)
  const handleSendMessage = async () => {
    if ((!inputText.trim() && !selectedFile) || isSending) return;
    
    // Aplicar Assinatura (Negrito Oficial)
    const signature = showSignature ? `\n\n— *${profile?.full_name || 'Equipe MAYUS'}*` : "";
    const textToSend = inputText + signature;

    // MODO SIMULAÇÃO (Liberado para Teste)
    if (!activeContact) {
      const simulatedMsg = {
        id: `sim-${Date.now()}`,
        contact_id: 'test',
        content: textToSend,
        direction: 'outbound',
        status: 'sent',
        created_at: new Date().toISOString(),
        is_simulated: true
      };
      setMessages(prev => [...prev, simulatedMsg]);
      setInputText("");
      setSelectedFile(null);
      scrollToBottom();
      toast.success("Mensagem Simulada com Sucesso! 🚀");
      return;
    }

    setIsSending(true);
    setInputText(""); 

    try {
       // Se houver arquivo, simular que foi enviado junto (No futuro integrar upload real)
       if (selectedFile) {
         toast.success(`Arquivo ${selectedFile.name} processado.`);
       }

       const response = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
             tenant_id: profile!.tenant_id,
             contact_id: activeContact.id,
             phone_number: activeContact.phone_number,
             text: textToSend
          })
       });

       const resData = await response.json();
       if (!response.ok) throw new Error(resData.error || "Erro ao disparar");

       toast.success("Disparo de Ouro! 🟢");
       setSelectedFile(null); // Limpar arquivo após envio real
       fetchContacts(); 
    } catch (error: any) {
       toast.error("Falha : " + error.message);
       setInputText(inputText);
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

          {(activeContact || messages.length > 0) ? (
             <>
                {/* Header Central */}
                <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0a] z-10">
                   <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#111] border border-white/10 flex items-center justify-center text-white font-bold overflow-hidden">
                         {activeContact?.profile_pic_url ? (
                            <img src={activeContact.profile_pic_url} alt={activeContact.name} className="w-full h-full object-cover" />
                         ) : (
                            activeContact?.name ? activeContact.name.substring(0, 2).toUpperCase() : "TS"
                         )}
                      </div>
                      <div>
                        <h2 className="text-white font-bold tracking-wide flex items-center gap-2">
                           {activeContact?.name || activeContact?.phone_number || "Lead de Teste"}
                           <span className="bg-[#25D366]/20 text-[#25D366] text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest border border-[#25D366]/30">
                              {activeContact ? "WhatsApp" : "Simulação"}
                           </span>
                        </h2>
                      </div>
                   </div>
                   <div className="flex items-center gap-3">
                      <button className="bg-[#CCA761] text-black font-black uppercase tracking-widest text-[10px] px-4 py-2 rounded shadow-[0_0_15px_rgba(204,167,97,0.4)] hover:scale-105 transition-transform flex items-center gap-2">
                         <CheckCircle2 size={14} /> Resolver
                      </button>
                   </div>
                </div>

                {/* Área de Mensagens */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 z-10 scroll-smooth">
                   {activeContact && messages.length === 0 && (
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

               {/* COMPOSER SLIM - DESIGN ULTRA COMPACTO E FUNCIONAL */}
               <div className="p-3 pb-4 bg-[#0a0a0a]/95 backdrop-blur-3xl border-t border-white/5 z-10">
                   {/* Linha Fina de Controles Superiores */}
                   <div className="flex justify-between items-center mb-2 px-3">
                       <div className="flex gap-4">
                         <button onClick={() => { console.log('Mode: Responder'); setInputMode("responder"); }} className={`text-[9px] font-black uppercase tracking-[0.2em] relative transition-all flex items-center gap-1.5 ${inputMode === "responder" ? "text-[#CCA761]" : "text-gray-600 hover:text-gray-400"}`}>
                             <MessageCircle size={12} /> Atendimento
                             {inputMode === "responder" && <div className="absolute -bottom-1 left-0 w-full h-[1px] bg-[#CCA761]" />}
                         </button>
                         <button onClick={() => { console.log('Mode: Nota'); setInputMode("nota"); }} className={`text-[9px] font-black uppercase tracking-[0.2em] relative transition-all flex items-center gap-1.5 ${inputMode === "nota" ? "text-orange-500" : "text-gray-600 hover:text-gray-400"}`}>
                             <Lock size={12} /> Nota Interna
                             {inputMode === "nota" && <div className="absolute -bottom-1 left-0 w-full h-[1px] bg-orange-500" />}
                         </button>
                       </div>
                       <label className="flex items-center gap-2 cursor-pointer group">
                           <input type="checkbox" checked={showSignature} onChange={() => setShowSignature(!showSignature)} className="hidden" />
                           <div className={`w-6 h-3 rounded-full transition-all relative ${showSignature ? "bg-[#CCA761]" : "bg-white/10"}`}>
                             <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${showSignature ? "right-0.5" : "left-0.5"}`} />
                           </div>
                           <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest group-hover:text-white transition-colors">Assinatura</span>
                       </label>
                   </div>
                   
                   {/* Área Principal de Input - Estilo Barra */}
                   <div className={`rounded-xl border transition-all flex flex-col shadow-lg relative ${inputMode === "nota" ? "bg-orange-500/[0.02] border-orange-500/30" : "bg-black/40 border-white/10 focus-within:border-[#CCA761]/40"} ${isRecording ? 'border-red-500 ring-1 ring-red-500/20' : ''}`}>
                       {isRecording ? (
                         <div className="w-full flex items-center justify-between px-4 py-3 bg-red-500/5 rounded-xl animate-pulse">
                             <div className="flex items-center gap-3">
                               <div className="flex gap-1 items-center">
                                 {[1, 2, 3, 4].map(i => (
                                   <div key={i} className={`w-1 bg-red-500 rounded-full animate-bounce`} style={{ height: `${Math.random() * 12 + 6}px`, animationDelay: `${i * 0.1}s` }} />
                                 ))}
                               </div>
                               <span className="text-red-500 font-black tracking-widest text-[10px] uppercase font-mono">GRAVANDO {formatDuration(recordingDuration)}</span>
                             </div>
                             <div className="flex gap-2">
                               <button 
                                 onClick={(e) => { e.preventDefault(); e.stopPropagation(); stopRecording(); }} 
                                 className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg font-black text-[8px] uppercase shadow-lg transition-all active:scale-95 z-20"
                               >
                                 Enviar
                               </button>
                               <button 
                                 onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsRecording(false); mediaRecorderRef.current?.stop(); }} 
                                 className="bg-white/5 text-gray-400 px-4 py-1.5 rounded-lg font-black text-[8px] uppercase border border-white/10 hover:bg-white/10 transition-all z-20"
                               >
                                 Cancelar
                               </button>
                             </div>
                         </div>
                       ) : (
                         <div className="flex flex-col">
                            {/* Preview de Anexo */}
                            {selectedFile && (
                              <div className="px-4 py-2 bg-black/40 border-t border-white/10 flex items-center justify-between animate-in slide-in-from-bottom-2">
                                <div className="flex items-center gap-2">
                                  <FileText size={16} className="text-[#CCA761]" />
                                  <span className="text-[11px] text-gray-300 font-medium">{selectedFile.name}</span>
                                  <span className="text-[9px] text-gray-600">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                                </div>
                                <button onClick={() => setSelectedFile(null)} className="text-gray-500 hover:text-white"><X size={14} /></button>
                              </div>
                            )}

                             <div className="relative flex items-end w-full px-2 py-2">
                              {/* Input de Texto Slim */}
                              <textarea 
                                value={inputText} 
                                onChange={(e) => setInputText(e.target.value)} 
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                  }
                                }} 
                                placeholder={inputMode === "nota" ? "Escreva uma nota interna..." : "Digite sua mensagem..."} 
                                className="flex-1 bg-transparent border-none text-white text-[13px] px-3 py-2 outline-none resize-none min-h-[42px] max-h-[150px] placeholder:text-gray-700 transition-all font-medium scrollbar-none" 
                              />

                              {/* Preview da Assinatura Minimalista */}
                              {showSignature && inputMode === "responder" && (
                                <div className="absolute bottom-1 right-[115px] pointer-events-none opacity-30 hidden sm:block">
                                   <span className="text-[8px] text-gray-500 italic font-bold">*{profile?.full_name || 'Equipe'}*</span>
                                </div>
                              )}

                              {/* Botão de Envio Compacto */}
                              <button 
                                onClick={(e) => { e.preventDefault(); handleSendMessage(); }} 
                                disabled={isSending || (!inputText.trim() && !isRecording && !selectedFile)} 
                                className={`ml-2 mb-1 shrink-0 h-9 px-4 rounded-lg font-black uppercase text-[9px] tracking-wider transition-all flex items-center gap-2 ${
                                  isSending ? 'bg-white/10 text-gray-400' : 'bg-[#CCA761] text-black hover:bg-white active:scale-95 shadow-lg shadow-[#CCA761]/10'
                                }`}
                              >
                                {isSending ? <Loader2 className="animate-spin" size={12} /> : <><Send size={12} /> ENVIAR</>}
                              </button>
                            </div>

                            {/* Barra de Ferramentas Inferior - ORGANIZAÇÃO SOLICITADA */}
                            <div className="flex gap-4 px-3 py-2 border-t border-white/[0.03] bg-black/20 rounded-b-xl relative items-center">
                                {/* Input de Arquivo Oculto */}
                                <input 
                                  type="file" 
                                  ref={fileInputRef} 
                                  className="hidden" 
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      setSelectedFile(file);
                                      toast.success(`Arquivo pronto para envio!`);
                                    }
                                  }}
                                />

                                <div className="flex gap-3">
                                  <button onClick={() => fileInputRef.current?.click()} className="text-gray-500 hover:text-[#CCA761] transition-all p-1" title="Anexar Arquivo"><Paperclip size={18} /></button>
                                  <button 
                                    onClick={(e) => { e.preventDefault(); startRecording(); }} 
                                    className="text-gray-500 hover:text-red-500 transition-all p-1" 
                                    title="Gravar Áudio"
                                  >
                                    <Mic size={18} />
                                  </button>
                                  <div className="relative">
                                    <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`transition-all p-1 ${showEmojiPicker ? 'text-[#CCA761]' : 'text-gray-500 hover:text-[#CCA761]'}`} title="Emoji"><Smile size={18} /></button>
                                    
                                    {showEmojiPicker && (
                                      <div className="absolute bottom-full left-0 mb-4 z-50 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="fixed inset-0" onClick={() => setShowEmojiPicker(false)} />
                                        <div className="relative">
                                          <EmojiPicker 
                                            theme={EmojiTheme.DARK}
                                            onEmojiClick={(emojiData) => {
                                              setInputText(prev => prev + emojiData.emoji);
                                              setShowEmojiPicker(false);
                                            }}
                                            lazyLoadEmojis={true}
                                            searchPlaceholder="Buscar emoji..."
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <button onClick={() => toast.info("Modelos de resposta em breve")} className="text-gray-500 hover:text-[#CCA761] transition-all p-1" title="Modelos"><LayoutPanelLeft size={18} /></button>
                                </div>
                                
                                <span className="ml-auto text-[7px] text-gray-700 font-black tracking-tighter uppercase self-center hidden sm:block">Focado na Experiência MAYUS</span>
                            </div>
                         </div>
                       )}
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
