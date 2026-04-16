import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Exclusao de Dados | MAYUS",
  description: "Instrucoes para solicitacao de exclusao de dados na plataforma MAYUS.",
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-white px-6 py-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-3 border-b border-white/10 pb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[#CCA761] font-semibold">MAYUS</p>
          <h1 className="text-3xl md:text-4xl font-semibold">Exclusao de Dados do Usuario</h1>
          <p className="text-sm text-white/60">Ultima atualizacao: 16/04/2026</p>
        </header>

        <section className="space-y-4 text-sm text-white/80 leading-7">
          <p>
            Se voce deseja solicitar a exclusao de dados vinculados a sua conta ou a sua organizacao na plataforma
            MAYUS, siga as instrucoes abaixo.
          </p>
        </section>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">1. Como solicitar</h2>
          <p>
            Envie um e-mail para <a className="text-[#CCA761] hover:underline" href="mailto:camiladutra.adv@gmail.com">camiladutra.adv@gmail.com</a> com o
            assunto <strong>&quot;Exclusao de Dados MAYUS&quot;</strong> e inclua informacoes suficientes para identificacao da
            conta (nome, e-mail de cadastro e, quando aplicavel, nome da organizacao).
          </p>
        </section>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">2. Prazo de resposta</h2>
          <p>
            Solicitacoes sao analisadas em ate 15 dias corridos, podendo haver prazo adicional quando necessario para
            validacao de identidade e requisitos legais.
          </p>
        </section>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">3. Escopo da exclusao</h2>
          <p>
            A exclusao abrangera dados pessoais e registros operacionais vinculados ao titular, exceto informacoes que
            precisem ser mantidas por obrigacao legal, regulatoria ou para defesa de direitos.
          </p>
        </section>

        <footer className="pt-8 border-t border-white/10 text-sm text-white/60 flex flex-wrap gap-4">
          <Link href="/privacy" className="text-[#CCA761] hover:underline">
            Politica de Privacidade
          </Link>
          <Link href="/terms" className="text-[#CCA761] hover:underline">
            Termos de Servico
          </Link>
        </footer>
      </div>
    </main>
  );
}
