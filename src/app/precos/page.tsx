"use client";

import { Check, Zap, Shield, Crown, ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

const plans = [
  {
    id: "essencial",
    icon: Zap,
    name: "Essencial",
    tagline: "O ponto de partida inteligente",
    access: "Entrada assistida para validar operação, CRM e primeiras rotinas.",
    highlight: false,
    features: [
      "Até 3 usuários",
      "CRM & Gestão de Clientes",
      "Agenda e Tarefas",
      "Controle Financeiro básico",
      "WhatsApp via Evolution API",
      "Documentos e Contratos",
      "Suporte por e-mail",
    ],
    cta: "Começar agora",
    gradient: "from-white/5 to-white/[0.02]",
    border: "border-white/10",
    glow: "",
  },
  {
    id: "profissional",
    icon: Shield,
    name: "Profissional",
    tagline: "O sistema que trabalha por você",
    access: "Beta supervisionado para escritórios com operação ativa e gargalos recorrentes.",
    highlight: true,
    features: [
      "Até 15 usuários",
      "CRM completo + Pipeline de Vendas",
      "Processos Jurídicos & Prazos",
      "BI & Analytics executivo",
      "WhatsApp com IA integrada",
      "Agentes IA personalizados",
      "Equipe Neural (até 5 agentes)",
      "Relatórios automáticos",
      "Suporte prioritário",
    ],
    cta: "Ativar Profissional",
    gradient: "from-[#CCA761]/10 to-[#CCA761]/[0.03]",
    border: "border-[#CCA761]/30",
    glow: "shadow-[0_0_60px_rgba(204,167,97,0.12)]",
  },
  {
    id: "elite",
    icon: Crown,
    name: "Elite",
    tagline: "Poder irrestrito. Presença total.",
    access: "Acompanhamento próximo para bancas com canais, automações e governança mais complexos.",
    highlight: false,
    features: [
      "Usuários ilimitados",
      "Todos os módulos ativos",
      "WhatsApp Oficial Meta (Cloud API)",
      "Instagram Direct & Facebook",
      "IA multicanal completa",
      "Equipe Neural ilimitada",
      "White label completo",
      "Integrações API personalizadas",
      "Gerente de conta dedicado",
      "Suporte 24/7 via WhatsApp",
    ],
    cta: "Falar com especialista",
    gradient: "from-white/5 to-white/[0.02]",
    border: "border-white/10",
    glow: "",
  },
];

export default function PrecosPage() {
  return (
    <div
      className={`relative min-h-screen bg-[#030303] text-white overflow-hidden font-sans`}
    >
      {/* ── CENTRAL GOLD BEAM ───────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 flex justify-center">
        {/* Core beam */}
        <div className="relative w-[2px] h-full">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#CCA761] to-transparent opacity-60" />
          <div className="absolute inset-0 blur-[2px] bg-gradient-to-b from-transparent via-[#CCA761] to-transparent opacity-40" />
        </div>
        {/* Wide glow halo */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-full bg-gradient-to-b from-[#CCA761]/0 via-[#CCA761]/8 to-[#CCA761]/0 blur-[80px]" />
        {/* Burst at top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[250px] bg-[#CCA761]/20 blur-[60px] rounded-full" />
        {/* Reflection at bottom */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[200px] h-[120px] bg-[#CCA761]/10 blur-[40px] rounded-full" />
      </div>

      {/* ── GRID OVERLAY ────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(204,167,97,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(204,167,97,0.5) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      {/* ── NAV ─────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-8 md:px-16 py-6 border-b border-white/5 backdrop-blur-sm">
        <Link href="/dashboard">
          <Image src="/mayus_logo.png" alt="MAYUS" width={110} height={40} className="object-contain" />
        </Link>
        <div className={`hidden md:flex items-center gap-8 text-sm text-white/50 font-sans`}>
          <Link href="/dashboard" className="hover:text-[#CCA761] transition-colors">Dashboard</Link>
          <Link href="#planos" className="hover:text-[#CCA761] transition-colors">Perfis</Link>
          <Link href="#faq" className="hover:text-[#CCA761] transition-colors">FAQ</Link>
        </div>
        <Link
          href="/dashboard"
          className="text-sm font-semibold px-5 py-2 rounded-full border border-[#CCA761]/40 text-[#CCA761] hover:bg-[#CCA761]/10 transition-all duration-300"
        >
          Acessar Sistema
        </Link>
      </nav>

      {/* ── HERO ────────────────────────────────────────── */}
      <section className="relative z-10 text-center pt-24 pb-20 px-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#CCA761]/20 bg-[#CCA761]/5 text-[#CCA761] text-xs font-semibold tracking-widest uppercase mb-8">
          <Sparkles size={12} />
          Acesso controlado
        </div>

        <h1
          className={`text-5xl md:text-7xl font-light leading-[1.05] tracking-tight mb-6 font-serif`}
        >
          Solicite o acesso que
          <br />
          <span className="italic text-[#CCA761]">encaixa</span> no seu escritório
        </h1>

        <p className="text-white/40 text-lg max-w-xl mx-auto mb-12 leading-relaxed">
          O MAYUS está em beta supervisionado. Antes de abrir condição comercial pública, avaliamos a operação, o momento do escritório e a dor que precisa ser resolvida primeiro.
        </p>
      </section>

      {/* ── PLANS ───────────────────────────────────────── */}
      <section id="planos" className="relative z-10 px-6 md:px-12 lg:px-20 pb-32">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.id}
                className={`
                  relative flex flex-col rounded-2xl border backdrop-blur-md
                  bg-gradient-to-b ${plan.gradient} ${plan.border} ${plan.glow}
                  p-8 transition-all duration-500 hover:-translate-y-1
                  ${plan.highlight ? "scale-[1.03] md:scale-[1.05]" : ""}
                `}
              >
                {plan.highlight && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] text-[#030303] text-xs font-black tracking-widest uppercase shadow-[0_0_20px_rgba(204,167,97,0.5)]">
                      Mais Popular
                    </div>
                  </div>
                )}

                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 ${plan.highlight ? "bg-[#CCA761]/20 border border-[#CCA761]/30" : "bg-white/5 border border-white/10"}`}>
                  <Icon size={22} className={plan.highlight ? "text-[#CCA761]" : "text-white/50"} />
                </div>

                {/* Name */}
                <p className="text-xs font-bold tracking-[0.3em] uppercase text-white/30 mb-1">
                  {plan.name}
                </p>
                <h2 className={`text-2xl font-semibold mb-2 ${plan.highlight ? "text-[#CCA761]" : "text-white"} font-serif italic`}>
                  {plan.tagline}
                </h2>

                {/* Access */}
                <div className={`mt-6 mb-8 rounded-xl border p-4 ${plan.highlight ? "border-[#CCA761]/30 bg-[#CCA761]/10" : "border-white/10 bg-white/[0.03]"}`}>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
                    Acesso sob convite
                  </p>
                  <p className={`mt-2 text-sm leading-relaxed ${plan.highlight ? "text-[#CCA761]" : "text-white/60"}`}>
                    {plan.access}
                  </p>
                </div>

                {/* Divider */}
                <div className={`h-px mb-8 ${plan.highlight ? "bg-gradient-to-r from-transparent via-[#CCA761]/40 to-transparent" : "bg-white/5"}`} />

                {/* Features */}
                <ul className="space-y-3 flex-1">
                  {plan.features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-3 text-sm">
                      <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${plan.highlight ? "bg-[#CCA761]/20" : "bg-white/5"}`}>
                        <Check size={10} className={plan.highlight ? "text-[#CCA761]" : "text-white/40"} />
                      </div>
                      <span className="text-white/60 leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href="/vendas#acesso-beta"
                  className={`
                    mt-8 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all duration-300
                    ${plan.highlight
                      ? "bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] text-[#030303] hover:shadow-[0_0_30px_rgba(204,167,97,0.4)] hover:-translate-y-0.5"
                      : "border border-white/10 text-white/70 hover:border-[#CCA761]/30 hover:text-[#CCA761] hover:bg-[#CCA761]/5"
                    }
                  `}
                >
                  {plan.cta}
                  <ArrowRight size={16} />
                </Link>
              </div>
            );
          })}
        </div>

        {/* Enterprise note */}
        <p className="text-center text-white/20 text-sm mt-12">
          Precisa de algo personalizado?{" "}
          <Link href="/vendas#acesso-beta" className="text-[#CCA761]/60 hover:text-[#CCA761] transition-colors underline underline-offset-4">
            Solicite uma conversa de beta
          </Link>
        </p>
      </section>

      {/* ── GUARANTEE ───────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-32">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-md">
            <Shield size={18} className="text-[#CCA761]" />
            <p className="text-white/40 text-sm">
              <span className="text-white/70 font-medium">Beta supervisionado.</span>{" "}
              Acesso controlado, limites claros e decisão humana preservada em toda operação.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────── */}
      <section id="faq" className="relative z-10 px-6 md:px-20 pb-40">
        <div className="max-w-3xl mx-auto">
          <h2 className={`text-4xl font-light text-center mb-16 font-serif italic text-white/80`}>
            Perguntas frequentes
          </h2>
          <div className="space-y-px">
            {[
              {
                q: "Por que a condição comercial não está aberta?",
                a: "Porque o MAYUS está em beta supervisionado. Primeiro entendemos o tamanho da operação, os canais e a dor principal para indicar o encaixe correto.",
              },
              {
                q: "O WhatsApp Oficial Meta tem custo adicional?",
                a: "A integração depende do cenário de cada escritório e das cobranças da Meta. Isso é explicado na etapa de diagnóstico, sem promessa comercial genérica.",
              },
              {
                q: "Quantos agentes de IA posso criar?",
                a: "A quantidade depende do desenho operacional aprovado no beta. O foco inicial é resolver uma dor real com supervisão antes de expandir automações.",
              },
              {
                q: "Os dados ficam seguros?",
                a: "Sim. Toda a infraestrutura roda no Supabase (PostgreSQL) com RLS por tenant, criptografia em repouso e em trânsito, e autenticação com 2FA.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="group border border-white/5 rounded-xl p-6 hover:border-[#CCA761]/20 hover:bg-[#CCA761]/[0.02] transition-all duration-300 cursor-default"
              >
                <p className="font-medium text-white/80 group-hover:text-white transition-colors mb-2">
                  {item.q}
                </p>
                <p className="text-white/35 text-sm leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/5 px-8 md:px-16 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-white/20 text-xs">
          © {new Date().getFullYear()} MAYUS. Todos os direitos reservados.
        </p>
        <p className={`text-white/10 text-xs italic font-serif`}>
          Inteligência que trabalha. Elegância que impressiona.
        </p>
      </footer>
    </div>
  );
}
