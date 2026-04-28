"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { buildAgendaPayloadFromManualTask } from "@/lib/agenda/userTasks";
import {
  buildMarketingAgendaTaskDraft,
  generateEditorialCalendar,
  updateEditorialCalendarItem,
  type EditorialCalendarItem,
  type MarketingChannel,
  type MarketingFrequency,
  type MarketingObjective,
  type MarketingTone,
} from "@/lib/marketing/editorial-calendar";
import { loadMarketingCalendar, saveMarketingCalendar } from "@/lib/marketing/local-persistence";
import { createClient } from "@/lib/supabase/client";

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
  const [error, setError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [creatingTaskItemId, setCreatingTaskItemId] = useState<string | null>(null);
  const [agendaMessage, setAgendaMessage] = useState<string | null>(null);

  useEffect(() => {
    setCalendar(loadMarketingCalendar());
    setIsLoaded(true);
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
        periods: Math.max(1, Number(form.periods) || 1),
      }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel gerar o calendario.");
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
      setAgendaMessage("Tarefa interna criada na agenda. Nenhuma publicacao externa foi feita.");
    } catch (err) {
      setAgendaMessage(err instanceof Error ? err.message : "Nao foi possivel criar a tarefa interna.");
    } finally {
      setCreatingTaskItemId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground lg:px-10">
      <Link href="/dashboard/marketing" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-[#CCA761]">
        <ArrowLeft size={16} />
        Voltar para Marketing
      </Link>

      <section className="mt-6 rounded-3xl border border-border bg-card p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#CCA761]/25 bg-[#CCA761]/10 text-[#CCA761]">
          <CalendarDays size={22} />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-[#CCA761]">Planejamento</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Calendario Editorial</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
          Gere uma grade editorial local com frequencia, estilo, canais, area juridica, objetivo, tom, publico, data inicial e periodos.
        </p>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <div className="rounded-3xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#CCA761]">Briefing</p>
              <h2 className="mt-2 text-xl font-semibold">Parametros do calendario</h2>
            </div>
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">MVP localStorage</span>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Frequencia
                <select
                  value={form.frequency}
                  onChange={(event) => updateForm("frequency", event.target.value as MarketingFrequency)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
                >
                  {frequencies.map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Periodos
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={form.periods}
                  onChange={(event) => updateForm("periods", event.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium">
              Data inicial
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => updateForm("startDate", event.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Estilo
              <input
                value={form.style}
                onChange={(event) => updateForm("style", event.target.value)}
                placeholder="Ex: premium consultivo"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Areas juridicas
              <input
                value={form.legalAreas}
                onChange={(event) => updateForm("legalAreas", event.target.value)}
                placeholder="Separadas por virgula"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Publicos
              <input
                value={form.audiences}
                onChange={(event) => updateForm("audiences", event.target.value)}
                placeholder="Separados por virgula"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
              />
            </label>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Canais</legend>
              <div className="flex flex-wrap gap-2">
                {channels.map((channel) => (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => updateForm("channels", toggleValue(form.channels, channel))}
                    className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${form.channels.includes(channel) ? "border-[#CCA761] bg-[#CCA761]/10 text-[#CCA761]" : "border-border text-muted-foreground"}`}
                  >
                    {channel}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Objetivos</legend>
              <div className="flex flex-wrap gap-2">
                {objectives.map((objective) => (
                  <button
                    key={objective}
                    type="button"
                    onClick={() => updateForm("objectives", toggleValue(form.objectives, objective))}
                    className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${form.objectives.includes(objective) ? "border-[#CCA761] bg-[#CCA761]/10 text-[#CCA761]" : "border-border text-muted-foreground"}`}
                  >
                    {objective}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Tom</legend>
              <div className="flex flex-wrap gap-2">
                {tones.map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => updateForm("tones", toggleValue(form.tones, tone))}
                    className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${form.tones.includes(tone) ? "border-[#CCA761] bg-[#CCA761]/10 text-[#CCA761]" : "border-border text-muted-foreground"}`}
                  >
                    {tone}
                  </button>
                ))}
              </div>
            </fieldset>

            {error ? <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

            <button
              type="button"
              onClick={generateCalendar}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#CCA761] px-4 py-3 text-sm font-bold text-black transition-opacity hover:opacity-90"
            >
              <Wand2 size={16} />
              Gerar calendario
            </button>
          </div>
        </div>

        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#CCA761]">Draft calendar</p>
              <h2 className="mt-2 text-xl font-semibold">Itens editaveis</h2>
            </div>
            <span className="text-sm text-muted-foreground">{calendar.length} pautas salvas localmente</span>
          </div>

          <div className="mt-6 grid gap-4">
            {agendaMessage ? <p className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">{agendaMessage}</p> : null}

            {calendar.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                Gere o calendario para editar titulos, datas, status, canal, objetivo, tom, publico, area e notas.
              </p>
            ) : calendar.map((item) => (
              <article key={item.id} className="rounded-2xl border border-border bg-background/50 p-4">
                <div className="grid gap-4 lg:grid-cols-[1fr_160px_160px]">
                  <label className="grid gap-2 text-sm font-medium">
                    Titulo
                    <input
                      value={item.title}
                      onChange={(event) => setCalendar((current) => updateEditorialCalendarItem(current, item.id, { title: event.target.value }))}
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    Data
                    <input
                      type="date"
                      value={item.date}
                      onChange={(event) => setCalendar((current) => updateEditorialCalendarItem(current, item.id, { date: event.target.value }))}
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    Status
                    <select
                      value={item.status}
                      onChange={(event) => setCalendar((current) => updateEditorialCalendarItem(current, item.id, { status: event.target.value as EditorialCalendarItem["status"] }))}
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
                    >
                      <option value="draft">draft</option>
                      <option value="approved">approved</option>
                      <option value="rejected">rejected</option>
                      <option value="published">published</option>
                    </select>
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCalendar((current) => updateEditorialCalendarItem(current, item.id, { status: "approved" }))}
                    className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-500 transition-opacity hover:opacity-80"
                  >
                    Aprovar
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendar((current) => updateEditorialCalendarItem(current, item.id, { status: "rejected" }))}
                    className="rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-destructive transition-opacity hover:opacity-80"
                  >
                    Recusar
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendar((current) => updateEditorialCalendarItem(current, item.id, { status: "draft" }))}
                    className="rounded-full border border-border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Voltar para rascunho
                  </button>
                  {item.status === "approved" ? (
                    <button
                      type="button"
                      disabled={creatingTaskItemId === item.id}
                      onClick={() => createAgendaTaskFromItem(item)}
                      className="rounded-full border border-[#CCA761]/40 bg-[#CCA761]/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#CCA761] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {creatingTaskItemId === item.id ? "Criando tarefa..." : "Criar tarefa na agenda"}
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Canal
                    <select value={item.channel} onChange={(event) => setCalendar((current) => updateEditorialCalendarItem(current, item.id, { channel: event.target.value as MarketingChannel }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal tracking-normal text-foreground outline-none transition-colors focus:border-[#CCA761]">
                      {channels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Area
                    <input value={item.legalArea} onChange={(event) => setCalendar((current) => updateEditorialCalendarItem(current, item.id, { legalArea: event.target.value }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal tracking-normal text-foreground outline-none transition-colors focus:border-[#CCA761]" />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Objetivo
                    <select value={item.objective} onChange={(event) => setCalendar((current) => updateEditorialCalendarItem(current, item.id, { objective: event.target.value as MarketingObjective }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal tracking-normal text-foreground outline-none transition-colors focus:border-[#CCA761]">
                      {objectives.map((objective) => <option key={objective} value={objective}>{objective}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Tom
                    <select value={item.tone} onChange={(event) => setCalendar((current) => updateEditorialCalendarItem(current, item.id, { tone: event.target.value as MarketingTone }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal tracking-normal text-foreground outline-none transition-colors focus:border-[#CCA761]">
                      {tones.map((tone) => <option key={tone} value={tone}>{tone}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Publico
                    <input value={item.audience} onChange={(event) => setCalendar((current) => updateEditorialCalendarItem(current, item.id, { audience: event.target.value }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal tracking-normal text-foreground outline-none transition-colors focus:border-[#CCA761]" />
                  </label>
                </div>

                <label className="mt-4 grid gap-2 text-sm font-medium">
                  Notas
                  <textarea
                    value={item.notes}
                    onChange={(event) => setCalendar((current) => updateEditorialCalendarItem(current, item.id, { notes: event.target.value }))}
                    rows={2}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
                  />
                </label>

                <p className="mt-4 text-xs leading-5 text-muted-foreground">Angulo: {item.angle}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
