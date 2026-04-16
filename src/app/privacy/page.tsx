import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politica de Privacidade | MAYUS",
  description: "Politica de privacidade da plataforma MAYUS.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-white px-6 py-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-3 border-b border-white/10 pb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[#CCA761] font-semibold">MAYUS</p>
          <h1 className="text-3xl md:text-4xl font-semibold">Politica de Privacidade</h1>
          <p className="text-sm text-white/60">Ultima atualizacao: 16/04/2026</p>
        </header>

        <section className="space-y-4 text-sm text-white/80 leading-7">
          <p>
            A MAYUS trata dados pessoais para operar sua plataforma de atendimento, automacao e inteligencia
            operacional. Ao utilizar nossos servicos, voce concorda com os termos desta Politica de Privacidade.
          </p>
        </section>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">1. Dados coletados</h2>
          <p>
            Podemos coletar dados de identificacao e contato, dados de uso da plataforma, dados de conversas
            integradas (incluindo canais como WhatsApp) e dados tecnicos necessarios para seguranca e auditoria.
          </p>
        </section>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">2. Finalidade do tratamento</h2>
          <p>
            Utilizamos os dados para disponibilizar funcionalidades do sistema, autenticar usuarios, registrar
            historico operacional, aprimorar desempenho, prevenir fraudes e cumprir obrigacoes legais.
          </p>
        </section>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">3. Compartilhamento de dados</h2>
          <p>
            Dados podem ser compartilhados com provedores de infraestrutura e parceiros tecnologicos estritamente
            necessarios para a operacao do servico, incluindo integracoes oficiais de mensageria e servicos de nuvem.
          </p>
        </section>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">4. Retencao e seguranca</h2>
          <p>
            Mantemos os dados somente pelo periodo necessario para as finalidades descritas e aplicamos medidas
            tecnicas e organizacionais de seguranca para proteger as informacoes tratadas.
          </p>
        </section>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">5. Direitos do titular</h2>
          <p>
            O titular pode solicitar confirmacao de tratamento, acesso, correcao, anonimização, portabilidade e
            exclusao de dados, conforme legislacao aplicavel.
          </p>
        </section>

        <section className="space-y-3 text-sm text-white/80 leading-7">
          <h2 className="text-xl text-white font-semibold">6. Contato</h2>
          <p>
            Para assuntos de privacidade e protecao de dados, entre em contato por: <br />
            <a className="text-[#CCA761] hover:underline" href="mailto:camiladutra.adv@gmail.com">
              camiladutra.adv@gmail.com
            </a>
          </p>
        </section>

        <footer className="pt-8 border-t border-white/10 text-sm text-white/60 flex flex-wrap gap-4">
          <Link href="/terms" className="text-[#CCA761] hover:underline">
            Termos de Servico
          </Link>
          <Link href="/data-deletion" className="text-[#CCA761] hover:underline">
            Exclusao de Dados
          </Link>
        </footer>
      </div>
    </main>
  );
}
