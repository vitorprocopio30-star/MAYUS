"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { ArrowLeft, BarChart3, FileText, Upload } from "lucide-react";
import { analyzeMetaAdsCsv, type MetaAdsMetricRow } from "@/lib/marketing/meta-ads-analysis";

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
  const [fileStatus, setFileStatus] = useState("Nenhum arquivo CSV selecionado.");
  const analysis = analyzeMetaAdsCsv(csvText);

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileStatus("Formato ainda nao suportado. Envie um arquivo .csv; XLSX/PDF ficam para versoes futuras.");
      return;
    }

    setFileStatus(`Lendo ${file.name}...`);
    try {
      const text = await file.text();
      setCsvText(text);
      setFileStatus(`CSV carregado: ${file.name}`);
    } catch {
      setFileStatus(`Nao foi possivel ler ${file.name}. Tente exportar novamente em CSV.`);
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground lg:px-10">
      <Link href="/dashboard/marketing" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-[#CCA761]">
        <ArrowLeft size={16} />
        Voltar para Marketing
      </Link>

      <section className="mt-6 rounded-3xl border border-border bg-card p-6 md:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#CCA761]/25 bg-[#CCA761]/10 text-[#CCA761]">
          <Upload size={22} />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-[#CCA761]">Midia paga</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Meta Ads MVP</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">
          Analise local de CSV exportado ou colado do Meta Ads. Sem API real, sem envio para servidores e com PDF/XLSX reservado para versoes futuras.
        </p>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-3xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Entrada</p>
              <h2 className="mt-2 text-xl font-semibold">Cole ou envie o CSV</h2>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-[#CCA761]/50 hover:text-[#CCA761]">
              <FileText size={16} />
              Arquivo CSV
              <input className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => void handleFile(event.target.files?.[0])} />
            </label>
          </div>

          <textarea
            value={csvText}
            onChange={(event) => {
              setCsvText(event.target.value);
              setFileStatus(event.target.value ? "CSV colado manualmente." : "Nenhum arquivo CSV selecionado.");
            }}
            placeholder={sampleCsv}
            className="mt-5 min-h-[360px] w-full rounded-2xl border border-border bg-background p-4 font-mono text-xs leading-6 outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-[#CCA761]/60"
          />

          <p className="mt-3 text-xs leading-5 text-muted-foreground">{fileStatus}</p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setCsvText(sampleCsv);
                setFileStatus("Exemplo carregado. Nenhum arquivo CSV selecionado.");
              }}
              className="rounded-full bg-[#CCA761] px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
            >
              Usar exemplo
            </button>
            <button
              type="button"
              onClick={() => {
                setCsvText("");
                setFileStatus("Nenhum arquivo CSV selecionado.");
              }}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Limpar
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#CCA761]/10 text-[#CCA761]">
                <BarChart3 size={20} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Diagnostico</p>
                <h2 className="text-xl font-semibold">Resumo de performance</h2>
              </div>
            </div>

            {analysis.warnings.length > 0 ? (
              <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                {analysis.warnings[0]}
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricCard label="Gasto" value={money(analysis.totals.spend)} />
              <MetricCard label="Leads" value={String(analysis.totals.leads)} />
              <MetricCard label="CPL" value={money(analysis.totals.cpl)} />
              <MetricCard label="CTR" value={percent(analysis.totals.ctr)} />
              <MetricCard label="CPC" value={money(analysis.totals.cpc)} />
              <MetricCard label="CPM" value={money(analysis.totals.cpm)} />
              <MetricCard label="Cliques" value={String(analysis.totals.clicks)} />
              <MetricCard label="Impressoes" value={String(analysis.totals.impressions)} />
            </div>
          </div>

          <Panel title="Achados principais">
            {analysis.findings.length ? analysis.findings.map((finding) => (
              <div key={`${finding.title}-${finding.detail}`} className="rounded-2xl border border-border bg-background p-4">
                <p className="text-sm font-semibold">{finding.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{finding.detail}</p>
              </div>
            )) : <EmptyState text="Cole um CSV com metricas para gerar achados." />}
          </Panel>

          <Panel title="Recomendacoes de verba">
            {analysis.budgetRecommendations.length ? analysis.budgetRecommendations.map((item) => (
              <div key={`${item.action}-${item.title}`} className="rounded-2xl border border-border bg-background p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#CCA761]">{item.action}</p>
                <p className="mt-2 text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>
              </div>
            )) : <EmptyState text="Sem recomendacoes enquanto nao houver dados validos." />}
          </Panel>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Vencedores">
          {analysis.winners.length ? analysis.winners.map((row) => <RowCard key={`${row.campaignName}-${rowLabel(row)}-winner`} row={row} />) : <EmptyState text="Nenhum vencedor detectado ainda." />}
        </Panel>

        <Panel title="Gasto sem lead">
          {analysis.wastedSpend.length ? analysis.wastedSpend.map((row) => <RowCard key={`${row.campaignName}-${rowLabel(row)}-waste`} row={row} />) : <EmptyState text="Nenhum gasto desperdicado detectado." />}
        </Panel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <ThemePanel title="Temas criativos" themes={analysis.creativeThemes} />
        <ThemePanel title="Temas de publico" themes={analysis.audienceThemes} />
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">{text}</p>;
}

function RowCard({ row }: { row: MetaAdsMetricRow }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <p className="text-sm font-semibold">{rowLabel(row)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{row.campaignName}</p>
      <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
        <span>Gasto {money(row.spend)}</span>
        <span>Leads {row.leads}</span>
        <span>CPL {money(row.cpl)}</span>
        <span>CTR {percent(row.ctr)}</span>
      </div>
    </div>
  );
}

function ThemePanel({ title, themes }: { title: string; themes: Array<{ theme: string; spend: number; leads: number; cpl: number | null; rows: number }> }) {
  return (
    <Panel title={title}>
      {themes.length ? themes.map((theme) => (
        <div key={theme.theme} className="rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold">{theme.theme}</p>
            <p className="text-xs text-muted-foreground">{theme.rows} linhas</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {money(theme.spend)} gastos, {theme.leads} leads, CPL {money(theme.cpl)}
          </p>
        </div>
      )) : <EmptyState text="Sem temas enquanto nao houver linhas validas." />}
    </Panel>
  );
}
