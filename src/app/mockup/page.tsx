/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState } from "react";
import {
  LayoutDashboard, Users, Scale, MessageCircle, BrainCircuit,
  Settings, Bell, Search, Plus, Filter, MoreHorizontal,
  ChevronDown, ChevronRight, CheckCircle2, Clock,
  TrendingUp, Zap, Phone, FileText, Star, Send, X,
  DollarSign, Calendar, Bot, Briefcase
} from "lucide-react";
import Image from "next/image";

const pipelines = [
  { name: "Captação 2026", active: true },
  { name: "Retenção Premium", active: false },
  { name: "Processos Ativos", active: false },
  { name: "Parceiros Estratégicos", active: false },
];

const columns = [
  {
    id: "novo", label: "NOVO LEAD", count: 8, color: "#6366f1",
    cards: [
      { id: 1, title: "Grupo Almeida & Filhos Ltda", tag: "Empresarial", tag2: "PJ", value: "R$ 18.000", score: 72, avatar: "GA", progress: 15, comments: 2, files: 1, assignee: "M", won: false },
      { id: 2, title: "Dr. Fernando Carvalho", tag: "Trabalhista", tag2: "PF", value: "R$ 9.500", score: 58, avatar: "FC", progress: 8, comments: 0, files: 3, assignee: "C", won: false },
      { id: 3, title: "Construtora Horizonte", tag: "Imobiliário", tag2: "PJ", value: "R$ 42.000", score: 91, avatar: "CH", progress: 5, comments: 5, files: 2, assignee: "R", won: false },
    ]
  },
  {
    id: "proposta", label: "PROPOSTA ENVIADA", count: 5, color: "#CCA761",
    cards: [
      { id: 4, title: "Farmácias Vida & Saúde", tag: "Comercial", tag2: "PJ", value: "R$ 27.000", score: 83, avatar: "FV", progress: 45, comments: 8, files: 4, assignee: "V", won: false },
      { id: 5, title: "Beatriz Mendonça", tag: "Família", tag2: "PF", value: "R$ 6.200", score: 67, avatar: "BM", progress: 38, comments: 3, files: 1, assignee: "M", won: false },
    ]
  },
  {
    id: "negociacao", label: "EM NEGOCIAÇÃO", count: 3, color: "#f97316",
    cards: [
      { id: 6, title: "Tech Solutions Brasil", tag: "Contratos", tag2: "PJ", value: "R$ 85.000", score: 94, avatar: "TS", progress: 72, comments: 12, files: 7, assignee: "R", won: false },
      { id: 7, title: "Rafael Souza & Cia", tag: "Tributário", tag2: "PJ", value: "R$ 31.000", score: 78, avatar: "RS", progress: 60, comments: 6, files: 3, assignee: "C", won: false },
    ]
  },
  {
    id: "ganho", label: "GANHO", count: 12, color: "#22c55e",
    cards: [
      { id: 8, title: "Banco Meridional S.A.", tag: "Financeiro", tag2: "PJ", value: "R$ 120.000", score: 99, avatar: "BM", progress: 100, comments: 24, files: 18, assignee: "V", won: true },
      { id: 9, title: "Instituto Cultural Arte", tag: "Civil", tag2: "PJ", value: "R$ 14.500", score: 88, avatar: "IC", progress: 100, comments: 9, files: 5, assignee: "M", won: true },
    ]
  },
];

const notifications = [
  { id: 1, user: "Maya IA", userColor: "#CCA761", action: "detectou lead quente", detail: "Tech Solutions Brasil • Score 94", time: "agora", dot: true, avatar: "🤖" },
  { id: 2, user: "Vitor Procópio", userColor: "#a78bfa", action: "fechou contrato em", detail: "Banco Meridional S.A. • R$ 120.000", time: "12 min", dot: true, avatar: "VP" },
  { id: 3, user: "Carlos Mendes", userColor: "#60a5fa", action: "moveu lead para", detail: "Em Negociação • Rafael Souza", time: "34 min", dot: false, avatar: "CM" },
  { id: 4, user: "WhatsApp", userColor: "#22c55e", action: "nova mensagem de", detail: "+55 11 99821-4432 • Construtora Horizonte", time: "1h", dot: false, avatar: "💬" },
  { id: 5, user: "Mariana Costa", userColor: "#f472b6", action: "adicionou proposta em", detail: "Farmácias Vida & Saúde • 4 arquivos", time: "2h", dot: false, avatar: "MC" },
  { id: 6, user: "Maya IA", userColor: "#CCA761", action: "resumo diário gerado", detail: "8 leads • 3 negociações • 1 fechamento", time: "3h", dot: false, avatar: "🤖" },
  { id: 7, user: "Renata Alves", userColor: "#34d399", action: "prazo fatal amanhã", detail: "Processo 0012345-67.2024 • Tributário", time: "5h", dot: false, avatar: "RA" },
];

const navIcons = [
  { icon: LayoutDashboard, label: "Dashboard", active: false },
  { icon: TrendingUp, label: "CRM", active: true },
  { icon: Scale, label: "Processos", active: false },
  { icon: Users, label: "Clientes", active: false },
  { icon: MessageCircle, label: "WhatsApp", active: false },
  { icon: BrainCircuit, label: "IA", active: false },
  { icon: Calendar, label: "Agenda", active: false },
  { icon: Settings, label: "Config", active: false },
];

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 90 ? "#22c55e" : score >= 70 ? "#CCA761" : "#6b7280";
  return (
    <div className="flex items-center gap-1">
      <Star size={10} style={{ color }} fill={color} />
      <span className="text-[10px] font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

export default function MockupPage() {
  const [inboxTab, setInboxTab] = useState<"all" | "notif" | "chat">("all");
  const [showCard, setShowCard] = useState<number | null>(null);

  return (
    <div className="h-screen w-screen bg-[#030303] flex overflow-hidden font-sans" style={{ fontSize: 13 }}>

      {/* ── GOLD GLOW BACKGROUND ─────────────────────── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#CCA761]/6 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 left-1/3 w-[300px] h-[300px] bg-[#6366f1]/5 blur-[100px] rounded-full" />
      </div>

      {/* ── ICON SIDEBAR ─────────────────────────────── */}
      <aside className="relative z-10 w-14 flex flex-col items-center py-4 gap-1 border-r border-white/5 bg-[#0a0a0a] shrink-0">
        <div className="w-8 h-8 mb-4 relative">
          <Image src="/logo.png" alt="MAYUS" fill className="object-contain" />
        </div>
        {navIcons.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            title={label}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 group relative
              ${active ? "bg-[#CCA761]/15 text-[#CCA761]" : "text-white/25 hover:text-white/60 hover:bg-white/5"}`}
          >
            <Icon size={17} />
            {active && <div className="absolute left-0 w-[2px] h-5 bg-[#CCA761] rounded-r-full -translate-x-[1px]" />}
          </button>
        ))}
        <div className="flex-1" />
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#CCA761] to-[#f1d58d] flex items-center justify-center text-[10px] font-black text-[#030303]">VP</div>
      </aside>

      {/* ── PROJECTS SIDEBAR ─────────────────────────── */}
      <aside className="relative z-10 w-48 flex flex-col border-r border-white/5 bg-[#080808] shrink-0">
        <div className="px-4 py-4 border-b border-white/5">
          <p className="text-[10px] font-black tracking-[0.25em] text-white/20 uppercase mb-3">CRM</p>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
            <Search size={12} className="text-white/20" />
            <span className="text-white/20 text-[11px]">Buscar...</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.03] transition-colors text-[11px]">
            <Briefcase size={13} /> Meus Leads
          </button>
          <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.03] transition-colors text-[11px]">
            <TrendingUp size={13} /> Todos os Leads
          </button>

          <div className="pt-3 pb-1">
            <button className="w-full flex items-center justify-between px-2 text-[10px] font-black tracking-[0.2em] text-white/20 uppercase">
              SEUS PIPELINES <ChevronDown size={10} />
            </button>
          </div>

          {pipelines.map((p) => (
            <button
              key={p.name}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors text-[11px] text-left
                ${p.active
                  ? "bg-[#CCA761]/10 text-[#CCA761] border border-[#CCA761]/15"
                  : "text-white/30 hover:text-white/60 hover:bg-white/[0.03]"}`}
            >
              <ChevronRight size={10} className={p.active ? "text-[#CCA761]" : ""} />
              {p.name}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-white/5">
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-[#CCA761]/5 border border-[#CCA761]/10">
            <Bot size={13} className="text-[#CCA761]" />
            <div>
              <p className="text-[10px] font-bold text-[#CCA761]">Maya IA</p>
              <p className="text-[9px] text-white/25">Online • 3 ações hoje</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-white/5 bg-[#080808]/60 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white/30 text-[11px]">Seus Pipelines</span>
                <ChevronRight size={10} className="text-white/20" />
                <span className="text-white/50 text-[11px]">CRM</span>
                <ChevronRight size={10} className="text-white/20" />
                <span className="text-white font-semibold text-[11px]">Captação 2026</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex">
              {["VP","CM","RA","MC"].map((a, i) => (
                <div key={i} className="w-6 h-6 rounded-full bg-gradient-to-br from-[#CCA761]/60 to-[#CCA761]/20 border-2 border-[#080808] flex items-center justify-center text-[8px] font-bold text-[#CCA761] -ml-1 first:ml-0">{a}</div>
              ))}
              <div className="w-6 h-6 rounded-full bg-white/10 border-2 border-[#080808] flex items-center justify-center text-[8px] text-white/50 -ml-1">+5</div>
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white/70 text-[11px] transition-colors">
              <Filter size={11} /> Filtrar
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#CCA761] text-[#030303] font-bold text-[11px] hover:bg-[#f1d58d] transition-colors shadow-[0_0_15px_rgba(204,167,97,0.3)]">
              <Plus size={11} /> Novo Lead
            </button>
          </div>
        </div>

        {/* Kanban tabs */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-white/5 shrink-0">
          {["Kanban", "Lista", "Timeline"].map((t, i) => (
            <button key={t} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-colors ${i === 0 ? "bg-white/[0.06] text-white font-medium" : "text-white/30 hover:text-white/60"}`}>
              {t === "Kanban" ? <LayoutDashboard size={11}/> : t === "Lista" ? <FileText size={11}/> : <Clock size={11}/>} {t}
            </button>
          ))}
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-3 h-full p-4 min-w-max">
            {columns.map((col) => (
              <div key={col.id} className="w-64 flex flex-col shrink-0">
                {/* Column header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                    <span className="text-[10px] font-black tracking-[0.2em] text-white/50">{col.label}</span>
                    <span className="text-[10px] text-white/25">— {col.count}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/5 text-white/20 transition-colors"><Plus size={12}/></button>
                    <button className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/5 text-white/20 transition-colors"><MoreHorizontal size={12}/></button>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
                  {col.cards.map((card: typeof col.cards[number]) => (
                    <div
                      key={card.id}
                      onClick={() => setShowCard(showCard === card.id ? null : card.id)}
                      className={`
                        group relative p-3 rounded-xl border cursor-pointer transition-all duration-200
                        ${card.won
                          ? "bg-[#22c55e]/5 border-[#22c55e]/15 hover:border-[#22c55e]/30"
                          : "bg-white/[0.03] border-white/[0.06] hover:border-[#CCA761]/20 hover:bg-white/[0.05]"}
                        ${showCard === card.id ? "border-[#CCA761]/30 bg-[#CCA761]/5 shadow-[0_0_20px_rgba(204,167,97,0.08)]" : ""}
                      `}
                    >
                      {/* Top row */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex gap-1 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-[#6366f1]/15 text-[#818cf8]">{card.tag}</span>
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-white/5 text-white/40">{card.tag2}</span>
                        </div>
                        <ScoreBadge score={card.score} />
                      </div>

                      {/* Title */}
                      <p className={`text-[11px] font-semibold mb-2 leading-tight ${card.won ? "text-[#22c55e]" : "text-white/80"}`}>{card.title}</p>

                      {/* Value */}
                      <div className="flex items-center gap-1 mb-2.5">
                        <DollarSign size={10} className="text-[#CCA761]" />
                        <span className="text-[11px] font-bold text-[#CCA761]">{card.value}</span>
                      </div>

                      {/* Progress bar */}
                      <div className="h-1 rounded-full bg-white/5 mb-3 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${card.progress}%`,
                            background: card.won ? "#22c55e" : col.id === "proposta" ? "#CCA761" : col.id === "negociacao" ? "#f97316" : "#6366f1"
                          }}
                        />
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#CCA761]/50 to-[#CCA761]/10 flex items-center justify-center text-[8px] font-bold text-[#CCA761]">
                            {card.assignee}
                          </div>
                          <div className="flex items-center gap-1 text-white/25">
                            <MessageCircle size={9}/> <span className="text-[9px]">{card.comments}</span>
                          </div>
                          <div className="flex items-center gap-1 text-white/25">
                            <FileText size={9}/> <span className="text-[9px]">{card.files}</span>
                          </div>
                        </div>
                        {card.won && <CheckCircle2 size={12} className="text-[#22c55e]" />}
                        {!card.won && <div className="text-[9px] text-white/20">{card.progress}%</div>}
                      </div>

                      {/* Expanded detail */}
                      {showCard === card.id && (
                        <div className="mt-3 pt-3 border-t border-white/5">
                          <div className="flex gap-2">
                            <button className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-[#CCA761]/15 text-[#CCA761] text-[10px] font-semibold hover:bg-[#CCA761]/25 transition-colors">
                              <Phone size={10}/> Ligar
                            </button>
                            <button className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-[#22c55e]/10 text-[#22c55e] text-[10px] font-semibold hover:bg-[#22c55e]/20 transition-colors">
                              <MessageCircle size={10}/> WhatsApp
                            </button>
                          </div>
                          <p className="text-[9px] text-white/25 mt-2">Última atividade: hoje às 14:32</p>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add card button */}
                  <button className="w-full py-2 rounded-xl border border-dashed border-white/5 text-white/15 text-[10px] hover:border-[#CCA761]/20 hover:text-[#CCA761]/40 transition-colors flex items-center justify-center gap-1">
                    <Plus size={10}/> Adicionar lead
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── INBOX / NOTIFICATIONS PANEL ──────────────── */}
      <aside className="relative z-10 w-72 flex flex-col border-l border-white/5 bg-[#080808] shrink-0">
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-[#CCA761]" />
            <span className="font-bold text-white text-[12px]">Central de Atividades</span>
          </div>
          <button className="text-white/20 hover:text-white/50 transition-colors"><X size={14}/></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 shrink-0">
          {([["all","Tudo"], ["notif","Alertas",2], ["chat","Chat"]] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setInboxTab(key as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-semibold transition-colors border-b-2
                ${inboxTab === key ? "border-[#CCA761] text-[#CCA761]" : "border-transparent text-white/30 hover:text-white/60"}`}
            >
              {label}
              {count && <span className="px-1 py-0.5 rounded-full bg-[#CCA761] text-[#030303] text-[8px] font-black">{count}</span>}
            </button>
          ))}
        </div>

        {/* Notification feed */}
        <div className="flex-1 overflow-y-auto py-2 no-scrollbar">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="group flex gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer border-b border-white/[0.03]"
            >
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 relative"
                style={{ background: `${n.userColor}20`, color: n.userColor }}>
                {typeof n.avatar === "string" && n.avatar.length <= 2 ? n.avatar : n.avatar}
                {n.dot && <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#CCA761] border-2 border-[#080808]" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white/70 leading-snug">
                  <span className="font-semibold" style={{ color: n.userColor }}>{n.user}</span>
                  {" "}<span className="text-white/40">{n.action}</span>
                </p>
                <p className="text-[10px] font-medium text-white/50 mt-0.5 truncate">{n.detail}</p>
                <p className="text-[9px] text-white/20 mt-1">{n.time} atrás</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom quick action */}
        <div className="p-3 border-t border-white/5 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5">
            <Zap size={11} className="text-[#CCA761]" />
            <input
              className="flex-1 bg-transparent text-[11px] text-white/50 placeholder-white/20 outline-none"
              placeholder="Pergunte à Maya IA..."
            />
            <button className="text-[#CCA761]/40 hover:text-[#CCA761] transition-colors">
              <Send size={11}/>
            </button>
          </div>
        </div>
      </aside>

    </div>
  );
}
