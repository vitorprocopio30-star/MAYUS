"use client";

import { useState, useEffect, useRef } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  Search, ChevronDown, Phone, Send,
  MessageCircle, Bot, Lock, CheckCircle2,
  Zap, Filter, FileText, Mic, Clock, Plus, X, Smartphone, Loader2, Smile, Paperclip, MoreVertical,
  Users, UserCheck, LayoutPanelLeft, Share2, ClipboardList, Building2
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

export default function WhatsAppChatPremiumPage() {
  const { profile } = useUserProfile();
  const supabase = createClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState("minhas"); // minhas, aguardando, todas
  const [inputMode, setInputMode] = useState("responder");
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState("");
  const [showSignature, setShowSignature] = useState(true);
  const [signatureName, setSignatureName] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [contacts, setContacts] = useState<any[]>([]);
  const [activeContact, setActiveContact] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Busca e Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [departments, setDepartments] = useState<any[]>([]);
  const [filterDeptId, setFilterDeptId] = useState<string | null>(null);

  // Modal de Transferência
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferDeptId, setTransferDeptId] = useState("");
  const [transferUserId, setTransferUserId] = useState("");
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isSendingContract, setIsSendingContract] = useState(false);
  const [isGeneratingMayusReply, setIsGeneratingMayusReply] = useState(false);
  const [isLoadingMayusDraft, setIsLoadingMayusDraft] = useState(false);
  const [mayusDraft, setMayusDraft] = useState<any | null>(null);
  const [contractFlowMode, setContractFlowMode] = useState<'ia_only' | 'human_only' | 'hybrid'>('hybrid');
  const [zapsignTemplateId, setZapsignTemplateId] = useState<string>("");

  // Permissões
  const isAdmin = profile?.role === 'Administrador' || profile?.role === 'mayus_admin' || profile?.role === 'Sócio';

  // Carregar Departamentos e Membros
  useEffect(() => {
    if (!profile?.tenant_id) return;

    const loadDeps = async () => {
      const { data: depts } = await supabase.from('departments').select('*').eq('tenant_id', profile!.tenant_id).order('name');
      if (depts) setDepartments(depts);

      const { data: members } = await supabase.from('profiles').select('id, full_name, role').eq('tenant_id', profile!.tenant_id).eq('is_active', true);
      if (members) setTeamMembers(members);

      // Carregar Configurações de Governança
      const { data: settings } = await supabase.from('tenant_settings').select('ai_features').eq('tenant_id', profile!.tenant_id).maybeSingle();
      if (settings?.ai_features) {
        if (settings.ai_features.contract_flow_mode) setContractFlowMode(settings.ai_features.contract_flow_mode);
        if (settings.ai_features.zapsign_template_id) setZapsignTemplateId(settings.ai_features.zapsign_template_id);
      }
    };
    loadDeps();
  }, [profile?.tenant_id]);

  // Carregar Contatos Iniciais
  useEffect(() => {
    if (!profile?.tenant_id) return;
    fetchContacts();
  }, [profile?.tenant_id, activeTab, filterDeptId]);

  const fetchContacts = async () => {
     setIsLoading(true);
     let query = supabase
       .from("whatsapp_contacts")
       .select("*")
       .eq("tenant_id", profile!.tenant_id)
       .order("last_message_at", { ascending: false });

     // PERMISSÕES: SDR/Advogado vê só as suas; Admin vê tudo
     if (!isAdmin) {
       if (activeTab === "minhas" || activeTab === "todas") {
         query = query.eq("assigned_user_id", profile!.id);
       }
     } else {
       if (activeTab === "minhas") query = query.eq("assigned_user_id", profile!.id);
     }
     if (activeTab === "aguardando") query = query.is("assigned_user_id", null);

     // Filtro por departamento
     if (filterDeptId) query = query.eq("department_id", filterDeptId);

     const { data } = await query;
     if (data) {
        setContacts(data);
        if (data.length > 0 && !activeContact) setActiveContact(data[0]);
     }
     setIsLoading(false);
  };

  // Filtro local de busca por nome/telefone
  const filteredContacts = contacts.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (c.name || '').toLowerCase().includes(q) || (c.phone_number || '').includes(q);
  });

  // Transferir Atendimento
  const handleTransfer = async () => {
    if (!activeContact || (!transferDeptId && !transferUserId)) return toast.error("Selecione um departamento ou agente.");
    setIsTransferring(true);

    const updates: any = {};

    // Se selecionou departamento, atualiza.
    // Se transferir para departamento SEM usuário, remove o assigned_user_id para cair na fila "Aguardando"
    if (transferDeptId) {
      updates.department_id = transferDeptId;
      if (!transferUserId) updates.assigned_user_id = null;
    }

    if (transferUserId) updates.assigned_user_id = transferUserId;

    const { error } = await supabase.from('whatsapp_contacts').update(updates).eq('id', activeContact.id);

    if (error) {
       console.error("Erro na transferência:", error);
       toast.error('Erro: ' + error.message);
    } else {
      toast.success('Conversa transferida com sucesso!');
      setShowTransferModal(false);

      // Lógica de visibilidade: se o contato "sumiu" da visão do usuário atual
      const movedAway = !isAdmin && (
        (updates.assigned_user_id && updates.assigned_user_id !== profile?.id) ||
        (activeTab === 'aguardando' && updates.assigned_user_id)
      );

      if (movedAway) {
        setActiveContact(null);
      } else {
        // Atualiza localmente o contato ativo para refletir a mudança
        setActiveContact(prev => prev ? { ...prev, ...updates } : null);
      }

      setTransferDeptId('');
      setTransferUserId('');
      fetchContacts();
    }
    setIsTransferring(false);
  };

  // Realtime Messages
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
    loadLatestMayusDraft(activeContact.id);

    const channel = supabase
       .channel(`chat_ws_meta_${activeContact.id}`)
       .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `contact_id=eq.${activeContact.id}` },
         (payload) => {
           setMessages((current) => [...current, payload.new]);
           scrollToBottom();
           if (payload.new?.direction === "inbound") {
             setTimeout(() => loadLatestMayusDraft(activeContact.id), 1200);
           }
         }
       ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeContact]);

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const loadLatestMayusDraft = async (contactId: string) => {
    if (!contactId) return;
    setIsLoadingMayusDraft(true);
    try {
      const response = await fetch(`/api/whatsapp/ai-sales-reply?contact_id=${encodeURIComponent(contactId)}`);
      const data = await response.json();
      if (response.ok) {
        setMayusDraft(data.draft || null);
      }
    } catch {
      setMayusDraft(null);
    } finally {
      setIsLoadingMayusDraft(false);
    }
  };

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
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
      console.error("Erro real de microfone no WhatsApp, iniciando modo simulação:", err);
      // Fallback de Simulação
      setIsRecording(true);
      setRecordingDuration(0);
      toast.info("Modo Simulação: Validando interface de áudio...");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else if (isRecording) {
      // Modo Simulação — enviar mensagem de áudio simulada
      setIsRecording(false);
      setRecordingDuration(0);
      const displayName = signatureName || profile?.full_name || 'Equipe MAYUS';
      const audioMsg = {
        id: `sim-audio-${Date.now()}`,
        contact_id: activeContact?.id || 'test-wa',
        content: `🎙️ Áudio (${formatDuration(recordingDuration)})${showSignature ? `\n— *${displayName}*` : ''}`,
        direction: 'outbound',
        message_type: 'audio',
        status: 'sent',
        created_at: new Date().toISOString(),
        is_simulated: true
      };
      setMessages(prev => [...prev, audioMsg]);
      scrollToBottom();
      toast.success("Áudio simulado enviado!");
    }
  };

  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => setRecordingDuration(d => d + 1), 1000);
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
      const { data, error: uploadError } = await supabase.storage
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
      toast.success("Áudio enviado");
    } catch (e: any) {
      toast.error("Falha ao enviar áudio: " + e.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMessage = async () => {
    if ((!inputText.trim() && !selectedFile) || isSending) return;

    // Aplicar Assinatura ACIMA da mensagem
    const displayName = signatureName || profile?.full_name || 'Equipe MAYUS';
    const signature = showSignature ? `— *${displayName}*\n\n` : "";
    const textToSend = signature + inputText;

    // MODO SIMULAÇÃO (Liberado para Teste)
    if (!activeContact) {
      const simulatedMsg = {
        id: `sim-wa-${Date.now()}`,
        contact_id: 'test-wa',
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
      toast.success("Mensagem de Teste Enviada! 🚀");
      return;
    }

    setIsSending(true);
    setInputText("");

    try {
       if (selectedFile) toast.success(`Anexo ${selectedFile.name} pronto.`);

       const response = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: profile!.tenant_id, contact_id: activeContact.id, phone_number: activeContact.phone_number, text: textToSend })
       });
       if (!response.ok) throw new Error("Erro no motor Meta");

       toast.success("Mensagem disparada com sucesso! 🟢");
       setSelectedFile(null);
       fetchContacts();
    } catch (e: any) {
       toast.error("Falha : " + e.message);
       setInputText(inputText);
    } finally {
       setIsSending(false);
    }
  };

  const handleGenerateMayusReply = async () => {
    if (!activeContact || isGeneratingMayusReply) {
      if (!activeContact) toast.info("Selecione um contato para o MAYUS preparar o atendimento.");
      return;
    }

    setIsGeneratingMayusReply(true);
    try {
      const response = await fetch('/api/whatsapp/ai-sales-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: activeContact.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nao consegui preparar a resposta agora.");

      setMayusDraft(data);
      if (data.suggested_reply) {
        setInputMode("responder");
        setInputText(data.suggested_reply);
        if (data.mode === "human_review_required") {
          toast.warning("MAYUS preparou a resposta, mas este caso pede revisao humana antes do envio.");
        } else {
          toast.success("Resposta consultiva preparada pelo MAYUS.");
        }
      } else {
        toast.info(data.internal_note || "MAYUS precisa completar a configuracao comercial antes de responder.");
      }
    } catch (error: any) {
      toast.error(error.message || "Falha ao gerar resposta MAYUS.");
    } finally {
      setIsGeneratingMayusReply(false);
    }
  };

  const handleUseMayusDraft = () => {
    if (!mayusDraft?.suggested_reply) return;
    setInputMode("responder");
    setInputText(mayusDraft.suggested_reply);
    toast.success("Rascunho MAYUS carregado no atendimento.");
  };

  const handleCreateContact = async () => {
     let cleanPhone = newContactPhone.replace(/\D/g, '');
     if (cleanPhone.length < 10) return toast.error("Número inválido.");
     const fullJid = cleanPhone;
     const { data: newContact, error } = await supabase
       .from("whatsapp_contacts")
       .insert([{ tenant_id: profile!.tenant_id, phone_number: fullJid, name: cleanPhone, assigned_user_id: profile!.id }])
       .select().single();

     if (!error) {
        setContacts([newContact, ...contacts]);
        setActiveContact(newContact);
        setIsAddingContact(false);
        setNewContactPhone("");
        toast.success("Contato pronto para conversa");
     }
  };

  const handleSendZapSignContract = async () => {
    if (!activeContact || isSendingContract) return;

    setIsSendingContract(true);
    const toastId = toast.loading("Gerando contrato na ZapSign...");

    try {
      const response = await fetch('/api/integrations/zapsign/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: profile?.tenant_id,
          contact_id: activeContact.id,
          template_id: zapsignTemplateId || "default",
          doc_name: `Contrato de Honorários - ${activeContact.name || 'Cliente'}`
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao gerar contrato");

      toast.success("Contrato enviado com sucesso!", { id: toastId });

      const contractMsg = {
        id: `contract-${Date.now()}`,
        content: `📄 *Contrato Gerado!* \n\nLink para assinatura: ${data.sign_url}`,
        direction: 'outbound',
        message_type: 'text',
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, contractMsg]);
      scrollToBottom();

    } catch (error: any) {
      toast.error(error.message || "Erro inesperado", { id: toastId });
    } finally {
      setIsSendingContract(false);
    }
  };



  return (
    <div className={`h-[calc(100vh-6rem)] w-full flex bg-[#020104] rounded-tl-3xl border-t border-l border-white/5 overflow-hidden ${montserrat.className} text-sm`}>

      {/* 1. BARRA LATERAL ESQUERDA (LISTAGEM) */}
      <div className="w-[360px] flex-shrink-0 border-r border-white/10 bg-white dark:bg-[#050505] flex flex-col h-full z-10 transition-all">
        <div className="p-6 border-b border-white/10 flex flex-col gap-4">
           <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                 <div className="w-8 h-8 rounded-lg bg-[#CCA761]/10 flex items-center justify-center border border-[#CCA761]/30 shadow-[0_0_15px_rgba(204,167,97,0.1)]">
                    <MessageCircle size={18} className="text-[#CCA761]" />
                 </div>
                 <h2 className={`text-xl font-black text-white italic tracking-tighter ${cormorant.className}`}>Conversas</h2>
              </div>
              <button onClick={() => setIsAddingContact(!isAddingContact)} className="bg-white/5 p-2 rounded-lg border border-white/5 hover:bg-[#CCA761] hover:text-black transition-all">
                 <Plus size={18} />
              </button>
           </div>

           {/* BARRA DE BUSCA */}
           <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="w-full bg-gray-200 dark:bg-black/40 border border-white/5 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder:text-gray-700 outline-none focus:border-[#CCA761]/30 transition-colors"
              />
           </div>

           {/* Filtros de Aba Estilo Premium */}
           <div className="flex p-1 bg-gray-200 dark:bg-black/40 rounded-xl border border-white/5">
              {[
                { id: "minhas", label: "Minhas", icon: UserCheck },
                { id: "aguardando", label: "Espera", icon: Clock },
                ...(isAdmin ? [{ id: "todas", label: "Todas", icon: Users }] : [])
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? "bg-[#CCA761] text-black shadow-lg" : "text-gray-500 hover:text-gray-300"}`}
                >
                   <tab.icon size={12} /> {tab.label}
                </button>
              ))}
           </div>

           {/* FILTRO POR DEPARTAMENTO */}
           {departments.length > 0 && (
             <div className="flex gap-1.5 flex-wrap">
               <button
                 onClick={() => setFilterDeptId(null)}
                 className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all ${
                   !filterDeptId ? 'bg-white/10 border-white/20 text-white' : 'border-white/5 text-gray-600 hover:text-gray-400'
                 }`}
               >
                 Todos
               </button>
               {departments.map(dept => (
                 <button
                   key={dept.id}
                   onClick={() => setFilterDeptId(filterDeptId === dept.id ? null : dept.id)}
                   className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all flex items-center gap-1 ${
                     filterDeptId === dept.id ? 'border-white/20 text-white' : 'border-white/5 text-gray-600 hover:text-gray-400'
                   }`}
                   style={filterDeptId === dept.id ? { backgroundColor: `${dept.color}20`, borderColor: `${dept.color}40` } : {}}
                 >
                   <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dept.color }} />
                   {dept.name}
                 </button>
               ))}
             </div>
           )}

           {isAddingContact && (
              <div className="animate-in slide-in-from-top-2 flex flex-col gap-2 p-4 bg-[#CCA761]/5 border border-[#CCA761]/20 rounded-2xl">
                 <input type="text" placeholder="DDD + Numero" value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} className="bg-gray-200 dark:bg-black border border-white/10 rounded-lg text-xs px-3 py-2 text-white" />
                 <button onClick={handleCreateContact} className="bg-[#CCA761] text-black py-2 rounded-lg font-black text-[10px] uppercase">Iniciar Atendimento</button>
              </div>
           )}
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 p-3">
           {isLoading ? (
              <div className="flex flex-col items-center justify-center h-40 opacity-20"><Loader2 className="animate-spin" /></div>
           ) : filteredContacts.map((contact) => (
              <div key={contact.id} onClick={() => setActiveContact(contact)} className={`group relative flex items-start gap-4 p-4 rounded-2xl cursor-pointer transition-all border ${activeContact?.id === contact.id ? "bg-[#111] border-[#CCA761]/30" : "hover:bg-white/5 border-transparent opacity-80 hover:opacity-100"}`}>
                 <div className="w-12 h-12 rounded-full border border-[#CCA761]/20 bg-gray-200 dark:bg-black flex flex-shrink-0 items-center justify-center text-[#CCA761] font-black shadow-inner overflow-hidden">
                    {contact.avatar_url ? <img src={contact.avatar_url} className="w-full h-full object-cover" /> : contact.name?.substring(0, 2).toUpperCase()}
                 </div>
                 <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                       <h4 className="font-bold truncate text-sm text-gray-200">{contact.name || contact.phone_number}</h4>
                       <span className="text-[9px] text-gray-600 font-bold uppercase">{contact.last_message_at ? formatTime(contact.last_message_at) : ''}</span>
                    </div>
                    <p className="text-gray-500 text-[10px] truncate italic font-medium">Sincronizado via Meta Cloud</p>
                 </div>
                 {contact.unread_count > 0 && <div className="bg-[#CCA761] text-black text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">{contact.unread_count}</div>}
              </div>
           ))}
        </div>
      </div>

      {/* 2. AREA DE CHAT (CENTRAL) */}
      <div className="flex-1 flex flex-col h-full bg-[#010101] relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none bg-[radial-gradient(circle_at_center,_#CCA761_0%,_transparent_80%)]" />

          <div className="flex-1 flex flex-col min-h-0">
            {(activeContact || messages.length > 0) ? (
              <>
                <div className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-[#0a0a0a]/90 backdrop-blur-3xl z-10 flex-shrink-0">
                    <div className="flex items-center gap-5">
                       <div className="w-11 h-11 rounded-full border border-[#CCA761]/50 bg-gray-200 dark:bg-black flex items-center justify-center text-[#CCA761] font-black text-lg shadow-[0_0_20px_rgba(204,167,97,0.1)] overflow-hidden">
                          {activeContact?.avatar_url ? <img src={activeContact.avatar_url} className="w-full h-full object-cover" /> : (activeContact?.name?.substring(0, 2).toUpperCase() || "TS")}
                       </div>
                       <div>
                         <h2 className={`text-2xl font-bold text-white tracking-wide flex items-center gap-3 ${cormorant.className} italic`}>
                            {activeContact?.name || activeContact?.phone_number || "Lead de Teste (Simulado)"}
                            <div className="flex gap-1.5 translate-y-[-1px]">
                               <span className={`text-[8px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest border ${activeContact ? 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/20' : 'bg-[#CCA761]/10 text-[#CCA761] border-[#CCA761]/20'}`}>
                                  {activeContact ? 'WhatsApp' : 'Simulação'}
                                </span>
                            </div>
                         </h2>
                         <div className="flex items-center gap-2 mt-0.5">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_#22c55e]" />
                            <span className="text-[9px] text-gray-600 uppercase font-black tracking-widest">Protocolo de Criptografia Ativo</span>
                         </div>
                       </div>
                    </div>

                    <div className="flex items-center gap-3">
                       <button onClick={() => setShowTransferModal(true)} className="flex items-center gap-2 bg-white/5 border border-white/10 text-gray-400 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#CCA761]/10 hover:text-[#CCA761] transition-all">
                          <Share2 size={14} /> Transferir Atendimento
                       </button>
                       <button className="bg-[#CCA761] text-black px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-[0_0_25px_rgba(204,167,97,0.3)] hover:scale-105 transition-all">
                          <CheckCircle2 size={16} /> Resolver
                       </button>
                    </div>
                </div>

                {(mayusDraft || isLoadingMayusDraft) && (
                  <div className="border-b border-[#CCA761]/15 bg-[#CCA761]/5 px-8 py-3 z-10 flex-shrink-0">
                    <div className="flex items-start justify-between gap-5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Bot size={14} className="text-[#CCA761]" />
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#CCA761]">
                            Rascunho MAYUS
                          </span>
                          {mayusDraft?.mode && (
                            <span className="text-[8px] font-black uppercase tracking-widest text-gray-500">
                              {String(mayusDraft.mode).replaceAll("_", " ")}
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] leading-relaxed text-gray-300 line-clamp-2">
                          {isLoadingMayusDraft
                            ? "Carregando rascunho consultivo..."
                            : mayusDraft?.suggested_reply || mayusDraft?.internal_note || "Sem rascunho disponivel para este contato."}
                        </p>
                        {Array.isArray(mayusDraft?.risk_flags) && mayusDraft.risk_flags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {mayusDraft.risk_flags.slice(0, 4).map((flag: string) => (
                              <span key={flag} className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-black/20 text-gray-400 border border-white/10">
                                {flag.replaceAll("_", " ")}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={handleUseMayusDraft}
                          disabled={!mayusDraft?.suggested_reply}
                          className="px-3 py-2 rounded-lg bg-[#CCA761] text-black text-[9px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Usar
                        </button>
                        <button
                          onClick={handleGenerateMayusReply}
                          disabled={isGeneratingMayusReply || !activeContact}
                          className="px-3 py-2 rounded-lg border border-[#CCA761]/20 text-[#CCA761] text-[9px] font-black uppercase tracking-widest disabled:opacity-40"
                        >
                          {isGeneratingMayusReply ? "Atualizando" : "Atualizar"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-10 flex flex-col gap-10 no-scrollbar min-h-0">
                    {messages.map((msg, idx) => {
                       const isMe = msg.direction === 'outbound';
                       return (
                          <div key={msg.id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4`}>
                             <div className={`flex flex-col gap-2 max-w-[65%] ${isMe ? 'items-end' : 'items-start'}`}>
                                <div className={`p-5 rounded-2xl text-[14px] leading-relaxed shadow-2xl relative border ${
                                   isMe
                                   ? 'bg-gradient-to-br from-[#CCA761] to-[#b89552] text-black font-semibold rounded-tr-sm border-[#b89552]/40'
                                   : 'bg-[#121212] border-white/10 text-gray-200 rounded-tl-sm'
                                }`}>
                                   {msg.content}
                                </div>
                                <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest px-2">
                                   {formatTime(msg.created_at)} {isMe ? '— Vitor P.' : ''}
                                </span>
                             </div>
                          </div>
                       );
                    })}
                    <div ref={messagesEndRef} />
                </div>
              </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-20 z-10 min-h-0">
                  <div className="w-28 h-28 bg-[#0a0a0a] border border-[#CCA761]/30 rounded-full flex items-center justify-center mb-10 shadow-[0_0_80px_rgba(204,167,97,0.1)] relative overflow-hidden">
                      <div className="absolute inset-0 bg-[conic-gradient(from_0deg,#CCA761,transparent,transparent,#CCA761)] animate-spin opacity-20" />
                      <Bot size={44} className="text-[#CCA761] relative z-10" />
                  </div>
                  <h2 className={`text-4xl font-bold text-white mb-4 ${cormorant.className} italic`}>Córtex de Mensagens Ativo</h2>
                  <p className="text-gray-500 max-w-sm text-sm font-medium leading-relaxed mb-12">O sistema está pronto. Escolha um lead que aguarda retorno ou comece uma prospecção de ouro agora.</p>
                  <button onClick={() => setIsAddingContact(true)} className="bg-white/5 border border-white/10 text-white px-10 py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.3em] hover:bg-[#CCA761] hover:text-black transition-all">Novo Atendimento</button>
                </div>
            )}
          </div>

          {/* COMPOSER SLIM - DESIGN ULTRA COMPACTO E FUNCIONAL */}
          <div className="p-3 pb-4 bg-[#0a0a0a]/95 backdrop-blur-3xl border-t border-white/10 z-10 flex-shrink-0">
              {/* Linha Fina de Controles Superiores */}
              <div className="flex justify-between items-center mb-2 px-3">
                  <div className="flex gap-4">
                    <button onClick={() => { console.log('Mode: Responder'); setInputMode("responder"); }} className={`text-[9px] font-black uppercase tracking-[0.2em] relative transition-all flex items-center gap-1.5 ${inputMode === "responder" ? "text-[#CCA761]" : "text-gray-600 hover:text-gray-400"}`}>
                        <MessageCircle size={12} /> Atendimento
                        {inputMode === "responder" && <div className="absolute -bottom-1 left-0 w-full h-[1px] bg-[#CCA761]" />}
                    </button>
                    <button onClick={handleGenerateMayusReply} disabled={isGeneratingMayusReply || !activeContact} className="text-[9px] font-black uppercase tracking-[0.2em] relative transition-all flex items-center gap-1.5 text-[#CCA761] disabled:opacity-40 disabled:cursor-not-allowed">
                        {isGeneratingMayusReply ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />} MAYUS
                    </button>
                    <button onClick={() => { console.log('Mode: Nota'); setInputMode("nota"); }} className={`text-[9px] font-black uppercase tracking-[0.2em] relative transition-all flex items-center gap-1.5 ${inputMode === "nota" ? "text-orange-500" : "text-gray-600 hover:text-gray-400"}`}>
                        <Lock size={12} /> Nota Interna
                        {inputMode === "nota" && <div className="absolute -bottom-1 left-0 w-full h-[1px] bg-orange-500" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    {showSignature && (
                      <input
                        type="text"
                        value={signatureName}
                        onChange={(e) => setSignatureName(e.target.value)}
                        placeholder={profile?.full_name || 'Seu nome'}
                        className="bg-transparent border-b border-white/10 text-[10px] text-gray-300 px-1 py-0.5 w-24 outline-none focus:border-[#CCA761] placeholder:text-gray-700 font-bold transition-colors"
                      />
                    )}
                    <label className="flex items-center gap-2 cursor-pointer group">
                        <input type="checkbox" checked={showSignature} onChange={() => setShowSignature(!showSignature)} className="hidden" />
                        <div className={`w-6 h-3 rounded-full transition-all relative ${showSignature ? "bg-[#CCA761]" : "bg-white/10"}`}>
                          <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${showSignature ? "right-0.5" : "left-0.5"}`} />
                        </div>
                        <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest group-hover:text-white transition-colors">Assinatura</span>
                    </label>
                  </div>
              </div>

              {/* Área Principal de Input - Estilo Barra */}
              <div className={`rounded-xl border transition-all flex flex-col shadow-lg relative ${inputMode === "nota" ? "bg-orange-500/[0.02] border-orange-500/30" : "bg-gray-200 dark:bg-black/40 border-white/10 focus-within:border-[#CCA761]/40"} ${isRecording ? 'border-red-500 ring-1 ring-red-500/20' : ''}`}>
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
                           <div className="px-4 py-2 bg-gray-200 dark:bg-black/40 border-t border-white/10 flex items-center justify-between animate-in slide-in-from-bottom-2">
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
                             placeholder={inputMode === "nota" ? "Nota interna..." : "Mensagem..."}
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
                         <div className="flex gap-4 px-3 py-2 border-t border-gray-100 dark:border-white/[0.03] bg-gray-200 dark:bg-black/20 rounded-b-xl relative items-center">
                             {/* Input de Arquivo Oculto */}
                             <input
                               type="file"
                               ref={fileInputRef}
                               className="hidden"
                               onChange={(e) => {
                                 const file = e.target.files?.[0];
                                 if (file) {
                                   setSelectedFile(file);
                                   toast.success(`Anexo pronto para envio!`);
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

                               <button onClick={() => toast.info("Modelos de resposta em breve")} className="text-gray-500 hover:text-[#CCA761] transition-all p-1" title="Modelos de Resposta"><LayoutPanelLeft size={18} /></button>
                             </div>

                             <span className="ml-auto text-[7px] text-gray-700 font-black tracking-tighter uppercase self-center hidden sm:block">Gerado pelo Córtex MAYUS</span>
                         </div>
                      </div>
                  )}
              </div>
          </div>
      </div>

      {/* 3. INFO E KANBAN (BARRA DIREITA) */}
      <div className="w-[340px] flex-shrink-0 border-l border-white/10 bg-white dark:bg-[#050505] flex flex-col h-full z-10 overflow-y-auto no-scrollbar">
         {activeContact && (
            <div className="p-8 space-y-10 animate-in slide-in-from-right-4 duration-700">
               {/* Header Perfil */}
               <div className="flex flex-col items-center">
                  <div className="w-28 h-28 rounded-full border-2 border-[#CCA761] bg-gray-200 dark:bg-black p-1 mb-5 relative group">
                     {activeContact.avatar_url ? (
                        <img src={activeContact.avatar_url} className="w-full h-full object-cover rounded-full" />
                     ) : (
                        <div className="w-full h-full rounded-full flex items-center justify-center text-3xl font-black text-[#CCA761]">
                           {activeContact.name?.substring(0, 2).toUpperCase()}
                        </div>
                     )}
                     <div className="absolute bottom-2 right-2 w-5 h-5 bg-[#25D366] rounded-full border-4 border-[#050505] shadow-[0_0_10px_#22c55e]" />
                  </div>
                  <h3 className="text-2xl font-bold text-white text-center italic group-hover:text-[#CCA761] transition-colors">{activeContact.name}</h3>
                  <div className="bg-[#CCA761]/10 border border-[#CCA761]/20 text-[#CCA761] px-4 py-1.5 rounded-full text-[9px] font-black uppercase mt-3 tracking-widest">Lead Qualificado</div>
               </div>

               {/* Módulo KANBAN (FUNCIONALIDADE SOLICITADA) */}
               <div className="space-y-4">
                  <div className="flex items-center gap-2 text-gray-500 font-black uppercase text-[10px] tracking-widest"><ClipboardList size={14} className="text-[#CCA761]" /> Gestão Pipeline</div>
                  <div className="p-5 bg-gray-200 dark:bg-black rounded-2xl border border-white/5 space-y-4">
                     <div>
                        <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest block mb-2">Etapa Atual</label>
                        <select className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-[#CCA761]">
                           <option>⭐ Novo Lead</option>
                           <option>📞 Chamada em Aberto</option>
                           <option>💼 Negociação</option>
                           <option>✍️ Contrato Emitido</option>
                        </select>
                     </div>
                     <div>
                        <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest block mb-2">Agente Responsável</label>
                        <div className="flex items-center gap-3 bg-[#111] p-3 rounded-xl border border-white/5">
                           <div className="w-6 h-6 rounded-full bg-[#CCA761] flex items-center justify-center text-[10px] font-black text-black">VP</div>
                           <span className="text-white text-xs font-bold">Vitor Procópio</span>
                        </div>
                     </div>
                  </div>
               </div>

                {/* Ações Rápidas */}
               <div className="space-y-3">
                  {contractFlowMode !== 'ia_only' && (
                    <button
                      onClick={handleSendZapSignContract}
                      disabled={isSendingContract}
                      className="w-full py-5 bg-[#CCA761] border border-[#CCA761]/20 text-black rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:scale-105 transition-all shadow-[0_0_20px_rgba(204,167,97,0.2)] disabled:opacity-50"
                    >
                       {isSendingContract ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                       Gerar Contrato (Um Clique)
                    </button>
                  )}
                  <button className="w-full py-5 bg-white/5 border border-white/10 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-white/10 transition-all group">
                     <FileText size={16} className="group-hover:-rotate-6 transition-transform" /> Dossiê Completo
                  </button>
                  <button className="w-full py-5 bg-gray-200 dark:bg-black border border-red-500/20 text-red-500 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-red-500 hover:text-white transition-all">
                     <X size={16} /> Encerrar Caso
                  </button>
               </div>
            </div>
         )}
      </div>

      {/* MODAL DE TRANSFERÊNCIA DE ATENDIMENTO */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-gray-200 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-2xl font-bold text-white italic ${cormorant.className}`}>
                Transferir <span className="text-[#CCA761]">Atendimento</span>
              </h3>
              <button onClick={() => setShowTransferModal(false)} className="text-gray-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-6">
              Transfira a conversa com <strong className="text-white">{activeContact?.name || activeContact?.phone_number}</strong> para outro departamento e/ou agente.
            </p>

            <div className="space-y-5">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-[#CCA761] mb-2 block">
                  <Building2 size={12} className="inline mr-1" /> Departamento Destino
                </label>
                <select
                  value={transferDeptId}
                  onChange={(e) => setTransferDeptId(e.target.value)}
                  className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#CCA761]/50 appearance-none"
                >
                  <option value="">— Selecione o departamento —</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-[#CCA761] mb-2 block">
                  <Users size={12} className="inline mr-1" /> Agente Responsável
                </label>
                <select
                  value={transferUserId}
                  onChange={(e) => setTransferUserId(e.target.value)}
                  className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#CCA761]/50 appearance-none"
                >
                  <option value="">— Selecione o agente —</option>
                  {teamMembers.map(member => (
                    <option key={member.id} value={member.id}>{member.full_name} ({member.role})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowTransferModal(false)}
                className="flex-1 py-3 text-xs font-bold uppercase text-gray-500 hover:text-white border border-white/10 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleTransfer}
                disabled={isTransferring || (!transferDeptId && !transferUserId)}
                className="flex-1 py-3 bg-[#CCA761] text-black text-xs font-black uppercase rounded-xl hover:bg-white transition-all shadow-[0_0_20px_rgba(204,167,97,0.3)] disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {isTransferring ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                Transferir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
