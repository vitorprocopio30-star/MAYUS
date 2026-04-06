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
} from "lucide-react";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useUserProfile } from "@/hooks/useUserProfile";
import { getAllowedHrefs } from "@/lib/permissions";

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

  const [isCollapsed, setIsCollapsed] = useState(false);

  // Hook para dados reais do usuário
  const { user, role, customPermissions, profile, isLoading: profileLoading } = useUserProfile();
  const allowedHrefs = getAllowedHrefs(customPermissions, role);
  const isAdmin = allowedHrefs.includes("ALL") || role === "Administrador" || role === "admin";

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleSidebar = () => setIsOpen(!isOpen);
  const toggleCollapse = () => setIsCollapsed(!isCollapsed);

  const toggleSection = (title: string) => {
    if (isCollapsed) return; // Não expande seções no modo mini
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
        { name: "Prazos e Audiências", icon: Clock, href: "/dashboard/prazos" },
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
        { name: "Integrações & APIs", icon: Wand2, href: "/dashboard/configuracoes?tab=integrations" },
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
        if (isAdmin) return true;
        if (item.href === "/dashboard/configuracoes/agente") return role === "admin" || role === "socio";
        if (item.href === "/dashboard/configuracoes/memoria") return role === "admin" || role === "socio";
        if (item.href === "/dashboard/configuracoes/voz") return role === "admin" || role === "socio";
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
        ${isCollapsed ? "w-[80px]" : "w-[280px]"}
      `}>
        {/* Toggle Button for Desktop */}
        <button 
          onClick={toggleCollapse}
          className="hidden md:flex absolute top-6 -right-3 z-50 w-6 h-6 items-center justify-center bg-[#CCA761] text-black rounded-full shadow-lg border border-white/20 hover:scale-110 transition-transform"
        >
          {isCollapsed ? <Plus size={14} className="rotate-45" /> : <Plus size={14} className="rotate-[225deg]" />}
        </button>

        <div className="absolute top-0 right-0 w-[1px] h-full bg-gradient-to-b from-transparent via-[#CCA761]/40 to-transparent z-10" />

        <div className="w-full aspect-square max-h-56 flex flex-col items-center justify-center bg-transparent shrink-0">
          <div className={`relative w-full h-full p-4 transition-all duration-500 ${isCollapsed ? 'scale-75 opacity-0' : 'hover:scale-105 opacity-100'}`}>
            {!isCollapsed && (
              <Image
                src="/logo.png"
                alt="MAYUS Logo"
                fill
                className="object-contain drop-shadow-[0_0_15px_rgba(204,167,97,0.15)]"
              />
            )}
          </div>
        </div>

        <div className={`flex-1 overflow-y-auto no-scrollbar pt-2 ${isCollapsed ? 'px-2' : 'px-5'} pb-20 ${montserrat.className}`}>

          <div className={`space-y-3 mb-8 ${isCollapsed ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
            <Link href="/dashboard/vendas/nova" className="relative w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#111111] font-[800] py-3 px-4 rounded-lg transition-all duration-300 transform active:scale-95 text-sm shadow-none overflow-hidden hover:-translate-y-[1px] tracking-widest">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12" />
              <Plus size={18} strokeWidth={2.5} className="relative z-10" />
              <span className="relative z-10">NOVA VENDA</span>
            </Link>
            <button className="w-full flex items-center justify-center gap-2 bg-secondary border border-border hover:border-primary/50 hover:shadow-[0_0_15px_rgba(204,167,97,0.1)] text-primary font-bold py-3 px-4 rounded-lg transition-all duration-300 transform active:scale-95 text-sm shadow-md group">
              <Wand2 size={18} className="text-primary group-hover:-rotate-12 transition-transform duration-300" />
              GERAR PEÇA COM IA
            </button>
          </div>

          <div className="space-y-6 pb-10">
            {filteredSections.map((section, idx) => {
              const isSectionOpen = openSections[section.title] ?? false;
              return (
                <div key={idx}>
                  {!isCollapsed && (
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

                  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${(section.collapsible && !isSectionOpen && !isCollapsed) ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100'
                    }`}>
                    <ul className={`space-y-2 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
                      {section.items.map((item, itemIdx) => {
                        const isActive = pathname === item.href;
                        return (
                          <li key={itemIdx} className="w-full">
                            <Link
                              href={item.href}
                              onClick={() => setIsOpen(false)}
                              title={isCollapsed ? item.name : ""}
                              className={`
                                flex items-center gap-3 rounded-lg text-[18px] transition-all duration-300
                                ${cormorant.className} italic font-bold
                                ${isCollapsed ? "justify-center p-3" : "px-3 py-3"}
                                ${isActive
                                  ? "bg-primary/10 text-primary border-l-2 border-primary shadow-[inset_0_0_20px_rgba(204,167,97,0.05)]"
                                  : "text-muted-foreground hover:bg-accent hover:text-primary"
                                }
                              `}
                            >
                              <item.icon size={isCollapsed ? 24 : 20} className={isActive ? "text-[#CCA761]" : "opacity-80"} />
                              {!isCollapsed && <span>{item.name}</span>}
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

        <div className={`p-5 flex items-center justify-between bg-gray-50 dark:bg-white/5 border-t border-gray-200 dark:border-white/10 ${montserrat.className} ${isCollapsed ? 'flex-col gap-4' : ''}`}>
          <div className={`flex items-center gap-2 ${isCollapsed ? 'hidden' : 'flex'}`}>
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
    </>
  );
}
