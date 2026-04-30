"use client";

import Link from "next/link";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { ArrowLeft, Images, Plus, Trash2, BarChart3, Filter, Zap, Target } from "lucide-react";
import { useEffect, useState } from "react";
import {
  extractReferencePatterns,
  type MarketingChannel,
  type ReferenceInput,
} from "@/lib/marketing/editorial-calendar";
import {
  loadLocalMarketingState,
  loadRemoteMarketingState,
  saveLocalMarketingState,
  saveMarketingReferences,
  saveRemoteMarketingState,
  shouldUseRemoteMarketingState,
} from "@/lib/marketing/local-persistence";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800", "900"] });

const channels: MarketingChannel[] = ["blog", "linkedin", "instagram", "email", "whatsapp"];

type ReferenceForm = {
  title: string;
  channel: MarketingChannel;
  legalArea: string;
  audience: string;
  contentType: string;
  hook: string;
  impressions: string;
  clicks: string;
  saves: string;
  shares: string;
  leads: string;
  comments: string;
};

const initialForm: ReferenceForm = {
  title: "",
  channel: "linkedin",
  legalArea: "",
  audience: "",
  contentType: "",
  hook: "",
  impressions: "",
  clicks: "",
  saves: "",
  shares: "",
  leads: "",
  comments: "",
};

function numberOrNull(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() !== "" ? parsed : null;
}

export default function ReferenciasMarketingPage() {
  const [form, setForm] = useState<ReferenceForm>(initialForm);
  const [references, setReferences] = useState<ReferenceInput[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageLabel, setStorageLabel] = useState("Sincronizando");

  const patterns = extractReferencePatterns(references);

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      const localState = loadLocalMarketingState();
      const remoteState = await loadRemoteMarketingState().catch(() => null);
      const useRemote = shouldUseRemoteMarketingState(remoteState);
      const sourceState = useRemote ? remoteState! : localState;
      if (cancelled) return;

      setReferences(sourceState.references);
      saveLocalMarketingState({ references: sourceState.references });
      setStorageLabel(useRemote ? "Servidor" : "Local");
      setIsLoaded(true);
    }

    void loadState();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    saveMarketingReferences(references);
    void saveRemoteMarketingState({ references }).then((saved) => setStorageLabel(saved ? "Servidor" : "Local"));
  }, [isLoaded, references]);

  function updateForm<K extends keyof ReferenceForm>(key: K, value: ReferenceForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addReference() {
    if (!form.title.trim()) return;

    setReferences((current) => [
      {
        id: `ref-${Date.now()}`,
        title: form.title.trim(),
        channel: form.channel,
        legalArea: form.legalArea.trim() || null,
        audience: form.audience.trim() || null,
        contentType: form.contentType.trim() || null,
        hook: form.hook.trim() || null,
        metrics: {
          impressions: numberOrNull(form.impressions),
          clicks: numberOrNull(form.clicks),
          saves: numberOrNull(form.saves),
          shares: numberOrNull(form.shares),
          leads: numberOrNull(form.leads),
          comments: numberOrNull(form.comments),
        },
      },
      ...current,
    ]);
    setForm(initialForm);
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
          <Images size={16} className="text-[#CCA761]" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#CCA761]/60">Biblioteca de Benchmarks</span>
        </div>
        <h1 className={`text-4xl lg:text-5xl text-[#CCA761] ${cormorant.className} italic tracking-tight drop-shadow-[0_0_20px_rgba(204,167,97,0.3)]`}>
          Referências
        </h1>
        <div className="mt-2 h-[1px] w-64 bg-gradient-to-r from-[#CCA761]/50 to-transparent" />
      </header>

      <section className="grid gap-12 lg:grid-cols-[420px_1fr]">
        
        {/* COLUNA ESQUERDA - CADASTRO */}
        <div className="space-y-8">
          <div className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#CCA761]/5 rounded-full blur-2xl" />
            
            <div className="relative z-10 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Novo Benchmark</h2>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">{storageLabel}</span>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Título do Conteúdo</label>
                  <input
                    value={form.title}
                    onChange={(event) => updateForm("title", event.target.value)}
                    placeholder="Ex: 5 erros antes de ajuizar uma ação"
                    className="w-full rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-white outline-none focus:border-[#CCA761]/50 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Canal</label>
                    <select
                      value={form.channel}
                      onChange={(event) => updateForm("channel", event.target.value as MarketingChannel)}
                      className="w-full rounded-xl border border-white/5 bg-[#050505] px-3 py-3 text-sm text-white outline-none focus:border-[#CCA761]/50"
                    >
                      {channels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Área Jurídica</label>
                    <input
                      value={form.legalArea}
                      onChange={(event) => updateForm("legalArea", event.target.value)}
                      placeholder="Ex: Trabalhista"
                      className="w-full rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-white outline-none focus:border-[#CCA761]/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Hook / Gancho Inicial</label>
                  <textarea
                    value={form.hook}
                    onChange={(event) => updateForm("hook", event.target.value)}
                    placeholder="Como o conteúdo prende a atenção?"
                    rows={3}
                    className="w-full rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-white outline-none focus:border-[#CCA761]/50 transition-all resize-none"
                  />
                </div>

                <div className="pt-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-4">Métricas de Performance</p>
                  <div className="grid grid-cols-3 gap-3">
                    {(["impressions", "clicks", "leads"] as const).map((metric) => (
                      <div key={metric} className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-600">{metric}</label>
                        <input
                          type="number"
                          value={form[metric]}
                          onChange={(event) => updateForm(metric, event.target.value)}
                          className="w-full rounded-lg border border-white/5 bg-white/[0.01] px-2 py-2 text-xs text-white outline-none focus:border-[#CCA761]/30"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={addReference}
                  disabled={!form.title.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#CCA761] py-4 text-xs font-black uppercase tracking-[0.2em] text-black hover:bg-[#d1b06d] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(204,167,97,0.3)] mt-4"
                >
                  <Plus size={16} />
                  Salvar Referência
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA - LISTA E PADRÕES */}
        <div className="space-y-12">
          
          {/* PADRÕES EXTRAÍDOS */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <Zap size={16} className="text-[#CCA761]" />
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-white">Inteligência de Padrões</h2>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              {patterns.length === 0 ? (
                <div className="md:col-span-2 py-12 text-center rounded-3xl border border-dashed border-white/5 bg-white/[0.01]">
                  <p className="text-sm text-gray-600 font-medium italic">Adicione referências para extrair padrões de sucesso.</p>
                </div>
              ) : patterns.map((pattern, index) => (
                <div key={index} className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-6 hover:border-[#CCA761]/20 transition-all group">
                  <div className="flex items-center justify-between mb-4">
                    <span className="px-3 py-1 rounded-full border border-[#CCA761]/30 bg-[#CCA761]/10 text-[9px] font-black uppercase tracking-widest text-[#CCA761]">{pattern.channel}</span>
                    <span className="text-xs font-bold text-gray-500">Score: {pattern.score}</span>
                  </div>
                  <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                    <Target size={14} className="text-[#CCA761]" />
                    {pattern.contentType || "Geral"}
                  </h3>
                  <div className="space-y-2 mb-4">
                    <p className="text-[10px] text-gray-500 leading-relaxed italic">&quot;{pattern.hookStyle}&quot;</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pattern.signals.map(s => (
                      <span key={s} className="text-[9px] font-bold text-[#CCA761]/70 bg-[#CCA761]/5 px-2 py-0.5 rounded-md">{s}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* LISTA DE REFERÊNCIAS */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <BarChart3 size={16} className="text-[#CCA761]" />
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-white">Histórico de Benchmarks</h2>
            </div>

            <div className="grid gap-4">
              {references.length === 0 ? (
                <div className="py-12 text-center rounded-3xl border border-dashed border-white/5 bg-white/[0.01]">
                  <p className="text-sm text-gray-600 font-medium italic">Nenhum registro ainda.</p>
                </div>
              ) : references.map((ref) => (
                <div key={ref.id} className="flex items-center gap-6 p-5 rounded-2xl border border-white/5 bg-[#0a0a0a] hover:bg-white/[0.02] transition-all group">
                  <div className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl bg-white/[0.03] border border-white/10 text-gray-500 group-hover:text-[#CCA761] group-hover:border-[#CCA761]/30 transition-all">
                    <Images size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-[#CCA761]">{ref.channel}</span>
                      <span className="text-gray-700">•</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">{ref.legalArea || "Geral"}</span>
                    </div>
                    <h4 className="text-sm font-bold text-white truncate">{ref.title}</h4>
                  </div>
                  <div className="hidden md:flex items-center gap-8 px-6 text-center border-l border-white/5">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-gray-600">Leads</p>
                      <p className="text-xs font-bold text-white">{ref.metrics.leads || 0}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-gray-600">Clicks</p>
                      <p className="text-xs font-bold text-white">{ref.metrics.clicks || 0}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setReferences((current) => current.filter((item) => item.id !== ref.id))}
                    className="p-2 text-gray-700 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
