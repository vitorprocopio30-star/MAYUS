"use client";

import { useState, useEffect, useCallback } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { 
  Users, UserPlus, Shield, Search, MoreVertical,
  Check, X, ChevronDown, AlertTriangle, Loader2,
  ArrowLeft
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { APP_MODULES } from "@/lib/permissions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

interface TeamMember {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  custom_permissions: string[] | null;
  department_id: string | null;
  departments?: { name: string } | null;
}

interface Department {
  id: string;
  name: string;
}

export default function UsuariosPermissoesPage() {
  const router = useRouter();
  const { role, tenantId, isLoading: profileLoading } = useUserProfile();
  const supabase = createClient();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);

  // Modal de Convite
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [invitePermissions, setInvitePermissions] = useState<string[]>([]);
  const [inviteDepartmentId, setInviteDepartmentId] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  // Modal Alterar Acesso
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [editDepartmentId, setEditDepartmentId] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active, avatar_url, created_at, custom_permissions, department_id, departments(name)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar equipe: " + error.message);
    } else {
      setMembers(data as any || []);
    }

    const { data: depts } = await supabase
      .from("departments")
      .select("id, name")
      .eq("tenant_id", tenantId);
    if (depts) setDepartments(depts);

    setIsLoading(false);
  }, [tenantId, supabase]);

  useEffect(() => {
    if (tenantId) loadMembers();
  }, [tenantId, loadMembers]);

  const filteredMembers = members.filter(m =>
    m.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleInvite = async () => {
    if (!inviteEmail || !inviteRole) {
      toast.error("E-mail e Cargo são obrigatórios.");
      return;
    }
    setInviteLoading(true);
    try {
      const res = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, permissions: invitePermissions, departmentId: inviteDepartmentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao enviar convite.");
      } else {
        toast.success(`Convite enviado para ${inviteEmail}!`);
        setShowInviteModal(false);
        setInviteEmail("");
        setInviteRole("");
        setInvitePermissions([]);
        loadMembers();
      }
    } catch (err) {
      toast.error("Erro de rede ao enviar convite.");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleSaveAccess = async () => {
    if (!editMember || !editRole) return;
    setEditLoading(true);
    try {
      const res = await fetch("/api/auth/update-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: editMember.id, role: editRole, permissions: editPermissions, departmentId: editDepartmentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao atualizar acessos.");
      } else {
         toast.success("Acessos atualizados com sucesso!");
         setEditMember(null);
         loadMembers();
      }
    } catch (err) {
      toast.error("Erro de conexão com servidor.");
    } finally {
      setEditLoading(false);
    }
  };

  const toggleMemberStatus = async (memberId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    const { error } = await supabase.from("profiles").update({ is_active: newStatus }).eq("id", memberId);
    if (error) {
      toast.error("Erro ao alterar status: " + error.message);
    } else {
      toast.success(newStatus ? "Membro reativado." : "Sessões encerradas.");
      loadMembers();
    }
    setOpenMenuId(null);
  };

  const togglePermission = (moduleId: string, currentList: string[], setList: (list: string[]) => void) => {
    if (currentList.includes(moduleId)) {
      setList(currentList.filter(m => m !== moduleId));
    } else {
      setList([...currentList, moduleId]);
    }
  };

  if (!profileLoading && role !== "Administrador" && role !== "admin" && role !== "mayus_admin") {
    return (
      <div className={`min-h-[60vh] flex items-center justify-center ${montserrat.className}`}>
        <div className="text-center">
          <AlertTriangle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className={`text-2xl text-white mb-2 ${cormorant.className} italic font-bold`}>Acesso Restrito</h2>
          <p className="text-gray-500 text-sm">Apenas Administradores podem gerenciar usuários.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-8 ${montserrat.className}`}>
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
           <button onClick={() => router.back()} className="mb-4 flex items-center gap-2 text-gray-500 hover:text-[#CCA761] transition-colors text-[10px] font-bold uppercase tracking-widest group">
             <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> Voltar
           </button>
          <h1 className={`text-3xl md:text-4xl text-white ${cormorant.className} italic font-bold`}>
            Usuários e <span className="text-[#CCA761]">Permissões</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie chaves de acesso e níveis de permissão dos membros do escritório.</p>
        </div>
        
        <button
          onClick={() => {
            setInviteEmail(""); setInviteRole(""); setInvitePermissions([]); setShowInviteModal(true);
          }}
          className="relative flex items-center justify-center gap-2 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#111111] font-[800] py-3 px-6 rounded-lg transition-all duration-300 transform active:scale-95 text-sm shadow-none overflow-hidden hover:-translate-y-[1px] tracking-widest"
        >
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12" />
          <UserPlus size={18} strokeWidth={2.5} className="relative z-10" />
          <span className="relative z-10">CONVIDAR NOVO MEMBRO</span>
        </button>
      </div>

      <div className="space-y-8 animate-fade-in pb-20">
        {/* Busca */}
        <div className="flex items-center gap-3 bg-[#111111] px-4 py-3 rounded-xl border border-[#222] focus-within:border-[#CCA761]/50 transition-colors max-w-md">
          <Search size={18} className="text-gray-500" />
          <input type="text" placeholder="Buscar por nome ou cargo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full text-gray-200 placeholder:text-gray-600" />
        </div>

        {/* Tabela de Membros */}
        <div className="bg-white/[0.02] border border-white/5 rounded-2xl backdrop-blur-sm relative z-0">
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/5 text-[11px] text-gray-500 uppercase tracking-[0.2em] font-bold">
            <div className="col-span-4">Membro / Usuário</div>
            <div className="col-span-3">Nível de Acesso</div>
            <div className="col-span-2">Módulos</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-right">Ações</div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 size={32} className="text-[#CCA761] animate-spin" /></div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-20 text-gray-500"><Users size={40} className="mx-auto mb-3 opacity-40" /><p className="text-sm">Nenhum membro encontrado.</p></div>
          ) : (
            filteredMembers.map((member) => (
              <div key={member.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-6 py-5 border-b border-white/5 hover:bg-white/[0.02] transition-colors items-center">
                <div className="col-span-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden relative ${member.is_active ? "bg-gradient-to-tr from-[#CCA761] to-[#8B7340] text-black" : "bg-gray-800 text-gray-500"}`}>
                    {member.avatar_url ? (
                      <img 
                        src={member.avatar_url} 
                        alt={member.full_name} 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : null}
                    <span className="absolute inset-0 flex items-center justify-center">
                      {member.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div><p className={`text-white font-medium text-sm ${!member.is_active ? "line-through opacity-50" : ""}`}>{member.full_name}</p></div>
                </div>
                <div className="col-span-3">
                  <span className="text-gray-300 text-xs px-3 py-1 bg-white/5 rounded-full border border-white/10 uppercase tracking-widest w-fit">{member.role}</span>
                </div>
                <div className="col-span-2 text-gray-500 text-xs">{(member.custom_permissions || []).length} ativos</div>
                <div className="col-span-2 flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${member.is_active ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-red-500"}`} />
                  <span className={`text-xs ${member.is_active ? "text-green-400" : "text-red-400"}`}>{member.is_active ? "Ativo" : "Suspenso"}</span>
                </div>
                <div className="col-span-1 flex justify-end relative">
                  <button onClick={() => setOpenMenuId(openMenuId === member.id ? null : member.id)} className="p-2 rounded-lg hover:bg-white/5 transition-colors"><MoreVertical size={16} className="text-gray-500" /></button>
                  {openMenuId === member.id && (
                    <div className="absolute right-0 top-10 w-48 bg-[#111] border border-[#222] rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in-up" style={{ animationDuration: "0.15s" }}>
                      <button onClick={() => { setEditMember(member); setEditRole(member.role); setEditPermissions(member.custom_permissions || []); setEditDepartmentId(member.department_id || ""); setOpenMenuId(null); }} className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-[#CCA761] flex items-center gap-2"><Shield size={14} className="opacity-50" /> Ajustar Permissões</button>
                      <div className="border-t border-[#222]">
                        <button onClick={() => toggleMemberStatus(member.id, member.is_active)} className={`w-full text-left px-4 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${member.is_active ? "text-red-400 hover:bg-red-900/10" : "text-green-400 hover:bg-green-900/10"}`}>
                          {member.is_active ? <X size={14} /> : <Check size={14} />} {member.is_active ? "Bloquear Acesso" : "Desbloquear Acesso"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modais (Invite & Edit) - Reutilizados da página de equipe original */}
      {(showInviteModal || editMember) && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto no-scrollbar rounded-2xl bg-[#0C0C0C] border border-[#222] p-8 animate-fade-in-up shadow-2xl" style={{ animationDuration: "0.2s" }}>
            <button
              onClick={() => { setShowInviteModal(false); setEditMember(null); }}
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-[#CCA761]/10 border border-[#CCA761]/20 flex items-center justify-center"><Shield size={28} className="text-[#CCA761]" /></div>
            </div>
            <h2 className={`text-2xl text-center text-white mb-1 ${cormorant.className} italic font-bold`}>{editMember ? "Ajustar Permissões" : <>Convidar <span className="text-[#CCA761]">Membro</span></>}</h2>
            <p className="text-gray-500 text-[10px] text-center mb-8 uppercase tracking-[0.2em] font-black">{editMember ? `USUÁRIO: ${editMember.full_name}` : "GERENCIAMENTO DE ACESSO CORPORATIVO"}</p>

            <div className="space-y-6">
              {!editMember && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">E-mail Corporativo *</label>
                  <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="advogado@escritorio.com" className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#CCA761] transition-all" />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Cargo / Título de Acesso *</label>
                <input type="text" value={editMember ? editRole : inviteRole} onChange={(e) => editMember ? setEditRole(e.target.value) : setInviteRole(e.target.value)} placeholder="Ex: Sócio, Associado..." className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#CCA761] transition-all" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Departamento / Unidade</label>
                <select 
                  value={editMember ? editDepartmentId : inviteDepartmentId} 
                  onChange={(e) => editMember ? setEditDepartmentId(e.target.value) : setInviteDepartmentId(e.target.value)} 
                  className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#CCA761] transition-all appearance-none"
                >
                  <option value="">Sem Unidade</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3 pt-4 border-t border-[#222]">
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider text-[#CCA761]">Módulos Habilitados</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[30vh] overflow-y-auto no-scrollbar pr-2">
                   {APP_MODULES.map(mod => {
                     const isChecked = editMember ? editPermissions.includes(mod.id) : invitePermissions.includes(mod.id);
                     return (
                      <label key={mod.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isChecked ? "bg-[#CCA761]/10 border-[#CCA761]/40" : "bg-[#111] border-[#222] hover:border-white/10"}`}>
                        <input type="checkbox" className="hidden" checked={isChecked} onChange={() => togglePermission(mod.id, editMember ? editPermissions : invitePermissions, editMember ? setEditPermissions : setInvitePermissions)} />
                        <div className={`w-5 h-5 flex items-center justify-center rounded border ${isChecked ? "bg-[#CCA761] border-[#CCA761]" : "border-[#444] bg-transparent"}`}>
                          {isChecked && <Check size={14} className="text-black" />}
                        </div>
                        <span className={`text-[11px] font-black uppercase tracking-widest ${isChecked ? "text-[#CCA761]" : "text-gray-400"}`}>{mod.label}</span>
                      </label>
                     )
                   })}
                </div>
              </div>

              <button
                onClick={editMember ? handleSaveAccess : handleInvite}
                disabled={editLoading || inviteLoading}
                className={`relative w-full mt-4 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#111111] font-[800] py-4 px-4 rounded-lg transition-all duration-300 transform active:scale-95 text-xs shadow-none overflow-hidden tracking-widest flex items-center justify-center gap-2 ${(editLoading || inviteLoading) ? "opacity-60 cursor-not-allowed" : "hover:-translate-y-[1px]"}`}
              >
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12" />
                {(editLoading || inviteLoading) && <Loader2 size={18} className="animate-spin relative z-10" />}
                <span className="relative z-10">{(editLoading || inviteLoading) ? "ATUALIZANDO..." : editMember ? "SALVAR CONFIGURAÇÕES" : "CONFIRMAR CONVITE"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {openMenuId && <div className="fixed inset-0 z-30" onClick={() => setOpenMenuId(null)} />}
    </div>
  );
}
