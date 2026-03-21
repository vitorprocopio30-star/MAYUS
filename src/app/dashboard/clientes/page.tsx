"use client";

import { useState, useEffect, useCallback } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { 
  Users, UserPlus, Search, Building2, User as UserIcon, Loader2, ArrowRight
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

export default function ClientesPage() {
  const { tenantId, isLoading: profileLoading } = useUserProfile();
  const supabase = createClient();
  const router = useRouter();

  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "PF" | "PJ">("ALL");

  const loadClients = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, document, type, status, email, phone, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar clientes: " + error.message);
    } else {
      setClients(data || []);
    }
    setIsLoading(false);
  }, [tenantId, supabase]);

  useEffect(() => {
    if (tenantId) loadClients();
  }, [tenantId, loadClients]);

  const filteredClients = clients.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.document.includes(searchTerm);
    const matchesType = filterType === "ALL" || c.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className={`space-y-8 ${montserrat.className}`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className={`text-3xl md:text-4xl text-white ${cormorant.className} italic font-bold`}>
            <span className="text-[#CCA761]">Clientes</span> 
          </h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie a carteira de clientes, documentos e histórico de atendimento.</p>
        </div>
        <Link
          href="/dashboard/clientes/novo"
          className="relative flex items-center justify-center gap-2 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#111111] font-[800] py-3 px-6 rounded-lg transition-all duration-300 transform active:scale-95 text-sm shadow-none overflow-hidden hover:-translate-y-[1px] tracking-widest"
        >
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12" />
          <UserPlus size={18} strokeWidth={2.5} className="relative z-10" />
          <span className="relative z-10">NOVO CLIENTE</span>
        </Link>
      </div>

      {/* Busca e Filtros */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 flex items-center gap-3 bg-[#111111] px-4 py-3 rounded-xl border border-[#222] focus-within:border-[#CCA761]/50 transition-colors">
          <Search size={18} className="text-gray-500" />
          <input 
            type="text" 
            placeholder="Buscar por nome ou CPF/CNPJ..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="bg-transparent border-none outline-none text-sm w-full text-gray-200 placeholder:text-gray-600" 
          />
        </div>
        <div className="flex bg-[#111111] border border-[#222] rounded-xl p-1 shrink-0">
          <button 
            onClick={() => setFilterType("ALL")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${filterType === "ALL" ? "bg-[#CCA761]/10 text-[#CCA761]" : "text-gray-500 hover:text-gray-300"}`}
          >
            TODOS
          </button>
          <button 
            onClick={() => setFilterType("PF")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${filterType === "PF" ? "bg-[#CCA761]/10 text-[#CCA761]" : "text-gray-500 hover:text-gray-300"}`}
          >
            FÍSICA
          </button>
          <button 
            onClick={() => setFilterType("PJ")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${filterType === "PJ" ? "bg-[#CCA761]/10 text-[#CCA761]" : "text-gray-500 hover:text-gray-300"}`}
          >
            JURÍDICA
          </button>
        </div>
      </div>

      {/* Tabela de Clientes */}
      <div className="bg-white/[0.02] border border-white/5 rounded-2xl backdrop-blur-sm relative z-0">
        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/5 text-[11px] text-gray-500 uppercase tracking-[0.2em] font-bold">
          <div className="col-span-4">Cliente</div>
          <div className="col-span-2">Documento</div>
          <div className="col-span-3">Contato</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1 text-right">Ações</div>
        </div>

        {profileLoading || isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={32} className="text-[#CCA761] animate-spin" /></div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <Users size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum cliente cadastrado com esses filtros.</p>
          </div>
        ) : (
          filteredClients.map((client) => (
            <div key={client.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-5 border-b border-white/5 hover:bg-white/[0.02] transition-colors items-center">
              <div className="col-span-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm shrink-0 border border-white/10 ${client.type === 'PF' ? "bg-white/5 text-gray-300" : "bg-[#CCA761]/10 border-[#CCA761]/30 text-[#CCA761]"}`}>
                  {client.type === 'PF' ? <UserIcon size={18} /> : <Building2 size={18} />}
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{client.name}</p>
                  <span className="text-gray-500 text-[10px] uppercase tracking-wider">{client.type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}</span>
                </div>
              </div>

              <div className="col-span-2">
                <span className="text-gray-300 text-xs font-mono">{client.document}</span>
              </div>

              <div className="col-span-3">
                <p className="text-gray-300 text-xs mb-1 truncate">{client.email || '—'}</p>
                <p className="text-gray-500 text-xs">{client.phone || '—'}</p>
              </div>

              <div className="col-span-2">
                <span className={`text-[10px] px-3 py-1 rounded-full border uppercase tracking-widest ${
                  client.status === 'Cliente' ? 'text-green-400 border-green-400/20 bg-green-400/10' :
                  client.status === 'Prospecção' ? 'text-blue-400 border-blue-400/20 bg-blue-400/10' :
                  client.status === 'Qualificado' ? 'text-[#CCA761] border-[#CCA761]/20 bg-[#CCA761]/10' :
                  'text-red-400 border-red-400/20 bg-red-400/10'
                }`}>
                  {client.status}
                </span>
              </div>

              <div className="col-span-1 flex justify-end">
                <button 
                  onClick={() => router.push(`/dashboard/clientes/${client.id}`)}
                  className="p-2 rounded-lg hover:bg-white/5 text-gray-500 hover:text-[#CCA761] transition-colors flex items-center gap-1 group"
                >
                  <span className="text-xs uppercase tracking-wider font-semibold group-hover:block hidden">Ver</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
