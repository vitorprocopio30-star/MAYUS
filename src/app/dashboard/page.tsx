"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Montserrat, Cormorant_Garamond } from "next/font/google";
import { Target, TrendingUp, TrendingDown, AlertCircle, ShieldCheck, ArrowDownRight, Users, Briefcase, Clock, Calendar, BarChart2, Star, CheckCircle, CheckCircle2, Smartphone, Mail, Instagram, Globe, Activity, ChevronDown, User as UserIcon, Wand2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });

/**
 * Hook de animação simples para os números do Dashboard
 */
function AnimatedNumber({ value, suffix = "", prefix = "", floating = false }: { value: number; suffix?: string; prefix?: string, floating?: boolean }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    const duration = 1500;
    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const expoProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = expoProgress * (end - start) + start;
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  const formatted = floating ? displayValue.toFixed(1) : Math.floor(displayValue).toLocaleString('pt-BR');
  return <span>{prefix}{formatted}{suffix}</span>;
}

function GlassCard({ children, className = "", noHover = false }: { children: React.ReactNode; className?: string; noHover?: boolean }) {
  return (
    <div className={`glass-card-premium rounded-2xl overflow-hidden p-6 relative group ${!noHover ? 'cursor-pointer' : ''} ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
      <div className="relative z-10 w-full h-full flex flex-col justify-between">
        {children}
      </div>
    </div>
  );
}

// ==========================================
// VIEWS DOS MÓDULOS
// ==========================================

const ElegantGoalGauge = ({ value, progress, label, color = "#CCA761", valuePrefix = "", valueSuffix = "%" }: { value: number, progress: number, label: string, color?: string, valuePrefix?: string, valueSuffix?: string }) => {
  const dashArray = 283;
  const cappedProgress = progress > 100 ? 100 : progress;
  const strokeOffset = dashArray - (dashArray * cappedProgress) / 100;

  return (
    <div className="relative w-20 h-20 lg:w-24 lg:h-24 flex flex-shrink-0 items-center justify-center group/gauge">
      {/* SVG com animação de radar/scanning premium */}
      <svg className="w-full h-full transform -rotate-90 overflow-visible" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" className="text-primary/5" strokeWidth="6" />

        {/* Efeito Vindo do Fundo pra Frente (Ping/Sonar 1) */}
        <circle
          cx="50" cy="50" r="45" fill="none"
          stroke={color} strokeWidth="2"
          className="opacity-40 animate-ping origin-center"
          style={{ animationDuration: '3s', filter: `blur(2px)` }}
        />

        {/* Efeito Vindo do Fundo pra Frente Atrásado (Ping/Sonar 2) */}
        <circle
          cx="50" cy="50" r="45" fill="none"
          stroke={color} strokeWidth="1"
          className="opacity-20 animate-ping origin-center delay-1000"
          style={{ animationDuration: '3s', filter: `blur(4px)` }}
        />

        {/* Brilho de fundo animado (Glow Base Fixo) */}
        <circle
          cx="50" cy="50" r="45" fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={dashArray} strokeDashoffset={strokeOffset}
          className="opacity-10 transition-all duration-1500"
          style={{ filter: `blur(8px)` }}
        />

        {/* Anel de Progresso Central com Neon (Girando) */}
        <circle
          cx="50" cy="50" r="45" fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={dashArray} strokeDashoffset={strokeOffset}
          className="animate-[spin_4s_linear_infinite] origin-center transition-all duration-[2000ms] ease-out stroke-linecap-round"
          style={{ filter: `drop-shadow(0 0 6px ${color}cc)` }}
        />

        {/* Partículas Espalhadas (Efeito Emergindo Individualmente/Não-Circular) */}
        <circle cx="20" cy="25" r="1.5" fill="white" className="opacity-0 animate-ping" style={{ animationDuration: '4s', animationDelay: '0s' }} />
        <circle cx="85" cy="35" r="1" fill="white" className="opacity-0 animate-ping" style={{ animationDuration: '3s', animationDelay: '1.5s' }} />
        <circle cx="75" cy="80" r="2" fill="white" className="opacity-0 animate-ping" style={{ animationDuration: '5s', animationDelay: '0.8s' }} />
        <circle cx="15" cy="70" r="1" fill="white" className="opacity-0 animate-ping" style={{ animationDuration: '3.5s', animationDelay: '2.2s' }} />
        <circle cx="50" cy="15" r="1.5" fill="white" className="opacity-0 animate-ping" style={{ animationDuration: '4.5s', animationDelay: '1s' }} />
      </svg>

      {/* Texto Centralizado e Fixo */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="flex flex-col items-center group-hover/gauge:scale-110 transition-transform duration-500">
          <span className="text-base lg:text-xl font-black text-foreground leading-none tracking-tighter drop-shadow-md">
            {valuePrefix}<AnimatedNumber value={value} />{valueSuffix}
          </span>
          <span className="text-[7px] lg:text-[8px] text-[#CCA761] uppercase tracking-[0.2em] font-black mt-1.5 opacity-80">{label}</span>
        </div>
      </div>
    </div>
  );
};

const ElegantResumoChart = () => (
  <div className="w-full h-56 relative group mt-4">
    <svg className="w-full h-full overflow-visible" viewBox="0 0 500 200" preserveAspectRatio="none">
      <defs>
        <linearGradient id="glow-rev" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#4ade80" stopOpacity="0.0" />
        </linearGradient>
        <linearGradient id="glow-cost" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f87171" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f87171" stopOpacity="0.0" />
        </linearGradient>
        <filter id="glow-fx">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Grid horizontal ultrafino */}
      <line x1="0" y1="40" x2="500" y2="40" stroke="rgba(255,255,255,0.03)" strokeDasharray="3" />
      <line x1="0" y1="100" x2="500" y2="100" stroke="rgba(255,255,255,0.03)" strokeDasharray="3" />
      <line x1="0" y1="160" x2="500" y2="160" stroke="rgba(255,255,255,0.03)" strokeDasharray="3" />

      {/* Custos (Vermelho) - Polygon and Polyline */}
      <polygon points="0,200 50,150 150,130 250,145 350,110 450,135 500,100 500,200" fill="url(#glow-cost)" className="transition-all duration-1000" />
      <polyline points="0,150 50,150 150,130 250,145 350,110 450,135 500,100" fill="none" stroke="#f87171" strokeWidth="2" filter="url(#glow-fx)" />

      {/* Receita (Ouro / Verde) */}
      <polygon points="0,200 50,170 150,110 250,90 350,60 450,40 500,20 500,200" fill="url(#glow-rev)" className="transition-all duration-1000" />
      <polyline points="0,170 50,170 150,110 250,90 350,60 450,40 500,20" fill="none" stroke="#4ade80" strokeWidth="2.5" filter="url(#glow-fx)" />

      {/* Marcadores de Destaque Receita */}
      <circle cx="500" cy="20" r="4" fill="#ffffff" filter="url(#glow-fx)" className="animate-pulse" />
      <circle cx="450" cy="40" r="3" fill="#4ade80" />
      <circle cx="350" cy="60" r="3" fill="#4ade80" />

      {/* Marcadores de Destaque Custos */}
      <circle cx="500" cy="100" r="3" fill="#f87171" />
      <circle cx="350" cy="110" r="3" fill="#f87171" />
    </svg>
    <div className="absolute bottom-0 w-full flex justify-between text-[8px] text-gray-500 uppercase font-bold px-0 pointer-events-none transform translate-y-6">
      <span>Out</span>
      <span>Nov</span>
      <span>Dez</span>
      <span>Jan</span>
      <span>Fev</span>
      <span>Mar</span>
      <span>Abr</span>
    </div>
  </div>
);

const ResumoView = ({ metrics, officeGoals = [] }: { metrics: any, officeGoals?: any[] }) => {
  // Buscar metas dinâmicas configuradas
  const targetRevenueGoal = officeGoals.find(g => g.unit === 'R$');
  const targetContractsGoal = officeGoals.find(g => g.unit === 'CTR');

  const TARGET_REVENUE = targetRevenueGoal ? Number(targetRevenueGoal.value) : 40000;
  const TARGET_CONTRACTS = targetContractsGoal ? Number(targetContractsGoal.value) : 25;

  const revenueProgress = Math.round((metrics.totalRevenue / TARGET_REVENUE) * 100);
  const missingRevenue = Math.max(0, TARGET_REVENUE - metrics.totalRevenue);

  const contractsProgress = Math.round((metrics.activeContracts / TARGET_CONTRACTS) * 100);
  const missingContracts = Math.max(0, TARGET_CONTRACTS - metrics.activeContracts);
  const missingContractsProgress = Math.round((missingContracts / TARGET_CONTRACTS) * 100);

  // Outras metas customizadas (KPIs Estratégicos)
  const otherGoals = officeGoals.filter(g => g.unit !== 'R$' && g.unit !== 'CTR');

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* Primeira Linha: Duas Caixas Master (Faturamento e Processos) - EM DESTAQUE */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">

        {/* Caixa 1: Metas Mensais & Faturamento */}
        <GlassCard className="flex flex-col justify-between border-2 border-primary/40 bg-gradient-to-br from-card via-card to-primary/10 px-8 py-7 shadow-lg ring-1 ring-inset ring-primary/20">
          <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_var(--primary)]"></span>
                <p className="text-[11px] text-primary uppercase tracking-[0.25em] font-black">Meta Mensal • {targetRevenueGoal?.name || 'Comercial'}</p>
              </div>
              <div className="flex flex-col mb-4">
                <h3 className="text-5xl 2xl:text-6xl font-black text-foreground tracking-tighter italic drop-shadow-[0_0_25px_rgba(204,167,97,0.3)]">
                  <span className="text-2xl 2xl:text-3xl text-[#CCA761] not-italic mr-2">R$</span><AnimatedNumber value={metrics.totalRevenue} />
                </h3>
              </div>
              <div className="flex flex-wrap gap-4 items-center">
                <div className="px-3 py-1 bg-secondary rounded-full border border-primary/30">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Alvo: R$ {TARGET_REVENUE.toLocaleString('pt-BR')}</span>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1 bg-[#4ade80]/10 rounded-full border border-[#4ade80]/20 ${missingRevenue === 0 ? 'bg-[#CCA761]/20 border-[#CCA761]/40' : ''}`}>
                  <TrendingUp size={12} className={missingRevenue === 0 ? 'text-[#CCA761]' : 'text-[#4ade80]'} />
                  <span className={`text-[10px] ${missingRevenue === 0 ? 'text-[#CCA761]' : 'text-[#4ade80]'} font-bold uppercase tracking-wider`}>
                    {missingRevenue === 0 ? 'Meta Batida!' : `Faltam R$ ${missingRevenue.toLocaleString('pt-BR')}`}
                  </span>
                </div>
              </div>
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex flex-col items-center justify-center min-w-[140px]">
              <p className="text-[9px] text-muted-foreground font-black uppercase tracking-[0.2em] mb-2">{targetContractsGoal?.name || 'Contratos Ativos'}</p>
              <div className="text-4xl font-black text-foreground italic tracking-tighter">
                <AnimatedNumber value={metrics.activeContracts} />
              </div>
              <p className="text-[10px] text-primary font-bold mt-1">Alvo: {TARGET_CONTRACTS}</p>
            </div>
          </div>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-6" />
          <div className="flex justify-between items-center px-4">
            <ElegantGoalGauge value={revenueProgress} progress={revenueProgress} label="Alcançado" color="#CCA761" />
            <ElegantGoalGauge value={metrics.activeContracts} progress={contractsProgress} label="Contratos" color="#ffffff" valueSuffix="" />
            <ElegantGoalGauge value={missingContracts} progress={missingContractsProgress} label="Faltam" color="#f87171" valueSuffix="" />
          </div>
        </GlassCard>

        {/* Caixa 2 em diante: KPIs Dinâmicos Estratégicos (Mapeamento Total para Meta Master com Inteligência de Dados) */}
        {otherGoals.map((goal, index) => {
          const colors = ["#22d3ee", "#b4a0f8", "#CCA761", "#4ade80", "#f87171"];
          const color = colors[index % colors.length];
          
          // INTELIGÊNCIA DE DADOS: Escolhendo a fonte real do valor
          let realValue = 0;
          
          if (goal.source === 'manual') {
            realValue = Number(goal.currentValue) || 0;
          } else if (goal.source === 'vendas') {
            realValue = metrics.activeContracts; // Contratos fechados reais
          } else if (goal.source === 'leads') {
            realValue = 0; // Futuro: Count from leads table
          } else if (goal.source === 'agendamentos' || goal.unit === 'AGD') {
            realValue = 0; // Futuro: Count from agenda
          }

          const targetValue = Number(goal.value) || 1;
          const progress = Math.min(100, Math.round((realValue / targetValue) * 100));
          const missing = Math.max(0, targetValue - realValue);
          const missingProgress = Math.round((missing / targetValue) * 100);

          return (
            <GlassCard key={goal.id} className="flex flex-col justify-between border-2 border-primary/40 bg-gradient-to-br from-card via-card to-primary/10 px-8 py-7 shadow-lg ring-1 ring-inset ring-primary/20">
              <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_var(--primary)]"></span>
                    <p className="text-[11px] text-primary uppercase tracking-[0.25em] font-black">Meta do Escritório • {goal.name}</p>
                  </div>
                  <div className="flex flex-col mb-4">
                    <h3 className="text-5xl 2xl:text-6xl font-black text-foreground tracking-tighter italic drop-shadow-[0_0_25px_rgba(204,167,97,0.3)]">
                      <AnimatedNumber value={realValue} /> <span className="text-2xl 2xl:text-3xl text-muted-foreground not-italic ml-2">{goal.unit}</span>
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-4 items-center">
                    <div className="px-3 py-1 bg-secondary rounded-full border border-primary/30">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Alvo: {targetValue} {goal.unit}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1 bg-[#4ade80]/10 rounded-full border border-[#4ade80]/20 ${missing === 0 ? 'bg-primary/20 border-primary/40' : ''}`}>
                      <TrendingUp size={12} className={missing === 0 ? 'text-primary' : 'text-[#4ade80]'} />
                      <span className={`text-[10px] ${missing === 0 ? 'text-primary' : 'text-[#4ade80]'} font-bold uppercase tracking-wider`}>
                        {missing === 0 ? 'Meta Batida!' : `Faltam ${missing} ${goal.unit}`}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex flex-col items-center justify-center min-w-[140px]">
                  <p className="text-[9px] text-muted-foreground font-black uppercase tracking-[0.2em] mb-2">EFICIÊNCIA</p>
                  <div className="text-4xl font-black text-foreground italic tracking-tighter">
                    {progress}%
                  </div>
                  <p className="text-[10px] text-primary font-bold mt-1">Global</p>
                </div>
              </div>
              <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-6" />
              <div className="flex justify-between items-center px-4">
                <ElegantGoalGauge value={progress} progress={progress} label="Realizado" color={color} />
                <ElegantGoalGauge value={targetValue} progress={100} label="Alvo" color="#ffffff" valueSuffix="" />
                <ElegantGoalGauge value={missing} progress={missingProgress} label="Faltam" color="#f87171" valueSuffix="" />
              </div>
            </GlassCard>
          );
        })}
      </div>


      {/* Segunda Linha: KPI ROIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlassCard className="flex items-center justify-between p-5 border border-primary/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#CCA761]/10 flex items-center justify-center border border-[#CCA761]/40">
              <Globe size={20} className="text-[#CCA761]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-400 font-black tracking-widest uppercase mb-1">ROI de Ads</span>
              <span className="text-3xl font-black text-white"><AnimatedNumber value={4.8} floating />x</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-[#4ade80] font-bold">+12%</span>
          </div>
        </GlassCard>

        <GlassCard className="flex items-center justify-between p-5 border border-green-500/20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#4ade80]/10 flex items-center justify-center border border-[#4ade80]/30">
              <Target size={20} className="text-[#4ade80]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-400 font-black tracking-widest uppercase mb-1">ROI Closer</span>
              <span className="text-3xl font-black text-white"><AnimatedNumber value={8.4} floating />x</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[8px] text-[#0a0a0a] font-black uppercase px-2 py-0.5 rounded-sm bg-[#4ade80]">Top</span>
          </div>
        </GlassCard>

        <GlassCard className="flex items-center justify-between p-5 border border-border">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
              <Activity size={20} className="text-gray-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 font-black tracking-widest uppercase mb-1">Operação</span>
              <span className="text-3xl font-black text-white">96%</span>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Terceira Linha: Gráfico e Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassCard className="lg:col-span-2 border border-[#CCA761]/20">
          <h4 className="text-[10px] text-[#CCA761] font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
            <Activity size={14} /> Fluxo Multisetorial
          </h4>
          <ElegantResumoChart />
        </GlassCard>

        <GlassCard className="border border-white/5">
          <h4 className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
            <AlertCircle size={14} className="text-[#f87171]" /> Radar de Atenção
          </h4>
          <div className="space-y-4">
            <div className="p-3.5 bg-[#f87171]/10 rounded-lg border border-[#f87171]/20">
              <span className="text-xs font-bold text-[#f87171]">Inadimplência Elevada</span>
              <p className="text-[10px] text-gray-400 mt-1">12 parcelas vencidas totalizando R$ 1.400,00.</p>
            </div>
            <div className="p-3.5 bg-[#CCA761]/10 rounded-lg border border-[#CCA761]/20">
              <span className="text-xs font-bold text-[#CCA761]">Alto No-Show</span>
              <p className="text-[10px] text-gray-400 mt-1">Ausências nas reuniões em 29%.</p>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

// ==========================================
// GRAFICOS CUSTOMIZADOS (SVG/CSS)
// ==========================================

const ElegantAreaChart = () => (
  <GlassCard className="lg:col-span-3 border border-[#CCA761]/30 hover:border-[#CCA761]/50 transition-colors">
    <div className="flex justify-between items-start mb-6 relative z-20">
      <h4 className="text-[10px] text-[#CCA761] font-bold uppercase tracking-widest flex items-center gap-2">
        <TrendingUp size={14} /> Histórico de Receita (14 Dias)
      </h4>
      <div className="text-right">
        <p className="text-3xl font-black text-[#4ade80] tracking-tighter drop-shadow-[0_0_15px_rgba(74,222,128,0.2)]">R$ <AnimatedNumber value={42500} /></p>
        <p className="text-[9px] text-[#CCA761] uppercase tracking-widest">+18% contra período anterior</p>
      </div>
    </div>

    <div className="w-full h-48 relative group">
      <svg className="w-full h-full overflow-visible" viewBox="0 0 400 150" preserveAspectRatio="none">
        <defs>
          <linearGradient id="cyber-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#CCA761" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#CCA761" stopOpacity="0.0" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grids */}
        <line x1="0" y1="30" x2="400" y2="30" stroke="rgba(204,167,97,0.1)" strokeDasharray="4" />
        <line x1="0" y1="70" x2="400" y2="70" stroke="rgba(204,167,97,0.1)" strokeDasharray="4" />
        <line x1="0" y1="110" x2="400" y2="110" stroke="rgba(204,167,97,0.1)" strokeDasharray="4" />

        {/* Curva Suavizada em Ouro */}
        <polygon points="0,150 40,120 80,130 120,90 160,105 200,60 240,40 280,80 320,30 360,50 400,10 400,150" fill="url(#cyber-glow)" className="transition-all duration-1000" />

        <polyline points="0,150 40,120 80,130 120,90 160,105 200,60 240,40 280,80 320,30 360,50 400,10" fill="none" stroke="#CCA761" strokeWidth="2.5" filter="url(#glow)" />

        {/* Pulsing Dots */}
        <circle cx="400" cy="10" r="4" fill="#ffffff" filter="url(#glow)" className="animate-pulse" />
        <circle cx="320" cy="30" r="3" fill="#CCA761" />
        <circle cx="240" cy="40" r="3" fill="#CCA761" />
        <circle cx="200" cy="60" r="3" fill="#CCA761" />
        <circle cx="120" cy="90" r="3" fill="#CCA761" />
      </svg>
    </div>
  </GlassCard>
);

const ComercialView = ({ metrics, officeGoals = [] }: { metrics: any, officeGoals?: any[] }) => {
  const targetRevenueGoal = officeGoals.find(g => g.unit === 'R$');
  const targetVal = targetRevenueGoal ? Number(targetRevenueGoal.value) : 50000;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Alta Gestão de KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <GlassCard shadow-lg>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Receita Fechada vs. Meta</p>
          <h3 className="text-3xl font-bold text-[#4ade80] tracking-wide mt-2">
            R$ <AnimatedNumber value={metrics.totalRevenue} />
          </h3>
          <div className="w-full bg-black h-1 mt-3 rounded-full overflow-hidden">
            <div className="bg-[#4ade80] h-full" style={{ width: `${Math.min(100, (metrics.totalRevenue / targetVal) * 100)}%` }} />
          </div>
          <p className="text-[10px] text-gray-400 mt-2">{Math.floor(((metrics.totalRevenue / targetVal) * 100) || 0)}% de R$ {targetVal.toLocaleString('pt-BR')}</p>
        </GlassCard>

      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Ticket Médio (Fechamentos)</p>
        <h3 className="text-3xl font-bold text-[#b4a0f8] tracking-wide mt-2">
          R$ <AnimatedNumber value={metrics.averageTicket} />
        </h3>
        <p className="text-[10px] text-[#4ade80] mt-2 flex items-center gap-1"><TrendingUp size={12} /> +12% vs. mês passado</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Comissões Devidas</p>
        <h3 className="text-3xl font-bold text-[#CCA761] tracking-wide mt-2">
          R$ <AnimatedNumber value={metrics.totalCommissions} />
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Valores para SDR/Closer</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Pipeline Aberto</p>
        <h3 className="text-3xl font-bold text-[#22d3ee] tracking-wide mt-2">
          R$ <AnimatedNumber value={metrics.openPipeline} />
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Potencial ativo</p>
      </GlassCard>
    </div>

    {/* Grid de Alta Performance */}
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <ElegantAreaChart />

      {/* Funnel Fatiado Lateral */}
      <GlassCard className="lg:col-span-1 border border-[#CCA761]/20">
        <h4 className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
          <Target size={14} className="text-[#CCA761]" /> Funil de Conversão MTO
        </h4>
        <div className="flex flex-col items-center gap-1.5 w-full">
          <div className="w-[100%] bg-[#22d3ee]/20 border border-[#22d3ee]/50 text-center py-3 rounded-t-lg relative">
            <span className="text-sm font-bold text-white relative z-10"><AnimatedNumber value={320} /> Leads</span>
          </div>
          <div className="w-[85%] bg-[#b4a0f8]/20 border border-[#b4a0f8]/50 text-center py-3 rounded-sm relative">
            <span className="text-sm font-bold text-white relative z-10"><AnimatedNumber value={155} /> Agendamentos</span>
            <span className="absolute -right-2 top-1/2 -translate-y-1/2 translate-x-full text-[9px] text-gray-400 font-bold bg-black px-1 rounded">48%</span>
          </div>
          <div className="w-[70%] bg-[#CCA761]/20 border border-[#CCA761]/50 text-center py-3 rounded-sm relative shadow-[0_0_10px_rgba(204,167,97,0.2)]">
            <span className="text-sm font-bold text-[#f1d58d] relative z-10"><AnimatedNumber value={110} /> Realizadas</span>
            <span className="absolute -right-2 top-1/2 -translate-y-1/2 translate-x-full text-[9px] text-[#CCA761] font-bold bg-black px-1 rounded border border-[#CCA761]/30">71%</span>
          </div>
          <div className="w-[50%] bg-[#4ade80]/20 border border-[#4ade80]/50 text-center py-3 rounded-b-lg relative">
            <span className="text-sm font-bold text-white relative z-10"><AnimatedNumber value={metrics.activeContracts} /> Fechamentos</span>
            <span className="absolute -right-2 top-1/2 -translate-y-1/2 translate-x-full text-[9px] text-[#4ade80] font-bold bg-black px-1 rounded">16%</span>
          </div>
        </div>
        <div className="mt-8 pt-4 border-t border-white/5 flex flex-col justify-between text-xs gap-2">
          <div className="flex justify-between items-center"><span className="text-gray-500">Ticket Médio:</span><span className="text-white font-bold">R$ {metrics.averageTicket.toLocaleString('pt-BR')}</span></div>
          <div className="flex justify-between items-center"><span className="text-gray-500">Taxa de No-Show:</span><span className="text-[#f87171] font-bold">29%</span></div>
        </div>
      </GlassCard>
    </div>

    {/* Tabela de ROI do Closer */}
    <div className="grid grid-cols-1 gap-6">
      <GlassCard>
        <h4 className="text-[10px] text-[#CCA761] font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
          <UserIcon size={14} className="text-[#CCA761]" /> ROI de Vendas por Executivo (Closer)
        </h4>
        <div className="w-full text-sm text-left overflow-x-auto">
          <div className="grid grid-cols-6 min-w-[700px] text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2 pb-2 border-b border-white/5">
            <span className="col-span-2">Closer (Executivo)</span>
            <span>Investimento (Custo/Mês)</span>
            <span>Receita Gerada</span>
            <span>Taxa Conv.</span>
            <span className="text-right">R.O.I.</span>
          </div>

          {/* Closer 1 */}
          <div className="grid grid-cols-6 min-w-[700px] py-4 border-b border-white/5 items-center group hover:bg-white/5 transition-colors px-2 rounded-lg">
            <div className="col-span-2 flex items-center gap-3">
              <div className="w-8 h-8 rounded border border-[#CCA761] flex items-center justify-center bg-[#CCA761]/10 text-[#CCA761] font-bold text-xs shadow-[0_0_10px_rgba(204,167,97,0.2)]">AS</div>
              <div>
                <p className="text-gray-200 font-bold text-sm uppercase tracking-wide">Ana S. <span className="text-[9px] text-[#CCA761] font-normal border border-[#CCA761]/30 rounded px-1 ml-1 bg-[#CCA761]/10">SÊNIOR</span></p>
                <p className="text-[10px] text-gray-500 font-mono mt-0.5"><AnimatedNumber value={85} /> Leads trabalhados</p>
              </div>
            </div>
            <span className="text-[#f87171] font-mono text-xs">R$ 4.500,00</span>
            <span className="text-[#4ade80] font-mono font-bold text-sm">R$ 38.000,00</span>
            <div className="flex gap-2 items-center">
              <span className="text-white text-xs font-bold">42%</span>
              <div className="w-12 h-1.5 bg-[#111] rounded-full"><div className="bg-[#CCA761] h-full rounded-full" style={{ width: '42%' }}></div></div>
            </div>
            <span className="text-[#CCA761] font-black italic text-2xl text-right drop-shadow-[0_0_15px_rgba(204,167,97,0.5)]"><AnimatedNumber value={8.4} floating />x</span>
          </div>

          {/* Closer 2 */}
          <div className="grid grid-cols-6 min-w-[700px] py-4 border-b border-white/5 items-center group hover:bg-white/5 transition-colors px-2 rounded-lg">
            <div className="col-span-2 flex items-center gap-3">
              <div className="w-8 h-8 rounded border border-white/10 flex items-center justify-center bg-[#111] text-gray-500 font-bold text-xs">RV</div>
              <div>
                <p className="text-gray-400 font-bold text-sm uppercase tracking-wide">Roberto V.</p>
                <p className="text-[10px] text-gray-500 font-mono mt-0.5"><AnimatedNumber value={62} /> Leads trabalhados</p>
              </div>
            </div>
            <span className="text-[#f87171] font-mono text-xs">R$ 2.800,00</span>
            <span className="text-[#4ade80] font-mono font-bold text-sm">R$ 15.200,00</span>
            <div className="flex gap-2 items-center">
              <span className="text-gray-400 text-xs font-bold">28%</span>
              <div className="w-12 h-1.5 bg-[#111] rounded-full"><div className="bg-gray-500 h-full rounded-full" style={{ width: '28%' }}></div></div>
            </div>
            <span className="text-gray-300 font-bold text-xl text-right"><AnimatedNumber value={5.4} floating />x</span>
          </div>

        </div>
      </GlassCard>
    </div>
    </div>
  );
};

const FinanceiroView = ({ metrics }: { metrics: any }) => (
  <div className="space-y-6 animate-fade-in-up">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Receita Total Mês</p>
        <h3 className="text-3xl font-bold text-[#4ade80] tracking-wide mt-2">
          R$ <AnimatedNumber value={metrics.revenueReceived} />
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Honorários + Êxito</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Custo Comissões</p>
        <h3 className="text-3xl font-bold text-[#CCA761] tracking-wide mt-2">
          R$ <AnimatedNumber value={metrics.totalCommissions} />
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">SDR / Closer</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">LTV Estimado (Por Cliente)</p>
        <h3 className="text-3xl font-bold text-[#22d3ee] tracking-wide mt-2">
          R$ <AnimatedNumber value={12400} />
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Média da carteira inteira</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Inadimplência</p>
        <h3 className="text-3xl font-bold text-[#f87171] tracking-wide mt-2">
          R$ <AnimatedNumber value={1400} />
        </h3>
        <p className="text-[10px] text-[#f87171] mt-2">12 parcelas vencidas</p>
      </GlassCard>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <GlassCard className="border border-[#1a1a1a]">
        <div className="space-y-6">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-3 font-bold">Resumo de Caixa</p>
            <div className="flex justify-between items-center text-sm font-medium mb-2">
              <span className="text-gray-300">Entradas (Parcelas Recebidas)</span>
              <span className="text-[#4ade80]">R$ {metrics.revenueReceived.toLocaleString('pt-BR')}</span>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-3 font-bold">Saídas (Operacional)</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Salários Base</span>
                <span className="text-[#f87171]">- R$ 10.500,00</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Comissões Pagas</span>
                <span className="text-[#f87171]">- R$ {metrics.totalCommissions.toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Marketing (Ads Google/Meta)</span>
                <span className="text-gray-500">- R$ 3.000,00</span>
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-white/5 flex justify-between items-center font-bold">
            <span className="text-gray-300">Lucro Operacional Estimado</span>
            <span className="text-[#4ade80]">R$ {(metrics.revenueReceived - metrics.totalCommissions - 13500).toLocaleString('pt-BR')}</span>
          </div>
        </div>
      </GlassCard>

      <div className="bg-card border border-primary/20 rounded-2xl flex flex-col justify-center p-8 relative overflow-hidden group hover:border-primary/40 transition-colors">
        <div className="absolute inset-x-0 h-px top-1/2 bg-gradient-to-r from-transparent via-[#CCA761]/20 to-transparent" />
        <h4 className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-6 relative z-10 flex items-center gap-2">
          <Calendar size={14} className="text-[#CCA761]" /> Projeção de Caixa
        </h4>
        <div className="flex items-end gap-2 h-32 relative z-10">
          <div className="flex-1 bg-[#1a1a1a] rounded-t-md relative group-hover:bg-[#22d3ee]/10 transition-colors h-[40%]" title="Mês Atual">
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-gray-500">Hoje</span>
          </div>
          <div className="flex-1 bg-[#1a1a1a] rounded-t-md relative group-hover:bg-[#22d3ee]/20 transition-colors h-[60%]" title="Mês +1">
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-gray-500">+30d</span>
          </div>
          <div className="flex-1 bg-[#1a1a1a] rounded-t-md relative group-hover:bg-[#22d3ee]/30 transition-colors h-[75%]" title="Mês +2">
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-gray-500">+60d</span>
          </div>
          <div className="flex-1 bg-gradient-to-t from-[#CCA761]/20 to-[#CCA761]/80 rounded-t-md relative shadow-[0_0_20px_rgba(204,167,97,0.2)] h-[100%]" title="Mês +3">
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[12px] font-bold text-[#CCA761]">+90d</span>
          </div>
        </div>
        <div className="mt-8 text-center relative z-10">
          <p className="text-xs text-gray-400">Projeção considerando parcelas Assas e acordos caindo nos próximos 90 dias.</p>
        </div>
      </div>
    </div>
  </div>
);

const MarketingView = () => (
  <div className="space-y-6 animate-fade-in-up">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Custo por Lead (CPL)</p>
        <h3 className="text-3xl font-bold text-[#f87171] tracking-wide mt-2">
          R$ <AnimatedNumber value={18.5} floating />
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Média da semana</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Volume de Leads</p>
        <h3 className="text-3xl font-bold text-[#CCA761] tracking-wide mt-2">
          <AnimatedNumber value={840} />
        </h3>
        <p className="text-[10px] text-[#4ade80] mt-2">Nas últimas 4 semanas</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Taxa Abertura Wpp/Mail</p>
        <h3 className="text-3xl font-bold text-[#22d3ee] tracking-wide mt-2">
          68.4%
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Disparos engajados</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">ROAS (Retorno em Ads)</p>
        <h3 className="text-3xl font-bold text-[#4ade80] tracking-wide mt-2">
          4.8x
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Para cada R$1, volta R$4,80</p>
      </GlassCard>
    </div>

    <GlassCard>
      <h4 className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
        <Target size={14} className="text-[#CCA761]" /> Origem dos Leads (Canais)
      </h4>
      <div className="flex gap-4 mb-4">
        <div className="flex-1 bg-[#111] border border-white/5 rounded-lg p-4 flex flex-col items-center justify-center">
          <Instagram size={24} className="text-pink-500 mb-2" />
          <span className="text-2xl font-bold text-white"><AnimatedNumber value={420} /></span>
          <span className="text-[10px] text-gray-500 uppercase mt-1">Instagram</span>
        </div>
        <div className="flex-1 bg-[#111] border border-white/5 rounded-lg p-4 flex flex-col items-center justify-center">
          <Globe size={24} className="text-blue-500 mb-2" />
          <span className="text-2xl font-bold text-white"><AnimatedNumber value={280} /></span>
          <span className="text-[10px] text-gray-500 uppercase mt-1">Google Search</span>
        </div>
        <div className="flex-1 bg-[#111] border border-white/5 rounded-lg p-4 flex flex-col items-center justify-center">
          <Users size={24} className="text-green-500 mb-2" />
          <span className="text-2xl font-bold text-white"><AnimatedNumber value={140} /></span>
          <span className="text-[10px] text-gray-500 uppercase mt-1">Indicação</span>
        </div>
      </div>
    </GlassCard>
  </div>
);

const ProcessosView = ({ metrics }: { metrics: any }) => (
  <div className="space-y-6 animate-fade-in-up">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Processos Ativos</p>
        <h3 className="text-3xl font-bold text-[#22d3ee] tracking-wide mt-2">
          <AnimatedNumber value={metrics.processActive} />
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">No portfólio geral</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Taxa de Êxito Histórica</p>
        <h3 className="text-3xl font-bold text-[#CCA761] tracking-wide mt-2">
          92%
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Decisões favoráveis</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Valor em Recuperação</p>
        <h3 className="text-3xl font-bold text-[#b4a0f8] tracking-wide mt-2">
          R$ 2.4<span className="text-xl">M</span>
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Volume potencial de causas</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Receita de Êxito (Retida)</p>
        <h3 className="text-3xl font-bold text-[#4ade80] tracking-wide mt-2">
          R$ <AnimatedNumber value={12500} />
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Média 30% no último mês</p>
      </GlassCard>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <GlassCard>
        <h4 className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-6">Distribuição por Tipo</h4>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1"><span className="text-gray-300">RMC / Cartões</span><span className="text-[#22d3ee] font-bold">55%</span></div>
            <div className="w-full bg-[#111] h-2 rounded"><div className="bg-[#22d3ee] h-full w-[55%] rounded"></div></div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1"><span className="text-gray-300">GRAM</span><span className="text-[#CCA761] font-bold">30%</span></div>
            <div className="w-full bg-[#111] h-2 rounded"><div className="bg-[#CCA761] h-full w-[30%] rounded"></div></div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1"><span className="text-gray-300">Inventários / Outros</span><span className="text-gray-400 font-bold">15%</span></div>
            <div className="w-full bg-[#111] h-2 rounded"><div className="bg-gray-500 h-full w-[15%] rounded"></div></div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="border border-[#f87171]/20">
        <h4 className="text-[10px] text-[#f87171] font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
          <AlertCircle size={14} /> Backlog & Atrasos
        </h4>
        <ul className="space-y-4 text-sm text-gray-300">
          <li className="flex justify-between items-center pb-2 border-b border-white/5">
            <span>Contratos pendentes de assinatura</span>
            <span className="bg-[#f87171]/20 text-[#f87171] px-2 py-0.5 rounded text-xs font-bold">12</span>
          </li>
          <li className="flex justify-between items-center pb-2 border-b border-white/5">
            <span>Processos Sem Movimentação (+60d)</span>
            <span className="bg-[#CCA761]/20 text-[#CCA761] px-2 py-0.5 rounded text-xs font-bold">8</span>
          </li>
        </ul>
      </GlassCard>
    </div>
  </div>
);

const AgendaView = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [criticalDeadlines, setCriticalDeadlines] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  const WEEK_DAYS = [
    { day: "Seg", date: "20", active: true },
    { day: "Ter", date: "21", active: false },
    { day: "Qua", date: "22", active: false },
    { day: "Qui", date: "23", active: false },
    { day: "Sex", date: "24", active: false },
    { day: "Sáb", date: "25", active: false },
    { day: "Dom", date: "26", active: false },
  ];

  const fetchTasks = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const tenantId = user.user_metadata?.tenant_id || user.app_metadata?.tenant_id;

    if (tenantId) {
      const { data: userTasks } = await supabase
        .from('user_tasks')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('time_text', { ascending: true });

      if (userTasks) {
        setEvents(userTasks.filter(t => !t.is_critical));
        setCriticalDeadlines(userTasks.filter(t => t.is_critical));
      } else {
        // Fallback Mock se a tabela não tiver dados ainda
        setEvents([
          { id: 1, time_text: "09:00", title: "Review de Leads Marketing", category: "Comercial", person: "Equipe SDR", type: "Reunião", color: "#CCA761", status: "Concluído" },
          { id: 2, time_text: "10:30", title: "Fechamento: Empresa Alpha S.A.", category: "Vendas", person: "Ana S. (Closer)", type: "Vídeo Chamada", color: "#4ade80", active: true },
          { id: 3, time_text: "14:00", title: "Audiência Virtual (TJSP)", category: "Judicial", person: "Dr. Marcos T.", type: "Audiência", color: "#22d3ee" },
          { id: 4, time_text: "16:30", title: "Alinhamento DRE Semanal", category: "Financeiro", person: "Sócios", type: "Interno", color: "#b4a0f8" },
          { id: 5, time_text: "18:00", title: "Follow-up leads frios", category: "CRM", person: "Equipe", type: "Automático", color: "#9ca3af" },
        ]);
      }
    }
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchTasks();

    // Inscrição Realtime da Agenda Diária
    const channel = supabase
      .channel('realtime_user_tasks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_tasks' },
        (payload) => {
          console.log("Agenda Atualizada Realtime", payload);
          fetchTasks(); // Recarrega após receber qualquer evento
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTasks, supabase]);

  const toggleStatus = async (task: any) => {
    if (!task.id || typeof task.id === 'number') return; // ignora os mocks limitados
    const newStatus = task.status === 'Concluído' ? 'Pendente' : 'Concluído';
    // Fazemos um fallback otimista (UI instantânea)
    setEvents(prev => prev.map(e => e.id === task.id ? { ...e, status: newStatus } : e));
    await supabase.from('user_tasks').update({ status: newStatus }).eq('id', task.id);
  };

  return (
    <div className="space-y-8 animate-fade-in-up">

      {/* Seletor de Semana Premium */}
      <div className="flex justify-between items-center gap-2 p-1 bg-white/5 rounded-2xl border border-white/10 shadow-inner">
        {WEEK_DAYS.map((d, i) => (
          <button
            key={i}
            className={`flex-1 flex flex-col items-center py-4 rounded-xl transition-all ${d.active ? 'bg-[#CCA761] text-[#0a0a0a] shadow-[0_0_20px_rgba(204,167,97,0.3)]' : 'hover:bg-white/5 text-gray-500 hover:text-white'}`}
          >
            <span className="text-[10px] font-black uppercase tracking-tighter mb-1">{d.day}</span>
            <span className="text-xl font-black italic">{d.date}</span>
            {d.active && <div className="w-1 h-1 bg-[#0a0a0a] rounded-full mt-2" />}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#CCA761] border-t-transparent flex rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Timeline Centralizada */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-3 bg-gradient-to-r from-[#111111] to-transparent rounded-xl border-l-[3px] border-[#CCA761] mb-6 shadow-md gap-4">
              <h3 className="text-sm font-black tracking-widest uppercase flex items-center gap-3 bg-gradient-to-r from-[#CCA761] to-[#f1d58d] bg-clip-text text-transparent">
                <Clock size={18} className="text-[#CCA761] drop-shadow-[0_0_8px_rgba(204,167,97,0.8)]" /> Cronograma do Dia
              </h3>
              <div className="flex gap-2">
                <button className="text-[10px] text-gray-400 font-bold uppercase tracking-widest bg-white/5 px-3 py-1 rounded-lg border border-white/5 whitespace-nowrap">Ao Vivo (Realtime)</button>
                <button className="text-[10px] text-[#CCA761] font-bold uppercase tracking-widest border border-[#CCA761]/30 hover:bg-[#CCA761]/10 transition-colors px-3 py-1 rounded-lg">Filtros</button>
              </div>
            </div>

            <div className="space-y-4">
              {events.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">Nenhuma atividade agendada.</div>
              ) : events.map((ev, i) => {
                const isDone = ev.status === 'Concluído';
                Object.assign(ev, { active: ev.active || false, color: ev.color || '#CCA761' });
                return (
                  <div key={i} className="group relative flex items-center gap-6">
                    {/* Horário na Esquerda */}
                    <div className="w-16 text-right shrink-0">
                      <span className={`text-base font-black italic tracking-tighter ${ev.active ? 'text-[#CCA761]' : 'text-gray-500'}`}>{ev.time_text}</span>
                    </div>

                    {/* Card do Evento Luxuoso */}
                    <div
                      onClick={() => toggleStatus(ev)}
                      className={`flex-1 flex items-center justify-between p-5 rounded-2xl border transition-all duration-500 cursor-pointer overflow-hidden relative shadow-lg ${ev.active
                          ? 'border-[#CCA761]/60 bg-gradient-to-r from-[#CCA761]/10 to-[#111] shadow-[0_0_30px_rgba(204,167,97,0.15)] ring-1 ring-[#CCA761]/20'
                          : 'border-white/5 bg-gradient-to-r from-[#111] to-[#0a0a0a] hover:border-white/20 hover:bg-[#151515]'
                        } ${isDone ? 'opacity-60 grayscale' : 'opacity-100'}`}
                    >
                      {/* Borda de Destaque Colorida */}
                      <div className="absolute top-0 left-0 bottom-0 w-32 opacity-10" style={{ background: `linear-gradient(to right, ${ev.color}, transparent)` }} />

                      <div className="flex items-center gap-5 relative z-10">
                        {/* Linha Lateral Mágica */}
                        <div className="w-1.5 h-12 rounded-full shadow-[0_0_10px_currentColor]" style={{ backgroundColor: ev.color, color: ev.color }} />

                        <div>
                          <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                            <span
                              className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded shadow-sm backdrop-blur-sm"
                              style={{ color: ev.color, backgroundColor: `${ev.color}15`, border: `1px solid ${ev.color}40`, textShadow: `0 0 8px ${ev.color}80` }}
                            >
                              {ev.category}
                            </span>
                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">• {ev.type}</span>
                            {ev.created_by_agent && (
                              <span className="text-[8px] bg-white/10 text-white font-bold px-2 py-0.5 rounded ml-2 flex items-center gap-1"><Wand2 size={10} /> Criada por {ev.created_by_agent}</span>
                            )}
                          </div>
                          <h4 className={`text-base font-bold tracking-wide transition-colors ${isDone ? 'text-gray-600 line-through decoration-gray-700' : 'text-gray-100 group-hover:text-white'
                            }`}>{ev.title}</h4>
                        </div>
                      </div>
                      <div className="text-right hidden sm:block relative z-10 flex-col items-end">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1 border-b border-white/5 pb-1 inline-block">Responsável</p>
                        <p className={`text-sm font-semibold tracking-wide ${ev.active ? 'text-[#CCA761]' : 'text-gray-300'}`}>{ev.person}</p>
                      </div>
                    </div>

                    {/* Marcador de Linha */}
                    {ev.active && !isDone && <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-[#CCA761] rounded-full animate-ping opacity-20" />}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Painel Lateral: Próximos Alertas Globais */}
          <div className="space-y-6">
            <GlassCard className="border border-[#f87171]/20 bg-gradient-to-b from-[#0a0a0a] to-[#140a0a]">
              <h4 className="text-[10px] text-[#f87171] font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                <AlertCircle size={14} /> Prazos Críticos (Escritório)
              </h4>
              <div className="space-y-4">
                {criticalDeadlines.length === 0 ? (
                  <div className="p-4 bg-black/40 rounded-xl border border-white/5 text-[11px] text-gray-500">
                    Nenhum prazo critico real encontrado para a selecao atual.
                  </div>
                ) : (
                  criticalDeadlines.map((p, i) => (
                    <div key={i} className="p-4 bg-black/40 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-white">{p.title}</span>
                        <span className="text-[8px] font-black text-[#0a0a0a] px-2 py-0.5 rounded-sm uppercase" style={{ backgroundColor: p.color || '#f87171' }}>{p.time_text}</span>
                      </div>
                      <p className="text-[10px] text-gray-500 font-semibold tracking-wide">Cliente: {p.client_name || '-'}</p>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>

            <div className="p-6 rounded-2xl border border-[#CCA761]/30 bg-gradient-to-br from-[#CCA761]/20 to-transparent">
              <Star className="text-[#CCA761] mb-4" size={24} />
              <h5 className="text-sm font-bold text-white mb-2 tracking-wide">Insight da Inteligência (MAYUS)</h5>
              <p className="text-[11px] text-gray-400 leading-relaxed italic font-medium">&quot;Doutor, você tem 3 audiências seguidas na quarta-feira. Recomendo revisar os relatórios de pauta agora para evitar sobrecarga operativa.&quot;</p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

const UniversalView = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center p-12 text-center animate-fade-in-up border border-white/5 rounded-2xl bg-[#0a0a0a] min-h-[400px]">
    <Activity size={48} className="text-[#CCA761] opacity-20 mb-4" />
    <h2 className="text-xl text-white font-bold tracking-widest uppercase mb-2">Módulo em Integração</h2>
    <p className="text-gray-500 max-w-sm text-sm">Os painéis analíticos do módulo <strong>{title}</strong> estão sendo conectados à nova estrutura DRE do seu banco de dados.</p>
  </div>
);

export default function DashboardHomePage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);

  // Aba Ativa (Filtro de Visualização)
  const [activeView, setActiveView] = useState("resumo");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [metrics, setMetrics] = useState({
    totalRevenue: 25400,
    activeContracts: 18,
    averageTicket: 4250,
    totalCommissions: 2100,
    processActive: 145,
    openPipeline: 125000,
    revenueReceived: 15800,
  });

  const [officeGoals, setOfficeGoals] = useState<any[]>([]);

  const TABS = [
    { id: "resumo", label: "Resumo Executivo" },
    { id: "comercial", label: "Comercial" },
    { id: "marketing", label: "Marketing" },
    { id: "processos", label: "Processos" },
    { id: "financeiro", label: "Financeiro" },
    { id: "agenda", label: "Agenda Global" },
    { id: "prazos", label: "Prazos / Alertas" },
    { id: "equipe", label: "RH" },
    { id: "clientes", label: "Clientes" },
  ];

  const activeTabLabel = TABS.find(t => t.id === activeView)?.label || "Dashboard";

  useEffect(() => {
    const fetchDashboardData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const tenantId = user.user_metadata?.tenant_id || user.app_metadata?.tenant_id;
      if (!tenantId) {
        setLoading(false);
        return;
      }

      // Buscar Configurações e Metas Estratégicas
      const { data: settings, error: settingsError } = await supabase
        .from('tenant_settings')
        .select('strategic_goals')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      
      if (settings?.strategic_goals) {
        console.log("🎯 MAYUS BI: Metas estratégicas carregadas", settings.strategic_goals);
        setOfficeGoals(settings.strategic_goals);
      } else {
        console.warn("⚠️ MAYUS BI: Nenhuma meta estratégica encontrada para este tenant");
      }

      // Buscar Vendas
      const { data: sales } = await supabase.from('sales').select('*').eq('tenant_id', tenantId);

      if (sales) {
        const closedSales = sales.filter(s => s.status === 'Fechado');
        const totalRev = closedSales.reduce((acc, curr) => acc + (Number(curr.ticket_total) || 0), 0);
        const activeCtr = closedSales.length;
        const avgTicket = activeCtr > 0 ? totalRev / activeCtr : 0;
        const commissions = closedSales.reduce((acc, curr) => acc + (Number(curr.commission_value) || 0), 0);

        const openSales = sales.filter(s => s.status === 'Pendente');
        const openPipe = openSales.reduce((acc, curr) => acc + (Number(curr.ticket_total) || 0), 0);

        setMetrics(prev => ({
          ...prev,
          totalRevenue: totalRev > 0 ? totalRev : prev.totalRevenue,
          activeContracts: activeCtr > 0 ? activeCtr : prev.activeContracts,
          averageTicket: avgTicket > 0 ? avgTicket : prev.averageTicket,
          totalCommissions: commissions > 0 ? commissions : prev.totalCommissions,
          openPipeline: openPipe > 0 ? openPipe : prev.openPipeline,
          revenueReceived: totalRev > 0 ? totalRev : prev.revenueReceived, // Temporário
        }));
      }

      setLoading(false);
    };

    fetchDashboardData();
  }, [supabase]);

  if (loading) {
    return (
      <div className={`h-[80vh] flex items-center justify-center ${montserrat.className}`}>
        <div className="w-10 h-10 border-2 border-[#CCA761] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`w-full max-w-7xl mx-auto space-y-4 pb-24 ${montserrat.className}`}>

      {/* Header Premium (Título na Esquerda, Controles na Direita) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end pb-4 mb-10 border-b border-[#CCA761]/20 relative z-40 gap-6">

        <h1 className={`text-5xl lg:text-7xl text-[#CCA761] mb-1 font-bold tracking-tight ${cormorant.className} italic drop-shadow-[0_0_20px_rgba(204,167,97,0.3)]`}>
          {activeTabLabel}
        </h1>

        <div className="flex flex-col items-end gap-2">

          {/* Dropdown Personalizado do Módulo */}
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center justify-between gap-4 bg-[#0a0a0a] border border-[#CCA761]/40 hover:border-[#CCA761] text-white px-5 py-2.5 rounded-xl transition-all shadow-[0_0_20px_rgba(204,167,97,0.15)] group min-w-[240px]"
            >
              <div className="flex flex-col items-start gap-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#CCA761] leading-none">Módulo Ativo</span>
                <span className="text-sm font-semibold whitespace-nowrap leading-none">{activeTabLabel}</span>
              </div>
              <ChevronDown size={16} className={`text-[#CCA761] transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-14 right-0 w-[240px] bg-[#0a0a0a] border border-[#CCA761]/30 rounded-xl shadow-2xl py-2 flex flex-col overflow-hidden z-[100]">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveView(tab.id); setIsDropdownOpen(false); }}
                    className={`text-right px-6 py-3.5 text-[11px] font-bold uppercase tracking-widest transition-all hover:bg-white/5 border-l-2 ${activeView === tab.id ? "text-[#0a0a0a] bg-[#CCA761] hover:bg-[#b58e46] border-transparent" : "text-gray-400 hover:text-[#CCA761] border-transparent"
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selecionador de Mês Minimizado */}
          <select className="bg-[#111] border border-white/10 text-[10px] px-3 py-1.5 rounded-lg text-gray-300 outline-none shadow-xl cursor-pointer hover:border-[#CCA761]/50 transition-all font-bold uppercase tracking-widest min-w-[140px] text-right">
            <option>Todos os Meses</option>
            <option>Mês Atual</option>
            <option>Mês Passado</option>
          </select>

        </div>
      </div>

      {/* Renderização Condicional da View Selecionada */}
      {activeView === "resumo" && <ResumoView metrics={metrics} officeGoals={officeGoals} />}
      {activeView === "comercial" && <ComercialView metrics={metrics} officeGoals={officeGoals} />}
      {activeView === "marketing" && <MarketingView />}
      {activeView === "processos" && <ProcessosView metrics={metrics} />}
      {activeView === "financeiro" && <FinanceiroView metrics={metrics} />}
      {activeView === "agenda" && <AgendaView />}

      {["prazos", "equipe", "clientes"].includes(activeView) && (
        <UniversalView title={TABS.find(t => t.id === activeView)?.label || "Módulo"} />
      )}

    </div>
  );
}
