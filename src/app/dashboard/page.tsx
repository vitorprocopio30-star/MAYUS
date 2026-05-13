"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Montserrat, Cormorant_Garamond } from "next/font/google";
import { Target, TrendingUp, AlertCircle, Users, Clock, Calendar, Star, Instagram, Globe, Activity, ChevronDown, User as UserIcon, Wand2 } from "lucide-react";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });

const FINANCIAL_PAID_STATUSES = new Set(["Pago", "Recebido", "Confirmado", "PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);

type SalesProfessionalMetrics = {
  name: string;
  closedCount: number;
  investment: number;
  revenue: number;
  share: number;
  roi: number;
};

type LeadSourceMetrics = {
  instagram: number;
  google: number;
  referral: number;
};

type ProcessTypeMetric = {
  label: string;
  count: number;
  percentage: number;
};

type FinanceCollectionPlanPreview = {
  id: string;
  title: string;
  createdAt: string | null;
  clientName: string | null;
  amount: number | null;
  daysOverdue: number | null;
  dueDate: string | null;
  stage: string | null;
  priority: string | null;
  nextBestAction: string | null;
  requiresHumanApproval: boolean;
  externalSideEffectsBlocked: boolean;
};

type FinanceSummaryPayload = {
  financials?: {
    received?: { amount?: number; count?: number };
    forecast?: { amount?: number; count?: number };
    overdue?: { amount?: number; count?: number };
    delinquency?: { amount?: number; count?: number; rate?: number };
    openCharges?: { amount?: number; count?: number };
    expenses?: {
      fixed?: { amount?: number; count?: number };
      marketing?: { amount?: number; count?: number };
    };
  };
  collectionsFollowup?: {
    totalPlans?: number;
    highPriorityPlans?: number;
    recentPlans?: FinanceCollectionPlanPreview[];
  };
  revenueReconciliation?: {
    available?: boolean;
    report?: {
      totals?: {
        matched?: number;
        partial?: number;
        blocked?: number;
        unmatched?: number;
        receivedRevenue?: number;
        openedCaseRevenue?: number;
      };
    };
  };
};

type DashboardMetrics = {
  totalRevenue: number;
  activeContracts: number;
  averageTicket: number;
  totalCommissions: number;
  processActive: number;
  openPipeline: number;
  revenueReceived: number;
  clientCount: number;
  estimatedLtv: number;
  delinquencyAmount: number;
  delinquencyCount: number;
  delinquencyRate: number;
  financeForecast: number;
  financeForecastCount: number;
  openChargesAmount: number;
  openChargesCount: number;
  fixedCosts: number;
  marketingSpend: number;
  leadCount: number;
  costPerLead: number;
  leadConversionRate: number;
  marketingRoas: number;
  processRecoveryValue: number;
  legalSuccessRevenue: number;
  pendingContracts: number;
  staleProcesses: number;
  commercialScheduled: number;
  commercialCompleted: number;
  leadToScheduleRate: number;
  scheduleCompletionRate: number;
  noShowRate: number;
  operationRate: number;
  closerRoi: number;
  legalSuccessRate: number;
  salesByProfessional: SalesProfessionalMetrics[];
  leadSources: LeadSourceMetrics;
  processTypeDistribution: ProcessTypeMetric[];
  collectionsFollowupPlansCount: number;
  collectionsFollowupHighPriorityCount: number;
  collectionsFollowupPlans: FinanceCollectionPlanPreview[];
  revenueReconciliationMatched: number;
  revenueReconciliationPartial: number;
  revenueReconciliationBlocked: number;
  revenueReconciliationOpenedCaseRevenue: number;
};

type OfficeGoal = {
  id?: string;
  name?: string;
  unit?: string;
  value?: number | string;
  source?: string;
  currentValue?: number | string;
};

type FinancialRow = {
  amount?: number | string | null;
  status?: string | null;
  due_date?: string | null;
  type?: string | null;
  description?: string | null;
  source?: string | null;
  reference_date?: string | null;
  metadata?: Record<string, unknown> | null;
};

type CrmTaskRow = {
  source?: string | null;
};

type ProcessTaskRow = {
  title?: string | null;
  description?: string | null;
  valor_causa?: number | string | null;
  value?: number | string | null;
  data_ultima_movimentacao?: string | null;
  demanda?: string | null;
  sector?: string | null;
  tags?: string[] | null;
  sentenca?: string | null;
  andamento_1grau?: string | null;
  andamento_2grau?: string | null;
};

const normalizeMetricText = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const rowText = (row: FinancialRow) =>
  normalizeMetricText(`${row.type || ""} ${row.description || ""} ${row.source || ""} ${JSON.stringify(row.metadata || {})}`);

const isExpenseRow = (row: FinancialRow) => {
  const type = normalizeMetricText(row.type);
  return ["despesa", "expense", "saida", "custo", "cost"].some((keyword) => type.includes(keyword)) || Number(row.amount) < 0;
};

const isMarketingExpense = (row: FinancialRow) => {
  const text = rowText(row);
  return isExpenseRow(row) && /(marketing|ads|meta|facebook|instagram|google|trafego|campanha|anuncio)/.test(text);
};

const isReceivedRevenue = (row: FinancialRow) => {
  if (isExpenseRow(row)) return false;
  if (FINANCIAL_PAID_STATUSES.has(String(row.status || ""))) return true;

  const type = normalizeMetricText(row.type);
  const source = normalizeMetricText(row.source);
  return type.includes("receita") && Boolean(row.reference_date || source.includes("asaas"));
};

const finiteNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const sanitizeCollectionPlans = (plans: unknown): FinanceCollectionPlanPreview[] => {
  if (!Array.isArray(plans)) return [];

  return plans.slice(0, 5).map((plan) => {
    const item = plan && typeof plan === "object" ? plan as Partial<FinanceCollectionPlanPreview> : {};
    return {
      id: String(item.id || ""),
      title: String(item.title || "Plano de cobranca"),
      createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
      clientName: typeof item.clientName === "string" ? item.clientName : null,
      amount: typeof item.amount === "number" && Number.isFinite(item.amount) ? item.amount : null,
      daysOverdue: typeof item.daysOverdue === "number" && Number.isFinite(item.daysOverdue) ? item.daysOverdue : null,
      dueDate: typeof item.dueDate === "string" ? item.dueDate : null,
      stage: typeof item.stage === "string" ? item.stage : null,
      priority: typeof item.priority === "string" ? item.priority : null,
      nextBestAction: typeof item.nextBestAction === "string" ? item.nextBestAction : null,
      requiresHumanApproval: item.requiresHumanApproval === true,
      externalSideEffectsBlocked: item.externalSideEffectsBlocked !== false,
    };
  });
};

const fetchTenantFinanceSummary = async (): Promise<FinanceSummaryPayload | null> => {
  try {
    const response = await fetch("/api/financeiro/summary", { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.summary && typeof payload.summary === "object" ? payload.summary as FinanceSummaryPayload : null;
  } catch (error) {
    console.warn("MAYUS BI: resumo financeiro indisponivel", error);
    return null;
  }
};

const classifyLeadSource = (source?: string | null): keyof LeadSourceMetrics | null => {
  const value = normalizeMetricText(source);
  if (!value) return null;
  if (/(instagram|insta|meta|facebook|fb)/.test(value)) return "instagram";
  if (/(google|search|gads|adwords)/.test(value)) return "google";
  if (/(indicacao|referral|recomendacao|parceiro)/.test(value)) return "referral";
  return null;
};

const processText = (task: ProcessTaskRow) =>
  normalizeMetricText(`${task.title || ""} ${task.description || ""} ${task.demanda || ""} ${task.sector || ""} ${(task.tags || []).join(" ")} ${task.sentenca || ""} ${task.andamento_1grau || ""} ${task.andamento_2grau || ""}`);

const classifyProcessType = (task: ProcessTaskRow) => {
  const explicit = String(task.demanda || task.sector || task.tags?.[0] || "").trim();
  if (explicit) return explicit.slice(0, 48);

  const text = processText(task);
  if (/rmc|cartao|cartoes|reserva de margem/.test(text)) return "RMC / Cartoes";
  if (/gram|margem consignavel|consignado/.test(text)) return "GRAM";
  if (/inventario|sucessao|partilha/.test(text)) return "Inventarios";
  if (/trabalh|verba|rescis/.test(text)) return "Trabalhista";
  return "Outros";
};

const isFavorableProcess = (task: ProcessTaskRow) => {
  const text = processText(task);
  return /(parcialmente procedente|procedente|deferid|favoravel|acordo homologado|homologad)/.test(text)
    && !/(improcedente|indeferid|desfavoravel)/.test(text);
};

const isUnfavorableProcess = (task: ProcessTaskRow) => {
  const text = processText(task);
  return /(improcedente|indeferid|desfavoravel|extint[ao])/.test(text);
};

const INITIAL_DASHBOARD_METRICS: DashboardMetrics = {
  totalRevenue: 0,
  activeContracts: 0,
  averageTicket: 0,
  totalCommissions: 0,
  processActive: 0,
  openPipeline: 0,
  revenueReceived: 0,
  clientCount: 0,
  estimatedLtv: 0,
  delinquencyAmount: 0,
  delinquencyCount: 0,
  delinquencyRate: 0,
  financeForecast: 0,
  financeForecastCount: 0,
  openChargesAmount: 0,
  openChargesCount: 0,
  fixedCosts: 0,
  marketingSpend: 0,
  leadCount: 0,
  costPerLead: 0,
  leadConversionRate: 0,
  marketingRoas: 0,
  processRecoveryValue: 0,
  legalSuccessRevenue: 0,
  pendingContracts: 0,
  staleProcesses: 0,
  commercialScheduled: 0,
  commercialCompleted: 0,
  leadToScheduleRate: 0,
  scheduleCompletionRate: 0,
  noShowRate: 0,
  operationRate: 100,
  closerRoi: 0,
  legalSuccessRate: 0,
  salesByProfessional: [],
  leadSources: {
    instagram: 0,
    google: 0,
    referral: 0,
  },
  processTypeDistribution: [],
  collectionsFollowupPlansCount: 0,
  collectionsFollowupHighPriorityCount: 0,
  collectionsFollowupPlans: [],
  revenueReconciliationMatched: 0,
  revenueReconciliationPartial: 0,
  revenueReconciliationBlocked: 0,
  revenueReconciliationOpenedCaseRevenue: 0,
};

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

const ResumoView = ({ metrics, officeGoals = [] }: { metrics: DashboardMetrics, officeGoals?: OfficeGoal[] }) => {
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
          <div className="h-px w-full bg-gradient-to-r from-transparent via-gray-300 dark:via-white/10 to-transparent my-6" />
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
            realValue = metrics.leadCount;
          } else if (goal.source === 'agendamentos' || goal.unit === 'AGD') {
            realValue = metrics.commercialScheduled;
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
              <div className="h-px w-full bg-gradient-to-r from-transparent via-gray-300 dark:via-white/10 to-transparent my-6" />
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
              <span className="text-3xl font-black text-white"><AnimatedNumber value={metrics.marketingRoas} floating />x</span>
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
              <span className="text-3xl font-black text-white"><AnimatedNumber value={metrics.closerRoi} floating />x</span>
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
              <span className="text-3xl font-black text-white">{metrics.operationRate}%</span>
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
              <p className="text-[10px] text-gray-400 mt-1">{metrics.delinquencyCount} parcelas vencidas totalizando R$ {metrics.delinquencyAmount.toLocaleString('pt-BR')}.</p>
            </div>
            <div className="p-3.5 bg-[#CCA761]/10 rounded-lg border border-[#CCA761]/20">
              <span className="text-xs font-bold text-[#CCA761]">Alto No-Show</span>
              <p className="text-[10px] text-gray-400 mt-1">Ausências nas reuniões em {metrics.noShowRate}%.</p>
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

const ElegantAreaChart = ({ metrics, targetValue }: { metrics: DashboardMetrics; targetValue: number }) => (
  <GlassCard className="lg:col-span-3 border border-[#CCA761]/30 hover:border-[#CCA761]/50 transition-colors">
    <div className="flex justify-between items-start mb-6 relative z-20">
      <h4 className="text-[10px] text-[#CCA761] font-bold uppercase tracking-widest flex items-center gap-2">
        <TrendingUp size={14} /> Histórico de Receita (14 Dias)
      </h4>
      <div className="text-right">
        <p className="text-3xl font-black text-[#4ade80] tracking-tighter drop-shadow-[0_0_15px_rgba(74,222,128,0.2)]">R$ <AnimatedNumber value={metrics.totalRevenue} /></p>
        <p className="text-[9px] text-[#CCA761] uppercase tracking-widest">{Math.floor(((metrics.totalRevenue / Math.max(1, targetValue)) * 100) || 0)}% da meta ativa</p>
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

const ComercialView = ({ metrics, officeGoals = [] }: { metrics: DashboardMetrics, officeGoals?: OfficeGoal[] }) => {
  const targetRevenueGoal = officeGoals.find(g => g.unit === 'R$');
  const targetVal = targetRevenueGoal ? Number(targetRevenueGoal.value) : 50000;
  const closerRows = Array.isArray(metrics.salesByProfessional) ? metrics.salesByProfessional.slice(0, 2) : [];
  const getInitials = (name: string) => name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Alta Gestão de KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <GlassCard className="shadow-lg">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Receita Fechada vs. Meta</p>
          <h3 className="text-3xl font-bold text-[#4ade80] tracking-wide mt-2">
            R$ <AnimatedNumber value={metrics.totalRevenue} />
          </h3>
          <div className="w-full bg-gray-200 dark:bg-black h-1 mt-3 rounded-full overflow-hidden">
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
      <ElegantAreaChart metrics={metrics} targetValue={targetVal} />

      {/* Funnel Fatiado Lateral */}
      <GlassCard className="lg:col-span-1 border border-[#CCA761]/20">
        <h4 className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
          <Target size={14} className="text-[#CCA761]" /> Funil de Conversão MTO
        </h4>
        <div className="flex flex-col items-center gap-1.5 w-full">
          <div className="w-[100%] bg-[#22d3ee]/20 border border-[#22d3ee]/50 text-center py-3 rounded-t-lg relative">
            <span className="text-sm font-bold text-white relative z-10"><AnimatedNumber value={metrics.leadCount} /> Leads</span>
          </div>
          <div className="w-[85%] bg-[#b4a0f8]/20 border border-[#b4a0f8]/50 text-center py-3 rounded-sm relative">
            <span className="text-sm font-bold text-white relative z-10"><AnimatedNumber value={metrics.commercialScheduled} /> Agendamentos</span>
            <span className="absolute -right-2 top-1/2 -translate-y-1/2 translate-x-full text-[9px] text-gray-400 font-bold bg-gray-200 dark:bg-black px-1 rounded">{metrics.leadToScheduleRate}%</span>
          </div>
          <div className="w-[70%] bg-[#CCA761]/20 border border-[#CCA761]/50 text-center py-3 rounded-sm relative shadow-[0_0_10px_rgba(204,167,97,0.2)]">
            <span className="text-sm font-bold text-[#f1d58d] relative z-10"><AnimatedNumber value={metrics.commercialCompleted} /> Realizadas</span>
            <span className="absolute -right-2 top-1/2 -translate-y-1/2 translate-x-full text-[9px] text-[#CCA761] font-bold bg-gray-200 dark:bg-black px-1 rounded border border-[#CCA761]/30">{metrics.scheduleCompletionRate}%</span>
          </div>
          <div className="w-[50%] bg-[#4ade80]/20 border border-[#4ade80]/50 text-center py-3 rounded-b-lg relative">
            <span className="text-sm font-bold text-white relative z-10"><AnimatedNumber value={metrics.activeContracts} /> Fechamentos</span>
            <span className="absolute -right-2 top-1/2 -translate-y-1/2 translate-x-full text-[9px] text-[#4ade80] font-bold bg-gray-200 dark:bg-black px-1 rounded">16%</span>
          </div>
        </div>
        <div className="mt-8 pt-4 border-t border-white/5 flex flex-col justify-between text-xs gap-2">
          <div className="flex justify-between items-center"><span className="text-gray-500">Ticket Médio:</span><span className="text-white font-bold">R$ {metrics.averageTicket.toLocaleString('pt-BR')}</span></div>
          <div className="flex justify-between items-center"><span className="text-gray-500">Taxa de No-Show:</span><span className="text-[#f87171] font-bold">{metrics.noShowRate}%</span></div>
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

          {closerRows.length === 0 ? (
            <div className="min-w-[700px] py-8 text-center text-xs text-gray-500 border-b border-white/5">
              Nenhum fechamento com profissional registrado ainda.
            </div>
          ) : closerRows.map((closer, index) => (
            <div key={closer.name} className="grid grid-cols-6 min-w-[700px] py-4 border-b border-white/5 items-center group hover:bg-white/5 transition-colors px-2 rounded-lg">
              <div className="col-span-2 flex items-center gap-3">
                <div className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs ${index === 0 ? "border border-[#CCA761] bg-[#CCA761]/10 text-[#CCA761] shadow-[0_0_10px_rgba(204,167,97,0.2)]" : "border border-white/10 bg-[#111] text-gray-500"}`}>
                  {getInitials(closer.name)}
                </div>
                <div>
                  <p className="text-gray-200 font-bold text-sm uppercase tracking-wide">{closer.name}</p>
                  <p className="text-[10px] text-gray-500 font-mono mt-0.5"><AnimatedNumber value={closer.closedCount} /> fechamentos</p>
                </div>
              </div>
              <span className="text-[#f87171] font-mono text-xs">R$ {closer.investment.toLocaleString('pt-BR')}</span>
              <span className="text-[#4ade80] font-mono font-bold text-sm">R$ {closer.revenue.toLocaleString('pt-BR')}</span>
              <div className="flex gap-2 items-center">
                <span className="text-white text-xs font-bold">{closer.share}%</span>
                <div className="w-12 h-1.5 bg-[#111] rounded-full"><div className="bg-[#CCA761] h-full rounded-full" style={{ width: `${Math.min(100, closer.share)}%` }}></div></div>
              </div>
              <span className={`${index === 0 ? "text-[#CCA761] font-black italic text-2xl drop-shadow-[0_0_15px_rgba(204,167,97,0.5)]" : "text-gray-300 font-bold text-xl"} text-right`}>
                <AnimatedNumber value={closer.roi} floating />x
              </span>
            </div>
          ))}

        </div>
      </GlassCard>
    </div>
    </div>
  );
};

const FinanceiroView = ({ metrics }: { metrics: DashboardMetrics }) => {
  const operationalProfit = metrics.revenueReceived - metrics.totalCommissions - metrics.fixedCosts - metrics.marketingSpend;
  const projectionMax = Math.max(metrics.revenueReceived, metrics.financeForecast, metrics.openChargesAmount, 1);
  const heightFor = (value: number) => `${Math.max(12, Math.min(100, Math.round((value / projectionMax) * 100)))}%`;
  const collectionPlans = metrics.collectionsFollowupPlans.slice(0, 3);

  return (
  <div className="space-y-6 animate-fade-in-up">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Recebido</p>
        <h3 className="text-3xl font-bold text-[#4ade80] tracking-wide mt-2">
          R$ <AnimatedNumber value={metrics.revenueReceived} />
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Honorarios e exito registrados</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Previsto</p>
        <h3 className="text-3xl font-bold text-[#22d3ee] tracking-wide mt-2">
          R$ <AnimatedNumber value={metrics.financeForecast} />
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">{metrics.financeForecastCount} cobrancas a vencer</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Cobrancas Abertas</p>
        <h3 className="text-3xl font-bold text-[#CCA761] tracking-wide mt-2">
          R$ <AnimatedNumber value={metrics.openChargesAmount} />
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">{metrics.openChargesCount} cobrancas em aberto</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Inadimplencia</p>
        <h3 className="text-3xl font-bold text-[#f87171] tracking-wide mt-2">
          R$ <AnimatedNumber value={metrics.delinquencyAmount} />
        </h3>
        <p className="text-[10px] text-[#f87171] mt-2">{metrics.delinquencyCount} vencidas / {metrics.delinquencyRate}% das abertas</p>
      </GlassCard>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <GlassCard className="border border-[#1a1a1a]">
        <div className="space-y-6">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-3 font-bold">Resumo de Caixa</p>
            <div className="space-y-2 text-sm font-medium">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Entradas recebidas</span>
                <span className="text-[#4ade80]">R$ {metrics.revenueReceived.toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Previsto em aberto</span>
                <span className="text-[#22d3ee]">R$ {metrics.financeForecast.toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Vencido</span>
                <span className="text-[#f87171]">R$ {metrics.delinquencyAmount.toLocaleString('pt-BR')}</span>
              </div>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-3 font-bold">Saidas (Operacional)</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Custos Fixos Cadastrados</span>
                <span className="text-[#f87171]">- R$ {metrics.fixedCosts.toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Comissoes Pagas</span>
                <span className="text-[#f87171]">- R$ {metrics.totalCommissions.toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Marketing (Ads Google/Meta)</span>
                <span className="text-gray-500">- R$ {metrics.marketingSpend.toLocaleString('pt-BR')}</span>
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-white/5 flex justify-between items-center font-bold">
            <span className="text-gray-300">Lucro Operacional Estimado</span>
            <span className={operationalProfit >= 0 ? "text-[#4ade80]" : "text-[#f87171]"}>
              R$ {operationalProfit.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
      </GlassCard>

      <div className="bg-card border border-primary/20 rounded-2xl flex flex-col justify-center p-8 relative overflow-hidden group hover:border-primary/40 transition-colors">
        <div className="absolute inset-x-0 h-px top-1/2 bg-gradient-to-r from-transparent via-[#CCA761]/20 to-transparent" />
        <h4 className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-6 relative z-10 flex items-center gap-2">
          <Calendar size={14} className="text-[#CCA761]" /> Projecao e Follow-up
        </h4>
        <div className="flex items-end gap-2 h-32 relative z-10">
          <div className="flex-1 bg-[#1a1a1a] rounded-t-md relative group-hover:bg-[#4ade80]/10 transition-colors" style={{ height: heightFor(metrics.revenueReceived) }} title="Recebido">
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-gray-500">Recebido</span>
          </div>
          <div className="flex-1 bg-[#1a1a1a] rounded-t-md relative group-hover:bg-[#22d3ee]/20 transition-colors" style={{ height: heightFor(metrics.financeForecast) }} title="Previsto">
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-gray-500">Previsto</span>
          </div>
          <div className="flex-1 bg-[#1a1a1a] rounded-t-md relative group-hover:bg-[#f87171]/20 transition-colors" style={{ height: heightFor(metrics.delinquencyAmount) }} title="Vencido">
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-gray-500">Vencido</span>
          </div>
          <div className="flex-1 bg-gradient-to-t from-[#CCA761]/20 to-[#CCA761]/80 rounded-t-md relative shadow-[0_0_20px_rgba(204,167,97,0.2)]" style={{ height: heightFor(metrics.openChargesAmount) }} title="Aberto">
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-[#CCA761]">Aberto</span>
          </div>
        </div>
        <div className="mt-8 relative z-10 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-400">Planos supervisionados</span>
            <span className="text-[#CCA761] font-bold">{metrics.collectionsFollowupPlansCount}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-400">Alta prioridade</span>
            <span className="text-[#f87171] font-bold">{metrics.collectionsFollowupHighPriorityCount}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-center">
            <div>
              <p className="text-[9px] text-gray-500 uppercase tracking-widest">Casados</p>
              <p className="text-sm font-bold text-[#4ade80]">{metrics.revenueReconciliationMatched}</p>
            </div>
            <div>
              <p className="text-[9px] text-gray-500 uppercase tracking-widest">Parciais</p>
              <p className="text-sm font-bold text-[#CCA761]">{metrics.revenueReconciliationPartial}</p>
            </div>
            <div>
              <p className="text-[9px] text-gray-500 uppercase tracking-widest">Bloqueios</p>
              <p className="text-sm font-bold text-[#f87171]">{metrics.revenueReconciliationBlocked}</p>
            </div>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-400">Receita ja virou caso</span>
            <span className="text-[#4ade80] font-bold">R$ {metrics.revenueReconciliationOpenedCaseRevenue.toLocaleString('pt-BR')}</span>
          </div>
          {collectionPlans.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-white/5">
              {collectionPlans.map((plan) => (
                <div key={plan.id || `${plan.clientName}-${plan.createdAt}`} className="flex justify-between gap-4 text-[11px]">
                  <span className="text-gray-300 truncate">{plan.clientName || plan.title}</span>
                  <span className="text-gray-500 whitespace-nowrap">
                    {plan.amount !== null ? `R$ ${plan.amount.toLocaleString('pt-BR')}` : plan.priority || "revisao"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
  );
};

const MarketingView = ({ metrics }: { metrics: DashboardMetrics }) => (
  <div className="space-y-6 animate-fade-in-up">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Custo por Lead (CPL)</p>
        <h3 className="text-3xl font-bold text-[#f87171] tracking-wide mt-2">
          R$ <AnimatedNumber value={metrics.costPerLead} floating />
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Baseado em gasto cadastrado</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Volume de Leads</p>
        <h3 className="text-3xl font-bold text-[#CCA761] tracking-wide mt-2">
          <AnimatedNumber value={metrics.leadCount} />
        </h3>
        <p className="text-[10px] text-[#4ade80] mt-2">Leads registrados</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Conversão Lead / Contrato</p>
        <h3 className="text-3xl font-bold text-[#22d3ee] tracking-wide mt-2">
          {metrics.leadConversionRate}%
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Contratos fechados sobre leads</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">ROAS (Retorno em Ads)</p>
        <h3 className="text-3xl font-bold text-[#4ade80] tracking-wide mt-2">
          {metrics.marketingRoas.toFixed(1)}x
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Receita recebida / gasto de ads</p>
      </GlassCard>
    </div>

    <GlassCard>
      <h4 className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
        <Target size={14} className="text-[#CCA761]" /> Origem dos Leads (Canais)
      </h4>
      <div className="flex gap-4 mb-4">
        <div className="flex-1 bg-[#111] border border-white/5 rounded-lg p-4 flex flex-col items-center justify-center">
          <Instagram size={24} className="text-pink-500 mb-2" />
          <span className="text-2xl font-bold text-white"><AnimatedNumber value={metrics.leadSources.instagram} /></span>
          <span className="text-[10px] text-gray-500 uppercase mt-1">Instagram</span>
        </div>
        <div className="flex-1 bg-[#111] border border-white/5 rounded-lg p-4 flex flex-col items-center justify-center">
          <Globe size={24} className="text-blue-500 mb-2" />
          <span className="text-2xl font-bold text-white"><AnimatedNumber value={metrics.leadSources.google} /></span>
          <span className="text-[10px] text-gray-500 uppercase mt-1">Google Search</span>
        </div>
        <div className="flex-1 bg-[#111] border border-white/5 rounded-lg p-4 flex flex-col items-center justify-center">
          <Users size={24} className="text-green-500 mb-2" />
          <span className="text-2xl font-bold text-white"><AnimatedNumber value={metrics.leadSources.referral} /></span>
          <span className="text-[10px] text-gray-500 uppercase mt-1">Indicação</span>
        </div>
      </div>
    </GlassCard>
  </div>
);

const ProcessosView = ({ metrics }: { metrics: DashboardMetrics }) => {
  const processTypeRows = metrics.processTypeDistribution.length > 0
    ? metrics.processTypeDistribution
    : [{ label: "Sem classificacao", count: 0, percentage: 0 }];
  const barColors = ["#22d3ee", "#CCA761", "#71717a"];

  return (
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
          {metrics.legalSuccessRate}%
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Decisões favoráveis</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Valor em Recuperação</p>
        <h3 className="text-3xl font-bold text-[#b4a0f8] tracking-wide mt-2">
          R$ <AnimatedNumber value={metrics.processRecoveryValue} />
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">Volume potencial de causas</p>
      </GlassCard>
      <GlassCard>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Exito Potencial</p>
        <h3 className="text-3xl font-bold text-[#4ade80] tracking-wide mt-2">
          R$ <AnimatedNumber value={metrics.legalSuccessRevenue} />
        </h3>
        <p className="text-[10px] text-gray-400 mt-2">30% sobre causas favoraveis identificadas</p>
      </GlassCard>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <GlassCard>
        <h4 className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-6">Distribuição por Tipo</h4>
        <div className="space-y-3">
          {processTypeRows.slice(0, 3).map((row, index) => (
            <div key={row.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300">{row.label}</span>
                <span className="font-bold" style={{ color: barColors[index] || "#71717a" }}>{row.percentage}%</span>
              </div>
              <div className="w-full bg-[#111] h-2 rounded">
                <div className="h-full rounded" style={{ width: `${row.percentage}%`, backgroundColor: barColors[index] || "#71717a" }} />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="border border-[#f87171]/20">
        <h4 className="text-[10px] text-[#f87171] font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
          <AlertCircle size={14} /> Backlog & Atrasos
        </h4>
        <ul className="space-y-4 text-sm text-gray-300">
          <li className="flex justify-between items-center pb-2 border-b border-white/5">
            <span>Contratos pendentes de assinatura</span>
            <span className="bg-[#f87171]/20 text-[#f87171] px-2 py-0.5 rounded text-xs font-bold">{metrics.pendingContracts}</span>
          </li>
          <li className="flex justify-between items-center pb-2 border-b border-white/5">
            <span>Processos Sem Movimentação (+60d)</span>
            <span className="bg-[#CCA761]/20 text-[#CCA761] px-2 py-0.5 rounded text-xs font-bold">{metrics.staleProcesses}</span>
          </li>
        </ul>
      </GlassCard>
    </div>
  </div>
  );
};

const AgendaView = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [criticalDeadlines, setCriticalDeadlines] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const today = new Date();
  const currentDay = today.getDay();
  const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + mondayOffset);

  const WEEK_DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);

    return {
      day,
      date: String(date.getDate()).padStart(2, "0"),
      active: date.toDateString() === today.toDateString(),
    };
  });

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

      const tasks = userTasks || [];
      setEvents(tasks.filter(t => !t.is_critical));
      setCriticalDeadlines(tasks.filter(t => t.is_critical));
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
    if (!task.id || typeof task.id === 'number') return; // ignora ids inválidos
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
                  <div className="p-4 bg-gray-200 dark:bg-black/40 rounded-xl border border-white/5 text-[11px] text-gray-500">
                    Nenhum prazo critico real encontrado para a selecao atual.
                  </div>
                ) : (
                  criticalDeadlines.map((p, i) => (
                    <div key={i} className="p-4 bg-gray-200 dark:bg-black/40 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
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
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);

  // Aba Ativa (Filtro de Visualização)
  const [activeView, setActiveView] = useState("resumo");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [metrics, setMetrics] = useState<DashboardMetrics>(INITIAL_DASHBOARD_METRICS);

  const [officeGoals, setOfficeGoals] = useState<OfficeGoal[]>([]);

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
      setLoading(true);
      const nextMetrics: DashboardMetrics = { ...INITIAL_DASHBOARD_METRICS };

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
      const { data: settings } = await supabase
        .from('tenant_settings')
        .select('strategic_goals')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      
      if (settings?.strategic_goals) {
        console.log("🎯 MAYUS BI: Metas estratégicas carregadas", settings.strategic_goals);
        setOfficeGoals(settings.strategic_goals);
      } else {
        console.warn("⚠️ MAYUS BI: Nenhuma meta estratégica encontrada para este tenant");
        setOfficeGoals([]);
      }

      // Buscar Vendas
      const { data: sales } = await supabase.from('sales').select('*').eq('tenant_id', tenantId);

      if (Array.isArray(sales)) {
        const closedSales = sales.filter(s => s.status === 'Fechado');
        const totalRev = closedSales.reduce((acc, curr) => acc + (Number(curr.ticket_total) || 0), 0);
        const activeCtr = closedSales.length;
        const avgTicket = activeCtr > 0 ? totalRev / activeCtr : 0;
        const commissions = closedSales.reduce((acc, curr) => acc + (Number(curr.commission_value) || 0), 0);
        const fixedSalaryInvestment = closedSales.reduce((acc, curr) => acc + (Number(curr.fixed_salary) || 0), 0);
        const totalCommercialInvestment = commissions + fixedSalaryInvestment;

        const openSales = sales.filter(s => s.status === 'Pendente');
        const openPipe = openSales.reduce((acc, curr) => acc + (Number(curr.ticket_total) || 0), 0);
        const pendingContracts = openSales.length;
        const professionalMap = new Map<string, {
          name: string;
          closedCount: number;
          investment: number;
          revenue: number;
        }>();

        closedSales.forEach((sale) => {
          const name = sale.professional_name || "Sem responsável";
          const current = professionalMap.get(name) || {
            name,
            closedCount: 0,
            investment: 0,
            revenue: 0,
          };

          current.closedCount += 1;
          current.investment += (Number(sale.commission_value) || 0) + (Number(sale.fixed_salary) || 0);
          current.revenue += Number(sale.ticket_total) || 0;
          professionalMap.set(name, current);
        });

        const salesByProfessional = Array.from(professionalMap.values())
          .map((item) => ({
            ...item,
            share: totalRev > 0 ? Math.round((item.revenue / totalRev) * 100) : 0,
            roi: item.investment > 0 ? item.revenue / item.investment : 0,
          }))
          .sort((a, b) => b.revenue - a.revenue);

        nextMetrics.totalRevenue = totalRev;
        nextMetrics.activeContracts = activeCtr;
        nextMetrics.averageTicket = activeCtr > 0 ? totalRev / activeCtr : 0;
        nextMetrics.totalCommissions = commissions;
        nextMetrics.openPipeline = openPipe;
        nextMetrics.pendingContracts = pendingContracts;
        nextMetrics.salesByProfessional = salesByProfessional;
        nextMetrics.closerRoi = totalCommercialInvestment > 0 ? totalRev / totalCommercialInvestment : 0;
        nextMetrics.revenueReceived = totalRev;
      }

      const financeSummaryPromise = fetchTenantFinanceSummary();
      const [
        { count: clientCount },
        { count: leadCount },
        { data: financialRows },
        { data: commercialTasks },
        { data: crmTasks },
        financeSummary,
      ] = await Promise.all([
        supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        supabase
          .from('financials')
          .select('amount, status, due_date, type, description, source, reference_date, metadata')
          .eq('tenant_id', tenantId),
        supabase
          .from('user_tasks')
          .select('status, category, type')
          .eq('tenant_id', tenantId),
        supabase
          .from('crm_tasks')
          .select('source')
          .eq('tenant_id', tenantId),
        financeSummaryPromise,
      ]);

      const normalizedClientCount = clientCount || 0;
      const crmLeadRows = Array.isArray(crmTasks) ? crmTasks as CrmTaskRow[] : [];
      const normalizedLeadCount = Math.max(leadCount || 0, crmLeadRows.length);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const financials = Array.isArray(financialRows) ? financialRows as FinancialRow[] : [];
      const receivedRevenue = financials
        .filter(isReceivedRevenue)
        .reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
      const openRevenueRows = financials.filter((row) => !isReceivedRevenue(row) && !isExpenseRow(row));
      const overdueRows = openRevenueRows.filter((row) => {
        if (!row.due_date) return false;
        const dueDate = new Date(`${row.due_date}T00:00:00`);
        return !Number.isNaN(dueDate.getTime()) && dueDate < today;
      });
      const forecastRows = openRevenueRows.filter((row) => {
        if (!row.due_date) return true;
        const dueDate = new Date(`${row.due_date}T00:00:00`);
        return Number.isNaN(dueDate.getTime()) || dueDate >= today;
      });
      const delinquencyAmount = overdueRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
      const financeForecast = forecastRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
      const openChargesAmount = openRevenueRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
      const marketingSpend = financials
        .filter(isMarketingExpense)
        .reduce((acc, row) => acc + Math.abs(Number(row.amount) || 0), 0);
      const fixedCosts = financials
        .filter((row) => isExpenseRow(row) && !isMarketingExpense(row))
        .reduce((acc, row) => acc + Math.abs(Number(row.amount) || 0), 0);
      const leadSources = crmLeadRows.reduce<LeadSourceMetrics>((acc, task) => {
        const key = classifyLeadSource(task.source);
        if (key) acc[key] += 1;
        return acc;
      }, { instagram: 0, google: 0, referral: 0 });
      const commercialTaskRows = Array.isArray(commercialTasks)
        ? commercialTasks.filter((task) => {
            const haystack = `${task.category || ''} ${task.type || ''}`.toLowerCase();
            return haystack.includes('comercial') || haystack.includes('venda') || haystack.includes('crm') || haystack.includes('lead');
          })
        : [];
      const commercialScheduled = commercialTaskRows.length;
      const commercialCompleted = commercialTaskRows.filter((task) => task.status === 'Concluído').length;

      const leadToScheduleRate = normalizedLeadCount > 0 ? Math.round((commercialScheduled / normalizedLeadCount) * 100) : 0;
      const scheduleCompletionRate = commercialScheduled > 0 ? Math.round((commercialCompleted / commercialScheduled) * 100) : 0;
      const noShowRate = commercialScheduled > 0 ? Math.max(0, 100 - scheduleCompletionRate) : 0;
      const hasFinanceSummary = Boolean(financeSummary?.financials);
      const financeReceivedFallback = receivedRevenue > 0 ? receivedRevenue : nextMetrics.revenueReceived;
      const financeReceived = finiteNumber(financeSummary?.financials?.received?.amount, financeReceivedFallback);
      const financeOverdueAmount = finiteNumber(financeSummary?.financials?.overdue?.amount, delinquencyAmount);
      const financeOverdueCount = finiteNumber(financeSummary?.financials?.overdue?.count, overdueRows.length);
      const financeForecastAmount = finiteNumber(financeSummary?.financials?.forecast?.amount, financeForecast);
      const financeForecastCount = finiteNumber(financeSummary?.financials?.forecast?.count, forecastRows.length);
      const financeOpenChargesAmount = finiteNumber(financeSummary?.financials?.openCharges?.amount, openChargesAmount);
      const financeOpenChargesCount = finiteNumber(financeSummary?.financials?.openCharges?.count, openRevenueRows.length);
      const financeDelinquencyRate = finiteNumber(
        financeSummary?.financials?.delinquency?.rate,
        financeOpenChargesAmount > 0 ? Math.round((financeOverdueAmount / financeOpenChargesAmount) * 1000) / 10 : 0
      );
      const financeMarketingSpend = finiteNumber(financeSummary?.financials?.expenses?.marketing?.amount, marketingSpend);
      const financeFixedCosts = finiteNumber(financeSummary?.financials?.expenses?.fixed?.amount, fixedCosts);
      const collectionPlans = sanitizeCollectionPlans(financeSummary?.collectionsFollowup?.recentPlans);
      const reconciliationTotals = financeSummary?.revenueReconciliation?.report?.totals;

      nextMetrics.clientCount = normalizedClientCount;
      nextMetrics.estimatedLtv = normalizedClientCount > 0 ? financeReceived / normalizedClientCount : 0;
      nextMetrics.delinquencyAmount = financeOverdueAmount;
      nextMetrics.delinquencyCount = financeOverdueCount;
      nextMetrics.delinquencyRate = financeDelinquencyRate;
      nextMetrics.financeForecast = financeForecastAmount;
      nextMetrics.financeForecastCount = financeForecastCount;
      nextMetrics.openChargesAmount = financeOpenChargesAmount;
      nextMetrics.openChargesCount = financeOpenChargesCount;
      nextMetrics.fixedCosts = financeFixedCosts;
      nextMetrics.marketingSpend = financeMarketingSpend;
      nextMetrics.leadCount = normalizedLeadCount;
      nextMetrics.costPerLead = normalizedLeadCount > 0 ? nextMetrics.marketingSpend / normalizedLeadCount : 0;
      nextMetrics.leadConversionRate = normalizedLeadCount > 0 ? Math.round((nextMetrics.activeContracts / normalizedLeadCount) * 1000) / 10 : 0;
      nextMetrics.marketingRoas = nextMetrics.marketingSpend > 0 ? financeReceived / nextMetrics.marketingSpend : 0;
      nextMetrics.commercialScheduled = commercialScheduled;
      nextMetrics.commercialCompleted = commercialCompleted;
      nextMetrics.leadToScheduleRate = leadToScheduleRate;
      nextMetrics.scheduleCompletionRate = scheduleCompletionRate;
      nextMetrics.noShowRate = noShowRate;
      nextMetrics.operationRate = Math.max(0, 100 - noShowRate);
      nextMetrics.revenueReceived = hasFinanceSummary ? financeReceived : financeReceivedFallback;
      nextMetrics.leadSources = leadSources;
      nextMetrics.collectionsFollowupPlansCount = finiteNumber(financeSummary?.collectionsFollowup?.totalPlans, collectionPlans.length);
      nextMetrics.collectionsFollowupHighPriorityCount = finiteNumber(financeSummary?.collectionsFollowup?.highPriorityPlans, collectionPlans.filter((plan) => normalizeMetricText(plan.priority) === "high").length);
      nextMetrics.collectionsFollowupPlans = collectionPlans;
      nextMetrics.revenueReconciliationMatched = finiteNumber(reconciliationTotals?.matched, 0);
      nextMetrics.revenueReconciliationPartial = finiteNumber(reconciliationTotals?.partial, 0);
      nextMetrics.revenueReconciliationBlocked = finiteNumber(reconciliationTotals?.blocked, 0);
      nextMetrics.revenueReconciliationOpenedCaseRevenue = finiteNumber(reconciliationTotals?.openedCaseRevenue, 0);

      const { data: processTasks, error: processTasksError } = await supabase
        .from('process_tasks')
        .select('id, title, description, valor_causa, value, data_ultima_movimentacao, demanda, sector, tags, sentenca, andamento_1grau, andamento_2grau')
        .eq('tenant_id', tenantId);

      if (!processTasksError && Array.isArray(processTasks)) {
        const processTaskRows = processTasks as ProcessTaskRow[];
        const staleCutoff = new Date();
        staleCutoff.setDate(staleCutoff.getDate() - 60);

        const processRecoveryValue = processTaskRows.reduce((acc, task) => {
          const value = Number(task.valor_causa ?? task.value ?? 0);
          return acc + (Number.isFinite(value) ? value : 0);
        }, 0);

        const staleProcesses = processTaskRows.filter((task) => {
          if (!task.data_ultima_movimentacao) return false;
          const lastMovement = new Date(task.data_ultima_movimentacao);
          return !Number.isNaN(lastMovement.getTime()) && lastMovement < staleCutoff;
        }).length;
        const typeCounts = processTaskRows.reduce<Map<string, number>>((acc, task) => {
          const label = classifyProcessType(task);
          acc.set(label, (acc.get(label) || 0) + 1);
          return acc;
        }, new Map());
        const favorableProcesses = processTaskRows.filter(isFavorableProcess);
        const unfavorableProcesses = processTaskRows.filter(isUnfavorableProcess);
        const decidedProcesses = favorableProcesses.length + unfavorableProcesses.length;
        const legalSuccessRevenue = favorableProcesses.reduce((acc, task) => {
          const value = Number(task.valor_causa ?? task.value ?? 0);
          return acc + (Number.isFinite(value) ? value * 0.3 : 0);
        }, 0);

        nextMetrics.processActive = processTaskRows.length;
        nextMetrics.processRecoveryValue = processRecoveryValue;
        nextMetrics.staleProcesses = staleProcesses;
        nextMetrics.legalSuccessRate = decidedProcesses > 0 ? Math.round((favorableProcesses.length / decidedProcesses) * 100) : 0;
        nextMetrics.legalSuccessRevenue = legalSuccessRevenue;
        nextMetrics.processTypeDistribution = Array.from(typeCounts.entries())
          .map(([label, count]) => ({
            label,
            count,
            percentage: processTaskRows.length > 0 ? Math.round((count / processTaskRows.length) * 100) : 0,
          }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      }

      setMetrics(nextMetrics);
      setLoading(false);
    };

    fetchDashboardData().catch((error) => {
      console.error("MAYUS BI: Falha ao carregar metricas do dashboard", error);
      setLoading(false);
    });
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
      {activeView === "marketing" && <MarketingView metrics={metrics} />}
      {activeView === "processos" && <ProcessosView metrics={metrics} />}
      {activeView === "financeiro" && <FinanceiroView metrics={metrics} />}
      {activeView === "agenda" && <AgendaView />}

      {["prazos", "equipe", "clientes"].includes(activeView) && (
        <UniversalView title={TABS.find(t => t.id === activeView)?.label || "Módulo"} />
      )}

    </div>
  );
}
