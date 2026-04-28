import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

export default function AprovadosMarketingPage() {
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
          Espaco reservado para pecas liberadas, historico de aprovacoes e materiais reutilizaveis.
        </p>
      </section>
    </main>
  );
}
