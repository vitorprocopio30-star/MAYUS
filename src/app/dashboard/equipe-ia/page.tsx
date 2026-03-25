"use client";

import { useState, useRef, useEffect } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { Bot, Power, Zap, BrainCircuit, Sparkles, Edit3, Check, Upload, Image as ImageIcon, Info, X } from "lucide-react";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

const AI_AGENTS_DEFAULT = [
  {
    id: "g-jud",
    name: "Harvey",
    role: "Jurídico",
    glowColor: "#CCA761", // Dourado
    avatarUrl: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=HarveyJ&radius=50&backgroundColor=transparent",
    features: ["Análise de Contratos", "Risco e Compliance", "Petições Base"],
    fullDescription: "O Agente Harvey é um especialista jurídico alimentado com vasta jurisprudência. Ele varre contratos gigantes em segundos buscando cláusulas abusivas ou riscos legais escondidos. Além de revisar, Harvey consegue escrever rascunhos de minutas e petições fundamentadas, atuando como o advogado de defesa perfeito para proteger o negócio."
  },
  {
    id: "g-mkt",
    name: "Astra",
    role: "Marketing",
    glowColor: "#3b82f6", // Azul
    avatarUrl: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=AstraM&radius=50&backgroundColor=transparent",
    features: ["Criação de Campanhas", "Estratégia de Funil", "Copywriting"],
    fullDescription: "Astra domina o funil de vendas e a persuasão! Treinada nos melhores cases de Marketing do mundo, ela desenha campanhas inteiras do zero, sugere os melhores canais de aquisição e escreve copys envolventes e impulsionadoras de conversão. Se você quer atrair olhos, ela aponta a direção da audiência."
  },
  {
    id: "g-fin",
    name: "Louis",
    role: "Financeiro",
    glowColor: "#10b981", // Verde
    avatarUrl: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=LouisF&radius=50&backgroundColor=transparent",
    features: ["Fluxo de Caixa", "Cobranças Aut.", "Relatórios Financeiros"],
    fullDescription: "Mais seguro que um cofre suíço! Louis é obcecado por números, margem de lucro e eficiência contábil. Ele é capaz de analisar furos de caixa inter-relacionados, automatizar disparos educados de cobrança proativa aos inadimplentes e calcular relatórios dinâmicos de PNL sem deixar passar um único centavo de despesa oculta."
  },
  {
    id: "g-ads",
    name: "Victor",
    role: "Ads",
    glowColor: "#a855f7", // Roxo
    avatarUrl: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=VictorA&radius=50&backgroundColor=transparent",
    features: ["Gestão de Tráfego", "Otimização de CPA", "Relatórios de ROI"],
    fullDescription: "Victor injeta esteroides nas suas métricas de cliques. Focado unicamente em compra de mídia (Facebook Ads, Google, TikTok), ele sugere a alocação de verba mais inteligente, cruza dados da concorrência e levanta hipóteses de otimização de custo por clique. Basicamente, um gestor de tráfego implacável!"
  },
  {
    id: "g-pos",
    name: "Sarah",
    role: "Pós Venda",
    glowColor: "#d1d5db", // Prata
    avatarUrl: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=SarahP&radius=50&backgroundColor=transparent",
    features: ["Retenção de Clientes", "Sucesso do Cliente", "Pesquisas NPS"],
    fullDescription: "A ponte de relacionamento de ouro. Sarah atua no delicado ecossistema da Retenção (Onboarding, Ongoing e Renovação). Ela mapeia 'Sinais de Churn' usando o comportamento dos seus clientes e cria estratégias personalizadas de 'Customer Success' para garantir que os clientes da agência nunca queiram ir embora."
  },
  {
    id: "g-soc",
    name: "Mia",
    role: "Social Midia",
    glowColor: "#ec4899", // Rosa
    avatarUrl: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=MiaS&radius=50&backgroundColor=transparent",
    features: ["Gestão de Redes", "Engajamento", "Distribuição Viral"],
    fullDescription: "Mia respira tendências! Ela sabe exatamente quais hooks (ganchos) seguram a atenção das pessoas no Instagram e no TikTok nos primeiros 3 segundos. Especialista em calendários editoriais, hashtags raras e produção de micro-conteúdos virais desenhados de forma cirúrgica para quebrar algoritmos!"
  },
  {
    id: "g-sup",
    name: "Donna",
    role: "Suporte",
    glowColor: "#fde047", // Amarelo Claro Puro (Neon)
    avatarUrl: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=DonnaS&radius=50&backgroundColor=transparent",
    features: ["Atendimento 24h", "Triagem de Problemas", "Resolução Rápida"],
    fullDescription: "Velocidade é com ela. A Donna engole manuais técnicos inteiros e manuais de FAQs. Além de fazer triagem calorosa via WhatsApp sem parecer um robô engessado, ela lê e analisa a gravidade do problema antes de acionar o time físico de dev e resolve os chamados rasos sozinha num piscar de olhos!"
  },
  {
    id: "g-sdr",
    name: "Mike",
    role: "SDR",
    glowColor: "#f97316", // Laranja
    avatarUrl: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=MikeS&radius=50&backgroundColor=transparent",
    features: ["Qualificação de Leads", "Cold Calling IA", "Follow-ups Ativos"],
    fullDescription: "Mike caça negócios como um tubarão! Ele analisa listas de LinkedIn e emails, monta perfil de cadências impecáveis para prospectar de forma hiper-personalizada e faz o mapeamento do Lead scoring pra verifique quem compõe o Perfil Ideal do Consumidor (ICP). Follow-ups diários são seu feijão com arroz."
  }
];

export default function EquipeNeuralPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [agents, setAgents] = useState(AI_AGENTS_DEFAULT);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const [selectedAgentInfo, setSelectedAgentInfo] = useState<any>(null); // Guardar agente para o Modal

  // Inicializa o localStorage após o Hydration para evitar Hydration Error
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") {
      const savedAgents = localStorage.getItem("@mayus:neural_agents");
      if (savedAgents) {
         const parsed = JSON.parse(savedAgents);
         if (parsed && Array.isArray(parsed) && parsed.length === 8) {
             // Força reset para a ordem nova de Louis e Donna, para contornar cache!
             if (parsed[2]?.id === "g-fin" && parsed[6]?.id === "g-sup") {
                setAgents(parsed);
             } else {
                setAgents(AI_AGENTS_DEFAULT); // Ignorar cache se estiver na ordem antiga
             }
         }
      }

      const savedActive = localStorage.getItem("@mayus:neural_active");
      if (savedActive) {
         setActiveAgents(JSON.parse(savedActive));
      }
    }
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    try {
      localStorage.setItem("@mayus:neural_agents", JSON.stringify(agents));
    } catch (e) {
      console.warn("Imagem muito grande para salvar na memória local (LocalStorage Queda Limit).");
    }
  }, [agents, isMounted]);

  useEffect(() => {
    if (!isMounted) return;
    localStorage.setItem("@mayus:neural_active", JSON.stringify(activeAgents));
  }, [activeAgents, isMounted]);
  
  // Ref para upload de imagem
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAgentId, setUploadingAgentId] = useState<string | null>(null);

  const toggleAgent = (id: string) => {
    setActiveAgents(prev => 
      prev.includes(id) 
        ? prev.filter(x => x !== id) 
        : [...prev, id]
    );
  };

  const handleEditClick = (e: React.MouseEvent, agent: any) => {
    e.stopPropagation(); // Evita ativar/desativar ao clicar no edit
    setEditingId(agent.id);
    setEditName(agent.name);
  };

  const handleSaveName = (id: string, e?: React.MouseEvent | React.FormEvent) => {
    if (e) e.stopPropagation();
    setAgents(prev => prev.map(a => a.id === id ? { ...a, name: editName || a.name } : a));
    setEditingId(null);
  };

  const handleAvatarClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setUploadingAgentId(id);
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Reseta o input para permitir selecionar a mesma imagem
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && uploadingAgentId) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setAgents(prev => prev.map(a => a.id === uploadingAgentId ? { ...a, avatarUrl: base64 } : a));
        setUploadingAgentId(null);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className={`w-full max-w-7xl mx-auto space-y-12 pb-24 px-4 ${montserrat.className}`}>
      {/* Input de arquivo invisivel */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />
      
      {/* Header Premium */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end pb-8 border-b border-[#CCA761]/20 relative z-40 gap-8">
        <div>
          <h1 className={`text-5xl lg:text-7xl text-[#CCA761] mb-1 font-bold tracking-tight ${cormorant.className} italic drop-shadow-[0_0_20px_rgba(204,167,97,0.3)] flex items-center gap-4`}>
             <BrainCircuit size={48} className="text-[#CCA761]" /> Equipe Neural
          </h1>
          <div className="mt-6 relative bg-gradient-to-r from-[#CCA761]/15 via-transparent to-transparent pl-6 py-4 border-l-[4px] border-[#CCA761] max-w-3xl overflow-hidden group rounded-r-2xl">
             <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
             <p className={`text-[#eadd87] text-xl lg:text-3xl font-semibold tracking-wide ${cormorant.className} italic drop-shadow-md leading-relaxed`}>
                "Gerencie seus clones digitais. Um escritório que nunca dorme."
             </p>
          </div>
        </div>

        <div className="flex flex-col items-center xl:items-end w-full xl:w-auto mt-6 xl:mt-0 gap-4">
           <div className="flex items-center gap-2 bg-[#CCA761]/10 border border-[#CCA761]/30 text-[#CCA761] px-4 py-2 rounded-lg text-xs font-bold tracking-widest uppercase shadow-[0_0_15px_rgba(204,167,97,0.2)]">
              <Sparkles size={14} className="animate-pulse" /> {activeAgents.length} Mentes Ativas
           </div>
        </div>
      </div>

      {/* Grid de Agentes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {agents.map((agent) => {
          const isActive = activeAgents.includes(agent.id);
          const color = isActive ? agent.glowColor : '#333333';
          
          return (
            <div 
              key={agent.id}
              onClick={() => toggleAgent(agent.id)}
              className={`relative w-full rounded-3xl p-[1px] transition-all duration-1000 cursor-pointer overflow-hidden transform 
                ${isActive ? 'scale-100 hover:scale-105' : 'scale-95 grayscale-[0.8] opacity-70 hover:grayscale-[0.4]'}
              `}
            >
              {/* Moldura Mágica (Neon Border) */}
              <div 
                className={`absolute inset-0 transition-opacity duration-1000 ${isActive ? 'opacity-100 animate-pulse' : 'opacity-20'}`} 
                style={{ 
                  background: `linear-gradient(to bottom right, ${color}, transparent, ${color})` 
                }} 
              />
              
              {/* O Card Interno (Vidro Preto) */}
              <div className="relative bg-[#050505]/95 backdrop-blur-3xl rounded-[23px] p-8 flex flex-col items-center h-full border border-white/5 mx-[1px] my-[1px] shadow-[inset_0_0_60px_rgba(0,0,0,0.9)]">
                
                {/* Lanterna de Fundo (Backlight) */}
                <div 
                  className={`absolute top-1/4 w-40 h-40 rounded-full blur-[70px] transition-all duration-1000 pointer-events-none 
                    ${isActive ? 'opacity-40 animate-[pulse_4s_ease-in-out_infinite]' : 'opacity-0'}
                  `} 
                  style={{ backgroundColor: color }} 
                />

                <div className="w-full flex justify-between items-center mb-4 z-10 relative">
                  <span className={`text-white font-black tracking-[0.4em] text-[10px] uppercase transition-colors duration-700 ${isActive ? '' : 'text-gray-600'}`}>AGENTE</span>
                  <button className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isActive ? 'bg-white/10 shadow-[0_0_15px_currentColor]' : 'bg-transparent border border-white/10'}`} style={{ color: isActive ? color : '' }}>
                    <Power size={14} color={isActive ? color : '#666'} />
                  </button>
                </div>
                
                {/* Circulo do Avatar (Anel de Energia) */}
                <div 
                  className="relative w-36 h-36 rounded-full p-[2px] mb-4 transition-all duration-1000 z-10 group/avatar cursor-pointer"
                  onClick={(e) => handleAvatarClick(e, agent.id)}
                  title="Trocar Foto da IA"
                  style={{ 
                    background: isActive ? `linear-gradient(135deg, ${color}, transparent, ${color})` : '#333' 
                  }}
                >
                  <div className="w-full h-full rounded-full bg-[#0a0a0a] flex items-center justify-center overflow-hidden border-[4px] border-[#0a0a0a] relative">
                    {/* Linhas de grade sci-fi sutis dentro do círculo */}
                    <div className="absolute inset-0 opacity-10 bg-[linear-gradient(transparent_49%,#fff_50%,transparent_51%),linear-gradient(90deg,transparent_49%,#fff_50%,transparent_51%)] bg-[length:20px_20px]" />
                    
                    {agent.avatarUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={agent.avatarUrl} alt={agent.name} className={`w-full h-full object-cover transition-all duration-1000 ${isActive ? 'opacity-100' : 'opacity-40'}`} />
                    ) : (
                      <Bot size={48} color={isActive ? color : '#555'} className={`transition-all duration-1000 ${isActive ? 'drop-shadow-[0_0_15px_currentColor]' : ''}`} />
                    )}

                    {/* Overlay de Edição de Imagem */}
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-300">
                      <Upload size={24} className="text-white mb-1" />
                      <span className="text-[9px] text-white font-bold tracking-widest uppercase">Mudar</span>
                    </div>
                  </div>
                </div>

                {/* Identidade com Modo Edição */}
                <div className="mb-1 z-20 flex items-center justify-center w-full group" onClick={(e) => editingId === agent.id && e.stopPropagation()}>
                    {editingId === agent.id ? (
                      <form onSubmit={(e) => handleSaveName(agent.id, e)} className="flex items-center gap-2">
                        <input 
                          type="text" 
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-black/50 border border-white/20 text-white font-bold text-3xl px-3 py-1 rounded w-40 text-center focus:outline-none focus:border-[#CCA761]"
                          autoFocus
                          maxLength={15}
                        />
                        <button type="submit" className="text-green-400 hover:text-green-300 transition-colors p-2 bg-white/5 rounded-full">
                           <Check size={20} />
                        </button>
                      </form>
                    ) : (
                      <div className="relative flex justify-center items-center w-full">
                        <h2 className={`text-5xl font-bold transition-colors duration-1000 text-center ${cormorant.className}`} style={{ color: isActive ? '#fff' : '#666' }}>{agent.name}</h2>
                        <button 
                          onClick={(e) => handleEditClick(e, agent)}
                          className="absolute right-0 translate-x-4 opacity-0 group-hover:opacity-100 transition-all p-2 text-gray-500 hover:text-[#CCA761]"
                          title="Renomear Agente"
                        >
                           <Edit3 size={18} />
                        </button>
                      </div>
                    )}
                </div>
                
                <div className="flex items-center gap-2 mb-8 z-10 pointer-events-none">
                   {isActive && <div className="w-1.5 h-1.5 rounded-full animate-pulse shadow-lg" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />}
                   <p className={`text-sm tracking-widest uppercase transition-colors duration-1000 ${cormorant.className} italic font-bold`} style={{ color: isActive ? color : '#555' }}>
                     {agent.role}
                   </p>
                </div>

                {/* Features (Caracteristicas) */}
                <ul className="w-full space-y-3 mb-10 z-10 text-left mt-2 flex-grow">
                  {agent.features.map((feat, i) => (
                    <li key={i} className={`flex items-start gap-3 transition-colors duration-1000`} style={{ color: isActive ? '#ccc' : '#444' }}>
                      <Zap size={12} color={isActive ? color : '#333'} className="mt-1 shrink-0" />
                      <span className="text-xs font-medium tracking-wide leading-relaxed">{feat}</span>
                    </li>
                  ))}
                </ul>

                {/* Footer MAYUS */}
                <div className="mt-auto z-10 w-full flex flex-col items-center">
                  <div className={`w-1/2 h-[1px] mb-4 transition-colors duration-1000`} style={{ backgroundColor: isActive ? `${color}40` : '#222' }} />
                  
                  <div className="flex items-center justify-between w-full">
                     <span className={`tracking-[0.5em] font-light text-[10px] transition-colors duration-1000 ${cormorant.className}`} style={{ color: isActive ? '#CCA761' : '#333' }}>MAYUS</span>
                     
                     <button
                       onClick={(e) => {
                         e.stopPropagation();
                         setSelectedAgentInfo(agent);
                       }}
                       className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors border text-[9px] font-black uppercase tracking-widest ${isActive ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-transparent border-[#222] text-[#444]'} hover:text-white group/info`}
                     >
                       <Info size={12} className={isActive ? 'text-[#CCA761]' : ''} /> Dossiê Técnico
                     </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL DE DOSSIÊ DO AGENTE */}
      {selectedAgentInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedAgentInfo(null)} />
          <div 
            className="relative bg-[#050505] border border-white/10 rounded-2xl w-full max-w-lg p-8 shadow-[0_0_80px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in duration-300"
            style={{ 
              boxShadow: `0 0 60px ${activeAgents.includes(selectedAgentInfo.id) ? selectedAgentInfo.glowColor + '20' : 'rgba(0,0,0,0.8)'}`,
              borderColor: activeAgents.includes(selectedAgentInfo.id) ? selectedAgentInfo.glowColor + '40' : undefined
            }}
          >
            {/* Fechar Modal */}
            <button 
              onClick={() => setSelectedAgentInfo(null)}
              className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>

            <div className="flex flex-col items-center text-center">
              <div 
                className="w-24 h-24 rounded-full bg-[#111] border-2 flex items-center justify-center mb-6 overflow-hidden"
                style={{ borderColor: activeAgents.includes(selectedAgentInfo.id) ? selectedAgentInfo.glowColor : '#333' }}
              >
                {selectedAgentInfo.avatarUrl ? (
                  <img src={selectedAgentInfo.avatarUrl} alt={selectedAgentInfo.name} className="w-full h-full object-cover" />
                ) : (
                  <Bot size={40} className="text-gray-500" />
                )}
              </div>
              
              <h2 className={`text-4xl font-bold text-white mb-2 ${cormorant.className}`}>{selectedAgentInfo.name}</h2>
              <p className="text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full border mb-8"
                style={{ 
                  color: selectedAgentInfo.glowColor, 
                  borderColor: selectedAgentInfo.glowColor + '40',
                  backgroundColor: selectedAgentInfo.glowColor + '10'
                }}>
                {selectedAgentInfo.role}
              </p>

              <div className="w-full text-left bg-white/5 rounded-xl p-6 border border-white/5">
                 <h3 className="text-white text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                   <BrainCircuit size={16} style={{ color: selectedAgentInfo.glowColor }} />
                   Matriz de Competência
                 </h3>
                 <p className="text-gray-400 text-sm leading-relaxed font-medium">
                   {selectedAgentInfo.fullDescription || "Este agente está passando por treinamento de sinapses pela MAYUS."}
                 </p>
              </div>

              <div className="w-full mt-8 flex flex-col items-center justify-center">
                 {activeAgents.includes(selectedAgentInfo.id) ? (
                   <span className="text-[#CCA761] text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-2">
                     <Sparkles size={14} className="animate-pulse" /> Operação Ativa
                   </span>
                 ) : (
                   <span className="text-gray-600 text-xs font-bold uppercase tracking-[0.2em]">
                     Anima Adormecida (Offline)
                   </span>
                 )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
