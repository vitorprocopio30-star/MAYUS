"use client";

import { useState, useEffect, useRef } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { 
  Search, Hash, User, Phone, Video, MoreVertical, Send, Paperclip, 
  Smile, Mic, Info, FileText, Image as ImageIcon, CircleUserRound, CheckCircle2, Loader2
} from "lucide-react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { createClient } from "@/lib/supabase/client";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });

export default function ChatEquipePage() {
  const { user, profile } = useUserProfile();
  const supabase = createClient();

  const [channels, setChannels] = useState<{ id: string; name: string; type: string }[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Carregar Canais Iniciais
  useEffect(() => {
    const fetchChannels = async () => {
       const { data, error } = await supabase.from('team_channels').select('*').order('created_at', { ascending: true });
       if (data && data.length > 0) {
          setChannels(data);
          setActiveChatId(data[0].id);
       } else {
          // Se não tem canais, cria um "Geral" pra começar o show!
          const { data: newChannel } = await supabase.from('team_channels').insert([{ name: 'geral', type: 'channel' }]).select().single();
          if (newChannel) {
             setChannels([newChannel]);
             setActiveChatId(newChannel.id);
          }
       }
       setIsLoading(false);
    };
    fetchChannels();
  }, []);

  // 2. Carregar Mensagens do Canal Ativo & Inscrever no Realtime
  useEffect(() => {
    if (!activeChatId) return;

    const fetchMessages = async () => {
       const { data } = await supabase
         .from('team_messages')
         .select('*')
         .eq('channel_id', activeChatId)
         .order('created_at', { ascending: true });
         
       if (data) {
           setMessages(data);
       }
    };
    fetchMessages();

    // Inscricao Realtime
    const channelListener = supabase.channel(`team_${activeChatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages', filter: `channel_id=eq.${activeChatId}` }, 
        (payload) => {
          setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
       supabase.removeChannel(channelListener);
    };
  }, [activeChatId]);

  // Scroll to bottom
  useEffect(() => {
     messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
     if (!inputText.trim() || !activeChatId || !user) return;
     const content = inputText.trim();
     setInputText(""); // Optimistic clear

     await supabase.from('team_messages').insert({
        channel_id: activeChatId,
        sender_id: user.id,
        content: content
     });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
     if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
     }
  };

  const currentContact = channels.find(c => c.id === activeChatId);
  const isChannel = currentContact?.type === 'channel';

  return (
    <div className={`flex h-[calc(100vh-6rem)] w-full bg-[#020104] rounded-tl-3xl border-t border-l border-white/5 overflow-hidden ${montserrat.className}`}>
      
      {/* ----------------- PAINEL ESQUERDO (AÇÕES & ROSTER) ----------------- */}
      <div className="w-[300px] flex-shrink-0 border-r border-white/5 flex flex-col bg-white dark:bg-[#050505] z-10 relative">
         <div className="p-4 border-b border-white/5">
            <h2 className={`text-xl text-[#CCA761] mb-4 font-bold ${cormorant.className} italic`}>MAYUS Hub</h2>
            <div className="relative">
               <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-500" />
               <input 
                  type="text" 
                  placeholder="Buscar colega ou sala..."
                  className="w-full bg-[#111] border border-white/5 rounded-lg py-2 pl-9 pr-3 text-sm text-white focus:outline-none focus:border-[#CCA761]/50 placeholder:text-gray-600 transition-colors"
               />
            </div>
         </div>

         <div className="flex-1 overflow-y-auto px-2 py-4 hide-scrollbar space-y-6">
            
            {/* Salas / Canais Reais do Supabase */}
            <div>
               <div className="px-2 mb-2 flex items-center justify-between">
                  <span className="text-[10px] items-center text-gray-500 font-black uppercase tracking-widest">Salas da Operação</span>
                  <button className="text-gray-600 hover:text-white transition-colors text-lg leadin-none">+</button>
               </div>
               <div className="space-y-0.5">
                  {isLoading ? (
                     <div className="text-center py-4"><Loader2 size={16} className="text-[#CCA761] animate-spin inline" /></div>
                  ) : channels.map(c => (
                     <button
                        key={c.id}
                        onClick={() => setActiveChatId(c.id)}
                        className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors group ${activeChatId === c.id ? 'bg-[#CCA761]/10 border border-[#CCA761]/20' : 'hover:bg-white/5 border border-transparent'}`}
                     >
                        <div className="flex items-center gap-2">
                           <Hash size={14} className={activeChatId === c.id ? "text-[#CCA761]" : "text-gray-500 group-hover:text-white"} />
                           <span className={`text-sm tracking-wide ${activeChatId === c.id ? "text-[#CCA761] font-bold" : "text-gray-400 group-hover:text-white"}`}>{c.name || 'Sala'}</span>
                        </div>
                     </button>
                  ))}
               </div>
            </div>

            {/* Mock DMs / Membros para o Layout futuramente virar do Supabase */}
            <div>
               <div className="px-2 mb-2 flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Equipe (Simulado)</span>
               </div>
               <div className="space-y-0.5">
                  <div className="px-3 text-xs text-gray-600 italic">Disponível em breve após adicionar perfil de colaboradores...</div>
               </div>
            </div>

         </div>
         
         <div className="p-4 bg-gradient-to-br from-[#111] to-[#0a0a0a] border-t border-white/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center relative bg-gray-200 dark:bg-black font-bold text-gray-400 text-xs uppercase">
               {profile?.full_name?.substring(0,2) || <User size={18} className="text-[#CCA761]" />}
               <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#25D366] rounded-full border-2 border-[#111]"></div>
            </div>
            <div className="overflow-hidden">
               <div className="text-sm font-bold text-white leading-tight truncate">{profile?.full_name || 'Usuário Atual'}</div>
               <div className="text-[10px] text-[#CCA761] tracking-widest uppercase truncate">{profile?.role || 'Ativo'}</div>
            </div>
         </div>
      </div>

      {/* ----------------- PAINEL CENTRAL (CHAT REALTIME) ----------------- */}
      <div className="flex-1 flex flex-col relative bg-[#0a0a0a]">
         {/* Efeito Glow Background Central */}
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#CCA761]/5 blur-[120px] pointer-events-none rounded-full" />
         
         {/* Top Header */}
         <div className="px-6 py-4 flex items-center justify-between bg-[#111]/80 backdrop-blur border-b border-white/5 z-10 sticky top-0">
            <div className="flex items-center gap-4">
               {isChannel ? (
                  <div className="w-10 h-10 rounded-xl bg-[#CCA761]/10 border border-[#CCA761]/30 flex items-center justify-center">
                     <Hash size={20} className="text-[#CCA761]" />
                  </div>
               ) : (
                  <div className="relative">
                     <div className="w-10 h-10 bg-white dark:bg-[#050505] border border-white/10 rounded-full flex items-center justify-center font-bold text-sm uppercase">
                        {(currentContact as any)?.name?.substring(0, 2) || 'CH'}
                     </div>
                  </div>
               )}
               
               <div>
                  <h1 className="text-lg font-bold text-white flex items-center gap-2">
                     {currentContact?.name || 'Canal Geral'}
                  </h1>
                  {isChannel && <p className="text-[10px] text-gray-500 uppercase tracking-widest">Canal Global Sincronizado</p>}
               </div>
            </div>
            
            <div className="flex items-center gap-2">
               <button className="w-10 h-10 rounded-full border border-white/5 bg-white dark:bg-[#050505] flex items-center justify-center text-gray-400 hover:text-white hover:border-[#CCA761]/50 hover:bg-[#CCA761]/5 transition-all"><Phone size={16} /></button>
               <button className="w-10 h-10 rounded-full border border-white/5 bg-white dark:bg-[#050505] flex items-center justify-center text-gray-400 hover:text-white hover:border-[#CCA761]/50 hover:bg-[#CCA761]/5 transition-all"><Video size={16} /></button>
               <div className="h-6 w-[1px] bg-white/10 mx-1"></div>
               <button className="w-8 h-8 rounded flex items-center justify-center text-gray-500 hover:text-white transition-colors"><Info size={18} /></button>
               <button className="w-8 h-8 rounded flex items-center justify-center text-gray-500 hover:text-white transition-colors"><MoreVertical size={18} /></button>
            </div>
         </div>

         {/* Stream de Mensagens Realtime do Supabase */}
         <div className="flex-1 overflow-y-auto p-6 space-y-4 hide-scrollbar z-10 flex flex-col">
            
            {messages.length === 0 && !isLoading && (
               <div className="w-full flex-col h-full items-center justify-center flex text-center opacity-50">
                   <Hash size={48} className="text-[#CCA761] mb-4" />
                   <div className="text-white font-bold mb-1">Crie a história dessa sala...</div>
                   <div className="text-xs text-gray-400">Nenhuma mensagem enviada ainda. Digite algo abaixo!</div>
               </div>
            )}

            {messages.map((msg: any, idx) => {
               const isMe = msg.sender_id === user?.id;
               return (
                  <div key={msg.id || idx} className={`flex gap-3 items-end w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
                      {!isMe && (
                         <div className="w-8 h-8 bg-[#111] rounded-full border border-white/5 shrink-0 flex items-center justify-center text-xs font-bold text-[#CCA761]">
                            M
                         </div>
                      )}
                      
                      <div className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                         <div className={`px-5 py-3 text-[14px] leading-relaxed max-w-xl shadow-sm ${
                           isMe 
                             ? 'bg-gradient-to-br from-[#CCA761] to-[#b89554] text-[#0a0a0a] rounded-2xl rounded-br-sm font-medium' 
                             : 'bg-[#1a1a1a] border border-white/5 rounded-2xl rounded-bl-sm text-gray-200'
                         }`}>
                            {msg.content}
                         </div>
                         <div className="flex items-center gap-1 text-[10px] text-gray-600 px-1 font-medium select-none">
                            {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            {isMe && <CheckCircle2 size={12} className="text-[#CCA761]" />}
                         </div>
                      </div>
                  </div>
               );
            })}
            
            <div ref={messagesEndRef} />
         </div>

         {/* Composer de Resposta */}
         <div className="p-4 bg-[#0a0a0a] border-t border-white/5 z-10 w-full flex justify-center pb-6">
            <div className="w-full max-w-4xl bg-[#111] border border-white/10 rounded-2xl flex flex-col focus-within:ring-1 focus-within:ring-white/30 transition-colors shadow-2xl">
               <textarea 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Envia uma mensagem interna em #${currentContact?.name || ''} (Aperte Enter)`}
                  className="w-full bg-transparent border-none text-white text-[14px] p-4 pb-2 outline-none resize-none min-h-[60px] placeholder:text-gray-600"
               />
               
               <div className="flex justify-between items-center p-2 pt-0 rounded-b-2xl">
                 <div className="flex gap-1 ml-2">
                   <button className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"><Smile size={18} strokeWidth={2} /></button>
                   <button className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"><Paperclip size={18} strokeWidth={2} /></button>
                   <button className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"><Mic size={18} strokeWidth={2} /></button>
                 </div>
                 <button onClick={handleSend} disabled={!inputText.trim() || !activeChatId} className="mr-2 px-5 py-2 text-xs font-black uppercase tracking-widest rounded-lg shadow-[0_0_15px_rgba(204,167,97,0.3)] hover:scale-105 transition-transform flex items-center gap-2 bg-[#CCA761] text-black disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none">
                   Enviar <Send size={14} />
                 </button>
               </div>
            </div>
         </div>
      </div>

      {/* ----------------- PAINEL DIREITO (INFO) ----------------- */}
      <div className="w-[300px] flex-shrink-0 border-l border-white/5 bg-white dark:bg-[#050505] flex flex-col z-10 hide-scrollbar overflow-y-auto hidden xl:flex">
         <div className="p-6 flex flex-col items-center border-b border-white/5 pt-10">
            {isChannel ? (
               <div className="w-20 h-20 rounded-2xl bg-[#CCA761]/10 border border-[#CCA761]/30 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(204,167,97,0.15)] relative">
                  <Hash size={32} className="text-[#CCA761]" />
               </div>
            ) : (
               <div className="w-24 h-24 rounded-full border-4 border-[#111] bg-[#1a1a1a] flex items-center justify-center text-3xl font-black text-white relative mb-4 shadow-xl">
                  {currentContact?.name?.substring(0, 2) || 'CH'}
                  {/* Online Badge */}
                  <div className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-[4px] border-[#050505] bg-[#25D366]`}></div>
               </div>
            )}
            
            <h3 className="text-xl font-bold text-white mb-1 text-center">{currentContact?.name || 'Canal'}</h3>
            {isChannel && <p className="text-xs text-gray-500 uppercase tracking-widest text-center px-4 leading-relaxed">Canal Oficial Sincronizado em Nuvem para a equipe MAYUS.</p>}
         </div>

         <div className="p-6 flex-1 space-y-6">
            <div className="space-y-4">
               <h4 className="text-[10px] text-gray-500 font-black uppercase tracking-widest flex items-center gap-2">
                 <FileText size={12} /> Galpão de Arquivos
               </h4>
               <div className="grid grid-cols-3 gap-2">
                  <div className="aspect-square bg-[#111] border border-white/10 rounded-lg flex items-center justify-center text-gray-600 hover:border-[#CCA761] transition-colors cursor-pointer"><ImageIcon size={20} /></div>
                  <div className="aspect-square bg-[#111] border border-white/10 rounded-lg flex items-center justify-center text-red-500 hover:border-red-500 transition-colors cursor-pointer"><FileText size={20} /></div>
                  <div className="aspect-square bg-[#111] border border-white/10 rounded-lg flex items-center justify-center text-blue-500 hover:border-blue-500 transition-colors cursor-pointer"><FileText size={20} /></div>
               </div>
               <button className="w-full text-xs text-gray-400 hover:text-white py-2 bg-[#111] border border-white/5 rounded-lg transition-colors font-medium">Ver todos os registros</button>
            </div>
         </div>
      </div>
    </div>
  );
}
