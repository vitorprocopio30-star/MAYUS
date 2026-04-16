import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termos de Servico | MAYUS",
  description: "Termos de servico da plataforma MAYUS.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-white px-6 py-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-3 border-b border-white/10 pb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[#CCA761] font-semibold">MAYUS</p>
          <h1 className="text-3xl md:text-4xl font-semibold">Termos de Servico</h1>
          <p className="text-sm text-white/60">Ultima atualizacao: 16/04/2026</p>
        </header>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">1. Aceitacao</h2>
          <p>
            Ao acessar ou utilizar a plataforma MAYUS, voce concorda com estes Termos de Servico e com a Politica de
            Privacidade aplicavel.
          </p>
        </section>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">2. Objeto do servico</h2>
          <p>
            A MAYUS disponibiliza recursos de atendimento, automacao, organizacao operacional e integracoes com
            servicos de terceiros para uso corporativo e profissional.
          </p>
        </section>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">3. Responsabilidades do usuario</h2>
          <p>
            O usuario e responsavel pela veracidade das informacoes inseridas, pela seguranca de suas credenciais e
            pelo uso licito da plataforma, incluindo comunicacoes enviadas por canais integrados.
          </p>
        </section>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">4. Integracoes e terceiros</h2>
          <p>
            Algumas funcionalidades dependem de provedores externos. A disponibilidade de tais servicos pode variar
            conforme politicas e limitacoes dos respectivos fornecedores.
          </p>
        </section>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">5. Limites de responsabilidade</h2>
          <p>
            A MAYUS envida esforcos razoaveis para manter disponibilidade e seguranca, sem garantia de operacao
            ininterrupta. Em qualquer hipotese, a responsabilidade limita-se aos termos da legislacao aplicavel.
          </p>
        </section>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">6. Alteracoes dos termos</h2>
          <p>
            Estes termos podem ser atualizados periodicamente. O uso continuado da plataforma apos alteracoes implica
            concordancia com a versao vigente.
          </p>
        </section>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">7. Contato</h2>
          <p>
            Para duvidas legais e operacionais, entre em contato por: <br />
            <a className="text-[#CCA761] hover:underline" href="mailto:camiladutra.adv@gmail.com">
              camiladutra.adv@gmail.com
            </a>
          </p>
        </section>

        <footer className="pt-8 border-t border-white/10 text-sm text-white/60 flex flex-wrap gap-4">
          <Link href="/privacy" className="text-[#CCA761] hover:underline">
            Politica de Privacidade
          </Link>
          <Link href="/data-deletion" className="text-[#CCA761] hover:underline">
            Exclusao de Dados
          </Link>
        </footer>
      </div>
    </main>
  );
}
