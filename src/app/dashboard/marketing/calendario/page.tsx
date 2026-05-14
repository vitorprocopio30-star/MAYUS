"use client";

import Link from "next/link";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { ArrowLeft, CalendarDays, Wand2, Sparkles, CheckCircle2, AlertCircle, Clock, Zap, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { buildAgendaPayloadFromManualTask } from "@/lib/agenda/userTasks";
import {
  buildMarketingCalendarDefaults,
  buildMarketingAgendaTaskDraft,
  generateEditorialCalendar,
  updateEditorialCalendarItem,
  type EditorialCalendarItem,
  type MarketingChannel,
  type MarketingFrequency,
  type MarketingObjective,
  type ReferenceInput,
  type MarketingTone,
} from "@/lib/marketing/editorial-calendar";
import { buildMayusInstagramWeekOneCalendar } from "@/lib/marketing/ai-native-narrative";
import {
  loadLocalMarketingState,
  loadRemoteMarketingState,
  saveLocalMarketingState,
  saveMarketingCalendar,
  saveRemoteMarketingState,
  shouldUseRemoteMarketingState,
} from "@/lib/marketing/local-persistence";
import { createClient } from "@/lib/supabase/client";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800", "900"] });

const channels: MarketingChannel[] = ["blog", "linkedin", "instagram", "email", "whatsapp"];
const frequencies: MarketingFrequency[] = ["weekly", "biweekly", "monthly"];
const objectives: MarketingObjective[] = ["awareness", "authority", "lead_generation", "nurture", "retention"];
const tones: MarketingTone[] = ["educational", "direct", "empathetic", "premium", "conversational"];

type CalendarForm = {
  frequency: MarketingFrequency;
  style: string;
  channels: MarketingChannel[];
  legalAreas: string;
  objectives: MarketingObjective[];
  tones: MarketingTone[];
  audiences: string;
  startDate: string;
  periods: string;
};

const initialForm: CalendarForm = {
  frequency: "weekly",
  style: "autoridade acessivel",
  channels: ["linkedin"],
  legalAreas: "Trabalhista, Previdenciario",
  objectives: ["authority"],
  tones: ["educational"],
  audiences: "leads qualificados",
  startDate: new Date().toISOString().slice(0, 10),
  periods: "4",
};

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function toggleValue<T extends string>(current: T[], value: T) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

export default function CalendarioMarketingPage() {
  const supabase = createClient();
  const [form, setForm] = useState<CalendarForm>(initialForm);
  const [calendar, setCalendar] = useState<EditorialCalendarItem[]>([]);
  const [references, setReferences] = useState<ReferenceInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [creatingTaskItemId, setCreatingTaskItemId] = useState<string | null>(null);
  const [agendaMessage, setAgendaMessage] = useState<string | null>(null);
  const [profileDefaultsApplied, setProfileDefaultsApplied] = useState(false);
  const [storageLabel, setStorageLabel] = useState("Sincronizando");

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      const localState = loadLocalMarketingState();
      const remoteState = await loadRemoteMarketingState().catch(() => null);
      const useRemote = shouldUseRemoteMarketingState(remoteState);
      const sourceState = useRemote ? remoteState! : localState;
      const defaults = buildMarketingCalendarDefaults(sourceState.profile);
      const hasSavedProfile = Boolean(
        sourceState.profile.firmName.trim() ||
        sourceState.profile.positioning.trim() ||
        sourceState.profile.legalAreas.length ||
        sourceState.profile.audiences.length ||
        sourceState.profile.websites.length ||
        sourceState.profile.socialProfiles.length ||
        sourceState.profile.admiredReferences.length,
      );
      if (cancelled) return;

      setCalendar(sourceState.calendar);
      setReferences(sourceState.references);
      saveLocalMarketingState({ calendar: sourceState.calendar, profile: sourceState.profile, references: sourceState.references });
      setForm((current) => ({
        ...current,
        style: defaults.style,
        channels: defaults.channels,
        legalAreas: defaults.legalAreas.join(", "),
        tones: defaults.tones,
        audiences: defaults.audiences.join(", "),
      }));
      setProfileDefaultsApplied(hasSavedProfile);
      setStorageLabel(useRemote ? "Servidor" : "Local");
      setIsLoaded(true);
    }

    void loadState();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    async function loadAgendaContext() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id, full_name, role")
        .eq("id", user.id)
        .maybeSingle();

      setCurrentUserId(user.id);
      setTenantId(profile?.tenant_id || null);
      setCurrentUserName(profile?.full_name || user.email?.split("@")[0] || null);
      setCurrentUserRole(profile?.role || null);
    }

    loadAgendaContext();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    saveMarketingCalendar(calendar);
    void saveRemoteMarketingState({ calendar }).then((saved) => setStorageLabel(saved ? "Servidor" : "Local"));
  }, [calendar, isLoaded]);

  function updateForm<K extends keyof CalendarForm>(key: K, value: CalendarForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function generateCalendar() {
    try {
      setCalendar(generateEditorialCalendar({
        startDate: form.startDate,
        frequency: form.frequency,
        style: form.style,
        channels: form.channels,
        legalAreas: splitList(form.legalAreas),
        objectives: form.objectives,
        tones: form.tones,
        audiences: splitList(form.audiences),
        references,
        periods: Math.max(1, Number(form.periods) || 1),
      }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o calendário.");
    }
  }

  function generateMayusInstagramWeekOne() {
    try {
      const weekOne = buildMayusInstagramWeekOneCalendar(form.startDate);
      setCalendar(weekOne);
      setForm((current) => ({
        ...current,
        channels: ["instagram"],
        legalAreas: "Operacao juridica",
        objectives: ["authority", "awareness", "lead_generation"],
        tones: ["premium", "direct", "educational", "conversational"],
        audiences: "Escritorios de advocacia com 3 a 20 pessoas",
        periods: "7",
      }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel gerar a semana narrativa do MAYUS.");
    }
  }

  async function createAgendaTaskFromItem(item: EditorialCalendarItem) {
    if (!tenantId || !currentUserId) {
      setAgendaMessage("Entre novamente para criar tarefas internas na agenda.");
      return;
    }

    setCreatingTaskItemId(item.id);
    setAgendaMessage(null);

    try {
      const draft = buildMarketingAgendaTaskDraft(item);
      const payload = buildAgendaPayloadFromManualTask({
        tenantId,
        title: draft.title,
        description: draft.description,
        responsibleNotes: draft.responsibleNotes,
        tags: draft.tags,
        assignedTo: currentUserId,
        assignedName: currentUserName,
        createdBy: currentUserId,
        createdByRole: currentUserRole,
        urgency: "ROTINA",
        scheduledFor: draft.scheduledFor,
        type: "Tarefa",
        visibility: "private",
        showOnlyOnDate: true,
        reminderDaysBefore: 0,
        rewardCoins: 0,
      });

      const { error: insertError } = await supabase.from("user_tasks").insert(payload);
      if (insertError) throw insertError;

      const taskNote = `Tarefa interna criada na agenda em ${new Date().toISOString().slice(0, 10)}. Origem: marketing_editorial_calendar.`;
      setCalendar((current) => updateEditorialCalendarItem(current, item.id, {
        notes: item.notes.includes("marketing_editorial_calendar") ? item.notes : `${item.notes}\n${taskNote}`.trim(),
      }));
      setAgendaMessage("Tarefa interna criada na agenda. Nenhuma publicação externa foi feita.");
    } catch (err) {
      setAgendaMessage(err instanceof Error ? err.message : "Não foi possível criar a tarefa interna.");
    } finally {
      setCreatingTaskItemId(null);
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
          <CalendarDays size={16} className="text-[#CCA761]" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#CCA761]/60">Planejamento Estratégico</span>
        </div>
        <h1 className={`text-4xl lg:text-5xl text-[#CCA761] ${cormorant.className} italic tracking-tight drop-shadow-[0_0_20px_rgba(204,167,97,0.3)]`}>
          Calendário Editorial
        </h1>
        <div className="mt-2 h-[1px] w-64 bg-gradient-to-r from-[#CCA761]/50 to-transparent" />
      </header>

      <section className="grid gap-12 xl:grid-cols-[420px_1fr]">

        {/* COLUNA ESQUERDA - CONFIGURAÇÃO */}
        <div className="space-y-8">
          <div className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#CCA761]/5 rounded-full blur-2xl" />

            <div className="relative z-10 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Configurar Grade</h2>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#CCA761]/60">{storageLabel}</span>
              </div>

              {profileDefaultsApplied && (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#CCA761]/5 border border-[#CCA761]/20">
                  <Sparkles size={16} className="text-[#CCA761] shrink-0 mt-0.5" />
                  <p className="text-[10px] text-[#CCA761]/80 leading-relaxed font-medium">
                    Briefing carregado automaticamente com base no seu Perfil de Marca.
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Frequência</label>
                    <select
                      value={form.frequency}
                      onChange={(event) => updateForm("frequency", event.target.value as MarketingFrequency)}
                      className="w-full rounded-xl border border-white/5 bg-[#050505] px-3 py-3 text-sm text-white outline-none focus:border-[#CCA761]/50"
                    >
                      {frequencies.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Períodos</label>
                    <input
                      type="number"
                      value={form.periods}
                      onChange={(event) => updateForm("periods", event.target.value)}
                      className="w-full rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-white outline-none focus:border-[#CCA761]/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Data Inicial</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(event) => updateForm("startDate", event.target.value)}
                    className="w-full rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-white outline-none focus:border-[#CCA761]/50 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Áreas Jurídicas</label>
                  <input
                    value={form.legalAreas}
                    onChange={(event) => updateForm("legalAreas", event.target.value)}
                    placeholder="Trabalhista, Cível..."
                    className="w-full rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-white outline-none focus:border-[#CCA761]/50 transition-all"
                  />
                </div>

                <div className="space-y-4 pt-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Canais Selecionados</p>
                  <div className="flex flex-wrap gap-2">
                    {channels.map((c) => (
                      <button
                        key={c}
                        onClick={() => updateForm("channels", toggleValue(form.channels, c))}
                        className={`px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${form.channels.includes(c) ? 'border-[#CCA761] bg-[#CCA761]/20 text-[#CCA761]' : 'border-white/5 bg-white/[0.02] text-gray-600 hover:border-white/20'}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {error && <p className="text-[10px] font-bold text-red-400 bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</p>}

                <button
                  onClick={generateCalendar}
                  className="w-full flex items-center justify-center gap-3 rounded-xl bg-[#CCA761] py-4 text-xs font-black uppercase tracking-[0.2em] text-black hover:bg-[#d1b06d] transition-all shadow-[0_0_20px_rgba(204,167,97,0.3)] active:scale-95 mt-4"
                >
                  <Wand2 size={18} />
                  Gerar Calendário
                </button>
                <button
                  onClick={generateMayusInstagramWeekOne}
                  className="w-full flex items-center justify-center gap-3 rounded-xl border border-[#CCA761]/30 bg-[#CCA761]/10 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#CCA761] hover:bg-[#CCA761] hover:text-black transition-all active:scale-95"
                >
                  <Sparkles size={16} />
                  Gerar Semana 1 MAYUS Instagram
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA - ITENS DO CALENDÁRIO */}
        <div className="space-y-8">

          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Clock size={16} className="text-[#CCA761]" />
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-white">Grade de Publicação</h2>
            </div>
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{calendar.length} Pautas Agendadas</span>
          </div>

          {agendaMessage && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-400">
              <CheckCircle2 size={16} />
              <p className="text-xs font-bold uppercase tracking-widest">{agendaMessage}</p>
            </div>
          )}

          <div className="grid gap-6">
            {calendar.length === 0 ? (
              <div className="py-24 text-center rounded-3xl border border-dashed border-white/5 bg-white/[0.01]">
                <p className="text-sm text-gray-700 font-medium italic">Configure o briefing e gere o calendário para começar.</p>
              </div>
            ) : calendar.map((item) => (
              <div key={item.id} className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-6 hover:border-[#CCA761]/20 transition-all group overflow-hidden relative">
                <div className={`absolute top-0 left-0 w-1 h-full ${item.status === 'approved' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : item.status === 'rejected' ? 'bg-red-500' : 'bg-gray-800'}`} />

                <div className="grid gap-6 lg:grid-cols-[1fr_200px]">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-0.5 rounded-md border border-[#CCA761]/30 bg-[#CCA761]/5 text-[9px] font-black uppercase tracking-widest text-[#CCA761]">{item.channel}</span>
                      <span className="text-gray-700">•</span>
                      <span className="text-[10px] font-bold text-gray-400">{item.date}</span>
                    </div>

                    <input
                      value={item.title}
                      onChange={(e) => setCalendar((curr) => updateEditorialCalendarItem(curr, item.id, { title: e.target.value }))}
                      className="w-full bg-transparent text-lg font-bold text-white outline-none focus:text-[#CCA761] transition-colors"
                    />

                    <div className="flex flex-wrap gap-4 text-[10px] font-black uppercase tracking-widest text-gray-600">
                      <span className="flex items-center gap-1.5"><Target size={12} className="text-gray-800" /> {item.objective}</span>
                      <span className="flex items-center gap-1.5"><Zap size={12} className="text-gray-800" /> {item.tone}</span>
                      <span className="flex items-center gap-1.5"><AlertCircle size={12} className="text-gray-800" /> {item.legalArea}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 justify-center lg:border-l lg:border-white/5 lg:pl-6">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCalendar((curr) => updateEditorialCalendarItem(curr, item.id, { status: "approved" }))}
                        className={`flex-1 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${item.status === 'approved' ? 'bg-emerald-500 text-black border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-white/[0.02] border-white/5 text-gray-600 hover:border-emerald-500/30'}`}
                      >
                        Aprovar
                      </button>
                      <button
                        onClick={() => setCalendar((curr) => updateEditorialCalendarItem(curr, item.id, { status: "rejected" }))}
                        className={`flex-1 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${item.status === 'rejected' ? 'bg-red-500 text-black border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-white/[0.02] border-white/5 text-gray-600 hover:border-red-500/30'}`}
                      >
                        Recusar
                      </button>
                    </div>

                    {item.status === 'approved' && (
                      <button
                        onClick={() => createAgendaTaskFromItem(item)}
                        disabled={creatingTaskItemId === item.id || item.notes.includes("marketing_editorial_calendar")}
                        className="w-full py-2.5 rounded-xl bg-[#CCA761]/10 text-[#CCA761] border border-[#CCA761]/30 text-[9px] font-black uppercase tracking-widest hover:bg-[#CCA761] hover:text-black transition-all disabled:opacity-50"
                      >
                        {item.notes.includes("marketing_editorial_calendar") ? "Na Agenda" : creatingTaskItemId === item.id ? "Criando..." : "Mandar para Agenda"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-white/5">
                  <textarea
                    value={item.notes}
                    onChange={(e) => setCalendar((curr) => updateEditorialCalendarItem(curr, item.id, { notes: e.target.value }))}
                    placeholder="Notas e diretrizes para esta pauta..."
                    rows={2}
                    className="w-full bg-white/[0.01] border border-white/5 rounded-xl px-4 py-3 text-xs text-gray-500 outline-none focus:border-[#CCA761]/20 transition-all resize-none"
                  />
                  <p className="mt-3 text-[10px] text-gray-700 italic font-medium">Ângulo: {item.angle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
