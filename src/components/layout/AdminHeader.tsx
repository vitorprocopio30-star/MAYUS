"use client";

import Image from "next/image";
import { Bell, Search, User, LogOut, Settings, ShieldAlert } from "lucide-react";
import { Montserrat } from "next/font/google";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useNotifications } from "@/hooks/useNotifications";
import { isBrainExecutiveRole } from "@/lib/brain/roles";
import type { BrainInboxApprovalItem, BrainInboxResponse } from "@/lib/brain/inbox-types";
import Link from "next/link";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600"] });

// Mapa de labels amigÃ¡veis para cada perfil
const roleLabels: Record<string, string> = {
  Administrador: "Administrador",
  admin: "Administrador",
  "SÃ³cio": "SÃ³cio",
  socio: "SÃ³cio",
  Advogado: "Advogado",
  SDR: "SDR",
  Financeiro: "Financeiro",
  EstagiÃ¡rio: "EstagiÃ¡rio",
  mayus_admin: "Super Admin MAYUS",
};

export function AdminHeader() {
  const [profileOpen, setProfileOpen] = useState(false);
  const [globalName, setGlobalName] = useState("");
  const router = useRouter();
  const supabase = createClient();
  const { profile, role, isLoading } = useUserProfile();


  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [brainInboxOpen, setBrainInboxOpen] = useState(false);
  const [brainPendingCount, setBrainPendingCount] = useState(0);
  const [brainPendingApprovals, setBrainPendingApprovals] = useState<BrainInboxApprovalItem[]>([]);
  const isExecutive = isBrainExecutiveRole(role);

  const loadBrainInbox = useCallback(async () => {
    if (!isExecutive) {
      setBrainPendingCount(0);
      setBrainPendingApprovals([]);
      return;
    }

    try {
      const response = await fetch("/api/brain/inbox?pending_limit=4&recent_limit=0", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao carregar approvals do cerebro.");
      }

      const inbox = data as BrainInboxResponse;
      setBrainPendingCount(inbox.pending_count || 0);
      setBrainPendingApprovals(Array.isArray(inbox.pending_approvals) ? inbox.pending_approvals : []);
    } catch (error) {
      console.error("[AdminHeader] brain inbox", error);
    }
  }, [isExecutive]);

  // Carrega nome do escritÃ³rio: primeiro do cache localStorage, depois confirma com o DB
  useEffect(() => {
    if (typeof window !== "undefined") {
      const g = localStorage.getItem("MTO_COMMERCIAL_GENERAL");
      if (g) {
        try {
          const parsed = JSON.parse(g);
          if (parsed.companyName) setGlobalName(parsed.companyName);
        } catch(e){}
      }
    }
  }, []);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    async function fetchTenantName() {
      const { data } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", profile!.tenant_id)
        .single();
      if (data?.name) {
        setGlobalName(data.name);
        // Atualiza o cache do localStorage com o valor real do DB
        try {
          const g = localStorage.getItem("MTO_COMMERCIAL_GENERAL");
          const parsed = g ? JSON.parse(g) : {};
          localStorage.setItem("MTO_COMMERCIAL_GENERAL", JSON.stringify({ ...parsed, companyName: data.name }));
        } catch(e){}
      }
    }
    fetchTenantName();
  }, [profile, supabase]);

  // Hook Ativo: Realtime WebSocket (apenas ativa se logado)
  useNotifications(profile?.id, profile?.tenant_id);

  useEffect(() => {
    if (!profile?.tenant_id) return;

    // Busca inicial de histÃ³rico
    async function fetchNotifications() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('tenant_id', profile!.tenant_id)
        .or('user_id.eq.' + profile!.id + ',user_id.is.null')
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.is_read).length);
      }
    }
    fetchNotifications();

    // Listener para o evento customizado disparado pelo Hook para atualizar na hora
    const handleNewNotif = (e: any) => {
      const newNotif = e.detail;
      setNotifications(prev => [newNotif, ...prev]);
      setUnreadCount(prev => prev + 1);
    };

    window.addEventListener('new-notification', handleNewNotif);
    return () => window.removeEventListener('new-notification', handleNewNotif);
  }, [profile?.id, profile?.tenant_id, profile, supabase]);

  useEffect(() => {
    if (!profile?.tenant_id || !isExecutive) return;

    void loadBrainInbox();
    const intervalId = window.setInterval(() => {
      void loadBrainInbox();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [profile?.tenant_id, isExecutive, loadBrainInbox]);

  const markAllAsRead = async () => {
    if (!profile?.tenant_id || unreadCount === 0) return;
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));

    await supabase.from('notifications')
      .update({ is_read: true })
      .eq('tenant_id', profile.tenant_id)
      .eq('is_read', false)
      .or('user_id.eq.' + profile!.id + ',user_id.is.null');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Nome e iniciais do avatar
  const displayName = profile?.full_name || "UsuÃ¡rio";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const displayRole = roleLabels[role || ""] || role || "â€”";

  return (
    <header className={`h-20 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-30 px-6 flex items-center justify-between ${montserrat.className}`}>

      {/* Office + Search */}
      <div className="hidden md:flex items-center gap-4 flex-1">
        <div className="px-4 py-2 border border-gray-200 dark:border-white/5 bg-gray-100 dark:bg-[#111111]/50 rounded-xl shadow-inner flex items-center gap-3 shrink-0">
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#CCA761] to-[#e4ce99] flex items-center justify-center text-black font-black text-xs shadow-[0_0_10px_rgba(204,167,97,0.4)]">
            {(globalName || "EscritÃ³rio").charAt(0).toUpperCase()}
          </div>
          <span className="text-[#CCA761] font-bold tracking-[0.15em] text-sm uppercase">
            {globalName || "EscritÃ³rio"}
          </span>
        </div>
        <div className="flex items-center gap-3 bg-gray-100 dark:bg-[#111111] px-4 py-2.5 rounded-xl border border-transparent dark:border-[#222] focus-within:border-[#CCA761] transition-colors w-full max-w-xl">
          <Search size={18} className="text-gray-400" />
          <input
            type="text"
            placeholder="Buscar clientes, contratos ou processos..."
            className="bg-transparent border-none outline-none text-sm w-full text-gray-800 dark:text-gray-200 placeholder:text-gray-500"
          />
        </div>
      </div>
      <div className="md:hidden" /> {/* Spacer for mobile where search is hidden */}

      {/* Right side actions */}
      <div className="flex items-center gap-4">
        {isExecutive && (
          <div className="relative">
            <button
              onClick={() => {
                setBrainInboxOpen(!brainInboxOpen);
                setNotifOpen(false);
                setProfileOpen(false);
                if (!brainInboxOpen) {
                  void loadBrainInbox();
                }
              }}
              className="relative p-2 rounded-full hover:bg-secondary transition-colors"
              title="Approvals do cÃ©rebro"
            >
              <ShieldAlert size={20} className="text-foreground/70" />
              {brainPendingCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-[#CCA761] rounded-full border-2 border-white dark:border-[#0C0C0C] text-[8px] flex items-center justify-center text-black font-bold animate-pulse">
                  {brainPendingCount > 9 ? "9+" : brainPendingCount}
                </span>
              )}
            </button>

            {brainInboxOpen && (
              <div className="absolute right-0 mt-3 w-80 md:w-96 bg-card rounded-xl shadow-xl border border-border overflow-hidden flex flex-col z-50 animate-fade-in-up" style={{ animationDuration: '0.15s' }}>
                <div className="p-4 border-b border-border flex items-center justify-between bg-secondary">
                  <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                    Approvals do CÃ©rebro
                    {brainPendingCount > 0 && <span className="bg-[#CCA761] text-black px-2 py-0.5 rounded-full text-xs">{brainPendingCount}</span>}
                  </h3>
                  <Link
                    href="/dashboard/aprovacoes"
                    onClick={() => setBrainInboxOpen(false)}
                    className="text-xs text-[#CCA761] hover:underline font-semibold"
                  >
                    Abrir inbox
                  </Link>
                </div>

                <div className="overflow-y-auto flex-1 p-2 space-y-1 bg-white dark:bg-[#0f0f0f] min-h-[100px] max-h-[320px]">
                  {brainPendingApprovals.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">Nenhuma aprovaÃ§Ã£o pendente no cÃ©rebro.</div>
                  ) : (
                    brainPendingApprovals.map((approval) => (
                      <Link
                        key={approval.id}
                        href="/dashboard/aprovacoes"
                        onClick={() => setBrainInboxOpen(false)}
                        className="block rounded-lg border border-gray-200 dark:border-white/5 bg-gray-100 dark:bg-white/5 p-3 hover:bg-white/[0.08] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                              {approval.awaiting_payload?.skillName || approval.step?.title || approval.task?.title || "AÃ§Ã£o do cÃ©rebro"}
                            </p>
                            <p className="text-xs text-gray-500 mt-1 truncate">
                              {approval.task?.module || "core"} Â· {approval.task?.status?.replaceAll("_", " ") || "pendente"}
                            </p>
                          </div>
                          <span className="text-[10px] uppercase tracking-widest text-[#CCA761] shrink-0">
                            {approval.risk_level || approval.awaiting_payload?.riskLevel || "medio"}
                          </span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); setBrainInboxOpen(false); }}
            className="relative p-2 rounded-full hover:bg-secondary transition-colors"
          >
            <Bell size={20} className="text-foreground/70" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white dark:border-[#0C0C0C] text-[8px] flex items-center justify-center text-gray-900 dark:text-white font-bold animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Modal Dropdown Notifications */}
          {notifOpen && (
            <div className="absolute right-0 mt-3 w-80 max-h-96 md:w-96 bg-card rounded-xl shadow-xl border border-border overflow-hidden flex flex-col z-50 animate-fade-in-up" style={{ animationDuration: '0.15s' }}>
              <div className="p-4 border-b border-border flex items-center justify-between bg-secondary">
                <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  NotificaÃ§Ãµes do Sistema {unreadCount > 0 && <span className="bg-[#CCA761] text-black px-2 py-0.5 rounded-full text-xs">{unreadCount}</span>}
                </h3>
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-xs text-[#CCA761] hover:underline font-semibold">Marcar lidas</button>
                )}
              </div>
              <div className="overflow-y-auto flex-1 p-2 space-y-1 bg-white dark:bg-[#0f0f0f] min-h-[100px] max-h-[300px]">
                {notifications.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">Nenhuma aba invisÃ­vel, vocÃª estÃ¡ em dia.</div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className={`p-3 rounded-lg flex items-start gap-3 transition-colors ${!n.is_read ? 'bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5' : 'hover:bg-gray-50 dark:bg-white/[0.02]'}`}>
                      <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${n.type === 'success' ? 'bg-green-500' : n.type === 'alert' ? 'bg-red-500' : 'bg-[#CCA761]'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${!n.is_read ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>{n.title}</p>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{n.message}</p>
                        {n.link_url && (
                          <Link href={n.link_url} onClick={() => setNotifOpen(false)} className="text-xs text-[#CCA761] hover:underline mt-2 inline-block font-medium">Ver detalhes &rarr;</Link>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-8 w-px bg-gray-200 dark:bg-[#222]" />

        {/* User Profile */}
        <div className="relative">
          <button
            onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); setBrainInboxOpen(false); }}
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
            <div className="relative w-10 h-10 rounded-full bg-gradient-to-tr from-[#CCA761] to-[#8B7340] border-2 border-[#111] flex items-center justify-center text-black shadow-lg font-bold text-sm overflow-hidden">
              {!isLoading && profile?.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={displayName}
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              ) : (
                isLoading ? "..." : initials
              )}
            </div>
          </button>

          {/* Dropdown Menu */}
          {profileOpen && (
            <div className="absolute right-0 mt-3 w-52 bg-card rounded-xl shadow-xl border border-border overflow-hidden py-1 z-50 animate-fade-in-up" style={{ animationDuration: '0.15s' }}>
              <button
                onClick={() => { router.push("/dashboard/perfil"); setProfileOpen(false); }}
                className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-100 dark:bg-[#1a1a1a] flex items-center gap-3 transition-colors"
              >
                <User size={16} />
                Meu Perfil
              </button>
              <button
                onClick={() => { router.push("/dashboard/configuracoes"); setProfileOpen(false); }}
                className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-100 dark:bg-[#1a1a1a] flex items-center gap-3 transition-colors"
              >
                <Settings size={16} />
                ConfiguraÃ§Ãµes
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
