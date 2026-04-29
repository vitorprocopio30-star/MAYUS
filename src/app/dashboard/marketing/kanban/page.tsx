"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, LayoutDashboard, Megaphone, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { updateEditorialCalendarItem, type EditorialCalendarItem } from "@/lib/marketing/editorial-calendar";
import { loadMarketingCalendar, saveMarketingCalendar } from "@/lib/marketing/local-persistence";

const columns = [
  { status: "draft", title: "Rascunho", icon: Megaphone, className: "border-zinc-500/25 bg-zinc-500/10 text-zinc-400" },
  { status: "approved", title: "Aprovado", icon: CheckCircle2, className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" },
  { status: "published", title: "Publicado", icon: CalendarDays, className: "border-[#CCA761]/30 bg-[#CCA761]/10 text-[#CCA761]" },
  { status: "rejected", title: "Recusado", icon: XCircle, className: "border-red-500/25 bg-red-500/10 text-red-400" },
] satisfies Array<{
  status: EditorialCalendarItem["status"];
  title: string;
  icon: typeof LayoutDashboard;
  className: string;
}>;

const nextActions: Array<{ status: EditorialCalendarItem["status"]; label: string }> = [
  { status: "draft", label: "Rascunho" },
  { status: "approved", label: "Aprovar" },
  { status: "published", label: "Publicado" },
  { status: "rejected", label: "Recusar" },
];

export default function MarketingKanbanPage() {
  const [calendar, setCalendar] = useState<EditorialCalendarItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setCalendar(loadMarketingCalendar());
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    saveMarketingCalendar(calendar);
  }, [calendar, isLoaded]);

  const grouped = useMemo(() => {
    return columns.reduce<Record<EditorialCalendarItem["status"], EditorialCalendarItem[]>>((acc, column) => {
      acc[column.status] = calendar
        .filter((item) => item.status === column.status)
        .sort((a, b) => a.date.localeCompare(b.date));
      return acc;
    }, { draft: [], approved: [], published: [], rejected: [] });
  }, [calendar]);

  function moveItem(itemId: string, status: EditorialCalendarItem["status"]) {
    setCalendar((current) => updateEditorialCalendarItem(current, itemId, { status }));
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground lg:px-10">
      <Link href="/dashboard/marketing" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-[#CCA761]">
        <ArrowLeft size={16} />
        Voltar para Marketing
      </Link>

      <section className="mt-6 rounded-3xl border border-border bg-card p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#CCA761]/25 bg-[#CCA761]/10 text-[#CCA761]">
          <LayoutDashboard size={22} />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-[#CCA761]">Fluxo editorial</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Kanban Marketing</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
          Acompanhe o calendario editorial por status. Este kanban usa o mesmo MVP local do calendario e nao publica conteudo nem aciona integracoes externas.
        </p>
      </section>

      <section className="mt-8 grid gap-4 xl:grid-cols-4">
        {columns.map((column) => {
          const Icon = column.icon;
          const items = grouped[column.status];

          return (
            <div key={column.status} className="min-h-[520px] rounded-3xl border border-border bg-card p-4">
              <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${column.className}`}>
                <div className="flex items-center gap-2">
                  <Icon size={17} />
                  <h2 className="text-sm font-black uppercase tracking-[0.18em]">{column.title}</h2>
                </div>
                <span className="rounded-full border border-current/20 px-2 py-0.5 text-xs font-bold">{items.length}</span>
              </div>

              <div className="mt-4 grid gap-3">
                {items.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Nenhuma pauta nesta coluna.
                  </p>
                ) : items.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-border bg-background/50 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#CCA761]">{item.channel}</p>
                        <h3 className="mt-2 text-sm font-semibold leading-5">{item.title}</h3>
                      </div>
                      <span className="shrink-0 rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">{item.date}</span>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                      <p><span className="font-bold text-foreground">Area:</span> {item.legalArea}</p>
                      <p><span className="font-bold text-foreground">Publico:</span> {item.audience}</p>
                      <p><span className="font-bold text-foreground">Objetivo:</span> {item.objective}</p>
                      <p><span className="font-bold text-foreground">Tom:</span> {item.tone}</p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {nextActions.filter((action) => action.status !== item.status).map((action) => (
                        <button
                          key={action.status}
                          type="button"
                          onClick={() => moveItem(item.id, action.status)}
                          className="rounded-full border border-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-[#CCA761]/50 hover:text-[#CCA761]"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
