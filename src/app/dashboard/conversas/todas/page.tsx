"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  Search, ChevronDown, MoreVertical, Phone, Mail, Send, Paperclip,
  Smile, User, MessageCircle, Bot, Lock, CheckCircle2,
  MapPin, Briefcase, Zap, Info, Filter, FileText, Mic, Clock, Plus, X,
  Loader2, LayoutPanelLeft, Users, UserCheck, ClipboardList, Building2, Share2, Tag
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
  if (!nextMessage?.id && !nextEvolutionId) return current;

  const alreadyExists = current.some((message) => (
    (nextMessage?.id && message.id === nextMessage.id)
    || (nextEvolutionId && message.message_id_from_evolution === nextEvolutionId)
  ));

  if (alreadyExists) return current;
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
  const normalized = tag.toLowerCase();
  if (/urgente|prazo|risco/.test(normalized)) return TAG_COLORS[0];
  if (/documento|aguardando/.test(normalized)) return TAG_COLORS[1];
  if (/contrato|honorario|valor/.test(normalized)) return TAG_COLORS[2];
  if (/novo|lead/.test(normalized)) return TAG_COLORS[3];
  return TAG_COLORS[index % TAG_COLORS.length];
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

export default function TodasConversasPage() {
  const { profile } = useUserProfile();
  const supabase = useMemo(() => createClient(), []);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState("minhas");
  const [inputMode, setInputMode] = useState("responder");
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showSignature, setShowSignature] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sideNoteText, setSideNoteText] = useState("");
  const [leadTagInput, setLeadTagInput] = useState("");
  const [localLeadTags, setLocalLeadTags] = useState<Record<string, string[]>>({});
  const [isSavingLeadTags, setIsSavingLeadTags] = useState(false);
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados de Audio
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
  const [departments, setDepartments] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [transferDeptId, setTransferDeptId] = useState("");
  const [transferUserId, setTransferUserId] = useState("");
  const [isConversationActionPending, setIsConversationActionPending] = useState(false);
  const tenantId = profile?.tenant_id;

  useEffect(() => {
    try {
      const rawTags = window.localStorage.getItem("mayus_all_conversations_lead_tags");
      if (rawTags) setLocalLeadTags(JSON.parse(rawTags));
    } catch {
      setLocalLeadTags({});
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("mayus_all_conversations_lead_tags", JSON.stringify(localLeadTags));
    } catch {
      // localStorage is only a fallback cache.
    }
  }, [localLeadTags]);

  // 1. Carregar configuracoes e contatos iniciais
  const fetchContacts = useCallback(async () => {
     if (!tenantId) return;

     const { data, error } = await supabase
       .from("whatsapp_contacts")
       .select("*")
       .eq("tenant_id", tenantId)
       .order("last_message_at", { ascending: false });

     if (data) {
        setContacts(data);
        setActiveContact((current) => {
          if (data.length === 0) return null;
          if (!current) return data[0];
          return data.find((contact) => contact.id === current.id) || data[0];
        });
     }
  }, [supabase, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    void fetchContacts();
  }, [fetchContacts, tenantId]);

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`all_conversations_contacts_${tenantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_contacts", filter: `tenant_id=eq.${tenantId}` },
        () => {
          void fetchContacts();
        }
      )
      .subscribe();

    const intervalId = window.setInterval(() => {
      void fetchContacts();
    }, 2500);

    return () => {
      window.clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [fetchContacts, supabase, tenantId]);

  useEffect(() => {
    if (!tenantId) return;

    const loadRoutingData = async () => {
      const [{ data: depts }, { data: members }] = await Promise.all([
        supabase.from("departments").select("id, name, color").eq("tenant_id", tenantId).order("name"),
        supabase
          .from("profiles")
          .select("id, full_name, role, department_id")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("full_name"),
      ]);

      if (depts) setDepartments(depts);
      if (members) setTeamMembers(members);
    };

    void loadRoutingData();
  }, [supabase, tenantId]);

  useEffect(() => {
    setTransferDeptId(activeContact?.department_id || "");
    setTransferUserId(activeContact?.assigned_user_id || "");
  }, [activeContact?.id, activeContact?.department_id, activeContact?.assigned_user_id]);

  const getLeadTagsForContact = (contact: any) => {
    if (!contact?.id) return [];
    const persistedTags = normalizeLeadTags(contact.lead_tags);
    return persistedTags.length > 0 ? persistedTags : normalizeLeadTags(localLeadTags[contact.id]);
  };

  const activeLeadTags = activeContact ? getLeadTagsForContact(activeContact) : [];

  // 2. Carregar Mensagens do Contato Ativo
  useEffect(() => {
    if (!tenantId || !activeContact) return;

    const fetchMessages = async () => {
       const { data } = await supabase
         .from("whatsapp_messages")
         .select("*")
         .eq("tenant_id", tenantId)
         .eq("contact_id", activeContact.id)
         .order("created_at", { ascending: true });

       if (data) {
          const tagMessages = data.filter((message) => message.message_type === LEAD_TAG_MESSAGE_TYPE);
          const latestTagMessage = tagMessages[tagMessages.length - 1];
          const tagsFromHistory = parseLeadTagsMessage(latestTagMessage);

          if (tagsFromHistory.length > 0) {
            setLocalLeadTags((current) => ({ ...current, [activeContact.id]: tagsFromHistory }));
            setActiveContact((current) => (
              current?.id === activeContact.id ? { ...current, lead_tags: tagsFromHistory } : current
            ));
          }

          setMessages(sortMessagesByCreatedAt(data.filter((message) => message.message_type !== LEAD_TAG_MESSAGE_TYPE)));
          scrollToBottom();
       }
    };

    fetchMessages();

    // 3. OUVINTE SUPABASE REALTIME (Magia Cortex)
    const channel = supabase
       .channel(`chat_${activeContact.id}`)
       .on(
         "postgres_changes",
         { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `contact_id=eq.${activeContact.id}` },
         (payload) => {
           if (payload.new?.message_type === LEAD_TAG_MESSAGE_TYPE) {
             const tagsFromHistory = parseLeadTagsMessage(payload.new);
             if (tagsFromHistory.length > 0) {
               setLocalLeadTags((current) => ({ ...current, [activeContact.id]: tagsFromHistory }));
               setActiveContact((current) => (
                 current?.id === activeContact.id ? { ...current, lead_tags: tagsFromHistory } : current
               ));
             }
             return;
           }
           setMessages((current) => mergeMessage(current, payload.new));
           if (payload.new?.direction === "inbound") {
             setShowTypingIndicator(true);
             setTimeout(() => setShowTypingIndicator(false), 2600);
           }
           scrollToBottom();
         }
       )
       .subscribe();

    const intervalId = window.setInterval(() => {
      void fetchMessages();
    }, 1500);

    return () => {
      window.clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [activeContact, supabase, tenantId]);

  useEffect(() => {
    if (activeContact) return;
    setMessages([]);
    setShowTypingIndicator(false);
  }, [activeContact]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const internalNotes = messages.filter((message) => (
    message.message_type !== LEAD_TAG_MESSAGE_TYPE
    && (message.message_type === "internal_note" || message.status === "internal_note")
  ));

  const serviceStatusLabel = activeContact?.assigned_user_id
    ? activeContact.assigned_user_id === profile?.id
      ? "Atendimento humano"
      : "Com responsavel"
    : "MAYUS atendendo";

  // 4. Logica de audio (realtime rec)
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
      console.error("Erro real de microfone, iniciando modo simulacao:", err);
      // Fallback de simulacao para teste de UI
      setIsRecording(true);
      setRecordingDuration(0);
      toast.info("Modo simulacao: usando hardware virtual para teste de UI");
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
      toast.info("Selecione um contato para enviar o audio.");
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

      if (!response.ok) throw new Error("Erro ao enviar audio");
      toast.success("Audio enviado com sucesso.");
      fetchContacts();
    } catch (e: any) {
      toast.error("Falha ao enviar audio: " + e.message);
    } finally {
      setIsSending(false);
    }
  };

  // 5. DISPARO DA ARMA (Enviar mensagem via Servidor MAYUS)
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

  const handleSendMessage = async () => {
    if (isSending) return;

    const messageBody = inputText.trim();

    if (inputMode === "nota") {
      if (!messageBody) return;

      if (!activeContact || !tenantId) {
        toast.info("Selecione uma conversa real para salvar a nota interna.");
        return;
      }

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

    // Assinatura oficial: somente o nome em negrito no topo.
    const signature = showSignature ? `*${profile?.full_name || 'Equipe MAYUS'}*\n\n` : "";
    const textToSend = signature + messageBody;

    // Modo simulacao liberado para teste
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
      toast.success("Mensagem simulada com sucesso.");
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

       setMessages((current) => {
         const localMessage = {
           id: `local-outbound-${Date.now()}`,
           tenant_id: tenantId,
           contact_id: activeContact.id,
           direction: "outbound",
           message_type: "text",
           content: textToSend,
           status: "sent",
           created_at: new Date().toISOString(),
         };
         return current.some((message) => message.id === localMessage.id) ? current : [...current, localMessage];
       });
       scrollToBottom();
       toast.success("Disparo de ouro.");
       setSelectedFile(null); // Limpar arquivo apos envio real
       fetchContacts();
    } catch (error: any) {
       toast.error("Falha : " + error.message);
       setInputText(inputText);
    } finally {
       setIsSending(false);
    }
  };

  const handleCreateContact = async () => {
     let cleanPhone = newContactPhone.replace(/\D/g, ''); // Remover nao-numeros
     if (cleanPhone.length < 10) {
        toast.error("Insira um numero valido com DDD e Pais (Ex: 551199999999)");
        return;
     }

     // O padrao Baileys Evolution e 551199999999@s.whatsapp.net
     const fullJid = `${cleanPhone}@s.whatsapp.net`;

     // Checar se ja existe no banco
     const existente = contacts.find(c => c.phone_number === fullJid || c.phone_number === cleanPhone);
     if (existente) {
        setActiveContact(existente);
        setIsAddingContact(false);
        setNewContactPhone("");
        toast.info("Contato ja existe na sua base.");
        return;
     }

     const toastId = toast.loading("Registrando novo Lead...");

     const { data: newContact, error: insertErr } = await supabase
       .from("whatsapp_contacts")
       .insert([{
          tenant_id: profile!.tenant_id,
          phone_number: fullJid,
          name: cleanPhone // Usando o numero como nome provisorio
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
     setLocalLeadTags((current) => ({ ...current, [newContact.id]: ["Novo lead"] }));
     setIsAddingContact(false);
     setNewContactPhone("");
     setInputText((prev) => !prev ? "Ola! Aqui e da equipe MAYUS." : prev); // Helper initial message
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
      void fetchContacts();
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
        console.error("[Conversas] Falha ao persistir etiquetas:", error, fallback.error);
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

  const handleTransferConversation = async () => {
    if (!transferDeptId && !transferUserId) {
      toast.error("Escolha um setor ou uma pessoa para transferir.");
      return;
    }

    const updates: Record<string, any> = {};
    if (transferDeptId) updates.department_id = transferDeptId;
    if (transferUserId) {
      updates.assigned_user_id = transferUserId;
    } else if (transferDeptId) {
      updates.assigned_user_id = null;
    }

    await updateActiveContact(updates, "Conversa transferida.");
  };

  const getDepartmentName = (id?: string | null) => {
    if (!id) return "Sem setor";
    return departments.find((department) => department.id === id)?.name || "Setor nao encontrado";
  };

  const getTeamMemberName = (id?: string | null) => {
    if (!id) return "MAYUS";
    return teamMembers.find((member) => member.id === id)?.full_name || "Responsavel nao encontrado";
  };

  return (
    <div className={`h-[calc(100vh-6rem)] w-full flex bg-white dark:bg-[#050505] rounded-tl-3xl border-t border-l border-white/5 overflow-hidden ${montserrat.className} text-sm`}>

      {/* ----------------- PAINEL ESQUERDO (LISTA DE CONVERSAS) ----------------- */}
      <div className="w-[320px] flex-shrink-0 border-r border-white/5 bg-[#0a0a0a] flex flex-col h-full relative z-10">

        {/* Header Esquerdo */}
        <div className="p-4 border-b border-white/5 bg-white dark:bg-[#050505] flex flex-col gap-4">
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
          {contacts.map((contact) => {
            const contactTags = getLeadTagsForContact(contact);
            return (
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
                     <p className="text-gray-400 text-xs truncate">Toque para ver historico</p>
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
               </div>
            );
          })}

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
                              {activeContact ? "WhatsApp" : "Simulacao"}
                           </span>
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

                {activeContact && (
                  <div className="border-b border-white/5 bg-[#050505]/95 px-6 py-3 z-10 flex-shrink-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-[#CCA761]">
                        <Tag size={13} />
                        Etiquetas
                      </div>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                        {activeLeadTags.length > 0 ? activeLeadTags.map((tag, index) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleRemoveLeadTag(tag)}
                            className={`group flex max-w-[150px] items-center gap-1 rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-widest transition-all hover:border-red-400/60 hover:text-red-100 ${getTagClassName(tag, index)}`}
                            title="Remover etiqueta"
                          >
                            <span className="truncate">{tag}</span>
                            <X size={9} className="opacity-60 group-hover:opacity-100" />
                          </button>
                        )) : (
                          <span className="text-[10px] font-semibold text-gray-600">
                            Sem etiqueta
                          </span>
                        )}
                      </div>
                      <div className="flex w-full gap-2 sm:w-auto">
                        <input
                          value={leadTagInput}
                          onChange={(event) => setLeadTagInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleAddLeadTag();
                            }
                          }}
                          placeholder="Editar etiqueta"
                          className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/50 px-3 text-[11px] font-semibold text-white outline-none placeholder:text-gray-700 focus:border-[#CCA761]/50 sm:w-40"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddLeadTag()}
                          disabled={!leadTagInput.trim() || isSavingLeadTags}
                          className="h-9 rounded-lg bg-[#CCA761] px-3 text-black transition-all hover:bg-white disabled:opacity-40"
                          title="Adicionar etiqueta"
                        >
                          {isSavingLeadTags ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={handleMayusSuggestLeadTags}
                          disabled={isSavingLeadTags}
                          className="hidden h-9 rounded-lg border border-[#CCA761]/25 px-3 text-[8px] font-black uppercase tracking-widest text-[#CCA761] transition-all hover:bg-[#CCA761] hover:text-black disabled:opacity-40 md:block"
                        >
                          MAYUS
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Area de mensagens */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 z-10 scroll-smooth">
                   {activeContact && messages.length === 0 && (
                      <div className="flex justify-center my-10 animate-fade-in-up">
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
                                 {activeContact.name ? activeContact.name.substring(0, 2).toUpperCase() : "WA"}
                              </div>
                           )}

                           <div className={`flex flex-col gap-1 ${isInternalNote ? 'max-w-[76%] items-center' : `max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}`}>
                              <div className={`p-3 rounded-2xl text-sm tracking-normal shadow-md ${
                                 isInternalNote
                                 ? 'bg-orange-500/10 text-orange-100 border border-orange-500/30 rounded-xl'
                                 : isMe
                                 ? 'bg-[#CCA761] text-black font-medium border border-[#b89552] rounded-tr-sm'
                                 : 'bg-[#1a1a1a] border border-white/5 text-gray-200 rounded-tl-sm'
                              }`}>
                                 {isInternalNote && (
                                   <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-orange-400 mb-2">
                                     <Lock size={12} /> Nota interna
                                   </div>
                                 )}
                                 {renderWhatsAppContent(msg.content)}
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
                  {(showTypingIndicator || isSending) && (
                    <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2">
                      <div className="rounded-2xl rounded-tl-sm border border-white/5 bg-[#1a1a1a] px-4 py-3 text-gray-300 shadow-md">
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
                                placeholder={inputMode === "nota" ? "Escreva uma nota interna..." : "Digite sua mensagem..."}
                                className="flex-1 bg-transparent border-none text-white text-[13px] px-3 py-2 outline-none resize-none min-h-[42px] max-h-[150px] placeholder:text-gray-700 transition-all font-medium scrollbar-none"
                              />

                              {/* Preview da Assinatura Minimalista */}
                              {showSignature && inputMode === "responder" && (
                                <div className="absolute bottom-1 right-[115px] pointer-events-none opacity-30 hidden sm:block">
                                   <strong className="text-[8px] font-black not-italic text-gray-400">
                                     {profile?.full_name || 'Equipe MAYUS'}
                                   </strong>
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
                                      toast.success(`Arquivo pronto para envio!`);
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
                                  <button onClick={() => toast.info("Modelos de resposta em breve")} className="text-gray-500 hover:text-[#CCA761] transition-all p-1" title="Modelos"><LayoutPanelLeft size={18} /></button>
                                </div>

                                <span className="ml-auto text-[7px] text-gray-700 font-black tracking-tighter uppercase self-center hidden sm:block">Focado na Experiencia MAYUS</span>
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
               <p className="text-gray-500 max-w-sm">Mande uma mensagem do seu celular para a Evolution API ou aguarde um lead entrar em contato para o Cortex interceptar.</p>
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
                  <span className="mt-3 rounded-full border border-[#CCA761]/20 bg-[#CCA761]/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-[#CCA761]">
                    {serviceStatusLabel}
                  </span>

                  <div className="w-full mt-6 space-y-3">
                     <div className="flex items-center gap-3 text-sm text-gray-400">
                        <Phone size={14} className="text-[#CCA761]" /> +{activeContact.phone_number.split('@')[0]}
                     </div>
                  </div>
               </div>

               <div className="p-4 space-y-4">
                  <div className="border border-[#CCA761]/20 rounded-lg bg-[#CCA761]/5 p-4 space-y-3">
                     <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 text-[#CCA761]">
                           <Tag size={16} />
                           <span className="text-[11px] font-black uppercase tracking-wider">Etiquetas do lead</span>
                        </div>
                        {isSavingLeadTags && <Loader2 size={14} className="animate-spin text-[#CCA761]" />}
                     </div>

                     <div className="flex flex-wrap gap-2">
                       {activeLeadTags.length > 0 ? activeLeadTags.map((tag, index) => (
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
                         <p className="text-xs leading-relaxed text-gray-500">Sem etiqueta ainda.</p>
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
                         className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-xs text-white outline-none placeholder:text-gray-700 focus:border-[#CCA761]/50"
                       />
                       <button
                         type="button"
                         onClick={() => handleAddLeadTag()}
                         disabled={!leadTagInput.trim() || isSavingLeadTags}
                         className="rounded-lg bg-[#CCA761] px-3 text-black transition-all hover:bg-white disabled:opacity-40"
                         title="Adicionar etiqueta"
                       >
                         <Plus size={14} />
                       </button>
                     </div>

                     <div className="flex flex-wrap gap-1.5">
                       <button
                         type="button"
                         onClick={handleMayusSuggestLeadTags}
                         disabled={isSavingLeadTags}
                         className="rounded-full border border-[#CCA761]/30 bg-[#CCA761]/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-[#CCA761] transition-all hover:bg-[#CCA761] hover:text-black disabled:opacity-40"
                       >
                         MAYUS sugerir
                       </button>
                       {DEFAULT_LEAD_TAGS.filter((tag) => !activeLeadTags.includes(tag)).slice(0, 4).map((tag) => (
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

                  <div className="border border-white/5 rounded-lg bg-white dark:bg-[#050505] p-4 space-y-4">
                     <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 text-gray-300">
                           <Briefcase size={16} className="text-[#CCA761]" />
                           <span className="text-[11px] font-black uppercase tracking-wider">Kanban (CRM)</span>
                        </div>
                        <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest">Ativo</span>
                     </div>

                     <div className="grid grid-cols-1 gap-3 text-xs">
                        <div className="rounded-lg border border-white/5 bg-black/40 p-3">
                           <span className="block text-[9px] font-black uppercase tracking-widest text-gray-600 mb-1">Setor</span>
                           <span className="text-white font-bold">{getDepartmentName(activeContact.department_id)}</span>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/40 p-3">
                           <span className="block text-[9px] font-black uppercase tracking-widest text-gray-600 mb-1">Responsavel</span>
                           <span className="text-white font-bold">{getTeamMemberName(activeContact.assigned_user_id)}</span>
                        </div>
                     </div>
                  </div>

                  <div className="border border-[#CCA761]/20 rounded-lg bg-[#CCA761]/5 p-4 space-y-3">
                     <div className="flex items-center gap-3 text-[#CCA761]">
                        <Zap size={16} />
                        <span className="text-[11px] font-black uppercase tracking-wider">Acoes da conversa</span>
                     </div>

                     <button
                       onClick={handleToggleHumanAgent}
                       disabled={isConversationActionPending}
                       className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#CCA761] px-3 py-3 text-[10px] font-black uppercase tracking-widest text-black transition-all hover:bg-white disabled:opacity-45 disabled:cursor-not-allowed"
                     >
                       {isConversationActionPending ? (
                         <Loader2 size={14} className="animate-spin" />
                       ) : activeContact.assigned_user_id === profile?.id ? (
                         <Bot size={14} />
                       ) : (
                         <UserCheck size={14} />
                       )}
                       {activeContact.assigned_user_id === profile?.id ? "Voltar para MAYUS" : "Assumir conversa"}
                     </button>

                     <button
                       onClick={handleResolveConversation}
                       disabled={isConversationActionPending}
                       className="w-full flex items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-300 transition-all hover:bg-emerald-500 hover:text-black disabled:opacity-45 disabled:cursor-not-allowed"
                     >
                       <CheckCircle2 size={14} />
                       Resolver
                     </button>
                  </div>

                  <div className="border border-orange-500/20 rounded-lg bg-orange-500/5 p-4 space-y-3">
                     <div className="flex items-center gap-3 text-orange-300">
                        <Lock size={16} />
                        <span className="text-[11px] font-black uppercase tracking-wider">Notas internas</span>
                     </div>

                     <div className="max-h-36 overflow-y-auto hide-scrollbar space-y-2 pr-1">
                       {internalNotes.length > 0 ? internalNotes.slice(-4).map((note) => (
                         <div key={note.id} className="rounded-lg border border-orange-500/20 bg-black/30 p-3">
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
                       className="w-full resize-none rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-xs text-white outline-none placeholder:text-gray-700 focus:border-orange-400/50"
                     />

                     <button
                       onClick={handleSaveSideNote}
                       disabled={isConversationActionPending || !sideNoteText.trim()}
                       className="w-full flex items-center justify-center gap-2 rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-orange-200 transition-all hover:bg-orange-500 hover:text-black disabled:opacity-45 disabled:cursor-not-allowed"
                     >
                       {isConversationActionPending ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                       Salvar nota
                     </button>
                  </div>

                  <div className="border border-white/5 rounded-lg bg-white dark:bg-[#050505] p-4 space-y-4">
                     <div className="flex items-center gap-3 text-gray-300">
                        <Share2 size={16} className="text-[#CCA761]" />
                        <span className="text-[11px] font-black uppercase tracking-wider">Transferir direto</span>
                     </div>

                     <div className="space-y-3">
                        <label className="block">
                           <span className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-500">
                             <Building2 size={12} /> Setor
                           </span>
                           <select
                             value={transferDeptId}
                             onChange={(event) => setTransferDeptId(event.target.value)}
                             className="w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-xs text-white outline-none transition-colors focus:border-[#CCA761]/50"
                           >
                             <option value="">Sem setor definido</option>
                             {departments.map((department) => (
                               <option key={department.id} value={department.id}>{department.name}</option>
                             ))}
                           </select>
                        </label>

                        <label className="block">
                           <span className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-500">
                             <Users size={12} /> Pessoa
                           </span>
                           <select
                             value={transferUserId}
                             onChange={(event) => setTransferUserId(event.target.value)}
                             className="w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-xs text-white outline-none transition-colors focus:border-[#CCA761]/50"
                           >
                             <option value="">Fila do setor / MAYUS</option>
                             {teamMembers.map((member) => (
                               <option key={member.id} value={member.id}>
                                 {member.full_name} {member.role ? `- ${member.role}` : ""}
                               </option>
                             ))}
                           </select>
                        </label>
                     </div>

                     <button
                       onClick={handleTransferConversation}
                       disabled={isConversationActionPending || (!transferDeptId && !transferUserId)}
                       className="w-full flex items-center justify-center gap-2 rounded-lg bg-white/5 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-300 transition-all hover:bg-[#CCA761] hover:text-black disabled:opacity-45 disabled:cursor-not-allowed"
                     >
                       {isConversationActionPending ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                       Aplicar transferencia
                     </button>
                  </div>

                  <div className="border border-white/5 rounded-lg bg-white dark:bg-[#050505] p-4 space-y-3">
                     <div className="flex items-center gap-3 text-gray-300">
                        <Info size={16} className="text-[#CCA761]" />
                        <span className="text-[11px] font-black uppercase tracking-wider">Atributos do contato</span>
                     </div>
                     <div className="space-y-2 text-xs text-gray-400">
                       <div className="flex items-center justify-between gap-3">
                         <span>Telefone</span>
                         <span className="text-white font-bold">+{activeContact.phone_number.split('@')[0]}</span>
                       </div>
                       <div className="flex items-center justify-between gap-3">
                         <span>Mensagens</span>
                         <span className="text-white font-bold">{messages.length}</span>
                       </div>
                     </div>
                  </div>

                  <button
                    onClick={() => toast.info("Dossie completo sera aberto quando o contato estiver vinculado a um cliente/processo.")}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-300 transition-all hover:border-[#CCA761]/40 hover:text-[#CCA761]"
                  >
                    <FileText size={14} />
                    Dossie completo
                  </button>
               </div>
            </>
         )}
      </div>
    </div>
  );
}
