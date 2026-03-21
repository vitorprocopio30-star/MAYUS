"use client";

import { Bell, Search, User, LogOut, Settings } from "lucide-react";
import { Montserrat } from "next/font/google";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600"] });

// Mapa de labels amigáveis para cada perfil
const roleLabels: Record<string, string> = {
  Administrador: "Administrador",
  Advogado: "Advogado",
  SDR: "SDR",
  Financeiro: "Financeiro",
  Estagiário: "Estagiário",
  mayus_admin: "Super Admin MAYUS",
};

export function AdminHeader() {
  const [profileOpen, setProfileOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { profile, role, isLoading } = useUserProfile();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Nome e iniciais do avatar
  const displayName = profile?.full_name || "Usuário";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const displayRole = roleLabels[role || ""] || role || "—";

  return (
    <header className={`h-20 border-b border-white/10 bg-white/5 backdrop-blur-md sticky top-0 z-30 px-6 flex items-center justify-between ${montserrat.className}`}>
      
      {/* Search Layout (Hidden on very small screens) */}
      <div className="hidden md:flex items-center gap-3 bg-gray-100 dark:bg-[#111111] px-4 py-2.5 rounded-xl flex-1 max-w-md border border-transparent dark:border-[#222] focus-within:border-[#CCA761] transition-colors">
        <Search size={18} className="text-gray-400" />
        <input 
          type="text" 
          placeholder="Buscar clientes, contratos ou processos..." 
          className="bg-transparent border-none outline-none text-sm w-full text-gray-800 dark:text-gray-200 placeholder:text-gray-500"
        />
      </div>
      <div className="md:hidden" /> {/* Spacer for mobile where search is hidden */}

      {/* Right side actions */}
      <div className="flex items-center gap-4">
        
        {/* Notifications */}
        <button className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#1a1a1a] transition-colors">
          <Bell size={20} className="text-gray-600 dark:text-gray-300" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-[#0C0C0C]"></span>
        </button>

        <div className="h-8 w-px bg-gray-200 dark:bg-[#222]" />

        {/* User Profile */}
        <div className="relative">
          <button 
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="text-right hidden sm:block">
              {isLoading ? (
                <div className="space-y-1">
                  <div className="h-4 w-24 bg-gray-700 rounded animate-pulse" />
                  <div className="h-3 w-16 bg-gray-800 rounded animate-pulse" />
                </div>
              ) : (
                <>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{displayName}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold text-[#CCA761]">{displayRole}</p>
                </>
              )}
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#CCA761] to-[#8B7340] border-2 border-[#111] flex items-center justify-center text-black shadow-lg font-bold text-sm">
              {isLoading ? "..." : initials}
            </div>
          </button>

          {/* Dropdown Menu */}
          {profileOpen && (
            <div className="absolute right-0 mt-3 w-52 bg-white dark:bg-[#111111] rounded-xl shadow-xl border border-gray-100 dark:border-[#222] overflow-hidden py-1 z-50 animate-fade-in-up" style={{ animationDuration: '0.15s' }}>
              <button 
                onClick={() => { router.push("/dashboard/configuracoes"); setProfileOpen(false); }}
                className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1a1a1a] flex items-center gap-3 transition-colors"
              >
                <Settings size={16} />
                Configurações
              </button>
              <div className="border-t border-gray-100 dark:border-[#222]" />
              <button 
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-3 transition-colors font-medium"
              >
                <LogOut size={16} />
                Sair da Plataforma
              </button>
            </div>
          )}
        </div>
      </div>

    </header>
  );
}
