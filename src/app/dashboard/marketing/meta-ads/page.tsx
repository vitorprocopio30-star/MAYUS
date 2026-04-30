"use client";

import Link from "next/link";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { ArrowLeft, BarChart3, FileText, Upload, TrendingUp, AlertTriangle, Lightbulb, Target, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { analyzeMetaAdsCsv, type MetaAdsMetricRow } from "@/lib/marketing/meta-ads-analysis";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800", "900"] });

const sampleCsv = `Campaign name,Ad set name,Ad name,Creative name,Audience,Amount spent,Impressions,Link clicks,Leads
Growth - Leads,Empresarios SP,Video Diagnostico,Video depoimento,Empresarios locais,200,10000,250,10
Growth - Leads,Empresarios SP,Imagem Oferta,Imagem oferta,Empresarios locais,150,8000,80,0`;

function money(value: number | null) {
  if (value === null) return "--";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function percent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;
}

function rowLabel(row: MetaAdsMetricRow) {
  return row.adName || row.creativeName || row.campaignName;
}

export default function MetaAdsMarketingPage() {
  const [csvText, setCsvText] = useState("");
  const [fileStatus, setFileStatus] = useState("Aguardando entrada de dados...");
  const analysis = analyzeMetaAdsCsv(csvText);

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileStatus("Formato inválido. Utilize arquivos .csv exportados do Meta.");
      return;
    }

    setFileStatus(`Lendo ${file.name}...`);
    try {
      const text = await file.text();
      setCsvText(text);
      setFileStatus(`CSV carregado com sucesso.`);
    } catch {
      setFileStatus(`Erro ao ler arquivo. Tente exportar novamente.`);
    }
  }

  return (
    <main className={`min-h-screen bg-[#050505] px-6 py-8 text-foreground lg:px-10 ${montserrat.className}`}>
      
      {/* HEADER */}
      <header className="mb-12">
        <Link href="/dashboard/marketing" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-gray-500 hover:text-[#CCA761] transition-colors mb-6 group">
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
          Voltar
        </Link>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={16} className="text-[#CCA761]" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#CCA761]/60">Análise de Performance</span>
        </div>
        <h1 className={`text-4xl lg:text-5xl text-[#CCA761] ${cormorant.className} italic tracking-tight drop-shadow-[0_0_20px_rgba(204,167,97,0.3)]`}>
          Métricas Meta Ads
        </h1>
        <div className="mt-2 h-[1px] w-64 bg-gradient-to-r from-[#CCA761]/50 to-transparent" />
      </header>

      <section className="grid gap-12 xl:grid-cols-[450px_1fr]">
        
        {/* COLUNA ESQUERDA - UPLOAD / INPUT */}
        <div className="space-y-8">
          <div className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#CCA761]/5 rounded-full blur-2xl" />
            
            <div className="relative z-10 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Importação Local</h2>
                <label className="cursor-pointer group">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.02] text-[9px] font-black uppercase tracking-widest text-gray-500 group-hover:border-[#CCA761]/30 group-hover:text-[#CCA761] transition-all">
                    <FileText size={12} />
                    Selecionar CSV
                  </div>
                  <input className="sr-only" type="file" accept=".csv,text/csv" onChange={(e) => void handleFile(e.target.files?.[0])} />
                </label>
              </div>

              <textarea
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  setFileStatus(e.target.value ? "Processando dados colados..." : "Aguardando entrada...");
                }}
                placeholder={sampleCsv}
                className="w-full min-h-[400px] rounded-2xl border border-white/5 bg-white/[0.01] p-4 font-mono text-[10px] leading-5 text-gray-400 outline-none focus:border-[#CCA761]/30 transition-all resize-none no-scrollbar"
              />

              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest flex items-center gap-2">
                <Zap size={12} className="text-[#CCA761]" />
                {fileStatus}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => { setCsvText(sampleCsv); setFileStatus("Exemplo carregado."); }}
                  className="flex-1 py-3 rounded-xl border border-[#CCA761]/20 bg-[#CCA761]/5 text-[#CCA761] text-[10px] font-black uppercase tracking-widest hover:bg-[#CCA761] hover:text-black transition-all"
                >
                  Usar Exemplo
                </button>
                <button
                  onClick={() => { setCsvText(""); setFileStatus("Aguardando entrada..."); }}
                  className="px-6 py-3 rounded-xl border border-white/5 bg-white/[0.02] text-gray-600 text-[10px] font-black uppercase tracking-widest hover:text-white transition-all"
                >
                  Limpar
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA - DIAGNÓSTICO */}
        <div className="space-y-12">
          
          {/* DASHBOARD DE MÉTRICAS */}
          <section className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-8 relative overflow-hidden">
             <div className="flex items-center gap-3 mb-8">
              <BarChart3 size={18} className="text-[#CCA761]" />
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-white">Consolidado da Operação</h2>
            </div>

            {analysis.warnings.length > 0 && (
              <div className="mb-8 flex items-start gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-amber-500">
                <AlertTriangle size={18} className="shrink-0" />
                <p className="text-xs font-bold uppercase tracking-widest leading-relaxed">{analysis.warnings[0]}</p>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <MetricItem label="Investimento" value={money(analysis.totals.spend)} highlight />
              <MetricItem label="Total Leads" value={String(analysis.totals.leads)} highlight />
              <MetricItem label="CPL Médio" value={money(analysis.totals.cpl)} color={analysis.totals.cpl && analysis.totals.cpl > 50 ? 'text-red-400' : 'text-emerald-400'} />
              <MetricItem label="CTR" value={percent(analysis.totals.ctr)} />
              <MetricItem label="Cliques" value={String(analysis.totals.clicks)} />
              <MetricItem label="CPC" value={money(analysis.totals.cpc)} />
              <MetricItem label="CPM" value={money(analysis.totals.cpm)} />
              <MetricItem label="Impressões" value={String(analysis.totals.impressions)} />
            </div>
          </section>

          {/* INSIGHTS E RECOMENDAÇÕES */}
          <div className="grid gap-6 md:grid-cols-2">
            <PanelSection title="Sinais Criativos" icon={<Lightbulb size={18} />}>
              {analysis.findings.length ? analysis.findings.map((f, i) => (
                <div key={i} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1">
                  <p className="text-xs font-bold text-white uppercase tracking-tight">{f.title}</p>
                  <p className="text-[11px] text-gray-500 leading-relaxed italic">{f.detail}</p>
                </div>
              )) : <p className="text-sm text-gray-700 italic py-4">Aguardando dados para diagnóstico...</p>}
            </PanelSection>

            <PanelSection title="Gestão de Verba" icon={<Target size={18} />}>
              {analysis.budgetRecommendations.length ? analysis.budgetRecommendations.map((r, i) => (
                <div key={i} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1">
                  <p className="text-[9px] font-black text-[#CCA761] uppercase tracking-[0.2em]">{r.action}</p>
                  <p className="text-xs font-bold text-white uppercase tracking-tight">{r.title}</p>
                  <p className="text-[11px] text-gray-500 leading-relaxed">{r.detail}</p>
                </div>
              )) : <p className="text-sm text-gray-700 italic py-4">Nenhuma recomendação disponível.</p>}
            </PanelSection>
          </div>

          {/* CAMPEÕES E DESPERDÍCIO */}
          <div className="grid gap-6 md:grid-cols-2">
            <PanelSection title="Vencedores (Escalar)" icon={<TrendingUp size={18} className="text-emerald-400" />}>
               {analysis.winners.length ? analysis.winners.map((row, i) => <AdRowCard key={i} row={row} winner />) : <p className="text-sm text-gray-700 italic py-4">Nenhum vencedor identificado.</p>}
            </PanelSection>

            <PanelSection title="Fuga de Verba (Pausar)" icon={<AlertTriangle size={18} className="text-red-400" />}>
               {analysis.wastedSpend.length ? analysis.wastedSpend.map((row, i) => <AdRowCard key={i} row={row} />) : <p className="text-sm text-gray-700 italic py-4">Sem desperdício crítico detectado.</p>}
            </PanelSection>
          </div>
        </div>
      </section>
    </main>
  );
}

function MetricItem({ label, value, highlight, color }: { label: string; value: string; highlight?: boolean; color?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">{label}</p>
      <p className={`text-xl font-bold tracking-tight ${highlight ? 'text-white' : color || 'text-gray-400'}`}>{value}</p>
    </div>
  );
}

function PanelSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="text-[#CCA761]">{icon}</div>
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function AdRowCard({ row, winner }: { row: MetaAdsMetricRow; winner?: boolean }) {
  return (
    <div className={`p-4 rounded-2xl border bg-white/[0.01] transition-all ${winner ? 'border-emerald-500/10 hover:border-emerald-500/30' : 'border-red-500/10 hover:border-red-500/30'}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-xs font-bold text-white truncate max-w-[250px]">{rowLabel(row)}</p>
          <p className="text-[10px] font-medium text-gray-600 uppercase tracking-tight">{row.campaignName}</p>
        </div>
        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${winner ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {winner ? 'ROI+' : 'ALERTA'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[8px] font-black text-gray-700 uppercase tracking-widest">Investido</p>
          <p className="text-[11px] font-bold text-white">{money(row.spend)}</p>
        </div>
        <div>
          <p className="text-[8px] font-black text-gray-700 uppercase tracking-widest">Leads</p>
          <p className="text-[11px] font-bold text-white">{row.leads}</p>
        </div>
        <div>
          <p className="text-[8px] font-black text-gray-700 uppercase tracking-widest">CPL</p>
          <p className={`text-[11px] font-bold ${winner ? 'text-emerald-400' : 'text-red-400'}`}>{money(row.cpl)}</p>
        </div>
      </div>
    </div>
  );
}
