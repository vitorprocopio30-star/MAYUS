"use client";

import Link from "next/link";
import { ArrowLeft, CalendarPlus, CheckCircle2, Megaphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { buildAgendaPayloadFromManualTask } from "@/lib/agenda/userTasks";
import {
  buildMarketingAgendaTaskDraft,
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

export default function AprovadosMarketingPage() {
  const supabase = createClient();
  const [calendar, setCalendar] = useState<EditorialCalendarItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageLabel, setStorageLabel] = useState("Carregando");
  const [message, setMessage] = useState<string | null>(null);
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
      saveLocalMarketingState({ calendar: sourceState.calendar });
      setStorageLabel(useRemote ? "Servidor" : "Local com fallback");
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
    void saveRemoteMarketingState({ calendar }).then((saved) => setStorageLabel(saved ? "Servidor" : "Local com fallback"));
  }, [calendar, isLoaded]);

  const approvedItems = useMemo(() => {
    return calendar
      .filter((item) => item.status === "approved" || item.status === "published")
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [calendar]);

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
      setMessage("Tarefa interna criada na agenda. Nenhuma publicacao externa foi feita.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel criar a tarefa interna.");
    } finally {
      setCreatingTaskItemId(null);
    }
  }

  function markPublished(item: EditorialCalendarItem) {
    const note = `Publicado manualmente em ${new Date().toISOString().slice(0, 10)}. Sem publicacao automatica pelo MAYUS.`;
    setCalendar((current) => updateEditorialCalendarItem(current, item.id, {
      status: "published",
      notes: item.notes.includes("Publicado manualmente") ? item.notes : `${item.notes}\n${note}`.trim(),
    }));
    setMessage("Conteudo marcado como publicado manualmente.");
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground lg:px-10">
      <Link href="/dashboard/marketing" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-[#CCA761]">
        <ArrowLeft size={16} />
        Voltar para Marketing
      </Link>

      <section className="mt-6 rounded-3xl border border-border bg-card p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#CCA761]/25 bg-[#CCA761]/10 text-[#CCA761]">
          <CheckCircle2 size={22} />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-[#CCA761]">Prontos para uso</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Conteudos Aprovados</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
          Hub operacional para pautas aprovadas: criar tarefa interna, acompanhar status e marcar publicacao manual sem acionar redes sociais automaticamente.
        </p>
        <span className="mt-5 inline-flex rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{storageLabel}</span>
      </section>

      {message ? <p className="mt-6 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">{message}</p> : null}

      <section className="mt-8 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {approvedItems.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-border p-8 text-sm text-muted-foreground lg:col-span-2 xl:col-span-3">
            Nenhum conteudo aprovado ainda. Aprove pautas no Calendario Editorial ou no Kanban Marketing.
          </p>
        ) : approvedItems.map((item) => {
          const taskCreated = item.notes.includes("marketing_editorial_calendar");
          return (
            <article key={item.id} className="rounded-3xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#CCA761]">{item.channel}</p>
                  <h2 className="mt-2 text-lg font-semibold leading-6">{item.title}</h2>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${item.status === "published" ? "border-[#CCA761]/30 bg-[#CCA761]/10 text-[#CCA761]" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"}`}>
                  {item.status === "published" ? "Publicado" : "Aprovado"}
                </span>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                <p><span className="font-bold text-foreground">Data:</span> {item.date}</p>
                <p><span className="font-bold text-foreground">Area:</span> {item.legalArea}</p>
                <p><span className="font-bold text-foreground">Publico:</span> {item.audience}</p>
                <p><span className="font-bold text-foreground">Objetivo:</span> {item.objective}</p>
                <p><span className="font-bold text-foreground">Angulo:</span> {item.angle}</p>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={taskCreated || creatingTaskItemId === item.id}
                  onClick={() => createAgendaTaskFromItem(item)}
                  className="inline-flex items-center gap-2 rounded-full border border-[#CCA761]/40 bg-[#CCA761]/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#CCA761] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CalendarPlus size={14} />
                  {taskCreated ? "Tarefa criada" : creatingTaskItemId === item.id ? "Criando..." : "Criar tarefa"}
                </button>
                <button
                  type="button"
                  disabled={item.status === "published"}
                  onClick={() => markPublished(item)}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-[#CCA761]/50 hover:text-[#CCA761] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Megaphone size={14} />
                  Marcar publicado
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
