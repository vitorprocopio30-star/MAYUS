"use client";

import Link from "next/link";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { ArrowRight, Building2, CalendarDays, CheckCircle2, Images, LayoutDashboard, Megaphone, Sparkles, Upload, Save, Target, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { buildMarketingReadiness } from "@/lib/marketing/marketing-readiness";
import {
  loadLocalMarketingState,
  loadRemoteMarketingState,
  saveLocalMarketingState,
  shouldUseRemoteMarketingState,
  type MarketingState,
} from "@/lib/marketing/local-persistence";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800", "900"] });

const marketingAreas = [
  {
    title: "Perfil e Canais",
    description: "Posicionamento, áreas, públicos, redes, sites e referências.",
    href: "/dashboard/marketing/perfil",
    icon: Building2,
    label: "Base Operacional",
    color: "#CCA761",
  },
  {
    title: "Kanban Marketing",
    description: "Acompanhe pautas por status: rascunho, aprovado e publicado.",
    href: "/dashboard/marketing/kanban",
    icon: LayoutDashboard,
    label: "Fluxo Editorial",
    color: "#34d399",
  },
  {
    title: "Referências",
    description: "Benchmarks, repertório visual e ideias para futuras campanhas.",
    href: "/dashboard/marketing/referencias",
    icon: Images,
    label: "Pesquisa Criativa",
    color: "#818cf8",
  },
  {
    title: "Calendário Editorial",
    description: "Planeje pautas, datas-chave e cadência de publicação por canal.",
    href: "/dashboard/marketing/calendario",
    icon: CalendarDays,
    label: "Planejamento",
    color: "#f472b6",
  },
  {
    title: "Meta Ads Upload",
    description: "Centralize os arquivos e instruções antes da subida de criativos.",
    href: "/dashboard/marketing/meta-ads",
    icon: Upload,
    label: "Mídia Paga",
    color: "#60a5fa",
  },
  {
    title: "Conteúdos Aprovados",
    description: "Acesse peças liberadas para publicação e reaproveitamento.",
    href: "/dashboard/marketing/aprovados",
    icon: CheckCircle2,
    label: "Prontos para Uso",
    color: "#4ade80",
  },
];

export default function MarketingPage() {
  const [state, setState] = useState<MarketingState | null>(null);
  const [storageLabel, setStorageLabel] = useState("Sincronizando");

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      const localState = loadLocalMarketingState();
      const remoteState = await loadRemoteMarketingState().catch(() => null);
      const useRemote = shouldUseRemoteMarketingState(remoteState);
      const sourceState = useRemote ? remoteState! : localState;
      if (cancelled) return;

      setState(sourceState);
      saveLocalMarketingState(sourceState);
      setStorageLabel(useRemote ? "Servidor" : "Local");
    }

    void loadState();
    return () => { cancelled = true; };
  }, []);

  const readiness = useMemo(() => buildMarketingReadiness(state), [state]);

  return (
    <main className={`min-h-screen bg-[#050505] px-6 py-8 text-foreground lg:px-10 ${montserrat.className}`}>
      
      {/* HEADER MAYUS PREMIUM */}
      <header className="mb-12">
        <div className="flex items-center gap-2 mb-1">
          <Megaphone size={16} className="text-[#CCA761]" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#CCA761]/60">Growth OS</span>
        </div>
        <h1 className={`text-5xl lg:text-6xl text-[#CCA761] ${cormorant.className} italic tracking-tight drop-shadow-[0_0_20px_rgba(204,167,97,0.3)]`}>
          Marketing
        </h1>
        <div className="mt-2 h-[1px] w-64 bg-gradient-to-r from-[#CCA761]/50 to-transparent" />
        
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-gray-400 font-medium italic">
          &quot;O marketing de excelência não é apenas visibilidade, é a engenharia de percepção que sustenta o crescimento do escritório.&quot;
        </p>
      </header>

      {/* HERO SECTION - DIAGNÓSTICO */}
      <section className="grid gap-8 xl:grid-cols-[1fr_1.2fr] mb-12">
        <div className="relative overflow-hidden rounded-3xl border border-[#CCA761]/20 bg-gradient-to-br from-[#111] to-[#050505] p-8 shadow-2xl group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#CCA761]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-[#CCA761]/10 transition-colors duration-700" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#CCA761]">Diagnóstico de Prontidão</p>
                <h2 className={`text-3xl lg:text-4xl mt-2 text-white font-bold tracking-tight`}>{readiness.score}% <span className="text-gray-500 font-medium text-lg tracking-normal">Geral</span></h2>
              </div>
              <div className="h-14 w-14 flex items-center justify-center rounded-2xl border border-[#CCA761]/30 bg-[#CCA761]/10 text-[#CCA761] shadow-[0_0_15px_rgba(204,167,97,0.2)] animate-pulse">
                <TrendingUp size={28} />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-white font-bold text-lg mb-2">{readiness.headline}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{readiness.summary}</p>
              </div>

              <div className="h-3 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="h-full bg-gradient-to-r from-[#CCA761] to-[#eadd87] rounded-full shadow-[0_0_15px_rgba(204,167,97,0.5)] transition-all duration-1000" 
                  style={{ width: `${readiness.score}%` }} 
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {readiness.checks.map((check) => (
                  <Link
                    key={check.id}
                    href={check.href}
                    className="flex flex-col p-4 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-[#CCA761]/30 transition-all group/check"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{check.label}</span>
                      <span className={`h-2 w-2 rounded-full shadow-[0_0_8px_currentcolor] ${check.complete ? "bg-emerald-500" : "bg-amber-500"}`} />
                    </div>
                    <p className="text-xs text-white font-bold group-hover:text-[#CCA761] transition-colors">{check.cta}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RECOMENDAÇÕES DA IA */}
        <div className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(204,167,97,0.05),transparent)] pointer-events-none" />
          
          <div className="flex items-center justify-between mb-8 relative z-10">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#CCA761]">MAYUS Intelligence</p>
              <h2 className="text-2xl mt-1 text-white font-bold tracking-tight">Próximos Passos</h2>
            </div>
            <Sparkles size={20} className="text-[#CCA761] animate-pulse" />
          </div>

          <div className="space-y-4 relative z-10">
            {readiness.recommendedActions.map((action) => (
              <Link key={action.id} href={action.href} className="flex items-center gap-4 p-5 rounded-2xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all group/action">
                <div className={`h-10 w-10 shrink-0 flex items-center justify-center rounded-xl border ${action.priority === 'high' ? 'border-amber-500/30 bg-amber-500/10 text-amber-500' : 'border-[#CCA761]/30 bg-[#CCA761]/10 text-[#CCA761]'}`}>
                  <Target size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-white group-hover:text-[#CCA761] transition-colors">{action.title}</h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-1">{action.detail}</p>
                </div>
                <ArrowRight size={16} className="text-gray-600 group-hover:text-[#CCA761] group-hover:translate-x-1 transition-all" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* GRID DE MÓDULOS */}
      <div className="mb-8 flex items-center gap-3">
        <div className="h-4 w-1 bg-[#CCA761] rounded-full" />
        <h2 className="text-xs font-black uppercase tracking-[0.3em] text-white">Módulos Operacionais</h2>
      </div>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 mb-24">
        {marketingAreas.map((area) => {
          const Icon = area.icon;

          return (
            <Link
              key={area.href}
              href={area.href}
              className="group relative flex min-h-[260px] flex-col justify-between rounded-2xl border border-white/5 bg-[#0a0a0a] p-6 transition-all hover:-translate-y-2 hover:border-[#CCA761]/30 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-[#CCA761]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              
              <div className="relative z-10">
                <div className="mb-6 flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-gray-400 group-hover:text-[#CCA761] group-hover:border-[#CCA761]/30 group-hover:bg-[#CCA761]/5 transition-all">
                    <Icon size={24} />
                  </div>
                  <div className="h-8 w-8 flex items-center justify-center rounded-full border border-white/5 text-gray-700 group-hover:text-[#CCA761] transition-colors">
                    <ArrowRight size={16} />
                  </div>
                </div>
                
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  {area.label}
                </p>
                <h2 className={`mt-3 text-xl font-bold text-white group-hover:text-[#CCA761] transition-colors`}>{area.title}</h2>
                <p className="mt-3 text-xs leading-relaxed text-gray-500 font-medium">{area.description}</p>
              </div>
              
              <div className="relative z-10 mt-6 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#CCA761]/40 group-hover:text-[#CCA761] transition-colors">
                  Acessar Módulo
                </span>
                <div className="h-1.5 w-1.5 rounded-full bg-[#CCA761]/20 group-hover:bg-[#CCA761] transition-colors" />
              </div>
            </Link>
          );
        })}
      </section>
    </main>
  );
}

function OperationalPanel({ title, emptyText, children }: { title: string; emptyText: string; children: ReactNode[] }) {
  return (
    <section className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-8">
      <h2 className="text-xl font-bold text-white mb-6">{title}</h2>
      <div className="grid gap-4">
        {children.length ? children : (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
            <p className="text-sm text-gray-600 font-medium">{emptyText}</p>
          </div>
        )}
      </div>
    </section>
  );
}
