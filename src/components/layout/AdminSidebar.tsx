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
  Plus,
  Wand2,
  Menu,
  X,
  Sun,
  Moon,
  LayoutTemplate
} from "lucide-react";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useUserProfile } from "@/hooks/useUserProfile";
import { getAllowedHrefs } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/client";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

export function AdminSidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    "VISÃO GERAL": true,
    "SISTEMA": true,
    "COMERCIAL": true
  });

  // Hook para dados reais do usuário
  const { role, customPermissions, profile, isLoading: profileLoading } = useUserProfile();
  const allowedHrefs = getAllowedHrefs(customPermissions, role);
  const isAdmin = allowedHrefs.includes("ALL") || role === "Administrador";

  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleSidebar = () => setIsOpen(!isOpen);

  const toggleSection = (title: string) => {
    setOpenSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const menuSections = [
    {
      title: "VISÃO GERAL",
      collapsible: false,
      items: [
        { name: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
        { name: "Agenda Global", icon: Calendar, href: "/dashboard/agenda" },
      ]
    },
    {
      title: "COMERCIAL",
      collapsible: true,
      items: [
        { name: "Painel CRM", icon: LayoutDashboard, href: "/dashboard/crm" },
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
      ]
    },
    {
      title: "ESTRATÉGIA",
      collapsible: true,
      items: [
        { name: "BI & Analytics", icon: LineChart, href: "/dashboard/bi" },
        { name: "Relatórios Executivos", icon: PieChart, href: "/dashboard/relatorios" },
      ]
    },
    {
      title: "SISTEMA",
      collapsible: false,
      items: [
        { name: "Configurações", icon: Settings, href: "/dashboard/configuracoes" },
        { name: "Usuários e Permissões", icon: ShieldCheck, href: "/dashboard/equipe" },
      ]
    }
  ];

  // Filtra seções e itens baseado no perfil do usuário
  const filteredSections = menuSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        if (isAdmin) return true;
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
        fixed top-0 left-0 h-full z-40 transition-transform duration-300 ease-in-out
        w-[280px] bg-white/[0.03] backdrop-blur-3xl border-r border-white/5
        flex flex-col
        ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <div className="absolute top-0 right-0 w-[1px] h-full bg-gradient-to-b from-transparent via-[#CCA761]/40 to-transparent z-10" />
        
        <div className="w-full aspect-square max-h-56 flex flex-col items-center justify-center bg-transparent shrink-0">
          <div className="relative w-full h-full p-4 hover:scale-105 transition-transform duration-500">
            <Image
              src="/logo.png"
              alt="MAYUS Logo"
              fill
              className="object-contain drop-shadow-[0_0_15px_rgba(204,167,97,0.15)]"
            />
          </div>
        </div>

        <div className={`flex-1 overflow-y-auto no-scrollbar pt-2 px-5 ${montserrat.className}`}>
          
          <div className="space-y-3 mb-8">
            <button className="relative w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#111111] font-[800] py-3 px-4 rounded-lg transition-all duration-300 transform active:scale-95 text-sm shadow-none overflow-hidden hover:-translate-y-[1px] tracking-widest">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12" />
              <Plus size={18} strokeWidth={2.5} className="relative z-10" /> 
              <span className="relative z-10">NOVA VENDA</span>
            </button>
            <button className="w-full flex items-center justify-center gap-2 bg-gradient-to-b from-[#1c1c1c] to-[#0a0a0a] border border-[#2a2a2a] hover:border-[#CCA761]/50 hover:shadow-[0_0_15px_rgba(204,167,97,0.1)] text-[#CCA761] font-bold py-3 px-4 rounded-lg transition-all duration-300 transform active:scale-95 text-sm shadow-md group">
              <Wand2 size={18} className="text-[#CCA761] group-hover:-rotate-12 transition-transform duration-300" /> 
              GERAR PEÇA COM IA
            </button>
          </div>

          <div className="space-y-6 pb-10">
            {filteredSections.map((section, idx) => {
              const isSectionOpen = openSections[section.title] ?? false;
              return (
                <div key={idx}>
                  <button
                    onClick={() => section.collapsible && toggleSection(section.title)}
                    className={`w-full text-[13px] md:text-[14px] text-gray-500 dark:text-white font-black uppercase tracking-[0.25em] mb-4 flex items-center justify-between ${montserrat.className} ${section.collapsible ? 'cursor-pointer hover:text-gray-800 dark:hover:text-[#CCA761]' : 'cursor-default'} transition-colors`}
                  >
                    {section.title}
                    {section.collapsible && (
                      <ChevronDown size={18} className={`opacity-60 transition-transform duration-300 ${isSectionOpen ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                  
                  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    section.collapsible && !isSectionOpen ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'
                  }`}>
                    <ul className="space-y-2">
                      {section.items.map((item, itemIdx) => {
                        const isActive = pathname === item.href;
                        return (
                          <li key={itemIdx}>
                            <Link 
                              href={item.href}
                              onClick={() => setIsOpen(false)}
                              className={`
                                flex items-center gap-3 px-3 py-3 rounded-lg text-[18px] transition-colors
                                ${cormorant.className} italic font-bold
                                ${isActive 
                                  ? "bg-white/[0.05] text-[#CCA761] border-l-2 border-[#CCA761] shadow-[inset_0_0_20px_rgba(204,167,97,0.05)]" 
                                  : "text-gray-400 hover:bg-white/[0.02] hover:text-[#CCA761]"
                                }
                              `}
                            >
                              <item.icon size={20} className={isActive ? "text-[#CCA761]" : "opacity-80"} />
                              {item.name}
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

        <div className={`p-5 flex items-center justify-between bg-white/5 border-t border-white/10 ${montserrat.className}`}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            <span className={`text-[12px] text-gray-500 dark:text-gray-400 italic ${cormorant.className} tracking-wide font-bold`}>Sistema Online</span>
          </div>

          {mounted && (
            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-[#222] text-gray-500 dark:text-gray-400 transition-colors"
              title="Alternar Tema da Área de Trabalho"
            >
              {resolvedTheme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          )}
        </div>

      </aside>
    </>
  );
}
