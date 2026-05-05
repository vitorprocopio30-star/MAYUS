"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  Search, ChevronDown, ChevronLeft, ChevronRight, Phone, Send,
  MessageCircle, Bot, Lock, CheckCircle2,
  Zap, Filter, FileText, Mic, Clock, Plus, X, Smartphone, Loader2, Smile, Paperclip, MoreVertical,
  Users, UserCheck, LayoutPanelLeft, Share2, ClipboardList, Building2, Download
} from "lucide-react";
import { toast } from "sonner";
import EmojiPicker, { Theme as EmojiTheme } from "emoji-picker-react";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });

// Funcoes utilitarias de formatacao
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

const sanitizeStorageName = (value: string) => (
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "arquivo"
);

const inferWhatsAppMediaType = (file: File) => {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
};

const labelColorOptions = ["#CCA761", "#25D366", "#60A5FA", "#F97316", "#EF4444", "#A855F7"];

type WhatsAppMediaObservability = {
  generated_at: string;
  window_hours: number;
  metrics: {
    pending_media: number;
    failed_media_total: number;
    events_24h: number;
    media_processed_24h: number;
    media_failed_24h: number;
    batches_24h: number;
    avg_media_duration_ms: number;
    last_batch: null | {
      created_at: string;
      picked: number;
      processed: number;
      failed: number;
      duration_ms: number;
    };
  };
  events: Array<{
    event_name: string;
    status: string;
    provider: string | null;
    created_at: string;
    kind: string | null;
    media_status: string | null;
    duration_ms: number;
    picked: number | null;
    processed: number | null;
    failed: number | null;
    error: string | null;
  }>;
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
  const [sideNoteText, setSideNoteText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [contacts, setContacts] = useState<any[]>([]);
  const [activeContact, setActiveContact] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Busca e Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [departments, setDepartments] = useState<any[]>([]);
  const [filterDeptId, setFilterDeptId] = useState<string | null>(null);

  // Modal de transferencia
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferDeptId, setTransferDeptId] = useState("");
  const [transferUserId, setTransferUserId] = useState("");
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isSendingContract, setIsSendingContract] = useState(false);
  const [isGeneratingMayusReply, setIsGeneratingMayusReply] = useState(false);
  const [isLoadingMayusDraft, setIsLoadingMayusDraft] = useState(false);
  const [isConversationActionPending, setIsConversationActionPending] = useState(false);
  const [mayusDraft, setMayusDraft] = useState<any | null>(null);
  const [contractFlowMode, setContractFlowMode] = useState<'ia_only' | 'human_only' | 'hybrid'>('hybrid');
  const [zapsignTemplateId, setZapsignTemplateId] = useState<string>("");
  const [labelDraft, setLabelDraft] = useState("");
  const [labelColorDraft, setLabelColorDraft] = useState("#CCA761");
  const [rightPanelMode, setRightPanelMode] = useState<"expanded" | "mini">("expanded");
  const [areConversationFiltersExpanded, setAreConversationFiltersExpanded] = useState(true);
  const [mediaObservability, setMediaObservability] = useState<WhatsAppMediaObservability | null>(null);
  const [isLoadingMediaObservability, setIsLoadingMediaObservability] = useState(false);

  // Permissoes
  const isAdmin = profile?.role === 'Administrador' || profile?.role === 'mayus_admin' || profile?.role === 'Sócio';

  // Carregar Departamentos e Membros
  useEffect(() => {
    if (!profile?.tenant_id) return;

    const loadDeps = async () => {
      const { data: depts } = await supabase.from('departments').select('*').eq('tenant_id', profile!.tenant_id).order('name');
      if (depts) setDepartments(depts);

      const { data: members } = await supabase.from('profiles').select('id, full_name, role').eq('tenant_id', profile!.tenant_id).eq('is_active', true);
      if (members) setTeamMembers(members);

      // Carregar configuracoes de governanca
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

  useEffect(() => {
    setTransferDeptId(activeContact?.department_id || "");
    setTransferUserId(activeContact?.assigned_user_id || "");
  }, [activeContact?.id, activeContact?.department_id, activeContact?.assigned_user_id]);

  useEffect(() => {
    setLabelDraft(activeContact?.label || "");
    setLabelColorDraft(activeContact?.label_color || "#CCA761");
  }, [activeContact?.id, activeContact?.label, activeContact?.label_color]);

  const fetchContacts = async () => {
     setIsLoading(true);
     let query = supabase
       .from("whatsapp_contacts")
       .select("*")
       .eq("tenant_id", profile!.tenant_id)
       .order("last_message_at", { ascending: false });

     // Permissoes: SDR/Advogado ve so as suas; Admin ve tudo
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
    return (c.name || '').toLowerCase().includes(q)
      || (c.phone_number || '').includes(q)
      || (c.label || '').toLowerCase().includes(q);
  });

  const internalNotes = messages.filter((message) => (
    message.message_type === "internal_note" || message.status === "internal_note"
  ));

  const serviceStatusLabel = activeContact?.assigned_user_id
    ? activeContact.assigned_user_id === profile?.id
      ? "Atendimento humano"
      : "Com responsavel"
    : "MAYUS atendendo";

  const activeTabLabel = activeTab === "minhas" ? "Minhas" : activeTab === "aguardando" ? "Espera" : "Todas";
  const activeDepartmentLabel = filterDeptId
    ? departments.find((department) => department.id === filterDeptId)?.name || "Setor filtrado"
    : "Todos os setores";
  const activeFilterSummary = `${activeTabLabel} - ${activeDepartmentLabel}`;

  // Transferencia de conversa
  const handleTransfer = async () => {
    if (!activeContact || (!transferDeptId && !transferUserId)) return toast.error("Selecione um departamento ou agente.");
    setIsTransferring(true);

    const updates: any = {};

    // Se selecionou departamento, atualiza.
    // Se transferir para departamento sem usuario, remove o assigned_user_id para cair na fila "Aguardando"
    if (transferDeptId) {
      updates.department_id = transferDeptId;
      if (!transferUserId) updates.assigned_user_id = null;
    }

    if (transferUserId) updates.assigned_user_id = transferUserId;

    const { error } = await supabase.from('whatsapp_contacts').update(updates).eq('id', activeContact.id);

    if (error) {
       console.error("Erro na transferencia:", error);
       toast.error('Erro: ' + error.message);
    } else {
      toast.success('Conversa transferida com sucesso!');
      setShowTransferModal(false);

      // Logica de visibilidade: se o contato saiu da visao do usuario atual
      const movedAway = !isAdmin && (
        (updates.assigned_user_id && updates.assigned_user_id !== profile?.id) ||
        (activeTab === 'aguardando' && updates.assigned_user_id)
      );

      if (movedAway) {
        setActiveContact(null);
      } else {
        // Atualiza localmente o contato ativo para refletir a mudanca
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
          setMessages(await signMessageMediaUrls(data));
          scrollToBottom();
       }
    };

    fetchMessages();
    loadLatestMayusDraft(activeContact.id);

    const channel = supabase
       .channel(`chat_ws_meta_${activeContact.id}`)
       .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `contact_id=eq.${activeContact.id}` },
          async (payload) => {
            const [signedMessage] = await signMessageMediaUrls([payload.new]);
            setMessages((current) => current.some((message) => message.id === payload.new.id) ? current : [...current, signedMessage]);
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

  const signMessageMediaUrls = async (rows: any[]) => {
    return Promise.all(rows.map(async (message) => {
      if (!message?.media_storage_path) return message;
      const { data } = await supabase.storage
        .from('whatsapp-media')
        .createSignedUrl(message.media_storage_path, 60 * 60);
      return data?.signedUrl ? { ...message, media_url: data.signedUrl } : message;
    }));
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
      console.error("Erro real de microfone no WhatsApp, iniciando modo simulacao:", err);
      // Fallback de simulacao
      setIsRecording(true);
      setRecordingDuration(0);
      toast.info("Modo simulacao: validando interface de audio...");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else if (isRecording) {
      // Modo simulacao: enviar mensagem de audio simulada
      setIsRecording(false);
      setRecordingDuration(0);
      const displayName = signatureName || profile?.full_name || 'Equipe MAYUS';
      const audioMsg = {
        id: `sim-audio-${Date.now()}`,
        contact_id: activeContact?.id || 'test-wa',
        content: `${showSignature ? `*${displayName}*\n\n` : ''}Audio (${formatDuration(recordingDuration)})`,
        direction: 'outbound',
        message_type: 'audio',
        status: 'sent',
        created_at: new Date().toISOString(),
        is_simulated: true
      };
      setMessages(prev => [...prev, audioMsg]);
      scrollToBottom();
      toast.success("Audio simulado enviado.");
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
      toast.info("Selecione um contato para enviar o audio.");
      return;
    }

    setIsSending(true);
    try {
      const fileName = `${profile?.tenant_id}/${activeContact.id}/${Date.now()}.webm`;
      const { data, error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      const { data: signedAudio, error: signedAudioError } = await supabase.storage
        .from('whatsapp-media')
        .createSignedUrl(fileName, 60 * 60);

      if (signedAudioError || !signedAudio?.signedUrl) throw signedAudioError || new Error("Falha ao assinar audio");

      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: activeContact.id,
          audio_url: signedAudio.signedUrl,
          media_storage_path: fileName
        })
      });

      if (!response.ok) throw new Error("Erro ao enviar audio");
      toast.success("Audio enviado");
    } catch (e: any) {
      toast.error("Falha ao enviar audio: " + e.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMessage = async () => {
    if (isSending) return;

    const messageBody = inputText.trim();

    if (inputMode === "nota") {
      if (!messageBody) return;

      setIsSending(true);
      setInputText("");

      try {
        await saveInternalNote(messageBody);
      } catch (error: any) {
        toast.error("Falha ao salvar nota interna: " + error.message);
        setInputText(messageBody);
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (!messageBody && !selectedFile) return;

    // Aplicar Assinatura ACIMA da mensagem
    const displayName = signatureName || profile?.full_name || 'Equipe MAYUS';
    const signature = showSignature ? `*${displayName}*\n\n` : "";
    const textToSend = messageBody ? signature + messageBody : "";

    // MODO SIMULACAO (Liberado para Teste)
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
      toast.success("Mensagem de teste enviada.");
      return;
    }

    setIsSending(true);
    setInputText("");

    try {
        let uploadedMedia: {
          media_url: string;
          media_type: string;
          media_filename: string;
          media_mime_type: string;
          media_storage_path: string;
        } | null = null;

       if (selectedFile) {
         const safeName = sanitizeStorageName(selectedFile.name);
         const filePath = `${profile!.tenant_id}/${activeContact.id}/${Date.now()}-${safeName}`;
         const { error: uploadError } = await supabase.storage
           .from('whatsapp-media')
           .upload(filePath, selectedFile, {
             contentType: selectedFile.type || 'application/octet-stream',
             upsert: true,
           });

         if (uploadError) throw uploadError;

          const { data: signedMedia, error: signedMediaError } = await supabase.storage
            .from('whatsapp-media')
            .createSignedUrl(filePath, 60 * 60);

          if (signedMediaError || !signedMedia?.signedUrl) throw signedMediaError || new Error("Falha ao assinar midia");

          uploadedMedia = {
            media_url: signedMedia.signedUrl,
            media_type: inferWhatsAppMediaType(selectedFile),
            media_filename: selectedFile.name,
            media_mime_type: selectedFile.type || 'application/octet-stream',
            media_storage_path: filePath,
          };
       }

       const response = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
             contact_id: activeContact.id,
             text: textToSend,
            ...(uploadedMedia || {}),
          })
       });
       if (!response.ok) throw new Error("Erro no motor Meta");

       toast.success("Mensagem disparada com sucesso.");
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

  const handleCreateContact = async () => {
     let cleanPhone = newContactPhone.replace(/\D/g, '');
     if (cleanPhone.length < 10) return toast.error("Numero invalido.");
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

  const updateActiveContactLocally = (updates: Record<string, any>) => {
    if (!activeContact) return;
    setActiveContact({ ...activeContact, ...updates });
    setContacts((current) => current.map((contact) => (
      contact.id === activeContact.id ? { ...contact, ...updates } : contact
    )));
  };

  const updateActiveContact = async (updates: Record<string, any>, successMessage: string) => {
    if (!activeContact || !profile?.tenant_id) return;

    setIsConversationActionPending(true);
    try {
      const { error } = await supabase
        .from("whatsapp_contacts")
        .update(updates)
        .eq("tenant_id", profile.tenant_id)
        .eq("id", activeContact.id);

      if (error) throw error;

      updateActiveContactLocally(updates);
      toast.success(successMessage);
      void fetchContacts();
    } catch (error: any) {
      toast.error(error.message || "Nao foi possivel atualizar a conversa.");
    } finally {
      setIsConversationActionPending(false);
    }
  };

  const loadMediaObservability = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingMediaObservability(true);
    try {
      const response = await fetch('/api/whatsapp/media/observability', { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Falha ao carregar observabilidade.");
      setMediaObservability(data);
    } catch (error: any) {
      toast.error(error?.message || "Falha ao carregar observabilidade WhatsApp.");
    } finally {
      setIsLoadingMediaObservability(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!profile?.tenant_id || !isAdmin) return;
    loadMediaObservability();
  }, [profile?.tenant_id, isAdmin, loadMediaObservability]);

  const handleSaveContactLabel = async () => {
    const label = labelDraft.trim().slice(0, 40);
    const color = /^#[0-9a-fA-F]{6}$/.test(labelColorDraft) ? labelColorDraft : "#CCA761";

    await updateActiveContact(
      { label: label || null, label_color: color, updated_at: new Date().toISOString() },
      label ? "Etiqueta atualizada." : "Etiqueta removida."
    );
  };

  const saveInternalNote = async (content: string) => {
    const note = content.trim();
    if (!note) return null;

    if (!activeContact || !profile?.tenant_id) {
      throw new Error("Selecione uma conversa real para salvar a nota interna.");
    }

    const { data, error } = await supabase
      .from("whatsapp_messages")
      .insert([{
        tenant_id: profile.tenant_id,
        contact_id: activeContact.id,
        direction: "outbound",
        message_type: "internal_note",
        content: note,
        status: "internal_note",
      }])
      .select()
      .single();

    if (error) throw error;

    if (data) {
      setMessages((current) => current.some((message) => message.id === data.id) ? current : [...current, data]);
    }
    scrollToBottom();
    toast.success("Nota interna salva somente para a equipe.");
    return data;
  };

  const handleSaveSideNote = async () => {
    if (!sideNoteText.trim()) return;

    setIsConversationActionPending(true);
    try {
      await saveInternalNote(sideNoteText);
      setSideNoteText("");
    } catch (error: any) {
      toast.error(error.message || "Falha ao salvar nota interna.");
    } finally {
      setIsConversationActionPending(false);
    }
  };

  const handleResolveConversation = async () => {
    await updateActiveContact(
      { unread_count: 0, updated_at: new Date().toISOString() },
      "Conversa marcada como resolvida."
    );
  };

  const handleAssumeConversation = async () => {
    if (!profile?.id) {
      toast.error("Nao encontrei seu usuario para assumir a conversa.");
      return;
    }

    await updateActiveContact(
      { assigned_user_id: profile.id, department_id: transferDeptId || activeContact?.department_id || null },
      "Conversa assumida por voce."
    );
  };

  const handleReturnToAgent = async () => {
    await updateActiveContact(
      { assigned_user_id: null },
      "Conversa devolvida para o agente MAYUS."
    );
  };

  const handleToggleHumanAgent = async () => {
    if (activeContact?.assigned_user_id === profile?.id) {
      await handleReturnToAgent();
      return;
    }

    await handleAssumeConversation();
  };

  const handleMayusControl = async () => {
    if (activeContact?.assigned_user_id === profile?.id) {
      await handleReturnToAgent();
      return;
    }

    await handleGenerateMayusReply();
  };

  const getDepartmentName = (id?: string | null) => {
    if (!id) return "Sem setor";
    return departments.find((department) => department.id === id)?.name || "Setor nao encontrado";
  };

  const getTeamMemberName = (id?: string | null) => {
    if (!id) return "MAYUS";
    return teamMembers.find((member) => member.id === id)?.full_name || "Responsavel nao encontrado";
  };

  const getMessageMediaUrl = (message: any) => (
    message?.media_url || message?.metadata?.media_url || message?.metadata?.audio_url || null
  );

  const getMessageMediaType = (message: any) => (
    String(message?.message_type || message?.metadata?.media_type || "text").toLowerCase()
  );

  const renderMessageMedia = (message: any) => {
    const mediaUrl = getMessageMediaUrl(message);
    const mediaType = getMessageMediaType(message);
    const filename = message?.media_filename || message?.metadata?.media_filename || message?.metadata?.fileName || "arquivo";
    const isMediaMessage = ["image", "audio", "video", "document", "sticker"].includes(mediaType);

    if (!isMediaMessage) return null;

    if (!mediaUrl) {
      return (
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-gray-400">
          Midia recebida, mas ainda sem arquivo disponivel. {message?.media_summary || "Aguardando processamento."}
        </div>
      );
    }

    if (mediaType === "image" || mediaType === "sticker") {
      return (
        <a href={mediaUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-white/10 bg-black/30">
          <img src={mediaUrl} alt={filename} className="max-h-72 w-full object-contain" />
        </a>
      );
    }

    if (mediaType === "audio") {
      return (
        <audio controls src={mediaUrl} className="w-[260px] max-w-full" />
      );
    }

    if (mediaType === "video") {
      return (
        <video controls src={mediaUrl} className="max-h-72 w-full rounded-xl border border-white/10 bg-black/30" />
      );
    }

    return (
      <a href={mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 hover:border-[#CCA761]/40 transition-colors">
        <FileText size={18} className="text-[#CCA761] shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-white">{filename}</p>
          <p className="text-[9px] uppercase tracking-widest text-gray-500">Abrir documento</p>
        </div>
        <Download size={14} className="text-gray-500 shrink-0" />
      </a>
    );
  };

  const renderMediaInsight = (message: any) => {
    const summary = message?.media_summary || null;
    const text = message?.media_text || null;
    const insight = summary || text;
    if (!insight) return null;

    return (
      <div className="mt-2 rounded-xl border border-[#CCA761]/15 bg-[#CCA761]/10 px-3 py-2 text-[11px] leading-relaxed text-[#f0d9a6]">
        <span className="font-black uppercase tracking-widest text-[8px] block mb-1">Leitura MAYUS</span>
        {String(insight).slice(0, 900)}
      </div>
    );
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
          doc_name: `Contrato de Honorarios - ${activeContact.name || 'Cliente'}`
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao gerar contrato");

      toast.success("Contrato enviado com sucesso!", { id: toastId });

      const contractMsg = {
        id: `contract-${Date.now()}`,
        content: `*Contrato Gerado!*\n\nLink para assinatura: ${data.sign_url}`,
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
    <div className={`h-[calc(100vh-5rem)] min-w-0 w-[calc(100%+2rem)] md:w-[calc(100%+4rem)] -m-4 md:-m-8 flex bg-[#020104] rounded-tl-3xl border-t border-l border-white/5 overflow-hidden ${montserrat.className} text-sm`}>

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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAreConversationFiltersExpanded((current) => !current)}
                  className="bg-white/5 p-2 rounded-lg border border-white/5 hover:bg-[#CCA761] hover:text-black transition-all"
                  title={areConversationFiltersExpanded ? "Recolher filtros" : "Expandir filtros"}
                >
                   <ChevronDown size={18} className={`transition-transform duration-300 ${areConversationFiltersExpanded ? "rotate-180" : ""}`} />
                </button>
                <button onClick={() => setIsAddingContact(!isAddingContact)} className="bg-white/5 p-2 rounded-lg border border-white/5 hover:bg-[#CCA761] hover:text-black transition-all" title="Novo atendimento">
                   <Plus size={18} />
                </button>
              </div>
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

           {areConversationFiltersExpanded ? (
             <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
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
             </div>
           ) : (
             <button
               type="button"
               onClick={() => setAreConversationFiltersExpanded(true)}
               className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-gray-200 px-3 py-2 text-left transition-colors hover:border-[#CCA761]/30 dark:bg-black/40"
             >
               <div className="flex min-w-0 items-center gap-2">
                 <Filter size={12} className="shrink-0 text-[#CCA761]" />
                 <span className="shrink-0 text-[8px] font-black uppercase tracking-widest text-gray-600">Filtro</span>
                 <span className="truncate text-[10px] font-bold uppercase tracking-wider text-gray-300">{activeFilterSummary}</span>
               </div>
               <ChevronDown size={14} className="shrink-0 text-gray-500" />
             </button>
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
                     {contact.profile_pic_url ? <img src={contact.profile_pic_url} alt="" className="w-full h-full object-cover" /> : contact.name?.substring(0, 2).toUpperCase()}
                 </div>
                 <div className="flex-1 min-w-0">
                     <div className="flex justify-between items-center mb-1">
                        <h4 className="font-bold truncate text-sm text-gray-200">{contact.name || contact.phone_number}</h4>
                        <span className="text-[9px] text-gray-600 font-bold uppercase">{contact.last_message_at ? formatTime(contact.last_message_at) : ''}</span>
                     </div>
                     <p className="text-gray-500 text-[10px] truncate italic font-medium">Sincronizado via Meta Cloud</p>
                     {contact.label && (
                       <span
                         className="mt-2 inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-widest"
                         style={{
                           color: contact.label_color || '#CCA761',
                           borderColor: `${contact.label_color || '#CCA761'}55`,
                           backgroundColor: `${contact.label_color || '#CCA761'}18`,
                         }}
                       >
                         <span className="truncate">{contact.label}</span>
                       </span>
                     )}
                  </div>
                 {contact.unread_count > 0 && <div className="bg-[#CCA761] text-black text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">{contact.unread_count}</div>}
              </div>
           ))}
        </div>
      </div>

      {/* 2. AREA DE CHAT (CENTRAL) */}
      <div className="flex-1 min-w-0 flex flex-col h-full relative bg-[#0a0a0a]/50 overflow-hidden">
          <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #CCA761 0%, transparent 60%)' }} />

          <div className="flex-1 flex flex-col min-h-0">
            {(activeContact || messages.length > 0) ? (
              <>
                <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0a] z-10 flex-shrink-0">
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-[#111] border border-white/10 flex items-center justify-center text-white font-bold overflow-hidden">
                           {activeContact?.profile_pic_url ? <img src={activeContact.profile_pic_url} alt="" className="w-full h-full object-cover" /> : (activeContact?.name?.substring(0, 2).toUpperCase() || "TS")}
                       </div>
                       <div>
                         <h2 className="text-white font-bold tracking-wide flex items-center gap-2">
                            {activeContact?.name || activeContact?.phone_number || "Lead de Teste (Simulado)"}
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest border ${activeContact ? 'bg-[#25D366]/20 text-[#25D366] border-[#25D366]/30' : 'bg-[#CCA761]/10 text-[#CCA761] border-[#CCA761]/20'}`}>
                              {activeContact ? 'WhatsApp' : 'Simulacao'}
                            </span>
                            {activeContact?.label && (
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest border"
                                style={{
                                  color: activeContact.label_color || '#CCA761',
                                  borderColor: `${activeContact.label_color || '#CCA761'}55`,
                                  backgroundColor: `${activeContact.label_color || '#CCA761'}18`,
                                }}
                              >
                                {activeContact.label}
                              </span>
                            )}
                          </h2>
                       </div>
                    </div>

                    <div className="flex items-center gap-3">
                       <button
                         onClick={handleResolveConversation}
                         disabled={isConversationActionPending}
                         className="bg-[#CCA761] text-black font-black uppercase tracking-widest text-[10px] px-4 py-2 rounded shadow-[0_0_15px_rgba(204,167,97,0.4)] hover:scale-105 transition-transform flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                          {isConversationActionPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Resolver
                       </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 z-10 scroll-smooth no-scrollbar min-h-0">
                    {activeContact && messages.length === 0 && (
                      <div className="flex justify-center my-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                         <span className="bg-[#CCA761]/10 border border-[#CCA761]/20 text-[#CCA761] px-4 py-2 rounded-full text-xs font-bold tracking-wide shadow-[0_0_15px_rgba(204,167,97,0.1)]">
                            Novo contato detectado. Diga ola!
                         </span>
                      </div>
                    )}
                    {messages.map((msg, idx) => {
                       const isInternalNote = msg.message_type === "internal_note" || msg.status === "internal_note";
                       const isMe = msg.direction === 'outbound' && !isInternalNote;
                       return (
                          <div key={msg.id || idx} className={`flex gap-4 ${isInternalNote ? 'justify-center' : isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                             {!isMe && !isInternalNote && (
                               <div className="w-8 h-8 rounded-full bg-[#111] border border-white/10 shrink-0 flex items-center justify-center text-xs font-bold text-gray-400">
                                  {activeContact?.name ? activeContact.name.substring(0, 2).toUpperCase() : "WA"}
                               </div>
                             )}

                             <div className={`flex flex-col gap-1 ${isInternalNote ? 'items-center max-w-[76%]' : `max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}`}>
                                <div className={`p-3 rounded-2xl text-sm shadow-md whitespace-pre-wrap ${
                                   isInternalNote
                                   ? 'bg-orange-500/10 border-orange-500/30 text-orange-100 rounded-xl'
                                   : isMe
                                   ? 'bg-[#CCA761] text-black font-medium border border-[#b89552] rounded-tr-sm'
                                   : 'bg-[#1a1a1a] border border-white/5 text-gray-200 rounded-tl-sm'
                                }`}>
                                   {isInternalNote && (
                                     <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-orange-400 mb-2">
                                       <Lock size={12} /> Nota interna
                                     </div>
                                   )}
                                   {renderMessageMedia(msg)}
                                   {msg.content && (
                                     <div className={renderMessageMedia(msg) ? "mt-2" : ""}>{msg.content}</div>
                                   )}
                                   {renderMediaInsight(msg)}
                                 </div>
                                <span className="text-[9px] text-gray-500 font-bold tracking-widest uppercase mt-0.5 px-1">
                                   {formatTime(msg.created_at)} {isInternalNote ? "Somente equipe" : ""}
                                </span>
                             </div>

                             {isMe && (
                               <div className="w-8 h-8 rounded-full bg-white dark:bg-[#050505] border border-white/10 shrink-0 flex items-center justify-center text-xs font-bold text-[#CCA761]">
                                  EU
                               </div>
                             )}
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
                  <h2 className={`text-4xl font-bold text-white mb-4 ${cormorant.className} italic`}>Cortex de Mensagens Ativo</h2>
                  <p className="text-gray-500 max-w-sm text-sm font-medium leading-relaxed mb-12">O sistema esta pronto. Escolha um lead que aguarda retorno ou comece uma prospeccao de ouro agora.</p>
                  <button onClick={() => setIsAddingContact(true)} className="bg-white/5 border border-white/10 text-white px-10 py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.3em] hover:bg-[#CCA761] hover:text-black transition-all">Novo Atendimento</button>
                </div>
            )}
          </div>

          {(activeContact || messages.length > 0) && (
          /* COMPOSER SLIM - DESIGN ULTRA COMPACTO E FUNCIONAL */
          <div className="min-w-0 p-3 pb-4 bg-[#0a0a0a]/95 backdrop-blur-3xl border-t border-white/5 z-10 flex-shrink-0">
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

              {/* Area principal de input - estilo barra */}
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

                         <div className="relative flex min-w-0 items-end w-full px-2 py-2">
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
                             className="min-w-0 flex-1 bg-transparent border-none text-white text-[13px] px-3 py-2 outline-none resize-none min-h-[42px] max-h-[150px] placeholder:text-gray-700 transition-all font-medium scrollbar-none"
                           />

                           {/* Preview da Assinatura Minimalista */}
                           {showSignature && inputMode === "responder" && (
                             <div className="absolute bottom-1 right-[115px] pointer-events-none opacity-30 hidden sm:block">
                                <span className="text-[8px] text-gray-500 italic font-bold">*{profile?.full_name || 'Equipe'}*</span>
                             </div>
                           )}

                           {/* Botao de envio compacto */}
                           <button
                             onClick={(e) => { e.preventDefault(); handleSendMessage(); }}
                             disabled={isSending || (inputMode === "nota" ? !inputText.trim() : (!inputText.trim() && !isRecording && !selectedFile))}
                             className={`ml-2 mb-1 shrink-0 h-9 px-4 rounded-lg font-black uppercase text-[9px] tracking-wider transition-all flex items-center gap-2 ${
                               isSending ? 'bg-white/10 text-gray-400' : 'bg-[#CCA761] text-black hover:bg-white active:scale-95 shadow-lg shadow-[#CCA761]/10'
                             }`}
                           >
                             {isSending ? (
                               <Loader2 className="animate-spin" size={12} />
                             ) : inputMode === "nota" ? (
                               <><Lock size={12} /> SALVAR NOTA</>
                             ) : (
                               <><Send size={12} /> ENVIAR</>
                             )}
                           </button>
                         </div>

                         {/* Barra de ferramentas inferior */}
                         <div className="flex gap-4 px-3 py-2 border-t border-gray-100 dark:border-white/[0.03] bg-gray-200 dark:bg-black/20 rounded-b-xl relative items-center">
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
                               title="Gravar Audio"
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
                             <button onClick={handleGenerateMayusReply} disabled={(isGeneratingMayusReply || isConversationActionPending) || !activeContact} className="text-gray-500 hover:text-[#CCA761] transition-all p-1 disabled:opacity-40 disabled:cursor-not-allowed" title="Preparar resposta MAYUS">
                               {isGeneratingMayusReply ? <Loader2 size={18} className="animate-spin" /> : <Bot size={18} />}
                             </button>
                             <button onClick={() => toast.info("Modelos de resposta em breve")} className="text-gray-500 hover:text-[#CCA761] transition-all p-1" title="Modelos"><LayoutPanelLeft size={18} /></button>
                           </div>

                           <span className="ml-auto text-[7px] text-gray-700 font-black tracking-tighter uppercase self-center hidden sm:block">Focado na Experiencia MAYUS</span>
                         </div>
                      </div>
                  )}
              </div>
          </div>
          )}
      </div>

      {/* 3. INFO E KANBAN (BARRA DIREITA) */}
      <div className={`relative flex-shrink-0 border-l border-white/10 bg-white dark:bg-[#050505] flex flex-col h-full z-10 overflow-visible transition-[width] duration-300 ease-in-out ${rightPanelMode === "mini" ? "w-[76px]" : "w-[340px]"}`}>
         <button
           onClick={() => setRightPanelMode((current) => current === "expanded" ? "mini" : "expanded")}
           className="absolute top-6 -left-3 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#CCA761] text-black shadow-[0_0_15px_rgba(204,167,97,0.3)] transition-transform hover:scale-110"
           title={rightPanelMode === "expanded" ? "Recolher painel" : "Expandir painel"}
         >
           {rightPanelMode === "expanded" ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
         </button>

         {activeContact && rightPanelMode === "mini" && (
            <div className="flex h-full flex-col items-center gap-5 px-3 py-8 animate-in fade-in duration-300">
               <button
                 onClick={() => setRightPanelMode("expanded")}
                 className="h-11 w-11 rounded-full border border-[#CCA761]/40 bg-gray-200 dark:bg-black p-0.5 shadow-[0_0_18px_rgba(204,167,97,0.12)]"
                 title="Expandir painel do contato"
               >
                  {activeContact.profile_pic_url ? (
                    <img src={activeContact.profile_pic_url} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center rounded-full text-xs font-black text-[#CCA761]">
                      {activeContact.name?.substring(0, 2).toUpperCase()}
                    </span>
                  )}
               </button>
               <div className="h-px w-8 bg-white/10" />
               <button
                 onClick={() => setRightPanelMode("expanded")}
                 className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-[#CCA761] transition-colors hover:bg-[#CCA761] hover:text-black"
                 title="Gestao pipeline"
               >
                 <ClipboardList size={18} />
               </button>
               <button
                 onClick={() => setRightPanelMode("expanded")}
                 className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-[#CCA761] transition-colors hover:bg-[#CCA761] hover:text-black"
                 title="Etiqueta"
               >
                 <Filter size={18} />
               </button>
               <button
                 onClick={() => setRightPanelMode("expanded")}
                 className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-orange-300 transition-colors hover:bg-orange-400 hover:text-black"
                 title="Notas internas"
               >
                 <Lock size={18} />
               </button>
               {isAdmin && (
                 <button
                   onClick={() => setRightPanelMode("expanded")}
                   className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-emerald-300 transition-colors hover:bg-emerald-400 hover:text-black"
                   title="Observabilidade de midia"
                 >
                   <Zap size={18} />
                 </button>
               )}
            </div>
         )}

         {activeContact && rightPanelMode === "expanded" && (
            <div className="h-full overflow-y-auto no-scrollbar p-8 space-y-8 animate-in slide-in-from-right-4 duration-500">
               {/* Header Perfil */}
                <div className="flex flex-col items-center">
                   <div className="w-28 h-28 rounded-full border-2 border-[#CCA761] bg-gray-200 dark:bg-black p-1 mb-5 relative group">
                     {activeContact.profile_pic_url ? (
                        <img src={activeContact.profile_pic_url} alt="" className="w-full h-full object-cover rounded-full" />
                     ) : (
                        <div className="w-full h-full rounded-full flex items-center justify-center text-3xl font-black text-[#CCA761]">
                           {activeContact.name?.substring(0, 2).toUpperCase()}
                        </div>
                     )}
                     <div className="absolute bottom-2 right-2 w-5 h-5 bg-[#25D366] rounded-full border-4 border-[#050505] shadow-[0_0_10px_#22c55e]" />
                  </div>
                   <h3 className="text-2xl font-bold text-white text-center italic group-hover:text-[#CCA761] transition-colors">{activeContact.name}</h3>
                   <div className="bg-[#CCA761]/10 border border-[#CCA761]/20 text-[#CCA761] px-4 py-1.5 rounded-full text-[9px] font-black uppercase mt-3 tracking-widest">{serviceStatusLabel}</div>
                </div>

                {isAdmin && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-gray-500 font-black uppercase text-[10px] tracking-widest">
                        <Zap size={14} className="text-emerald-300" /> Observabilidade Midia
                      </div>
                      <button
                        onClick={loadMediaObservability}
                        disabled={isLoadingMediaObservability}
                        className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-gray-400 transition-colors hover:border-emerald-300/40 hover:text-emerald-200 disabled:opacity-40"
                      >
                        {isLoadingMediaObservability ? "Atualizando" : "Atualizar"}
                      </button>
                    </div>
                    <div className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.04] p-5 space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-white/5 bg-[#111] p-3">
                          <span className="block text-[8px] font-black uppercase tracking-widest text-gray-600">Pendentes</span>
                          <span className="text-lg font-black text-white">{mediaObservability?.metrics.pending_media ?? 0}</span>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-[#111] p-3">
                          <span className="block text-[8px] font-black uppercase tracking-widest text-gray-600">Falhas</span>
                          <span className={`text-lg font-black ${(mediaObservability?.metrics.failed_media_total || 0) > 0 ? "text-red-300" : "text-emerald-300"}`}>
                            {mediaObservability?.metrics.failed_media_total ?? 0}
                          </span>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-[#111] p-3">
                          <span className="block text-[8px] font-black uppercase tracking-widest text-gray-600">Processadas 24h</span>
                          <span className="text-lg font-black text-white">{mediaObservability?.metrics.media_processed_24h ?? 0}</span>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-[#111] p-3">
                          <span className="block text-[8px] font-black uppercase tracking-widest text-gray-600">Tempo medio</span>
                          <span className="text-lg font-black text-white">{Math.round((mediaObservability?.metrics.avg_media_duration_ms || 0) / 1000)}s</span>
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/5 bg-black/40 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[8px] font-black uppercase tracking-widest text-gray-600">Ultimo batch</span>
                          <span className="text-[8px] font-bold uppercase text-gray-500">{mediaObservability?.metrics.batches_24h ?? 0} em 24h</span>
                        </div>
                        {mediaObservability?.metrics.last_batch ? (
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <span className="block text-[8px] uppercase text-gray-600">Pegou</span>
                              <strong className="text-xs text-white">{mediaObservability.metrics.last_batch.picked}</strong>
                            </div>
                            <div>
                              <span className="block text-[8px] uppercase text-gray-600">OK</span>
                              <strong className="text-xs text-emerald-300">{mediaObservability.metrics.last_batch.processed}</strong>
                            </div>
                            <div>
                              <span className="block text-[8px] uppercase text-gray-600">Falhou</span>
                              <strong className="text-xs text-red-300">{mediaObservability.metrics.last_batch.failed}</strong>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500">Nenhum batch registrado nas ultimas 24h.</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <span className="text-[8px] font-black uppercase tracking-widest text-gray-600">Eventos recentes</span>
                        {(mediaObservability?.events || []).slice(0, 4).map((event, index) => (
                          <div key={`${event.event_name}-${event.created_at}-${index}`} className="rounded-xl border border-white/5 bg-black/30 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[10px] font-black uppercase tracking-widest text-gray-300">{event.event_name.replace("whatsapp_media_", "")}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${event.status === "error" ? "bg-red-400/10 text-red-300" : "bg-emerald-400/10 text-emerald-300"}`}>{event.status}</span>
                            </div>
                            <p className="mt-1 truncate text-[10px] text-gray-500">
                              {event.provider || "mayus"} {event.kind ? `- ${event.kind}` : ""} {event.duration_ms ? `- ${Math.round(event.duration_ms / 1000)}s` : ""}
                            </p>
                            {event.error && <p className="mt-1 line-clamp-2 text-[10px] text-red-200/80">{event.error}</p>}
                          </div>
                        ))}
                        {!mediaObservability && (
                          <p className="text-xs text-gray-500">Carregando dados sanitizados de midia...</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Modulo Kanban */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-gray-500 font-black uppercase text-[10px] tracking-widest"><ClipboardList size={14} className="text-[#CCA761]" /> Gestao Pipeline</div>
                  <div className="p-5 bg-gray-200 dark:bg-black rounded-2xl border border-white/5 space-y-4">
                     <div className="grid grid-cols-1 gap-3 text-xs">
                        <div className="rounded-xl border border-white/5 bg-[#111] p-3">
                           <span className="block text-[9px] font-black uppercase tracking-widest text-gray-600 mb-1">Setor atual</span>
                           <span className="text-white font-bold">{getDepartmentName(activeContact.department_id)}</span>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-[#111] p-3">
                           <span className="block text-[9px] font-black uppercase tracking-widest text-gray-600 mb-1">Responsavel atual</span>
                           <span className="text-white font-bold">{getTeamMemberName(activeContact.assigned_user_id)}</span>
                        </div>
                     </div>
                     <div>
                        <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest block mb-2">Transferir para setor</label>
                        <select
                          value={transferDeptId}
                          onChange={(e) => setTransferDeptId(e.target.value)}
                          className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-[#CCA761]"
                        >
                           <option value="">Sem setor definido</option>
                           {departments.map((dept) => (
                             <option key={dept.id} value={dept.id}>{dept.name}</option>
                           ))}
                        </select>
                     </div>
                     <div>
                        <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest block mb-2">Transferir para pessoa</label>
                        <select
                          value={transferUserId}
                          onChange={(e) => setTransferUserId(e.target.value)}
                          className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-[#CCA761]"
                        >
                           <option value="">Fila do setor / MAYUS</option>
                           {teamMembers.map((member) => (
                             <option key={member.id} value={member.id}>
                               {member.full_name} {member.role ? `- ${member.role}` : ""}
                             </option>
                           ))}
                        </select>
                     </div>
                     <button
                       onClick={handleTransfer}
                       disabled={isTransferring || (!transferDeptId && !transferUserId)}
                       className="w-full py-3 bg-white/5 border border-white/10 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#CCA761] hover:text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                     >
                       {isTransferring ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                       Aplicar transferencia
                     </button>
                  </div>
               </div>

                <div className="space-y-4">
                   <div className="flex items-center gap-2 text-gray-500 font-black uppercase text-[10px] tracking-widest"><Filter size={14} className="text-[#CCA761]" /> Etiqueta</div>
                   <div className="p-5 bg-gray-200 dark:bg-black rounded-2xl border border-white/5 space-y-4">
                     <input
                       value={labelDraft}
                       onChange={(event) => setLabelDraft(event.target.value)}
                       placeholder="Ex: urgente, fechamento, suporte..."
                       maxLength={40}
                       className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none placeholder:text-gray-700 focus:border-[#CCA761]"
                     />
                     <div className="flex items-center gap-2">
                       {labelColorOptions.map((color) => (
                         <button
                           key={color}
                           type="button"
                           onClick={() => setLabelColorDraft(color)}
                           className={`h-7 w-7 rounded-full border transition-all ${labelColorDraft === color ? 'border-white scale-110' : 'border-white/10'}`}
                           style={{ backgroundColor: color }}
                           aria-label={`Usar cor ${color}`}
                         />
                       ))}
                     </div>
                     <button
                       onClick={handleSaveContactLabel}
                       disabled={isConversationActionPending}
                       className="w-full py-3 bg-white/5 border border-white/10 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#CCA761] hover:text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                     >
                       {isConversationActionPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                       Salvar etiqueta
                     </button>
                   </div>
                </div>

               <div className="space-y-4">
                  <div className="flex items-center gap-2 text-gray-500 font-black uppercase text-[10px] tracking-widest"><Lock size={14} className="text-orange-400" /> Notas internas</div>
                  <div className="p-5 bg-gray-200 dark:bg-black rounded-2xl border border-white/5 space-y-4">
                    <div className="max-h-44 overflow-y-auto no-scrollbar space-y-3 pr-1">
                      {internalNotes.length > 0 ? internalNotes.slice(-5).map((note) => (
                        <div key={note.id} className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-3">
                          <p className="text-xs leading-relaxed text-orange-50 whitespace-pre-wrap">{note.content}</p>
                          <span className="mt-2 block text-[8px] font-black uppercase tracking-widest text-orange-400/70">{formatTime(note.created_at)}</span>
                        </div>
                      )) : (
                        <p className="text-xs leading-relaxed text-gray-500">Nenhuma nota interna registrada para esta conversa.</p>
                      )}
                    </div>
                    <textarea
                      value={sideNoteText}
                      onChange={(event) => setSideNoteText(event.target.value)}
                      placeholder="Adicionar contexto interno, dados do lead, combinado ou alerta..."
                      rows={3}
                      className="w-full resize-none rounded-xl border border-white/10 bg-[#111] px-4 py-3 text-xs text-white outline-none placeholder:text-gray-700 focus:border-orange-400/50"
                    />
                    <button
                      onClick={handleSaveSideNote}
                      disabled={isConversationActionPending || !sideNoteText.trim()}
                      className="w-full py-3 bg-orange-500/10 border border-orange-500/25 text-orange-200 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-orange-500 hover:text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isConversationActionPending ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                      Salvar nota
                    </button>
                  </div>
               </div>

                {/* Acoes rapidas */}
               <div className="space-y-3">
                  <button
                    onClick={handleToggleHumanAgent}
                    disabled={isConversationActionPending}
                    className="w-full py-5 bg-[#CCA761] border border-[#CCA761]/20 text-black rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:scale-105 transition-all shadow-[0_0_20px_rgba(204,167,97,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                     {isConversationActionPending ? (
                       <Loader2 className="animate-spin" size={16} />
                     ) : activeContact.assigned_user_id === profile?.id ? (
                       <Bot size={16} />
                     ) : (
                       <UserCheck size={16} />
                     )}
                     {activeContact.assigned_user_id === profile?.id ? "Voltar para MAYUS" : "Assumir conversa"}
                  </button>
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
                  <button
                    onClick={() => toast.info("Dossie completo sera aberto quando o contato estiver vinculado a um cliente/processo.")}
                    className="w-full py-5 bg-white/5 border border-white/10 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-white/10 transition-all group"
                  >
                     <FileText size={16} className="group-hover:-rotate-6 transition-transform" /> Dossie Completo
                  </button>
                  <button
                    onClick={handleResolveConversation}
                    disabled={isConversationActionPending}
                    className="w-full py-5 bg-gray-200 dark:bg-black border border-red-500/20 text-red-500 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                     <X size={16} /> Encerrar Caso
                  </button>
               </div>
            </div>
         )}
      </div>

      {/* Modal de transferencia de atendimento */}
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
                  <option value="">- Selecione o departamento -</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-[#CCA761] mb-2 block">
                  <Users size={12} className="inline mr-1" /> Agente Responsavel
                </label>
                <select
                  value={transferUserId}
                  onChange={(e) => setTransferUserId(e.target.value)}
                  className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#CCA761]/50 appearance-none"
                >
                  <option value="">- Selecione o agente -</option>
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
