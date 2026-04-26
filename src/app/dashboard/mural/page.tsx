"use client";

import { useState, useEffect, useCallback } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { Send, EyeOff, Eye, Sparkles, MessageSquare, AlertTriangle, User, Loader2, Quote, ThumbsUp, ThumbsDown, Pin, Smile } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

interface Feedback {
  id: string;
  content: string;
  is_anonymous: boolean;
  sentiment: string | null;
  created_at: string;
  user_id: string;
  liked_by?: string[];
  disliked_by?: string[];
  profiles?: any;
}

export default function MuralFeedbacksPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [input, setInput] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [apiKeyData, setApiKeyData] = useState<{ provider: string, model: string } | null>(null);

  const supabase = createClient();
  const { profile, user, isLoading: profileLoading } = useUserProfile();

  const loadBrainStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/brain/status", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao carregar status do cerebro.");
      }

      if (data?.configured && data?.default_provider && data?.default_model) {
        setApiKeyData({
          provider: String(data.default_provider),
          model: String(data.default_model),
        });
      } else {
        setApiKeyData(null);
      }
    } catch (error) {
      console.error(error);
      setApiKeyData(null);
    }
  }, []);

  const loadFeedbacks = useCallback(async () => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const { data: fbData, error } = await supabase
        .from("mural_feedbacks")
        .select("*")
        .gte("created_at", yesterday.toISOString())
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro ao buscar feedbacks:", error);
        return;
      }

      if (fbData) {
        setFeedbacks(fbData as any[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetching(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!profileLoading) {
      if (profile?.tenant_id) {
        void loadBrainStatus();
        void loadFeedbacks();
      } else {
        setIsFetching(false);
      }
    }
  }, [profile?.tenant_id, profileLoading, loadBrainStatus, loadFeedbacks]);

  useEffect(() => {
    // Realtime channel
    const channel = supabase
      .channel('realtime_mural_feedbacks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mural_feedbacks' },
        () => {
          void loadFeedbacks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadFeedbacks, supabase]);

  const calculateTimeLeft = (createdAt: string) => {
    const expiresAt = new Date(createdAt);
    expiresAt.setDate(expiresAt.getDate() + 1);
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();

    if (diff <= 0) return "Expirado";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h restantes`;
    return `${mins}m restantes`;
  };

  const handlePost = async () => {
    if (!input.trim()) return;
    if (!profile?.tenant_id || !user?.id) {
        toast.error("Sua sessÃ£o nÃ£o estÃ¡ ativa.");
        return;
    }

    setIsLoading(true);

    try {
      let isApproved = true;
      let sentiment = "neutral";

      // Fase 1: ModeraÃ§Ã£o da IA
      if (apiKeyData) {
         toast.info("A IA GuardiÃ£ estÃ¡ revisando seu texto...");
         const res = await fetch("/api/ai/mural-moderator", {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({
             content: input,
             provider: apiKeyData.provider,
             model: apiKeyData.model
            })
          });

         if (res.ok) {
           const modData = await res.json();
           isApproved = modData.isApproved;
           sentiment = modData.sentiment;
           if (!isApproved) {
             toast.error(`Bloqueado pela IA: ${modData.reason || "ConteÃºdo imprÃ³prio para o ambiente de trabalho."}`, {
                duration: 6000,
             });
             setIsLoading(false);
             return; // Barra o envio
           }
         }
      } else {
         toast.warning("Nenhuma inteligÃªncia conectada para moderar. Postando diretamente (Risco de ambiente).");
      }

      // Fase 2: InserÃ§Ã£o no Banco
      const { error } = await supabase
        .from("mural_feedbacks")
        .insert({
          tenant_id: profile.tenant_id,
          user_id: user.id,
          content: input.trim(),
          is_anonymous: isAnonymous,
          sentiment: sentiment
        });

      if (error) throw error;

       toast.success("Feedback postado no Mural!");
       setInput("");
       setIsAnonymous(false);
       void loadFeedbacks();

    } catch (err: any) {
      toast.error(err.message || "Erro ao postar.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVote = async (feedbackId: string, type: 'like' | 'dislike') => {
    if (!user) return;

    const feedback = feedbacks.find(f => f.id === feedbackId);
    if (!feedback) return;

    let likedBy = feedback.liked_by || [];
    let dislikedBy = feedback.disliked_by || [];

    // Remover voto antigo se existir
    likedBy = likedBy.filter(id => id !== user.id);
    dislikedBy = dislikedBy.filter(id => id !== user.id);

    // Adicionar novo voto
    if (type === 'like' && !(feedback.liked_by || []).includes(user.id)) {
      likedBy.push(user.id);
    } else if (type === 'dislike' && !(feedback.disliked_by || []).includes(user.id)) {
      dislikedBy.push(user.id);
    }

    // Otimista UI
    setFeedbacks(prev => prev.map(f => f.id === feedbackId ? { ...f, liked_by: likedBy, disliked_by: dislikedBy } : f));

    // Persistir no banco
    await supabase.from("mural_feedbacks").update({
      liked_by: likedBy,
      disliked_by: dislikedBy
    }).eq("id", feedbackId);
  };

  return (
    <div className={`w-full max-w-6xl mx-auto space-y-8 pb-24 px-4 ${montserrat.className}`}>

      {/* Header Premium */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end pb-8 border-b border-[#CCA761]/20 relative z-40 gap-8">
        <div>
          <h1 className={`text-5xl lg:text-7xl text-[#CCA761] mb-1 font-bold tracking-tight ${cormorant.className} italic drop-shadow-[0_0_20px_rgba(204,167,97,0.3)] flex items-center gap-4`}>
             <MessageSquare size={48} className="text-[#CCA761]" /> O Mural
          </h1>
          <div className="mt-6 relative bg-gradient-to-r from-[#CCA761]/15 via-transparent to-transparent pl-6 py-4 border-l-[4px] border-[#CCA761] max-w-3xl overflow-hidden group rounded-r-2xl">
             <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
             <p className={`text-[#eadd87] text-xl lg:text-3xl font-semibold tracking-wide ${cormorant.className} italic drop-shadow-md leading-relaxed`}>
                &ldquo;Tudo que Ã© escrito aqui se autodestrÃ³i em 24 horas. Seja transparente. Seja Ã©tico.&rdquo;
             </p>
          </div>
        </div>

        <div className="flex flex-col items-center xl:items-end w-full xl:w-auto mt-6 xl:mt-0 gap-4">
           {!apiKeyData ? (
             <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-xs font-bold tracking-widest uppercase">
                <AlertTriangle size={14} /> IA GuardiÃ£ Inativa
             </div>
           ) : (
             <div className="flex items-center gap-2 bg-[#CCA761]/10 border border-[#CCA761]/30 text-[#CCA761] px-4 py-2 rounded-lg text-xs font-bold tracking-widest uppercase shadow-[0_0_15px_rgba(204,167,97,0.2)]">
                <Sparkles size={14} className="animate-pulse" /> IA GuardiÃ£ Ativa
             </div>
           )}
        </div>
      </div>

      {/* Caixa de CriaÃ§Ã£o */}
      <div className="glass-card-premium rounded-2xl p-6 relative z-50 group/box">
        {/* Camada isolada para os efeitos de fundo sem cortar o Dropdown de Emojis */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none -z-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#CCA761]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        </div>
                <div className="flex flex-col gap-4 relative z-10">
           <div>
             <textarea
               value={input}
               onChange={(e) => setInput(e.target.value)}
               placeholder="Escreva seu elogio, crÃ­tica ou sugestÃ£o para o time. Lembre-se, o Agente MAYUS irÃ¡ analisar seu texto..."
               className="w-full bg-background border border-border rounded-xl p-4 min-h-[120px] focus:outline-none focus:border-primary focus:shadow-[0_0_20px_rgba(204,167,97,0.3)] text-sm text-foreground resize-none transition-all duration-300 placeholder:text-muted-foreground relative z-10"
               disabled={isLoading}
             />

             {/* BotÃ£o de abrir Emoji Picker Customizado */}
             <div className="flex flex-wrap items-center gap-2 mt-3 px-2 relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="text-gray-400 hover:text-[#CCA761] transition-colors duration-200 cursor-pointer flex items-center justify-center p-2 rounded-full hover:bg-gray-100 dark:bg-white/5"
                  title="Inserir Emoji"
                >
                  <Smile size={24} />
                </button>

                {showEmojiPicker && (
                  <div className="absolute top-12 left-0 z-50 bg-card/95 backdrop-blur-xl border border-border rounded-2xl p-4 shadow-2xl w-[280px]">
                    <div className="grid grid-cols-6 gap-3">
                      {["ðŸ”¥","ðŸš€","ðŸ’¡","ðŸ‘","ðŸŽ¯","ðŸ¤","ðŸ¤","âš ï¸","ðŸ¤–","â­","ðŸŽ‰","ðŸ†","ðŸ’¯","ðŸ’Ž","ðŸ¤¯","ðŸ‘€","â¤ï¸","âœ…","ðŸš¨","ðŸ’¼","ðŸ“Œ","ðŸ“ˆ","ðŸ’ª","ðŸ˜Ž"].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            setInput(prev => prev + emoji);
                            setShowEmojiPicker(false);
                          }}
                          className="text-2xl hover:scale-125 transition-transform duration-200 cursor-pointer opacity-80 hover:opacity-100 flex items-center justify-center"
                          title={`Inserir ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
             </div>
           </div>

           <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-2">
              <button
                type="button"
                onClick={() => setIsAnonymous(!isAnonymous)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold tracking-widest uppercase transition-all border ${
                  isAnonymous
                    ? 'bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white border-gray-300 dark:border-white/20'
                    : 'bg-transparent text-gray-500 border-transparent hover:bg-gray-100 dark:bg-white/5'
                }`}
                disabled={isLoading}
              >
                {isAnonymous ? <EyeOff size={16} /> : <Eye size={16} />}
                {isAnonymous ? "Modo AnÃ´nimo Ligado" : "Postar de forma anÃ´nima?"}
              </button>

              <button
                onClick={handlePost}
                disabled={isLoading}
                className={`relative w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#111111] font-[900] py-3 px-8 rounded-xl transition-all duration-300 transform active:scale-95 text-xs shadow-[0_0_20px_rgba(204,167,97,0.6)] overflow-hidden hover:-translate-y-[1px] tracking-widest uppercase ${!input.trim() ? 'opacity-90' : 'opacity-100'}`}
              >
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-gray-200 dark:via-white/50 to-transparent skew-x-12 pointer-events-none" />
                <div className="relative z-10 flex items-center gap-2">
                   {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={2.5} />}
                   <span>{isLoading ? "Enviando..." : "Publicar no Mural"}</span>
                </div>
              </button>
           </div>
        </div>
      </div>

      {/* ExibiÃ§Ã£o do Mural (Vitrine de Post-Its Vidro) */}
      <div className="pt-8">
        {isFetching ? (
           <div className="flex justify-center py-20">
             <div className="w-8 h-8 border-2 border-[#CCA761] border-t-transparent flex rounded-full animate-spin"></div>
           </div>
        ) : feedbacks.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-20 opacity-50">
             <MessageSquare size={48} className="text-gray-600 mb-4" />
             <p className="text-gray-400 font-medium text-sm">O Mural estÃ¡ completamente em branco nas Ãºltimas 24 horas.</p>
           </div>
        ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {feedbacks.map((fb, idx) => {
               // Array de cores para os alfinetes
               const pinColors = [
                 "text-red-500 fill-red-500/60",
                 "text-blue-500 fill-blue-500/60",
                 "text-emerald-500 fill-emerald-500/60",
                 "text-purple-500 fill-purple-500/60",
                 "text-orange-500 fill-orange-500/60",
                 "text-[#CCA761] fill-[#CCA761]/60",
                 "text-pink-500 fill-pink-500/60"
               ];
               const currentPinColor = pinColors[idx % pinColors.length];

               return (
                 <div
                   key={fb.id}
                   className={`relative p-6 rounded-2xl flex flex-col bg-gradient-to-br from-white/90 dark:from-[#111111]/90 to-gray-50/90 dark:to-[#050505]/90 border border-gray-200 dark:border-white/5 shadow-[0_5px_15px_rgba(0,0,0,0.5)] hover:shadow-[0_10px_30px_rgba(204,167,97,0.15)] transition-all duration-500 group hover:-translate-y-2`}
                 >
                   {/* Alfinete Colorido */}
                   <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 drop-shadow-[0_4px_4px_rgba(0,0,0,0.6)]">
                      <Pin size={24} className={`${currentPinColor} -rotate-[15deg] group-hover:-rotate-12 transition-transform duration-500`} />
                   </div>

                   <Quote size={44} className="absolute top-4 right-4 text-[#CCA761]/40 group-hover:text-[#CCA761] group-hover:scale-110 transition-all duration-500 drop-shadow-[0_0_10px_rgba(204,167,97,0.3)] group-hover:drop-shadow-[0_0_20px_rgba(204,167,97,0.8)] z-0" />

                   {/* Corpo do Feedback com Padding Right (pr-12) para nÃ£o atropelar as aspas */}
                   <div className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-wrap pt-4 pb-6 pr-12 min-h-[80px] relative z-10 font-medium">
                     {fb.content}
                   </div>

                 {/* RodapÃ© do Post-It */}
                 <div className="mt-auto pt-4 border-t border-gray-200 dark:border-white/5 flex items-end justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${fb.is_anonymous ? 'bg-gray-100 dark:bg-white/5 text-gray-500' : 'bg-[#CCA761]/20 text-[#CCA761] border border-[#CCA761]/30'}`}>
                         {fb.is_anonymous ? <EyeOff size={14} /> : <User size={14} />}
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${fb.is_anonymous ? 'text-gray-500' : 'text-[#CCA761]'}`}>
                          {fb.is_anonymous ? 'Colaborador AnÃ´nimo' : (fb.profiles?.full_name || 'Membro do Time')}
                        </span>
                        <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mt-0.5">
                          {calculateTimeLeft(fb.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* VotaÃ§Ã£o: Curtir / NÃ£o Curtir */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleVote(fb.id, 'like')}
                        className={`flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase transition-colors ${(fb.liked_by || []).includes(user?.id || '') ? 'text-[#4ade80]' : 'text-gray-500 hover:text-[#4ade80]'}`}
                      >
                         <ThumbsUp size={14} /> {(fb.liked_by || []).length > 0 && (fb.liked_by || []).length}
                      </button>
                      <button
                        onClick={() => handleVote(fb.id, 'dislike')}
                        className={`flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase transition-colors ${(fb.disliked_by || []).includes(user?.id || '') ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
                      >
                         <ThumbsDown size={14} /> {(fb.disliked_by || []).length > 0 && (fb.disliked_by || []).length}
                      </button>
                    </div>

                    {/* Badge Sutil de Sentimento (Opcional, se a IA classificar) */}
                    {fb.sentiment === 'positive' && (
                      <span className="w-2 h-2 rounded-full bg-green-500/50 shadow-[0_0_8px_rgba(34,197,94,0.5)]" title="Sentimento Positivo" />
                    )}
                    {fb.sentiment === 'negative' && (
                      <span className="w-2 h-2 rounded-full bg-red-500/50 shadow-[0_0_8px_rgba(239,68,68,0.5)]" title="CrÃ­tica/Ponto de AtenÃ§Ã£o" />
                    )}
                 </div>
               </div>
             );
             })}
           </div>
        )}
      </div>

    </div>
  );
}
