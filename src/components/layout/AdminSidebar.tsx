"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import {
  ChevronDown,
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  Briefcase,
  Scale,
  Clock,
  FolderOpen,
  DollarSign,
  LineChart,
  PieChart,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Wand2,
  Menu,
  X,
  Sun,
  Moon,
  Target,
  Globe,
  BrainCircuit,
  MessageSquare,
  MessageCircle,
  Bot,
  MessagesSquare,
  Share2,
  Building2,
  Brain,
  Volume2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useUserProfile } from "@/hooks/useUserProfile";
import { getAllowedHrefs, isFullAccessRole } from "@/lib/permissions";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

export function AdminSidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    "VISÃO GERAL": true,
    "CONVERSAS": true,
    "COMERCIAL": true,
    "OPERAÇÃO JURÍDICA": true,
    "FINANCEIRO": true,
    "ESTRATÉGIA": true,
    "SISTEMA": true,
  });

  type SidebarMode = "expanded" | "mini" | "hidden";
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("expanded");

  // Hook para dados reais do usuário
  const { user, role, customPermissions, profile, isLoading: profileLoading } = useUserProfile();
  const allowedHrefs = getAllowedHrefs(customPermissions, role);
  // Sem sessão (dev local ou auth comentada): trata como admin para não esconder o menu
  const isAdmin = !profileLoading && (!user || allowedHrefs.includes("ALL") || isFullAccessRole(role));

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleSidebar = () => setIsOpen(!isOpen);

  const toggleSidebarMode = () => {
    if (sidebarMode === "expanded") setSidebarMode("mini");
    else if (sidebarMode === "mini") setSidebarMode("hidden");
    else setSidebarMode("expanded");
  };

  const toggleSection = (title: string) => {
    if (sidebarMode === "mini") return; // Não expande seções no modo mini
    setOpenSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const menuSections = [
    // ... (mesmo conteúdo de menuSections)
    {
      title: "VISÃO GERAL",
      collapsible: true,
      items: [
        { name: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
        { name: "Mural", icon: MessageSquare, href: "/dashboard/mural" },
        { name: "Agenda Diária", icon: Calendar, href: "/dashboard/agenda" },
        { name: "Agenda Global", icon: Globe, href: "/dashboard/agenda-global" },
        { name: "Auditoria ADMIN", icon: ShieldCheck, href: "/dashboard/agenda-admin" },
      ]
    },
    {
      title: "CONVERSAS",
      collapsible: true,
      items: [
        { name: "Todas as Conversas", icon: MessagesSquare, href: "/dashboard/conversas/todas" },
        { name: "Chat da Equipe", icon: Users, href: "/dashboard/conversas/equipe" },
        { name: "WhatsApp", icon: MessageCircle, href: "/dashboard/conversas/whatsapp" },
        { name: "Sociais", icon: Share2, href: "/dashboard/conversas/sociais" },
      ]
    },
    {
      title: "COMERCIAL",
      collapsible: true,
      items: [
        { name: "Painel CRM", icon: LayoutDashboard, href: "/dashboard/crm" },
        { name: "Gestão de Vendas", icon: DollarSign, href: "/dashboard/vendas" },
        { name: "Clientes Base", icon: Briefcase, href: "/dashboard/clientes" },
        { name: "Leads & Contatos", icon: Users, href: "/dashboard/leads" },
        { name: "Contratos Online", icon: FileText, href: "/dashboard/contratos" },
      ]
    },
    {
      title: "OPERAÇÃO JURÍDICA",
      collapsible: true,
      items: [
        { name: "Processos Ativos", icon: Scale, href: "/dashboard/processos" },
        { name: "Monitoramento", icon: ShieldAlert, href: "/dashboard/operacoes/monitoramento" },
        { name: "Prazos e Audiências", icon: Clock, href: "/dashboard/operacoes/prazos" },
        { name: "Repositório de Documentos", icon: FolderOpen, href: "/dashboard/documentos" },
      ]
    },
    {
      title: "FINANCEIRO",
      collapsible: true,
      items: [
        { name: "Faturamento", icon: DollarSign, href: "/dashboard/faturamento" },
        { name: "Honorários", icon: Scale, href: "/dashboard/honorarios" },
        { name: "Gestão de Equipe", icon: Users, href: "/dashboard/equipe" },
      ]
    },
    {
      title: "ESTRATÉGIA",
      collapsible: true,
      items: [
        { name: "BI & Analytics", icon: LineChart, href: "/dashboard/bi" },
        { name: "MAYUS Inteligência", icon: BrainCircuit, href: "/dashboard/mayus" },
        { name: "Equipe Neural", icon: Bot, href: "/dashboard/equipe-ia" },
        { name: "Relatórios Executivos", icon: PieChart, href: "/dashboard/relatorios" },
      ]
    },
    {
      title: "SISTEMA",
      collapsible: true,
      items: [
        { name: "Configurações Globais", icon: Settings, href: "/dashboard/configuracoes" },
        { name: "Departamentos", icon: Building2, href: "/dashboard/configuracoes/departamentos" },
        { name: "Comercial & Metas", icon: Target, href: "/dashboard/configuracoes/comercial" },
        { name: "Integrações & APIs", icon: Wand2, href: "/dashboard/configuracoes/integracoes" },
        { name: "Jurídico & Modelos", icon: FileText, href: "/dashboard/configuracoes/juridico" },
        { name: "Usuários e Permissões", icon: ShieldCheck, href: "/dashboard/configuracoes/usuarios" },
        { name: "Agente / Skills", icon: Bot, href: "/dashboard/configuracoes/agente" },
        { name: "Memória Institucional", icon: Brain, href: "/dashboard/configuracoes/memoria" },
        { name: "Voz & Áudio", icon: Volume2, href: "/dashboard/configuracoes/voz" },
        { name: "Painel Master", icon: ShieldCheck, href: "/admin" },
      ]
    }
  ];

  // Filtra seções e itens baseado no perfil do usuário
  const filteredSections = menuSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        if (item.href === "/admin") {
          if (profileLoading) return false;
          if (profile?.is_superadmin === true) return true;
          return user?.id === '1952586a-b97b-47e9-a18d-3f955c2a5cf0';
        }
        // Enquanto carrega o perfil, mostra todos os itens (evita menu vazio)
        if (profileLoading) return true;
        if (isAdmin) return true;
        if (item.href === "/dashboard/configuracoes/agente") return role === "admin" || role === "socio" || role === "Sócio" || role === "Administrador";
        if (item.href === "/dashboard/configuracoes/memoria") return role === "admin" || role === "socio" || role === "Sócio" || role === "Administrador";
        if (item.href === "/dashboard/configuracoes/voz") return role === "admin" || role === "socio" || role === "Sócio" || role === "Administrador";
        if (item.href === "/dashboard/agenda-admin") return false;
        if (item.href === "/dashboard") return true;
        if (item.href === "/dashboard/equipe") return false;
        return allowedHrefs.some(allowed => {
          if (allowed === "/dashboard") return false;
          return item.href.startsWith(allowed);
        });
      })
    }))
    .filter(section => section.items.length > 0);

  return (
    <>
      <button
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-[#CCA761] text-black md:hidden shadow-lg"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={toggleSidebar}
        />
      )}

      <aside className={`
        fixed top-0 left-0 h-full z-40 transition-all duration-300 ease-in-out
        bg-card backdrop-blur-3xl border-r border-border
        flex flex-col
        ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        ${sidebarMode === "mini" ? "w-[80px]" : sidebarMode === "hidden" ? "w-0 -translate-x-full opacity-0" : "w-[280px]"}
      `}>
        {/* Toggle Button for Desktop */}
        <button 
          onClick={toggleSidebarMode}
          className="hidden md:flex absolute top-6 -right-3 z-50 w-6 h-6 items-center justify-center bg-[#CCA761] text-black rounded-full shadow-lg border border-white/20 hover:scale-110 transition-transform"
          title="Alternar Modo de Exibição"
        >
          {sidebarMode === "mini" ? <ChevronRight size={14} /> : sidebarMode === "expanded" ? <ChevronLeft size={14} /> : <Plus size={14} />}
        </button>

        <div className="absolute top-0 right-0 w-[1px] h-full bg-gradient-to-b from-transparent via-[#CCA761]/40 to-transparent z-10" />

        <div className={`flex items-center justify-center bg-transparent shrink-0 transition-all duration-500 ${sidebarMode === "mini" ? "h-16 px-2" : "h-56 px-1"}`}>
          <div className="relative w-full h-full transition-all duration-500 flex items-center justify-center">
            {sidebarMode === "expanded" ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 pt-3">
                <div className="relative h-[128px] w-[128px] transition-transform duration-500 hover:scale-[1.03] [perspective:1200px]">
                  <div
                    className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(204,167,97,0.10)_0%,rgba(204,167,97,0)_72%)] blur-xl"
                    aria-hidden="true"
                  />
                  <div
                    className="relative h-full w-full [transform-style:preserve-3d]"
                    style={{ animation: "mayusPlateRotate 12s ease-in-out infinite" }}
                  >
                    <Image
                      src="/mayus_logo.png"
                      alt="MAYUS Monograma"
                      fill
                      className="object-contain scale-[1.02] drop-shadow-[0_14px_28px_rgba(0,0,0,0.34)]"
                      priority
                    />
                  </div>
                </div>
                <div className="flex flex-col items-center leading-none pb-1">
                  <span className={`text-[1.7rem] font-semibold tracking-[0.22em] text-[#CCA761] drop-shadow-[0_0_12px_rgba(204,167,97,0.10)] ${cormorant.className}`}>
                    MAYUS
                  </span>
                </div>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#CCA761] to-[#8B7340] flex items-center justify-center shadow-[0_0_10px_rgba(204,167,97,0.3)] hover:scale-110 transition-transform duration-300">
                <span className="text-white text-xs font-bold">M</span>
              </div>
            )}
          </div>
        </div>

        <div className={`flex-1 overflow-y-auto no-scrollbar pt-2 ${sidebarMode === "mini" ? 'px-2' : 'px-5'} pb-20 ${montserrat.className}`}>

          <div className={`space-y-3 mb-8 ${sidebarMode === "mini" ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
            <Link href="/dashboard/vendas/nova" className="relative w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#111111] font-[800] py-3 px-4 rounded-lg transition-all duration-300 transform active:scale-95 text-sm shadow-none overflow-hidden hover:-translate-y-[1px] tracking-widest">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12" />
              <Plus size={18} strokeWidth={2.5} className="relative z-10" />
              <span className="relative z-10">NOVA VENDA</span>
            </Link>
            <Link href="/dashboard/documentos/donna" className="w-full flex items-center justify-center gap-2 bg-secondary border border-border hover:border-primary/50 hover:shadow-[0_0_15px_rgba(204,167,97,0.1)] text-primary font-bold py-3 px-4 rounded-lg transition-all duration-300 transform active:scale-95 text-sm shadow-md group">
              <Wand2 size={18} className="text-primary group-hover:-rotate-12 transition-transform duration-300" />
              GERAR PEÇA COM IA
            </Link>
          </div>

          <div className="space-y-6 pb-10">
            {filteredSections.map((section, idx) => {
              const isSectionOpen = openSections[section.title] ?? false;
              const isMini = sidebarMode === "mini";
              return (
                <div key={idx}>
                  {!isMini && (
                    <button
                      onClick={() => section.collapsible && toggleSection(section.title)}
                      className={`w-full text-[13px] md:text-[14px] text-gray-500 dark:text-white font-black uppercase tracking-[0.25em] mb-4 flex items-center justify-between ${montserrat.className} ${section.collapsible ? 'cursor-pointer hover:text-gray-800 dark:hover:text-[#CCA761]' : 'cursor-default'} transition-colors`}
                    >
                      {section.title}
                      {section.collapsible && (
                        <ChevronDown size={18} className={`opacity-60 transition-transform duration-300 ${isSectionOpen ? 'rotate-180' : ''}`} />
                      )}
                    </button>
                  )}

                  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${(section.collapsible && !isSectionOpen && !isMini) ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100'
                    }`}>
                    <ul className={`space-y-2 ${isMini ? 'flex flex-col items-center' : ''}`}>
                      {section.items.map((item, itemIdx) => {
                        const isActive = pathname === item.href;
                        return (
                          <li key={itemIdx} className="w-full">
                            <Link
                              href={item.href}
                              onClick={() => setIsOpen(false)}
                              title={isMini ? item.name : ""}
                              className={`
                                flex items-center gap-3 rounded-lg text-[18px] transition-all duration-300
                                ${cormorant.className} italic font-bold
                                ${isMini ? "justify-center p-3" : "px-3 py-3"}
                                ${isActive
                                  ? "bg-primary/10 text-primary border-l-2 border-primary shadow-[inset_0_0_20px_rgba(204,167,97,0.05)]"
                                  : "text-muted-foreground hover:bg-accent hover:text-primary"
                                }
                              `}
                            >
                              <item.icon size={isMini ? 24 : 20} className={`shrink-0 ${isActive ? "text-[#CCA761]" : "opacity-80"}`} />
                              {!isMini && <span className="truncate">{item.name}</span>}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className={`p-5 flex items-center justify-between bg-gray-50 dark:bg-white/5 border-t border-gray-200 dark:border-white/10 ${montserrat.className} ${sidebarMode === "mini" ? 'flex-col gap-4' : ''}`}>
          <div className={`items-center gap-2 ${sidebarMode === "mini" ? 'hidden' : 'flex'}`}>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            <span className={`text-[12px] text-gray-500 dark:text-gray-400 italic ${cormorant.className} tracking-wide font-bold`}>Sistema Online</span>
          </div>

          {mounted && (
            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-[#222] text-gray-500 dark:text-gray-400 transition-colors"
              title="Alternar Tema"
            >
              {resolvedTheme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          )}
        </div>

      </aside>

      {/* Floating Restore Button for Hidden State */}
      {sidebarMode === "hidden" && (
        <button
          onClick={() => setSidebarMode("expanded")}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-50 w-8 h-12 bg-[#CCA761] text-black rounded-r-xl shadow-[5px_0_15px_rgba(0,0,0,0.3)] flex items-center justify-center hover:w-10 hover:pr-1 transition-all duration-300 group overflow-hidden"
          title="Mostrar Menu Lateral"
        >
          <ChevronRight size={20} className="group-hover:scale-125 transition-transform" />
        </button>
      )}

      <style jsx global>{`
        @keyframes mayusPlateRotate {
          0% {
            transform: rotateX(7deg) rotateY(0deg);
          }
          50% {
            transform: rotateX(7deg) rotateY(180deg);
          }
          100% {
            transform: rotateX(7deg) rotateY(360deg);
          }
        }
      `}</style>
    </>
  );
}
