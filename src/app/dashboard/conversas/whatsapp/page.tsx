"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { DEMO_SEED_TAG } from "@/lib/demo/demo-oab-flow";
import {
  Search, ChevronDown, ChevronLeft, ChevronRight, Phone, Send,
  MessageCircle, Bot, Lock, CheckCircle2,
  Zap, Filter, FileText, Mic, Clock, Plus, X, Smartphone, Loader2, Smile, Paperclip, MoreVertical,
  Users, UserCheck, LayoutPanelLeft, Share2, ClipboardList, Building2, Tag
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

const sortMessagesByCreatedAt = (items: any[]) => {
  return [...items].sort((a, b) => {
    const dateA = new Date(a.created_at || 0).getTime();
    const dateB = new Date(b.created_at || 0).getTime();
    return dateA - dateB;
  });
};

const mergeMessage = (current: any[], nextMessage: any) => {
  const nextEvolutionId = String(nextMessage?.message_id_from_evolution || "").trim();
  if (!nextMessage?.id && !nextEvolutionId) {
    return current;
  }

  const alreadyExists = current.some((message) => (
    (nextMessage?.id && message.id === nextMessage.id)
    || (nextEvolutionId && message.message_id_from_evolution === nextEvolutionId)
  ));

  if (alreadyExists) {
    return current;
  }

  return sortMessagesByCreatedAt([...current, nextMessage]);
};

const DEFAULT_LEAD_TAGS = ["Urgente", "Aguardando documento", "Contrato", "Novo lead", "Retornar hoje", "MAYUS atendendo"];
const LEAD_TAG_MESSAGE_TYPE = "lead_tags";
const TAG_COLORS = [
  "border-red-400/30 bg-red-500/10 text-red-200",
  "border-amber-400/30 bg-amber-500/10 text-amber-100",
  "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  "border-sky-400/30 bg-sky-500/10 text-sky-100",
  "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100",
  "border-[#CCA761]/35 bg-[#CCA761]/10 text-[#f4d991]",
];

const normalizeLeadTags = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 12)));
};

const getTagClassName = (tag: string, index = 0) => {
  const tagKey = tag.toLowerCase();
  if (/urgente|prazo|risco/.test(tagKey)) return TAG_COLORS[0];
  if (/documento|aguardando/.test(tagKey)) return TAG_COLORS[1];
  if (/contrato|honorario|valor/.test(tagKey)) return TAG_COLORS[2];
  if (/novo|lead/.test(tagKey)) return TAG_COLORS[3];
  return TAG_COLORS[index % TAG_COLORS.length];
};

const suggestLeadTags = (contact: any, messages: any[]) => {
  const text = [
    contact?.name,
    contact?.phone_number,
    ...messages.slice(-8).map((message) => message.content),
  ].join(" ").toLowerCase();
  const suggestions: string[] = [];

  if (!contact?.assigned_user_id) suggestions.push("MAYUS atendendo");
  if ((contact?.unread_count || 0) > 0) suggestions.push("Responder");
  if (/urgente|prazo|liminar|audiencia|bloqueio/.test(text)) suggestions.push("Urgente");
  if (/documento|rg|cpf|comprovante|prova|imagem/.test(text)) suggestions.push("Aguardando documento");
  if (/contrato|honorario|valor|preco|pagamento/.test(text)) suggestions.push("Contrato");
  if (/inss|beneficio|aposentadoria|previd/.test(text)) suggestions.push("Previdenciario");
  if (suggestions.length === 0) suggestions.push("Novo lead");

  return Array.from(new Set(suggestions)).slice(0, 4);
};

const parseLeadTagsMessage = (message: any) => {
  if (message?.message_type !== LEAD_TAG_MESSAGE_TYPE) return [];
  try {
    const parsed = JSON.parse(String(message.content || "{}"));
    return normalizeLeadTags(parsed.lead_tags || parsed.tags);
  } catch {
    return [];
  }
};

const renderFormattedText = (text: string, keyPrefix: string) => {
  const parts = String(text || "").split(/(\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, partIndex) => {
    const isBold = part.startsWith("*") && part.endsWith("*") && part.length > 2;
    return isBold ? (
      <strong key={`${keyPrefix}-${partIndex}`} className="font-black tracking-normal">
        {part.slice(1, -1)}
      </strong>
    ) : (
      <span key={`${keyPrefix}-${partIndex}`}>{part}</span>
    );
  });
};

const renderWhatsAppContent = (content: string) => {
  const lines = String(content || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const firstLineSignature = lines[0]?.match(/^\*([^*\n]+)\*$/);

  return lines.map((line, lineIndex) => {
    if (lineIndex === 0 && firstLineSignature) {
      return (
        <strong key="signature-line" className="mb-1 block text-[15px] font-black leading-tight tracking-normal">
          {firstLineSignature[1]}
          {lineIndex < lines.length - 1 && <br />}
        </strong>
      );
    }

    return (
      <span key={`line-${lineIndex}`}>
        {renderFormattedText(line, `line-${lineIndex}`)}
        {lineIndex < lines.length - 1 && <br />}
      </span>
    );
  });
};

type WhatsAppChatPremiumPageProps = {
  initialActiveTab?: string;
  initialFiltersOpen?: boolean;
  pageTitle?: string;
};

export default function WhatsAppChatPremiumPage({
  initialActiveTab = "minhas",
  initialFiltersOpen = true,
  pageTitle = "Conversas",
}: WhatsAppChatPremiumPageProps = {}) {
  const { profile } = useUserProfile();
  const supabase = useMemo(() => createClient(), []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoPreparedDraftContactsRef = useRef<Set<string>>(new Set());
  const activeContactIdRef = useRef<string | null>(null);
  const inputTextRef = useRef("");

  const [activeTab, setActiveTab] = useState(initialActiveTab); // minhas, aguardando, todas
  const [isFiltersOpen, setIsFiltersOpen] = useState(initialFiltersOpen);
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
  const [leadTagInput, setLeadTagInput] = useState("");
  const [localLeadTags, setLocalLeadTags] = useState<Record<string, string[]>>({});
  const [isSavingLeadTags, setIsSavingLeadTags] = useState(false);
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
  const [isExecutingMayusReply, setIsExecutingMayusReply] = useState(false);
  const [isConversationActionPending, setIsConversationActionPending] = useState(false);
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);
  const [mayusDraft, setMayusDraft] = useState<any | null>(null);
  const [contractFlowMode, setContractFlowMode] = useState<'ia_only' | 'human_only' | 'hybrid'>('hybrid');
  const [zapsignTemplateId, setZapsignTemplateId] = useState<string>("");
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);

  const tenantId = profile?.tenant_id || null;
  const profileId = profile?.id || null;
  const normalizedRole = String(profile?.role || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // Permissoes
  const isAdmin = ["administrador", "admin", "socio", "mayus_admin"].includes(normalizedRole);

  useEffect(() => {
    activeContactIdRef.current = activeContact?.id || null;
  }, [activeContact?.id]);

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  useEffect(() => {
    try {
      const rawTags = window.localStorage.getItem("mayus_whatsapp_lead_tags");
      if (rawTags) setLocalLeadTags(JSON.parse(rawTags));
    } catch {
      setLocalLeadTags({});
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("mayus_whatsapp_lead_tags", JSON.stringify(localLeadTags));
    } catch {
      // localStorage is best-effort only.
    }
  }, [localLeadTags]);

  // Carregar Departamentos e Membros
  useEffect(() => {
    if (!tenantId) return;

    const loadDeps = async () => {
      const { data: depts } = await supabase.from('departments').select('*').eq('tenant_id', tenantId).order('name');
      if (depts) setDepartments(depts);

      const { data: members } = await supabase.from('profiles').select('id, full_name, role').eq('tenant_id', tenantId).eq('is_active', true);
      if (members) setTeamMembers(members);

      // Carregar configuracoes de governanca
      const { data: settings } = await supabase.from('tenant_settings').select('ai_features').eq('tenant_id', tenantId).maybeSingle();
      if (settings?.ai_features) {
        if (settings.ai_features.contract_flow_mode) setContractFlowMode(settings.ai_features.contract_flow_mode);
        if (settings.ai_features.zapsign_template_id) setZapsignTemplateId(settings.ai_features.zapsign_template_id);
      }
    };
    loadDeps();
  }, [supabase, tenantId]);

  useEffect(() => {
    setTransferDeptId(activeContact?.department_id || "");
    setTransferUserId(activeContact?.assigned_user_id || "");
  }, [activeContact?.id, activeContact?.department_id, activeContact?.assigned_user_id]);

  const fetchContacts = useCallback(async (showLoading = true) => {
     if (showLoading) setIsLoading(true);
     if (!tenantId) {
        setContacts([]);
        setActiveContact(null);
        if (showLoading) setIsLoading(false);
        return;
     }
     let query = supabase
       .from("whatsapp_contacts")
       .select("*")
       .eq("tenant_id", tenantId)
       .order("last_message_at", { ascending: false });

     // Permissoes: SDR/Advogado ve so as suas; Admin ve tudo
     if (activeTab === "aguardando") query = query.is("assigned_user_id", null);
     else if (activeTab === "minhas") {
       query = profileId
         ? query.or(`assigned_user_id.eq.${profileId},assigned_user_id.is.null`)
         : query.is("assigned_user_id", null);
     } else if (!isAdmin) {
       query = profileId
         ? query.or(`assigned_user_id.eq.${profileId},assigned_user_id.is.null`)
         : query.is("assigned_user_id", null);
     }

     // Filtro por departamento
     if (filterDeptId) query = query.eq("department_id", filterDeptId);

     const { data } = await query;
     if (data) {
        setContacts(data);
        setActiveContact((current) => {
          if (data.length === 0) return null;
          if (!current) return data[0];
          return data.find((contact) => contact.id === current.id) || data[0];
        });
     }
     if (showLoading) setIsLoading(false);
  }, [activeTab, filterDeptId, isAdmin, profileId, supabase, tenantId]);

  // Carregar Contatos Iniciais
  useEffect(() => {
    if (!tenantId) return;
    void fetchContacts();
  }, [fetchContacts, tenantId]);

  const getLeadTagsForContact = (contact: any) => {
    if (!contact?.id) return [];
    const persistedTags = normalizeLeadTags(contact.lead_tags);
    return persistedTags.length > 0 ? persistedTags : normalizeLeadTags(localLeadTags[contact.id]);
  };

  const activeLeadTags = activeContact ? getLeadTagsForContact(activeContact) : [];
  const isDemoContact = activeLeadTags.includes(DEMO_SEED_TAG);
  const visibleActiveLeadTags = activeLeadTags.filter((tag) => tag !== DEMO_SEED_TAG);

  const handleSelectContact = (contact: any) => {
    if (contact?.id === activeContact?.id) return;
    activeContactIdRef.current = contact?.id || null;
    setActiveContact(contact);
    setMessages([]);
    setMayusDraft(null);
    setInputMode("responder");
    setInputText("");
    setSelectedFile(null);
    setShowTypingIndicator(false);
  };

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`whatsapp_contacts_${tenantId}_${profileId || "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_contacts", filter: `tenant_id=eq.${tenantId}` },
        () => {
          void fetchContacts(false);
        }
      )
      .subscribe();

    const intervalId = window.setInterval(() => {
      void fetchContacts(false);
    }, 2500);

    const handleWindowFocus = () => {
      void fetchContacts(false);
    };

    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
      supabase.removeChannel(channel);
    };
  }, [fetchContacts, supabase, tenantId, profileId]);

  // Filtro local de busca por nome/telefone
  const filteredContacts = contacts.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const tagText = getLeadTagsForContact(c).join(" ").toLowerCase();
    return (c.name || '').toLowerCase().includes(q) || (c.phone_number || '').includes(q) || tagText.includes(q);
  });

  const internalNotes = messages.filter((message) => (
    message.message_type !== LEAD_TAG_MESSAGE_TYPE
    && (message.message_type === "internal_note" || message.status === "internal_note")
  ));

  const serviceStatusLabel = activeContact?.assigned_user_id
    ? activeContact.assigned_user_id === profile?.id
      ? "Atendimento humano"
      : "Com responsavel"
    : "MAYUS atendendo";

  // Transferir Atendimento
  const handleTransfer = async () => {
    if (!activeContact || (!transferDeptId && !transferUserId)) return toast.error("Selecione um departamento ou agente.");
    if (!tenantId) return toast.error("Nao encontrei o tenant para transferir a conversa.");
    setIsTransferring(true);

    const updates: any = {};

    // Se selecionou departamento, atualiza.
    // Se transferir para departamento sem usuario, remove o assigned_user_id para cair na fila "Aguardando"
    if (transferDeptId) {
      updates.department_id = transferDeptId;
      if (!transferUserId) updates.assigned_user_id = null;
    }

    if (transferUserId) updates.assigned_user_id = transferUserId;

    const { error, data } = await supabase
      .from('whatsapp_contacts')
      .update(updates)
      .eq('tenant_id', tenantId)
      .eq('id', activeContact.id)
      .select()
      .maybeSingle();

    if (error) {
       console.error("Erro na transferencia:", error);
       toast.error('Erro: ' + error.message);
    } else if (!data) {
       toast.warning("Transferencia nao aplicada. Verifique se voce tem permissao para editar este contato.");
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
    if (!tenantId || !activeContact) return;
    const contactId = activeContact.id;

    const fetchMessages = async () => {
       const { data } = await supabase
         .from("whatsapp_messages")
         .select("*")
         .eq("tenant_id", tenantId)
         .eq("contact_id", contactId)
         .order("created_at", { ascending: true });

       if (data) {
          const tagMessages = data.filter((message) => message.message_type === LEAD_TAG_MESSAGE_TYPE);
          const latestTagMessage = tagMessages[tagMessages.length - 1];
          const tagsFromHistory = parseLeadTagsMessage(latestTagMessage);

          if (tagsFromHistory.length > 0) {
            setLocalLeadTags((current) => ({ ...current, [contactId]: tagsFromHistory }));
            setActiveContact((current) => (
              current?.id === contactId ? { ...current, lead_tags: tagsFromHistory } : current
            ));
          }

          setMessages(sortMessagesByCreatedAt(data.filter((message) => message.message_type !== LEAD_TAG_MESSAGE_TYPE)));
       }
    };

    fetchMessages();
    loadLatestMayusDraft(contactId, { prepareIfMissing: true });

    const channel = supabase
       .channel(`chat_ws_meta_${contactId}`)
       .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `contact_id=eq.${contactId}` },
         (payload) => {
           if (payload.new?.tenant_id !== tenantId) return;
           if (payload.new?.message_type === LEAD_TAG_MESSAGE_TYPE) {
             const tagsFromHistory = parseLeadTagsMessage(payload.new);
             if (tagsFromHistory.length > 0) {
               setLocalLeadTags((current) => ({ ...current, [contactId]: tagsFromHistory }));
               setActiveContact((current) => (
                 current?.id === contactId ? { ...current, lead_tags: tagsFromHistory } : current
               ));
             }
             return;
           }
           setMessages((current) => mergeMessage(current, payload.new));
           if (payload.new?.direction === "inbound") {
             setShowTypingIndicator(true);
             setTimeout(() => setShowTypingIndicator(false), 2600);
              setTimeout(() => loadLatestMayusDraft(contactId, { prepareIfMissing: true }), 1200);
           }
         }
       )
       .on("postgres_changes", { event: "UPDATE", schema: "public", table: "whatsapp_messages", filter: `contact_id=eq.${contactId}` },
         (payload) => {
           if (payload.new?.tenant_id !== tenantId) return;
           setMessages((current) => sortMessagesByCreatedAt(current.map((message) => (
             message.id === payload.new.id ? payload.new : message
           ))));
         }
       ).subscribe();

    const intervalId = window.setInterval(() => {
      void fetchMessages();
    }, 1500);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchMessages();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      supabase.removeChannel(channel);
    };
  }, [supabase, tenantId, activeContact]);

  useEffect(() => {
    if (activeContact) return;
    setMessages([]);
    setMayusDraft(null);
    setShowTypingIndicator(false);
  }, [activeContact]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, activeContact?.id]);

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const loadLatestMayusDraft = async (contactId: string, options: { prepareIfMissing?: boolean } = {}) => {
    if (!contactId) return;
    const isCurrentContact = () => activeContactIdRef.current === contactId;
    const applyDraft = (draft: any) => {
      const wasAutoSent = draft?.auto_sent === true || draft?.metadata?.auto_sent === true;
      setMayusDraft(draft);
      if (!wasAutoSent && draft?.suggested_reply && !inputTextRef.current.trim()) {
        setInputMode("responder");
        setInputText(draft.suggested_reply);
      }
    };

    try {
      const response = await fetch(`/api/whatsapp/ai-sales-reply?contact_id=${encodeURIComponent(contactId)}`);
      const data = await response.json().catch(() => null);
      if (!isCurrentContact()) return;
      if (!response.ok || !data) {
        setMayusDraft(null);
        return;
      }

      if (data.draft) {
        applyDraft(data.draft);
        return;
      }

      setMayusDraft(null);

      const autoPrepareKey = `${contactId}:${data.latest_inbound_at || "no-inbound"}`;
      if (!options.prepareIfMissing || autoPreparedDraftContactsRef.current.has(autoPrepareKey)) return;

      autoPreparedDraftContactsRef.current.add(autoPrepareKey);
      setShowTypingIndicator(true);

      const prepareResponse = await fetch('/api/whatsapp/ai-sales-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId }),
      });
      const prepared = await prepareResponse.json().catch(() => null);
      if (!isCurrentContact()) return;
      if (!prepareResponse.ok || !prepared) {
        autoPreparedDraftContactsRef.current.delete(autoPrepareKey);
        return;
      }

      applyDraft(prepared);
    } catch {
      if (isCurrentContact()) setMayusDraft(null);
    } finally {
      if (isCurrentContact()) setShowTypingIndicator(false);
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
    if (!tenantId) {
      toast.error("Nao encontrei o tenant para enviar o audio.");
      return;
    }

    setIsSending(true);
    try {
      const fileName = `${tenantId}/${activeContact.id}/${Date.now()}.webm`;
      const { data, error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('whatsapp-media').getPublicUrl(fileName);

      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          contact_id: activeContact.id,
          phone_number: activeContact.phone_number,
          audio_url: publicUrl
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
    const displayName = (signatureName || profile?.full_name || 'Equipe MAYUS').trim();
    const signature = showSignature ? `*${displayName}*\n\n` : "";
    const textToSend = signature + messageBody;

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
    setShowTypingIndicator(true);
    setInputText("");

    try {
       if (!tenantId) throw new Error("Tenant nao encontrado para enviar mensagem.");
       if (selectedFile) toast.success(`Anexo ${selectedFile.name} pronto.`);

       const response = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: tenantId, contact_id: activeContact.id, phone_number: activeContact.phone_number, text: textToSend })
       });
       const sendResult = await response.json().catch(() => ({}));
       if (!response.ok) throw new Error(sendResult?.error || "Erro no motor Meta");

       setMessages((current) => mergeMessage(current, sendResult?.message || {
          id: `local-outbound-${Date.now()}`,
          tenant_id: tenantId,
          contact_id: activeContact.id,
          direction: "outbound",
          message_type: "text",
          content: textToSend,
          status: "sent",
          created_at: new Date().toISOString(),
       }));
       scrollToBottom();
       toast.success("Mensagem disparada com sucesso.");
       setSelectedFile(null);
       fetchContacts(false);
    } catch (e: any) {
       toast.error("Falha : " + e.message);
       setInputText(inputText);
    } finally {
       setIsSending(false);
       setShowTypingIndicator(false);
    }
  };

  const handleGenerateMayusReply = async () => {
    if (!activeContact || isGeneratingMayusReply) {
      if (!activeContact) toast.info("Selecione um contato para o MAYUS preparar o atendimento.");
      return;
    }

    setIsGeneratingMayusReply(true);
    setShowTypingIndicator(true);
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
      setShowTypingIndicator(false);
    }
  };

  const handleExecuteMayusReply = async () => {
    if (!activeContact || isExecutingMayusReply) {
      if (!activeContact) toast.info("Selecione um contato demo para executar a resposta.");
      return;
    }

    const replyText = String(mayusDraft?.suggested_reply || inputText || "").trim();
    if (!replyText) {
      toast.info("Gere ou escreva uma resposta antes de executar.");
      return;
    }

    setIsExecutingMayusReply(true);
    setShowTypingIndicator(true);

    try {
      const response = await fetch("/api/whatsapp/execute-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: activeContact.id, text: replyText }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Nao consegui executar a resposta demo agora.");

      setMessages((current) => mergeMessage(current, data?.message || {
        id: `demo-outbound-${Date.now()}`,
        tenant_id: tenantId,
        contact_id: activeContact.id,
        direction: "outbound",
        message_type: "text",
        content: replyText,
        status: "sent",
        created_at: new Date().toISOString(),
        metadata: { simulated: true, source: "whatsapp_execute_reply" },
      }));
      setInputText("");
      scrollToBottom();
      toast.success("Resposta demo executada no WhatsApp.");
      void fetchContacts(false);
    } catch (error: any) {
      toast.error(error.message || "Falha ao executar resposta demo.");
    } finally {
      setIsExecutingMayusReply(false);
      setShowTypingIndicator(false);
    }
  };

  const handleCreateContact = async () => {
     if (!tenantId || !profileId) return toast.error("Nao encontrei sua sessao para criar a conversa.");
     let cleanPhone = newContactPhone.replace(/\D/g, '');
     if (cleanPhone.length < 10) return toast.error("Numero invalido.");
     const fullJid = cleanPhone;
     const { data: newContact, error } = await supabase
       .from("whatsapp_contacts")
       .insert([{ tenant_id: tenantId, phone_number: fullJid, name: cleanPhone, assigned_user_id: profileId }])
       .select().single();

     if (!error) {
        setContacts([newContact, ...contacts]);
        setActiveContact(newContact);
        setMessages([]);
        setMayusDraft(null);
        setLocalLeadTags((current) => ({ ...current, [newContact.id]: ["Novo lead"] }));
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
    if (!activeContact || !tenantId) return;

    setIsConversationActionPending(true);
    try {
      const { error, data } = await supabase
        .from("whatsapp_contacts")
        .update(updates)
        .eq("tenant_id", tenantId)
        .eq("id", activeContact.id)
        .select()
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast.warning("Atualizacao nao aplicada. Verifique se voce tem permissao para editar este contato.");
        return;
      }

      updateActiveContactLocally(updates);
      toast.success(successMessage);
      void fetchContacts();
    } catch (error: any) {
      toast.error(error.message || "Nao foi possivel atualizar a conversa.");
    } finally {
      setIsConversationActionPending(false);
    }
  };

  const saveLeadTags = async (nextTags: string[], successMessage = "Etiquetas atualizadas.") => {
    if (!activeContact || !tenantId) return;

    const normalizedTags = normalizeLeadTags(nextTags);
    const updates = {
      lead_tags: normalizedTags,
      updated_at: new Date().toISOString(),
    };

    updateActiveContactLocally(updates);
    setLocalLeadTags((current) => ({ ...current, [activeContact.id]: normalizedTags }));
    setIsSavingLeadTags(true);

    try {
      const { error, data } = await supabase
        .from("whatsapp_contacts")
        .update(updates)
        .eq("tenant_id", tenantId)
        .eq("id", activeContact.id)
        .select()
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("Update de etiquetas nao retornou o contato. Verifique RLS/permissao.");
      }
      toast.success(successMessage);
      void fetchContacts(false);
    } catch (error: any) {
      const fallback = await supabase.from("whatsapp_messages").insert([{
        tenant_id: tenantId,
        contact_id: activeContact.id,
        direction: "outbound",
        message_type: LEAD_TAG_MESSAGE_TYPE,
        content: JSON.stringify({ lead_tags: normalizedTags }),
        status: "internal_note",
      }]);

      if (fallback.error) {
        toast.warning("Etiqueta aplicada na tela, mas nao consegui persistir no banco.");
        console.error("[WhatsApp] Falha ao persistir etiquetas do lead:", error, fallback.error);
      } else {
        toast.success(successMessage);
      }
    } finally {
      setIsSavingLeadTags(false);
    }
  };

  const handleAddLeadTag = (tagValue?: string) => {
    const tag = String(tagValue ?? leadTagInput).trim();
    if (!tag || !activeContact) return;

    const nextTags = normalizeLeadTags([...activeLeadTags, tag]);
    setLeadTagInput("");
    void saveLeadTags(nextTags, "Etiqueta adicionada ao lead.");
  };

  const handleRemoveLeadTag = (tag: string) => {
    if (!activeContact) return;
    void saveLeadTags(activeLeadTags.filter((item) => item !== tag), "Etiqueta removida do lead.");
  };

  const handleMayusSuggestLeadTags = () => {
    if (!activeContact) return;
    const suggestions = suggestLeadTags(activeContact, messages);
    void saveLeadTags([...activeLeadTags, ...suggestions], "MAYUS atualizou as etiquetas do lead.");
  };

  const saveInternalNote = async (content: string) => {
    const note = content.trim();
    if (!note) return null;

    if (!activeContact || !tenantId) {
      throw new Error("Selecione uma conversa real para salvar a nota interna.");
    }

    const { data, error } = await supabase
      .from("whatsapp_messages")
      .insert([{
        tenant_id: tenantId,
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

  const handleSendZapSignContract = async () => {
    if (!activeContact || isSendingContract) return;
    if (!tenantId) return toast.error("Nao encontrei o tenant para gerar o contrato.");

    setIsSendingContract(true);
    const toastId = toast.loading("Gerando contrato na ZapSign...");

    try {
      const response = await fetch('/api/integrations/zapsign/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
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
    <div className={`-mx-4 -mb-4 h-[calc(100dvh-6rem)] min-h-[520px] w-[calc(100%+2rem)] max-w-none flex overflow-hidden rounded-tl-3xl border-t border-l border-white/5 bg-[#020104] text-sm md:-mx-8 md:-mb-8 md:h-[calc(100dvh-7rem)] md:min-h-[560px] md:w-[calc(100%+4rem)] ${montserrat.className}`}>

      {/* 1. BARRA LATERAL ESQUERDA (LISTAGEM) */}
      <div className="w-[288px] flex-shrink-0 border-r border-white/10 bg-white dark:bg-[#050505] flex flex-col h-full z-10 transition-all md:w-[300px] 2xl:w-[320px]">
        <div className="border-b border-white/10 p-5 flex flex-col gap-4">
           <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#CCA761]/10 flex items-center justify-center border border-[#CCA761]/30 shadow-[0_0_15px_rgba(204,167,97,0.1)]">
                     <MessageCircle size={18} className="text-[#CCA761]" />
                  </div>
                  <h2 className={`text-xl font-black text-white italic tracking-tighter ${cormorant.className}`}>{pageTitle}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsFiltersOpen((current) => !current)}
                  className={`rounded-lg border p-2 transition-all ${isFiltersOpen ? "border-[#CCA761]/30 bg-[#CCA761]/10 text-[#CCA761]" : "border-white/5 bg-white/5 text-gray-500 hover:text-[#CCA761]"}`}
                  title={isFiltersOpen ? "Fechar filtros" : "Abrir filtros"}
                >
                  <Filter size={16} />
                </button>
                <button onClick={() => setIsAddingContact(!isAddingContact)} className="bg-white/5 p-2 rounded-lg border border-white/5 hover:bg-[#CCA761] hover:text-black transition-all">
                   <Plus size={18} />
                </button>
              </div>
           </div>

           {isFiltersOpen ? (
             <div className="animate-in slide-in-from-top-2 flex flex-col gap-4">
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
             </div>
           ) : (
             <button
               type="button"
               onClick={() => setIsFiltersOpen(true)}
               className="flex items-center justify-between rounded-xl border border-white/5 bg-black/30 px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500 transition-all hover:border-[#CCA761]/30 hover:text-[#CCA761]"
             >
               <span>{filteredContacts.length} conversa(s) nesta visao</span>
               <ChevronDown size={14} />
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
           ) : filteredContacts.map((contact) => {
               const contactTags = getLeadTagsForContact(contact).filter((tag) => tag !== DEMO_SEED_TAG);
              return (
                <div key={contact.id} onClick={() => handleSelectContact(contact)} className={`group relative flex items-start gap-4 p-4 rounded-2xl cursor-pointer transition-all border ${activeContact?.id === contact.id ? "bg-[#111] border-[#CCA761]/30" : "hover:bg-white/5 border-transparent opacity-80 hover:opacity-100"}`}>
                   <div className="w-12 h-12 rounded-full border border-[#CCA761]/20 bg-gray-200 dark:bg-black flex flex-shrink-0 items-center justify-center text-[#CCA761] font-black shadow-inner overflow-hidden">
                       {contact.profile_pic_url ? <img src={contact.profile_pic_url} alt={contact.name || "Contato"} className="w-full h-full object-cover" /> : contact.name?.substring(0, 2).toUpperCase()}
                   </div>
                   <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                         <h4 className="font-bold truncate text-sm text-gray-200">{contact.name || contact.phone_number}</h4>
                         <span className="text-[9px] text-gray-600 font-bold uppercase">{contact.last_message_at ? formatTime(contact.last_message_at) : ''}</span>
                      </div>
                      <p className="text-gray-500 text-[10px] truncate italic font-medium">Sincronizado via Meta Cloud</p>
                      {contactTags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {contactTags.slice(0, 3).map((tag, index) => (
                            <span key={`${contact.id}-${tag}`} className={`max-w-full truncate rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-widest ${getTagClassName(tag, index)}`}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                   </div>
                   {contact.unread_count > 0 && <div className="bg-[#CCA761] text-black text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">{contact.unread_count}</div>}
                </div>
              );
           })}
        </div>
      </div>

      {/* 2. AREA DE CHAT (CENTRAL) */}
      <div className="flex-1 flex flex-col h-full bg-[#010101] relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none bg-[radial-gradient(circle_at_center,_#CCA761_0%,_transparent_80%)]" />

          <div className="flex-1 flex flex-col min-h-0">
            {(activeContact || messages.length > 0) ? (
              <>
                <div className="min-h-[84px] border-b border-white/5 flex items-center justify-between px-4 py-3 bg-[#0a0a0a]/90 backdrop-blur-3xl z-10 flex-shrink-0 md:px-6">
                    <div className="flex min-w-0 items-center gap-4">
                       <div className="h-12 w-12 rounded-full border border-[#CCA761]/50 bg-gray-200 dark:bg-black flex flex-shrink-0 items-center justify-center text-[#CCA761] font-black text-base shadow-[0_0_20px_rgba(204,167,97,0.1)] overflow-hidden">
                           {activeContact?.profile_pic_url ? <img src={activeContact.profile_pic_url} alt={activeContact?.name || "Contato ativo"} className="w-full h-full object-cover" /> : (activeContact?.name?.substring(0, 2).toUpperCase() || "TS")}
                        </div>
                        <div className="min-w-0">
                          <h2 className={`truncate text-2xl font-bold leading-none text-white tracking-wide ${cormorant.className} italic`}>
                             {activeContact?.name || activeContact?.phone_number || "Lead de Teste (Simulado)"}
                           </h2>
                          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                             <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_#22c55e]" />
                             <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border ${activeContact ? 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/20' : 'bg-[#CCA761]/10 text-[#CCA761] border-[#CCA761]/20'}`}>
                               {activeContact ? 'WhatsApp' : 'Simulacao'}
                            </span>
                            <span className="truncate text-[9px] text-gray-600 uppercase font-black tracking-widest">{serviceStatusLabel}</span>
                          </div>
                        </div>
                     </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 no-scrollbar min-h-0 md:p-6 md:gap-6 lg:p-7">
                    {messages.map((msg, idx) => {
                       const isInternalNote = msg.message_type === "internal_note" || msg.status === "internal_note";
                       const isMe = msg.direction === 'outbound' && !isInternalNote;
                       return (
                          <div key={msg.id || idx} className={`flex ${isInternalNote ? 'justify-center' : isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4`}>
                             <div className={`flex flex-col gap-2 ${isInternalNote ? 'items-center max-w-[82%] md:max-w-[72%]' : `max-w-[82%] md:max-w-[74%] xl:max-w-[66%] ${isMe ? 'items-end' : 'items-start'}`}`}>
                                <div className={`p-5 rounded-2xl text-[14px] leading-relaxed tracking-normal shadow-2xl relative border ${
                                   isInternalNote
                                   ? 'bg-orange-500/10 border-orange-500/30 text-orange-100 rounded-xl'
                                   : isMe
                                   ? 'bg-gradient-to-br from-[#CCA761] to-[#b89552] text-black font-semibold rounded-tr-sm border-[#b89552]/40'
                                   : 'bg-[#121212] border-white/10 text-gray-200 rounded-tl-sm'
                                }`}>
                                   {isInternalNote && (
                                     <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-orange-400 mb-2">
                                       <Lock size={12} /> Nota interna
                                     </div>
                                   )}
                                   {renderWhatsAppContent(msg.content)}
                                </div>
                                <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest px-2">
                                   {formatTime(msg.created_at)} {isInternalNote ? 'Somente equipe' : isMe ? '- Vitor P.' : ''}
                                </span>
                             </div>
                          </div>
                       );
                    })}
                    {(showTypingIndicator || isSending || isGeneratingMayusReply || isExecutingMayusReply) && (
                      <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2">
                        <div className="max-w-[82%] rounded-2xl rounded-tl-sm border border-white/10 bg-[#121212] px-5 py-4 text-gray-300 shadow-2xl md:max-w-[74%] xl:max-w-[66%]">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#CCA761]">
                              MAYUS digitando
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#CCA761]" />
                              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#CCA761] [animation-delay:120ms]" />
                              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#CCA761] [animation-delay:240ms]" />
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
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

          {/* COMPOSER SLIM - DESIGN ULTRA COMPACTO E FUNCIONAL */}
          <div className="p-3 bg-[#0a0a0a]/95 backdrop-blur-3xl border-t border-white/10 z-10 flex-shrink-0">
              {/* Linha Fina de Controles Superiores */}
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => { console.log('Mode: Responder'); setInputMode("responder"); }} className={`text-[9px] font-black uppercase tracking-[0.16em] relative transition-all flex items-center gap-1.5 ${inputMode === "responder" ? "text-[#CCA761]" : "text-gray-600 hover:text-gray-400"}`}>
                        <MessageCircle size={12} /> Atendimento
                        {inputMode === "responder" && <div className="absolute -bottom-1 left-0 w-full h-[1px] bg-[#CCA761]" />}
                    </button>
                    <button onClick={() => { console.log('Mode: Nota'); setInputMode("nota"); }} className={`text-[9px] font-black uppercase tracking-[0.16em] relative transition-all flex items-center gap-1.5 ${inputMode === "nota" ? "text-orange-500" : "text-gray-600 hover:text-gray-400"}`}>
                        <Lock size={12} /> Nota Interna
                        {inputMode === "nota" && <div className="absolute -bottom-1 left-0 w-full h-[1px] bg-orange-500" />}
                    </button>
                  </div>
                  <div className="flex min-w-0 items-center gap-3">
                    {showSignature && (
                      <input
                        type="text"
                        value={signatureName}
                        onChange={(e) => setSignatureName(e.target.value)}
                        placeholder={profile?.full_name || 'Seu nome'}
                        className="w-40 max-w-[44vw] bg-transparent border-b border-white/10 text-[10px] text-gray-200 px-1 py-0.5 outline-none focus:border-[#CCA761] placeholder:text-gray-700 font-black transition-colors"
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

                         {/* Barra de ferramentas inferior - organizacao solicitada */}
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

                               <button onClick={() => toast.info("Modelos de resposta em breve")} className="text-gray-500 hover:text-[#CCA761] transition-all p-1" title="Modelos de Resposta"><LayoutPanelLeft size={18} /></button>
                             </div>

                             <span className="ml-auto text-[7px] text-gray-700 font-black tracking-tighter uppercase self-center hidden sm:block">Gerado pelo Cortex MAYUS</span>
                         </div>
                      </div>
                  )}
              </div>
          </div>
      </div>

      {/* 3. INFO E KANBAN (BARRA DIREITA) */}
      <div className={`${isRightPanelCollapsed ? "w-[56px]" : "w-[292px] 2xl:w-[320px]"} flex-shrink-0 border-l border-white/10 bg-white dark:bg-[#050505] flex flex-col h-full z-10 overflow-hidden transition-all duration-300`}>
        <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-white/10 px-3">
          {!isRightPanelCollapsed && (
            <div className="min-w-0">
              <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-[#CCA761]">Painel</span>
              <span className="block truncate text-[10px] font-bold uppercase tracking-widest text-gray-600">Atendimento</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsRightPanelCollapsed((current) => !current)}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-400 transition-all hover:border-[#CCA761]/40 hover:text-[#CCA761]"
            title={isRightPanelCollapsed ? "Abrir painel direito" : "Recuar painel direito"}
          >
            {isRightPanelCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        {isRightPanelCollapsed ? (
          <div className="flex flex-1 flex-col items-center gap-4 py-5">
            <button type="button" onClick={() => setIsRightPanelCollapsed(false)} className="rounded-xl border border-[#CCA761]/25 bg-[#CCA761]/10 p-3 text-[#CCA761]" title="Abrir MAYUS">
              <Bot size={18} />
            </button>
            <button type="button" onClick={() => setIsRightPanelCollapsed(false)} className="rounded-xl border border-white/10 bg-white/5 p-3 text-gray-400" title="Abrir notas">
              <Lock size={18} />
            </button>
            <button type="button" onClick={() => setIsRightPanelCollapsed(false)} className="rounded-xl border border-white/10 bg-white/5 p-3 text-gray-400" title="Abrir etiquetas">
              <Tag size={18} />
            </button>
          </div>
        ) : activeContact ? (
          <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
            <div className="flex min-h-full flex-col p-5 animate-in slide-in-from-right-4 duration-500">
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full border-2 border-[#CCA761] bg-gray-200 dark:bg-black p-1 mb-4 relative group">
                  {activeContact.profile_pic_url ? (
                    <img src={activeContact.profile_pic_url} alt={activeContact.name || "Contato ativo"} className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <div className="w-full h-full rounded-full flex items-center justify-center text-2xl font-black text-[#CCA761]">
                      {activeContact.name?.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute bottom-1.5 right-1.5 w-4 h-4 bg-[#25D366] rounded-full border-4 border-[#050505] shadow-[0_0_10px_#22c55e]" />
                </div>
                <h3 className="text-lg font-bold text-white text-center italic group-hover:text-[#CCA761] transition-colors">{activeContact.name}</h3>
                <div className="bg-[#CCA761]/10 border border-[#CCA761]/20 text-[#CCA761] px-4 py-1.5 rounded-full text-[9px] font-black uppercase mt-3 tracking-widest">{serviceStatusLabel}</div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-2 text-gray-500 font-black uppercase text-[10px] tracking-widest"><ClipboardList size={14} className="text-[#CCA761]" /> Gestao Pipeline</div>
                <div className="p-4 bg-gray-200 dark:bg-black rounded-2xl border border-white/5 space-y-3">
                  <div className="rounded-xl border border-white/5 bg-[#111] p-3 text-xs">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-gray-600 mb-1">Setor atual</span>
                    <span className="text-white font-bold">{getDepartmentName(activeContact.department_id)}</span>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-[#111] p-3 text-xs">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-gray-600 mb-1">Responsavel atual</span>
                    <span className="text-white font-bold">{getTeamMemberName(activeContact.assigned_user_id)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-auto space-y-5 border-t border-white/10 pt-5">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-gray-500 font-black uppercase text-[10px] tracking-widest"><Lock size={14} className="text-orange-400" /> Notas internas</div>
                  <div className="p-4 bg-gray-200 dark:bg-black rounded-2xl border border-white/5 space-y-4">
                    <div className="max-h-36 overflow-y-auto no-scrollbar space-y-3 pr-1">
                      {internalNotes.length > 0 ? internalNotes.slice(-4).map((note) => (
                        <div key={note.id} className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-3">
                          <p className="text-xs leading-relaxed text-orange-50">{renderWhatsAppContent(note.content)}</p>
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

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-gray-500 font-black uppercase text-[10px] tracking-widest">
                    <Tag size={14} className="text-[#CCA761]" /> Etiquetas do lead
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-gray-200 p-4 dark:bg-black">
                    <div className="mb-4 flex flex-wrap gap-2">
                      {visibleActiveLeadTags.length > 0 ? visibleActiveLeadTags.map((tag, index) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleRemoveLeadTag(tag)}
                          className={`flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest transition-all hover:border-red-400/50 hover:text-red-100 ${getTagClassName(tag, index)}`}
                          title="Remover etiqueta"
                        >
                          <span className="truncate">{tag}</span>
                          <X size={10} />
                        </button>
                      )) : (
                        <p className="text-xs leading-relaxed text-gray-500">Sem etiqueta ainda. Use uma sugestao do MAYUS ou crie uma manualmente.</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        value={leadTagInput}
                        onChange={(event) => setLeadTagInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleAddLeadTag();
                          }
                        }}
                        placeholder="Nova etiqueta"
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#111] px-3 py-2 text-xs text-white outline-none placeholder:text-gray-700 focus:border-[#CCA761]/50"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddLeadTag()}
                        disabled={!leadTagInput.trim() || isSavingLeadTags}
                        className="rounded-xl bg-[#CCA761] px-3 text-black transition-all hover:bg-white disabled:opacity-40"
                        title="Adicionar etiqueta"
                      >
                        {isSavingLeadTags ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={handleMayusSuggestLeadTags}
                        disabled={isSavingLeadTags}
                        className="rounded-full border border-[#CCA761]/30 bg-[#CCA761]/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-[#CCA761] transition-all hover:bg-[#CCA761] hover:text-black disabled:opacity-40"
                      >
                        MAYUS sugerir
                      </button>
                      {DEFAULT_LEAD_TAGS.filter((tag) => !activeLeadTags.includes(tag)).slice(0, 5).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleAddLeadTag(tag)}
                          disabled={isSavingLeadTags}
                          className="rounded-full border border-white/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-gray-500 transition-all hover:border-[#CCA761]/40 hover:text-[#CCA761] disabled:opacity-40"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-gray-500 font-black uppercase text-[10px] tracking-widest">
                    <CheckCircle2 size={14} className="text-[#CCA761]" /> Acoes do atendimento
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-gray-200 p-4 dark:bg-black space-y-2.5">
                    <button
                      onClick={handleMayusControl}
                      disabled={(isGeneratingMayusReply || isConversationActionPending) || !activeContact}
                      className="w-full rounded-xl border border-[#CCA761]/25 bg-[#CCA761]/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#CCA761] transition-all hover:bg-[#CCA761] hover:text-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {(isGeneratingMayusReply || isConversationActionPending) ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                      {activeContact.assigned_user_id === profile?.id ? "Voltar MAYUS" : "MAYUS responder"}
                    </button>
                    <button
                      onClick={() => setShowTransferModal(true)}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-gray-300 transition-all hover:border-[#CCA761]/40 hover:text-[#CCA761] flex items-center justify-center gap-2"
                    >
                      <Share2 size={14} /> Transferir
                    </button>
                    <button
                      onClick={handleResolveConversation}
                      disabled={isConversationActionPending}
                      className="w-full rounded-xl bg-[#CCA761] px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-black transition-all hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isConversationActionPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Resolver
                    </button>
                    <button
                      onClick={handleToggleHumanAgent}
                      disabled={isConversationActionPending}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-gray-300 transition-all hover:border-[#CCA761]/40 hover:text-[#CCA761] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {activeContact.assigned_user_id === profile?.id ? <Bot size={14} /> : <UserCheck size={14} />}
                      {activeContact.assigned_user_id === profile?.id ? "Voltar MAYUS" : "Assumir"}
                    </button>
                    {isDemoContact && (
                      <button
                        onClick={handleExecuteMayusReply}
                        disabled={isExecutingMayusReply || (!mayusDraft?.suggested_reply && !inputText.trim())}
                        className="w-full rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100 transition-all hover:bg-emerald-400 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isExecutingMayusReply ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        Executar demo
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-gray-500 font-black uppercase text-[10px] tracking-widest">
                    <Zap size={14} className="text-[#CCA761]" /> Automacoes
                  </div>
                  {contractFlowMode !== 'ia_only' && (
                    <button
                      onClick={handleSendZapSignContract}
                      disabled={isSendingContract}
                      className="w-full py-4 bg-[#CCA761] border border-[#CCA761]/20 text-black rounded-2xl font-black uppercase text-[10px] tracking-[0.16em] flex items-center justify-center gap-3 hover:scale-105 transition-all shadow-[0_0_20px_rgba(204,167,97,0.2)] disabled:opacity-50"
                    >
                      {isSendingContract ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                      Gerar Contrato
                    </button>
                  )}
                  <button
                    onClick={() => toast.info("Dossie completo sera aberto quando o contato estiver vinculado a um cliente/processo.")}
                    className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl font-black uppercase text-[10px] tracking-[0.16em] flex items-center justify-center gap-3 hover:bg-white/10 transition-all group"
                  >
                    <FileText size={16} className="group-hover:-rotate-6 transition-transform" /> Dossie Completo
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-5 text-center text-xs font-bold uppercase tracking-widest text-gray-600">
            Selecione uma conversa
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
