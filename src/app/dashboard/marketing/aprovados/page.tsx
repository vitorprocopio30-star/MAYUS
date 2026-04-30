"use client";

import Link from "next/link";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { ArrowLeft, CalendarPlus, Check, CheckCircle2, Copy, Megaphone, Wand2, Star, Clock, ShieldCheck, ExternalLink, Trash2, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { buildAgendaPayloadFromManualTask } from "@/lib/agenda/userTasks";
import {
  buildMarketingFinalDraft,
  markMarketingFinalDraftReviewedInNotes,
  readMarketingFinalDraftFromNotes,
  upsertMarketingFinalDraftInNotes,
  type MarketingFinalDraft,
} from "@/lib/marketing/content-draft";
import {
  buildMarketingAgendaTaskDraft,
  type MarketingProfile,
  updateEditorialCalendarItem,
  type EditorialCalendarItem,
} from "@/lib/marketing/editorial-calendar";
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

export default function AprovadosMarketingPage() {
  const supabase = createClient();
  const [calendar, setCalendar] = useState<EditorialCalendarItem[]>([]);
  const [profile, setProfile] = useState<MarketingProfile | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageLabel, setStorageLabel] = useState("Sincronizando");
  const [message, setMessage] = useState<string | null>(null);
  const [generatedDrafts, setGeneratedDrafts] = useState<Record<string, MarketingFinalDraft>>({});
  const [creatingTaskItemId, setCreatingTaskItemId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      const localState = loadLocalMarketingState();
      const remoteState = await loadRemoteMarketingState().catch(() => null);
      const useRemote = shouldUseRemoteMarketingState(remoteState);
      const sourceState = useRemote ? remoteState! : localState;
      if (cancelled) return;

      setCalendar(sourceState.calendar);
      setProfile(sourceState.profile);
      const savedDrafts: Record<string, MarketingFinalDraft> = {};
      sourceState.calendar.forEach((item) => {
        const savedDraft = readMarketingFinalDraftFromNotes(item.notes);
        if (savedDraft) savedDrafts[item.id] = savedDraft;
      });
      setGeneratedDrafts(savedDrafts);
      saveLocalMarketingState({ calendar: sourceState.calendar });
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

    void loadAgendaContext();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    saveMarketingCalendar(calendar);
    void saveRemoteMarketingState({ calendar }).then((saved) => setStorageLabel(saved ? "Servidor" : "Local"));
  }, [calendar, isLoaded]);

  const approvedItems = useMemo(() => {
    return calendar
      .filter((item) => item.status === "approved" || item.status === "published")
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [calendar]);

  const groupedItems = useMemo(() => {
    const readyToPublish = approvedItems.filter((item) => item.status === "approved" && Boolean(generatedDrafts[item.id]?.reviewedAt));
    const needsReview = approvedItems.filter((item) => item.status === "approved" && !generatedDrafts[item.id]?.reviewedAt);
    const published = approvedItems.filter((item) => item.status === "published");

    return { readyToPublish, needsReview, published };
  }, [approvedItems, generatedDrafts]);

  async function createAgendaTaskFromItem(item: EditorialCalendarItem) {
    if (!tenantId || !currentUserId) {
      setMessage("Entre novamente para criar tarefas internas na agenda.");
      return;
    }

    setCreatingTaskItemId(item.id);
    setMessage(null);

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

      const { error } = await supabase.from("user_tasks").insert(payload);
      if (error) throw error;

      const taskNote = `Tarefa interna criada na agenda em ${new Date().toISOString().slice(0, 10)}. Origem: marketing_editorial_calendar.`;
      setCalendar((current) => updateEditorialCalendarItem(current, item.id, {
        notes: item.notes.includes("marketing_editorial_calendar") ? item.notes : `${item.notes}\n${taskNote}`.trim(),
      }));
      setMessage("Tarefa interna criada na agenda.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar a tarefa interna.");
    } finally {
      setCreatingTaskItemId(null);
    }
  }

  function markPublished(item: EditorialCalendarItem) {
    const note = `Publicado manualmente em ${new Date().toISOString().slice(0, 10)}.`;
    setCalendar((current) => updateEditorialCalendarItem(current, item.id, {
      status: "published",
      notes: item.notes.includes("Publicado manualmente") ? item.notes : `${item.notes}\n${note}`.trim(),
    }));
    setMessage("Conteúdo marcado como publicado.");
  }

  function prepareFinalDraft(item: EditorialCalendarItem) {
    try {
      const draft = buildMarketingFinalDraft(item, profile);
      setGeneratedDrafts((current) => ({ ...current, [item.id]: draft }));
      setCalendar((current) => updateEditorialCalendarItem(current, item.id, {
        notes: upsertMarketingFinalDraftInNotes(item.notes, draft),
      }));
      setMessage("Rascunho final preparado. Revise abaixo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível preparar o rascunho final.");
    }
  }

  async function copyFinalDraft(draft: MarketingFinalDraft) {
    try {
      await navigator.clipboard.writeText(draft.body);
      setMessage("Rascunho copiado com sucesso.");
    } catch {
      setMessage("Erro ao copiar. Selecione o texto manualmente.");
    }
  }

  function markFinalDraftReviewed(item: EditorialCalendarItem, draft: MarketingFinalDraft) {
    const reviewedAt = new Date().toISOString();
    const reviewedDraft = { ...draft, reviewedAt };
    setGeneratedDrafts((current) => ({ ...current, [item.id]: reviewedDraft }));
    setCalendar((current) => updateEditorialCalendarItem(current, item.id, {
      notes: markMarketingFinalDraftReviewedInNotes(item.notes, reviewedAt),
    }));
    setMessage("Rascunho marcado como revisado.");
  }

  function renderContentCard(item: EditorialCalendarItem) {
    const taskCreated = item.notes.includes("marketing_editorial_calendar");
    const finalDraft = generatedDrafts[item.id];
    const readyToPublish = item.status === "approved" && Boolean(finalDraft?.reviewedAt);

    return (
      <article key={item.id} className={`rounded-3xl border bg-[#0a0a0a] p-6 transition-all relative overflow-hidden group ${readyToPublish ? 'border-emerald-500/30 bg-emerald-500/[0.02] shadow-[0_0_30px_rgba(16,185,129,0.05)]' : 'border-white/5 hover:border-white/10'}`}>
        <div className={`absolute top-0 right-0 w-32 h-32 opacity-10 blur-3xl rounded-full ${readyToPublish ? 'bg-emerald-500' : 'bg-[#CCA761]'}`} />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <span className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${readyToPublish ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-[#CCA761]/30 bg-[#CCA761]/5 text-[#CCA761]'}`}>
              {item.channel}
            </span>
            <span className="text-[10px] font-bold text-gray-600 flex items-center gap-1.5 uppercase tracking-widest">
              <Clock size={12} /> {item.date}
            </span>
          </div>

          <h3 className="text-white font-bold text-lg mb-4 group-hover:text-[#CCA761] transition-colors">{item.title}</h3>

          <div className="flex flex-wrap gap-x-4 gap-y-2 mb-6">
            <div className="space-y-0.5">
              <p className="text-[8px] font-black uppercase tracking-widest text-gray-700">Objetivo</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{item.objective}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[8px] font-black uppercase tracking-widest text-gray-700">Área</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{item.legalArea}</p>
            </div>
            {readyToPublish && (
               <div className="space-y-0.5">
                <p className="text-[8px] font-black uppercase tracking-widest text-emerald-900">Estado</p>
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-tight">Pronto</p>
              </div>
            )}
          </div>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => createAgendaTaskFromItem(item)}
              disabled={taskCreated || creatingTaskItemId === item.id}
              className="flex-1 py-2 rounded-xl bg-white/[0.03] border border-white/5 text-[9px] font-black uppercase tracking-widest text-gray-400 hover:text-white hover:border-[#CCA761]/30 transition-all disabled:opacity-30"
            >
              {taskCreated ? "Na Agenda" : "Tarefa"}
            </button>
            <button
              onClick={() => prepareFinalDraft(item)}
              className="flex-1 py-2 rounded-xl bg-[#CCA761]/10 border border-[#CCA761]/20 text-[9px] font-black uppercase tracking-widest text-[#CCA761] hover:bg-[#CCA761] hover:text-black transition-all"
            >
              Gerar Rascunho
            </button>
             <button
              onClick={() => markPublished(item)}
              className="px-3 py-2 rounded-xl bg-white/[0.01] border border-white/5 text-gray-700 hover:text-white transition-all"
              title="Marcar como publicado"
            >
              <Megaphone size={14} />
            </button>
          </div>

          {finalDraft && (
            <div className="mt-6 pt-6 border-t border-white/5 space-y-4 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-widest text-[#CCA761]">Corpo do Conteúdo</p>
                <div className="flex gap-2">
                  <button onClick={() => void copyFinalDraft(finalDraft)} className="p-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-gray-500 hover:text-[#CCA761] transition-all"><Copy size={12} /></button>
                  <button onClick={() => markFinalDraftReviewed(item, finalDraft)} disabled={Boolean(finalDraft.reviewedAt)} className={`p-1.5 rounded-lg border transition-all ${finalDraft.reviewedAt ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-white/[0.03] border-white/5 text-gray-500 hover:text-emerald-400'}`}><CheckCircle2 size={12} /></button>
                </div>
              </div>
              <div className="max-h-[200px] overflow-y-auto pr-2 no-scrollbar">
                <p className="text-[11px] leading-relaxed text-gray-400 whitespace-pre-wrap font-medium">{finalDraft.body}</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <p className="text-[8px] font-black uppercase tracking-widest text-gray-600 mb-2">Checklist de Ética</p>
                <ul className="space-y-1">
                  {finalDraft.ethicalChecklist.slice(0, 2).map((c, i) => (
                    <li key={i} className="text-[9px] text-gray-500 flex items-center gap-2"><ShieldCheck size={10} className="text-[#CCA761]" /> {c}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </article>
    );
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
          <ShieldCheck size={16} className="text-[#CCA761]" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#CCA761]/60">Central de Operações</span>
        </div>
        <h1 className={`text-4xl lg:text-5xl text-[#CCA761] ${cormorant.className} italic tracking-tight drop-shadow-[0_0_20px_rgba(204,167,97,0.3)]`}>
          Conteúdos Aprovados
        </h1>
        <div className="mt-2 h-[1px] w-64 bg-gradient-to-r from-[#CCA761]/50 to-transparent" />
      </header>

      {message && (
        <div className="mb-8 p-4 rounded-2xl bg-[#CCA761]/10 border border-[#CCA761]/20 flex items-center justify-between text-[#CCA761]">
          <div className="flex items-center gap-3">
            <Zap size={16} />
            <p className="text-xs font-black uppercase tracking-widest">{message}</p>
          </div>
          <button onClick={() => setMessage(null)} className="text-[#CCA761]/50 hover:text-[#CCA761]"><Trash2 size={14} /></button>
        </div>
      )}

      <section className="space-y-12">

        {groupedItems.readyToPublish.length > 0 && (
          <GroupSection title="Prontos para Publicar" icon={<Star size={16} />} count={groupedItems.readyToPublish.length}>
            {groupedItems.readyToPublish.map(renderContentCard)}
          </GroupSection>
        )}

        <GroupSection title="Aguardando Revisão" icon={<Clock size={16} />} count={groupedItems.needsReview.length}>
          {approvedItems.length === 0 ? (
            <div className="lg:col-span-3 py-24 text-center rounded-3xl border border-dashed border-white/5 bg-white/[0.01]">
              <p className="text-sm text-gray-700 font-medium italic">Nenhum conteúdo aprovado para revisão.</p>
            </div>
          ) : groupedItems.needsReview.map(renderContentCard)}
        </GroupSection>

        {groupedItems.published.length > 0 && (
          <GroupSection title="Histórico de Publicações" icon={<ExternalLink size={16} />} count={groupedItems.published.length}>
            {groupedItems.published.map(renderContentCard)}
          </GroupSection>
        )}

      </section>
    </main>
  );
}

function GroupSection({ title, icon, count, children }: { title: string; icon: ReactNode; count: number; children: ReactNode }) {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-[#CCA761]">{icon}</div>
          <h2 className="text-xs font-black uppercase tracking-[0.3em] text-white">{title}</h2>
        </div>
        <span className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">{count} Itens</span>
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </section>
  );
}
