import Link from "next/link";
import { ArrowRight, Building2, CalendarDays, CheckCircle2, Images, Megaphone, Upload } from "lucide-react";

const marketingAreas = [
  {
    title: "Perfil e Canais",
    description: "Cadastre posicionamento, areas, publicos, redes, sites e referencias admiradas.",
    href: "/dashboard/marketing/perfil",
    icon: Building2,
    label: "Base operacional",
  },
  {
    title: "Referencias",
    description: "Organize benchmarks, repertorio visual e ideias para campanhas futuras.",
    href: "/dashboard/marketing/referencias",
    icon: Images,
    label: "Pesquisa criativa",
  },
  {
    title: "Calendario Editorial",
    description: "Planeje pautas, datas-chave e cadencia de publicacao por canal.",
    href: "/dashboard/marketing/calendario",
    icon: CalendarDays,
    label: "Planejamento",
  },
  {
    title: "Meta Ads Upload",
    description: "Centralize os arquivos e instrucoes antes da subida de criativos.",
    href: "/dashboard/marketing/meta-ads",
    icon: Upload,
    label: "Midia paga",
  },
  {
    title: "Conteudos Aprovados",
    description: "Acesse pecas liberadas para publicacao e reaproveitamento comercial.",
    href: "/dashboard/marketing/aprovados",
    icon: CheckCircle2,
    label: "Prontos para uso",
  },
];

export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground lg:px-10">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-sm">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-[#CCA761]/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#CCA761]/30 bg-[#CCA761]/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-[#CCA761]">
            <Megaphone size={14} />
            Growth OS
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
            Marketing
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
            Shell operacional para organizar perfil de marca, referencias, calendario editorial, Meta Ads e conteudos aprovados. O MVP salva dados localmente, cria tarefas internas quando aprovado e nao publica nada automaticamente.
          </p>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {marketingAreas.map((area) => {
          const Icon = area.icon;

          return (
            <Link
              key={area.href}
              href={area.href}
              className="group flex min-h-[240px] flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:border-[#CCA761]/50 hover:shadow-[0_18px_50px_rgba(0,0,0,0.12)]"
            >
              <div>
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#CCA761]/25 bg-[#CCA761]/10 text-[#CCA761]">
                    <Icon size={21} />
                  </div>
                  <ArrowRight size={18} className="text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-[#CCA761]" />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                  {area.label}
                </p>
                <h2 className="mt-3 text-xl font-semibold text-foreground">{area.title}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{area.description}</p>
              </div>
              <span className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#CCA761]">
                Abrir modulo
              </span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
