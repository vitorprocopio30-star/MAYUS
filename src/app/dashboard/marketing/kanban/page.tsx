"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, LayoutDashboard, Megaphone, XCircle, Settings, Plus, Search, LayoutTemplate, List } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { updateEditorialCalendarItem, type EditorialCalendarItem } from "@/lib/marketing/editorial-calendar";
import {
  loadLocalMarketingState,
  loadRemoteMarketingState,
  saveLocalMarketingState,
  saveMarketingCalendar,
  saveRemoteMarketingState,
  shouldUseRemoteMarketingState,
} from "@/lib/marketing/local-persistence";

// Colunas agora são dinâmicas via Configuração (localStorage)

const nextActions: Array<{ status: EditorialCalendarItem["status"]; label: string }> = [
  { status: "draft", label: "Rascunho" },
  { status: "approved", label: "Aprovar" },
  { status: "published", label: "Publicado" },
  { status: "rejected", label: "Recusar" },
];

export default function MarketingKanbanPage() {
  const [calendar, setCalendar] = useState<EditorialCalendarItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageLabel, setStorageLabel] = useState("Carregando");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [columns, setColumns] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      const localState = loadLocalMarketingState();
      const remoteState = await loadRemoteMarketingState().catch(() => null);
      const useRemote = shouldUseRemoteMarketingState(remoteState);
      const sourceState = useRemote ? remoteState! : localState;
      if (cancelled) return;

      setCalendar(sourceState.calendar);
      
      const defaultCols = [
        { status: "draft", title: "Rascunho", color: "#71717a" },
        { status: "approved", title: "Aprovado", color: "#34d399" },
        { status: "published", title: "Publicado", color: "#CCA761" },
        { status: "rejected", title: "Recusado", color: "#ef4444" },
      ];
      const savedCols = localStorage.getItem("mayus_marketing_columns");
      setColumns(savedCols ? JSON.parse(savedCols) : defaultCols);
      saveLocalMarketingState({ calendar: sourceState.calendar });
      setStorageLabel(useRemote ? "Servidor" : "Local com fallback");
      setIsLoaded(true);
    }

    void loadState();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    saveMarketingCalendar(calendar);
    void saveRemoteMarketingState({ calendar }).then((saved) => setStorageLabel(saved ? "Servidor" : "Local com fallback"));
  }, [calendar, isLoaded]);

  const grouped = useMemo(() => {
    return columns.reduce<Record<string, EditorialCalendarItem[]>>((acc, column) => {
      acc[column.status] = calendar
        .filter((item) => item.status === column.status)
        .sort((a, b) => a.date.localeCompare(b.date));
      return acc;
    }, {});
  }, [calendar, columns]);

  function moveItem(itemId: string, status: EditorialCalendarItem["status"]) {
    setCalendar((current) => updateEditorialCalendarItem(current, itemId, { status }));
  }

  return (
    <main className="h-screen flex flex-col bg-[#050505] overflow-hidden">
      {/* Animacoes Premium MAYUS */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmerBeam {
          0% { transform: translateX(-100%) skewX(-15deg); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: translateX(250%) skewX(-15deg); opacity: 0; }
        }
        .kanban-card { transition: transform 0.25s cubic-bezier(.22,.68,0,1.2), box-shadow 0.25s ease, border-color 0.25s ease; }
        .kanban-card:hover { transform: translateY(-3px); box-shadow: 0 0 0 1px rgba(204,167,97,0.22), 0 12px 40px rgba(0,0,0,0.9), 0 0 36px rgba(204,167,97,0.12); border-color: rgba(204,167,97,0.3) !important; }
        .kanban-card:hover .card-shimmer { animation: shimmerBeam 0.85s ease forwards; }
        @keyframes neonSweep {
          0% { transform: translateX(-100%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateX(100%); opacity: 0; }
        }
        .col-neon-line { animation: neonSweep 3s ease-in-out infinite; animation-delay: var(--sweep-delay, 0s); }
      `}} />

      {/* Header Premium MAYUS */}
      <header className="flex-none bg-[#080808]/98 backdrop-blur-2xl border-b border-[#CCA761]/10 z-20 shadow-[0_1px_0_rgba(204,167,97,0.07),0_4px_32px_rgba(0,0,0,0.6)]">
        <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/marketing/kanban/config" className="p-2.5 bg-white/5 hover:bg-[#CCA761]/10 text-gray-400 hover:text-[#CCA761] border border-white/5 rounded-lg transition-colors">
              <ArrowLeft size={18} />
            </Link>
            <div className="flex flex-col">
              <div className="flex flex-col relative">
                <div 
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <h1 className="text-3xl lg:text-4xl font-cormorant italic text-[#CCA761] tracking-tight flex items-center gap-3 drop-shadow-[0_0_15px_rgba(204,167,97,0.2)]">
                    Marketing
                    <svg className={`w-5 h-5 text-[#CCA761]/40 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    <span className="text-[10px] font-black font-montserrat bg-[#CCA761]/10 text-[#CCA761]/80 border border-[#CCA761]/20 px-2 py-0.5 rounded-full">{calendar.length}</span>
                  </h1>
                </div>
                
                {isDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
                    <div className="absolute top-10 left-0 mt-2 w-64 bg-[#0a0a0a] border border-[#CCA761]/20 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in duration-200 backdrop-blur-xl">
                      <div className="px-3 pb-2 mb-2 border-b border-[#CCA761]/10 text-[10px] font-black text-[#CCA761]/50 uppercase tracking-[0.2em]">
                        Seus Fluxos (Marketing)
                      </div>
                      <button className="w-full text-left px-4 py-2 text-sm bg-[#CCA761]/10 text-[#CCA761] flex items-center justify-between font-medium">
                        MKT GERAL <CheckCircle2 size={14} />
                      </button>
                      <div className="px-3 pt-2 mt-2 border-t border-[#CCA761]/10">
                        <button className="w-full text-left px-3 py-2 text-sm text-[#CCA761]/60 hover:text-[#CCA761] hover:bg-[#CCA761]/10 transition-colors rounded-lg flex items-center gap-2 font-medium">
                          <Plus size={16} /> Criar Novo Fluxo
                        </button>
                      </div>
                    </div>
                  </>
                )}
                {/* Linha Decorativa Fina do MAYUS */}
                <div className="mt-1.5 h-[1px] w-full bg-gradient-to-r from-[#CCA761]/40 to-transparent" />
              </div>
              <p className="text-[9px] font-black tracking-[0.25em] uppercase text-[#CCA761]/40 mt-1">FLUXO EDITORIAL • {storageLabel}</p>
            </div>
          </div>
          
                              <div className="flex items-center gap-3 flex-wrap md:justify-start">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#111] border border-white/5 rounded-lg text-gray-500">
              <Search size={14} />
              <span className="text-xs font-bold uppercase tracking-widest">Pesquisar</span>
            </div>
            
            <div className="flex items-center bg-[#111] border border-white/5 rounded-lg p-1">
              <button className="p-2 rounded-md flex items-center gap-2 bg-white/10 text-white shadow-sm">
                <LayoutTemplate size={16} /> <span className="text-xs font-bold uppercase hidden sm:inline">Board</span>
              </button>
              <button className="p-2 rounded-md flex items-center gap-2 text-gray-500 hover:text-white hover:bg-white/5 transition-colors">
                <List size={16} /> <span className="text-xs font-bold uppercase hidden sm:inline">Lista</span>
              </button>
            </div>
            
            <button className="flex items-center gap-2 px-4 py-2 bg-[#CCA761] hover:bg-[#b08e4d] text-black rounded-lg transition-all shadow-[0_0_20px_rgba(204,167,97,0.3)] font-bold text-xs uppercase tracking-widest">
              <Plus size={16} /> <span className="hidden sm:inline">Novo Item</span>
            </button>
            
            <Link href="/dashboard/marketing/kanban/config" className="flex items-center gap-2 p-2.5 bg-white/5 hover:bg-[#CCA761]/10 text-gray-400 hover:text-[#CCA761] border border-white/5 rounded-lg transition-colors" title="Configuracoes">
              <Settings size={18} /> <span className="text-xs font-bold hidden sm:inline">Configurar</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Colunas Premium */}
      <div className="flex-1 overflow-hidden p-6"><section className="grid gap-4 xl:grid-cols-4 h-full">
        {columns.map((column) => {
          const Icon = column.icon;
          const items = grouped[column.status];
          const colColor = column.color;

          return (
            <div
              key={column.status}
              className="min-h-[520px] flex flex-col rounded-2xl overflow-hidden border"
              style={{ background: '#0a0a0a', borderColor: `${colColor}25`, boxShadow: `0 8px 32px rgba(0,0,0,0.7)` }}
            >
              {/* Column Header — Estilo CRM Premium */}
              <div
                className="relative flex items-center justify-between gap-3 px-4 py-3.5 border-b rounded-t-2xl overflow-hidden"
                style={{ borderColor: `${colColor}50` }}
              >
                {/* Fundo colorido vibrante com vidro */}
                <div className="absolute inset-0 rounded-t-2xl" style={{ background: `linear-gradient(180deg, ${colColor}90 0%, ${colColor}75 100%)`, backdropFilter: 'blur(20px)' }} />
                
                {/* Linha neon animada no topo */}
                <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden">
                  <div className="col-neon-line h-full w-1/2" style={{ background: `linear-gradient(90deg, transparent, ${colColor}, white, ${colColor}, transparent)`, boxShadow: `0 0 12px 2px ${colColor}` }} />
                </div>
                
                <div className="relative flex items-center w-full z-10">
                  {/* Círculo com número - estilo foto */}
                  <span className="h-6 w-6 flex items-center justify-center rounded-full border bg-black/40 text-[10px] font-black text-white font-montserrat" style={{ borderColor: 'rgba(255,255,255,0.2)' }}>{items.length}</span>
                  
                  {/* Título Branco Centralizado */}
                  <h2 className="flex-1 text-center text-lg font-cormorant font-bold italic tracking-tight text-white drop-shadow-md">
                    {column.title}
                  </h2>
                  
                  {/* Plus icon transparente */}
                  <button className="h-6 w-6 flex items-center justify-center rounded-full border border-white/10 hover:bg-white/20 transition-colors text-white/60 hover:text-white">
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              <div className="flex-1 p-4 overflow-y-auto no-scrollbar grid gap-3">
                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/[0.08] p-4 text-sm text-zinc-600 text-center">
                    Nenhuma pauta aqui.
                  </p>
                ) : items.map((item) => (
                  <article
                    key={item.id}
                    className="kanban-card group relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 cursor-pointer"
                  >
                    {/* Shimmer beam */}
                    <div
                      className="card-shimmer absolute inset-0 pointer-events-none pointer-events-none"
                      style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)', willChange: 'transform' }}
                    />
                    {/* Neon top line on hover */}
                    <div
                      className="absolute top-0 left-6 right-6 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{ background: `linear-gradient(90deg, transparent, ${colColor}55, transparent)` }}
                    />
                    {/* Left accent bar */}
                    <div
                      className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full"
                      style={{ backgroundColor: colColor, boxShadow: `0 0 10px ${colColor}70` }}
                    />

                    <div className="relative flex items-start justify-between gap-3">
                      <div className="pl-2">
                        <p className="text-[10px] font-montserrat font-black uppercase tracking-[0.22em] text-[#CCA761]">{item.channel}</p>
                        <h3 className="mt-2 text-[13px] font-bold leading-5 text-[#e2e2e2] group-hover:text-[#CCA761] transition-colors duration-300">{item.title}</h3>
                      </div>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-zinc-500">{item.date}</span>
                    </div>

                    <div className="relative mt-3 grid gap-1.5 text-xs text-zinc-600 pl-2">
                      <p><span className="font-bold text-zinc-400">Area:</span> {item.legalArea}</p>
                      <p><span className="font-bold text-zinc-400">Publico:</span> {item.audience}</p>
                      <p><span className="font-bold text-zinc-400">Objetivo:</span> {item.objective}</p>
                      <p><span className="font-bold text-zinc-400">Tom:</span> {item.tone}</p>
                    </div>

                    <div className="relative mt-4 flex flex-wrap gap-2">
                      {nextActions.filter((action) => action.status !== item.status).map((action) => (
                        <button
                          key={action.status}
                          type="button"
                          onClick={() => moveItem(item.id, action.status)}
                          className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-montserrat font-black uppercase tracking-[0.14em] text-zinc-500 transition-all hover:border-[#CCA761]/40 hover:text-[#CCA761] hover:shadow-[0_0_8px_rgba(204,167,97,0.15)]"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </section>
      </div>
    </main>
  );
}