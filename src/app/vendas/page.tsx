"use client";

import { SalesHero } from "@/components/landing/SalesHero";
import { FounderCounter } from "@/components/landing/FounderCounter";
import { motion } from "framer-motion";
import { Cormorant_Garamond } from "next/font/google";
import { type FormEvent, useState } from "react";
import { 
  Bot, 
  Search, 
  GanttChartSquare, 
  Users2, 
  MessageSquare, 
  CreditCard,
  CheckCircle2,
  Loader2
} from "lucide-react";
import Image from "next/image";

const cormorant = Cormorant_Garamond({ 
  subsets: ["latin"], 
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"]
});

const features = [
  {
    title: "Agente IA (Kernel)",
    description: "Um cérebro central que planeja e executa tarefas sozinho. Atendimento, peças e consultas integradas.",
    icon: Bot
  },
  {
    title: "Monitoramento Ativo",
    description: "Sincronização em tempo real com tribunais. O Escavador detecta, a IA resume e o Kanban organiza.",
    icon: Search
  },
  {
    title: "Kanban Jurídico",
    description: "Gestão visual de processos com automação de prazos e cálculo de urgência por inteligência artificial.",
    icon: GanttChartSquare
  },
  {
    title: "Gestão de Equipe",
    description: "Gamificação com MAYUS Coins, mural de ideias e agenda global oculta até o check-in.",
    icon: Users2
  },
  {
    title: "Atendimento WhatsApp",
    description: "Agentes que vendem, fecham contratos e dão suporte aos clientes 24/7 de forma humanizada.",
    icon: MessageSquare
  },
  {
    title: "Financeiro Integrado",
    description: "Cobranças automáticas via ASAAS e assinaturas digitais via ZapSign centralizadas.",
    icon: CreditCard
  }
];

type BetaFormStatus = "idle" | "submitting" | "success" | "error";

const inputClass = "w-full border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-[#CCA761]/70 focus:bg-black/50";
const labelClass = "text-[10px] font-black uppercase tracking-[0.24em] text-[#CCA761]/80";

export default function VendasPage() {
  const [formStatus, setFormStatus] = useState<BetaFormStatus>("idle");
  const [formMessage, setFormMessage] = useState("");

  async function handleBetaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const searchParams = new URLSearchParams(window.location.search);

    setFormStatus("submitting");
    setFormMessage("");

    const payload = {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      phone: String(formData.get("phone") || ""),
      firmName: String(formData.get("firmName") || ""),
      role: String(formData.get("role") || ""),
      teamSize: String(formData.get("teamSize") || ""),
      priority: String(formData.get("priority") || ""),
      mainPain: String(formData.get("mainPain") || ""),
      consent: formData.get("consent") === "on",
      website: String(formData.get("website") || ""),
      landingPage: window.location.pathname,
      referrer: document.referrer || "",
      utmSource: searchParams.get("utm_source") || "",
      utmMedium: searchParams.get("utm_medium") || "",
      utmCampaign: searchParams.get("utm_campaign") || "",
      utmContent: searchParams.get("utm_content") || "",
    };

    if (!payload.email.trim() && !payload.phone.trim()) {
      setFormStatus("error");
      setFormMessage("Informe email ou WhatsApp para recebermos o pedido.");
      return;
    }

    try {
      const response = await fetch("/api/public/beta-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel registrar o pedido agora.");
      }

      form.reset();
      setFormStatus("success");
      setFormMessage("Pedido recebido. Vamos revisar o encaixe do escritório e responder com os próximos passos do beta supervisionado.");
    } catch (error: any) {
      setFormStatus("error");
      setFormMessage(error?.message || "Nao foi possivel registrar o pedido agora.");
    }
  }

  return (
    <main className="bg-[#030303] min-h-screen selection:bg-[#CCA761] selection:text-black">
      <SalesHero />

      {/* Campaign Section */}
      <section className="py-24 px-4 bg-gradient-to-b from-transparent via-[#CCA761]/5 to-transparent">
        <div className="max-w-6xl mx-auto text-center mb-16 space-y-4">
          <h2 className={`${cormorant.className} text-4xl md:text-6xl text-white font-light`}>
            A Campanha <span className="text-luxury">100 Founders</span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto font-light">
            Estamos selecionando apenas 100 escritórios para fazer parte do conselho fundador. 
            Acesso acompanhado de perto, bastidores reais e prioridade na evolução do produto.
          </p>
        </div>
        
        <FounderCounter />
      </section>

      {/* Features Grid */}
      <section id="recursos" className="py-32 px-4 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -10 }}
              className="glass-card p-10 group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <f.icon size={80} className="text-[#CCA761]" />
              </div>
              
              <f.icon size={32} className="text-[#CCA761] mb-6" />
              <h3 className={`${cormorant.className} text-2xl text-white mb-4`}>{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-light">
                {f.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Beta Access / Final CTA */}
      <section id="acesso-beta" className="py-32 px-4 border-t border-white/5 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#CCA761]/10 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-6xl mx-auto glass-card p-8 md:p-14 lg:p-16 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#CCA761] to-transparent" />
          
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="space-y-7">
              <div className="space-y-4">
                <span className="text-[10px] font-black tracking-[0.4em] text-[#CCA761] uppercase">Beta supervisionado</span>
                <h2 className={`${cormorant.className} text-5xl md:text-7xl text-white leading-[0.95]`}>
                  Entre na lista de acesso antecipado.
                </h2>
                <p className="text-gray-400 leading-relaxed font-light">
                  O MAYUS está rodando em beta controlado. Antes de abrir condição comercial pública, vamos entender o tipo de operação, a dor principal e se o escritório é um bom encaixe para acompanhamento próximo.
                </p>
              </div>

              <div className="grid gap-4 text-sm text-gray-400">
                {[
                  "Sem promessa de resultado ou decisão jurídica automatizada.",
                  "Demonstração com produto real, limites claros e validação humana.",
                  "Prioridade para escritórios com dor operacional concreta.",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#CCA761]" />
                    <span className="leading-relaxed">{item}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4 opacity-30 grayscale saturate-0">
                <Image src="/landing/founder-badge.png" alt="Founder Badge" width={120} height={120} className="object-contain" />
              </div>
            </div>

            <form onSubmit={handleBetaSubmit} className="space-y-5">
              <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className={labelClass}>Nome</span>
                  <input name="name" required minLength={2} className={inputClass} placeholder="Seu nome" />
                </label>
                <label className="space-y-2">
                  <span className={labelClass}>Escritório</span>
                  <input name="firmName" className={inputClass} placeholder="Nome do escritório" />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className={labelClass}>Email</span>
                  <input name="email" type="email" className={inputClass} placeholder="voce@escritorio.com" />
                </label>
                <label className="space-y-2">
                  <span className={labelClass}>WhatsApp</span>
                  <input name="phone" className={inputClass} placeholder="(00) 00000-0000" />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className={labelClass}>Cargo</span>
                  <input name="role" className={inputClass} placeholder="Sócio, gestor..." />
                </label>
                <label className="space-y-2">
                  <span className={labelClass}>Equipe</span>
                  <select name="teamSize" className={inputClass} defaultValue="">
                    <option value="" className="bg-[#030303]">Selecione</option>
                    <option value="1-3" className="bg-[#030303]">1 a 3</option>
                    <option value="4-10" className="bg-[#030303]">4 a 10</option>
                    <option value="11-30" className="bg-[#030303]">11 a 30</option>
                    <option value="31+" className="bg-[#030303]">31+</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className={labelClass}>Gargalo</span>
                  <select name="priority" className={inputClass} defaultValue="">
                    <option value="" className="bg-[#030303]">Selecione</option>
                    <option value="prazos" className="bg-[#030303]">Prazos</option>
                    <option value="whatsapp" className="bg-[#030303]">WhatsApp</option>
                    <option value="documentos" className="bg-[#030303]">Documentos</option>
                    <option value="follow-up" className="bg-[#030303]">Follow-up</option>
                    <option value="operacao" className="bg-[#030303]">Operação</option>
                  </select>
                </label>
              </div>

              <label className="space-y-2 block">
                <span className={labelClass}>Dor operacional principal</span>
                <textarea
                  name="mainPain"
                  required
                  minLength={8}
                  rows={5}
                  className={`${inputClass} resize-none leading-relaxed`}
                  placeholder="Conte onde o escritório mais perde tempo, controle ou previsibilidade hoje."
                />
              </label>

              <label className="flex items-start gap-3 text-xs leading-relaxed text-gray-500">
                <input name="consent" type="checkbox" required className="mt-1 h-4 w-4 accent-[#CCA761]" />
                <span>Autorizo o MAYUS a entrar em contato sobre o beta supervisionado e entendo que esta solicitação não cria contratação automática.</span>
              </label>

              <button
                type="submit"
                disabled={formStatus === "submitting"}
                className="flex w-full items-center justify-center gap-3 bg-[#CCA761] px-6 py-5 text-xs font-black uppercase tracking-[0.18em] text-black shadow-[0_0_30px_rgba(204,167,97,0.28)] transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:px-8 sm:text-sm sm:tracking-[0.26em]"
              >
                {formStatus === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Solicitar acesso beta
              </button>

              {formMessage ? (
                <p className={`text-sm leading-relaxed ${formStatus === "success" ? "text-[#CCA761]" : "text-red-300"}`}>
                  {formMessage}
                </p>
              ) : (
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">
                  Sem condição comercial pública nesta fase · acesso controlado · decisão humana no centro
                </p>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-4 text-center border-t border-white/5">
        <div className={`${cormorant.className} italic text-2xl text-white/40 mb-4`}>
          M A Y U S
        </div>
        <p className="text-[9px] text-gray-600 uppercase tracking-[0.5em] font-medium">
          © 2026 · The AI Operating System for Law Firms
        </p>
      </footer>
    </main>
  );
}
