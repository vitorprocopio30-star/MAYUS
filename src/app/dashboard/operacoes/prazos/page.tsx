'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Filter, 
  Search, 
  UserPlus, 
  ChevronDown,
  Calendar,
  Gavel,
  CheckCircle,
  MoreVertical,
  User,
  ExternalLink,
  Copy,
  Check,
  X
} from 'lucide-react'
import { Montserrat, Cormorant_Garamond } from "next/font/google"

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });

function formatarData(v: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/Sao_Paulo'
  })
}

function diasRestantes(data: string): number {
  const diff = new Date(data).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl overflow-hidden p-6 relative group border border-[#CCA761]/10 bg-gradient-to-b from-[#111111]/90 to-[#050505]/90 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.4)] ring-1 ring-white/5 transition-all duration-500 ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
      <div className="relative z-10 w-full h-full flex flex-col">
        {children}
      </div>
    </div>
  );
}

type TabType = 'prazos' | 'audiencias'

export default function PrazosPage() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<TabType>('prazos')
  const [items, setItems] = useState<any[]>([])
  const [profiles, setProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterResponsavel, setFilterResponsavel] = useState<string>('todos')
  const [filterTribunal, setFilterTribunal] = useState<string>('todos')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  
  // Estados para o Drawer de Detalhes
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [taskDetails, setTaskDetails] = useState<any | null>(null)
  const [loadingTask, setLoadingTask] = useState(false)
  const [annotationText, setAnnotationText] = useState('')
  const [isSavingAnnotation, setIsSavingAnnotation] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      if (!profile) return

      setTenantId(profile.tenant_id)

      // Carregar perfis do time para o dropdown de atribuição
      const { data: team } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role')
        .eq('tenant_id', profile.tenant_id)
        .eq('is_active', true)
      
      console.log("[Prazos] Perfis carregados:", team);
      setProfiles(team || [])

      fetchData(profile.tenant_id)
    }

    async function fetchData(tenantId: string) {
      setLoading(true)
      const { data, error } = await supabase
        .from('process_prazos')
        .select(`
          *,
          monitored_processes(
            numero_processo, 
            partes, 
            tribunal, 
            comarca, 
            vara, 
            ultima_movimentacao_texto, 
            resumo_curto, 
            cliente_nome,
            escavador_monitoramento_id
          ),
          profiles:responsavel_id(id, full_name, avatar_url)
        `)
        .eq('tenant_id', tenantId)
        .in('tipo', ['sessao', 'pericia', 'audiencia', 'citacao', 'sentenca', 'recurso', 'prazo'])
        .not('descricao', 'ilike', '%Despacho%')
        .order('data_vencimento', { ascending: true });

      if (error) {
        console.error('Erro ao buscar prazos:', error);
      } else {
        setItems(data || []);
      }
      setLoading(false);
    }

    init()
  }, [supabase])

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Filtragem por ABA
      const tiposAudiencia = ['audiencia', 'sessao', 'pericia']
      const tiposPrazo = ['citacao', 'sentenca', 'recurso', 'prazo']
      const isAudiencia = tiposAudiencia.includes(item.tipo)
      const isPrazo = tiposPrazo.includes(item.tipo)
      if (activeTab === 'prazos' && !isPrazo) return false
      if (activeTab === 'audiencias' && !isAudiencia) return false

      // Filtro por Busca (Processo ou Descrição)
      const searchLower = searchTerm.toLowerCase()
      const matchSearch = 
        item.descricao.toLowerCase().includes(searchLower) ||
        item.monitored_processes?.numero_processo?.toLowerCase().includes(searchLower)
      if (!matchSearch) return false

      // Filtro por Responsável
      if (filterResponsavel !== 'todos') {
        if (filterResponsavel === 'sem_responsavel' && item.responsavel_id) return false
        if (filterResponsavel !== 'sem_responsavel' && item.responsavel_id !== filterResponsavel) return false
      }

      // Filtro por Tribunal
      if (filterTribunal !== 'todos' && item.monitored_processes?.tribunal !== filterTribunal) return false

      return true
    })
  }, [items, activeTab, searchTerm, filterResponsavel, filterTribunal])

  const tribunals = useMemo(() => {
    const list = new Set<string>()
    items.forEach(i => {
      if (i.monitored_processes?.tribunal) list.add(i.monitored_processes.tribunal)
    })
    return Array.from(list)
  }, [items])

  async function updateStatus(id: string, newStatus: string) {
    const { error } = await supabase
      .from('process_prazos')
      .update({ status: newStatus })
      .eq('id', id)
    
    if (!error) {
      setItems(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item))
    }
  }

  async function atribuirResponsavel(id: string, responsavelId: string | null) {
    const { error } = await supabase
      .from('process_prazos')
      .update({ responsavel_id: responsavelId })
      .eq('id', id)
    
    if (!error) {
      const profile = responsavelId ? profiles.find(p => p.id === responsavelId) : null
      setItems(prev => prev.map(item => item.id === id ? { ...item, responsavel_id: responsavelId, profiles: profile } : item))
    }
  }

  function getUrgencyStyle(data: string, status: string) {
    if (status === 'concluido') return 'border-green-500/20 text-green-400'
    const d = diasRestantes(data)
    if (d <= 0) return 'border-red-600 bg-red-600/10 text-red-500 shadow-[0_0_15px_rgba(220,38,38,0.3)]'
    if (d <= 3) return 'border-red-500/40 bg-red-500/10 text-red-400'
    if (d <= 7) return 'border-orange-500/40 bg-orange-500/10 text-orange-400'
    return 'border-[#CCA761]/40 bg-[#CCA761]/10 text-[#CCA761]'
  }

  async function handleOpenDrawer(item: any) {
    setSelectedItemId(item.id)
    setIsDrawerOpen(true)
    setLoadingTask(true)
    setTaskDetails(null)
    setAnnotationText('')

    if (item.monitored_processes?.id) {
      console.log("[Prazos] Buscando resumo do caso para:", item.monitored_processes.id)
      const { data, error } = await supabase
        .from('process_tasks')
        .select('*')
        .eq('monitored_process_id', item.monitored_processes.id)
        .maybeSingle()

      if (error) {
        console.error("[Prazos] Erro ao buscar process_tasks:", error)
      } else {
        setTaskDetails(data)
        setAnnotationText(data?.description || '')
      }
    }
    setLoadingTask(false)
  }

  async function handleSaveAnnotation() {
    if (!selectedItemId || !tenantId) return
    const item = items.find(i => i.id === selectedItemId)
    if (!item?.monitored_processes?.id) return

    setIsSavingAnnotation(true)
    
    try {
      if (taskDetails?.id) {
        // Update
        const { error } = await supabase
          .from('process_tasks')
          .update({ 
            description: annotationText,
            updated_at: new Date().toISOString()
          })
          .eq('id', taskDetails.id)
        
        if (error) throw error
      } else {
        // Insert
        const { data, error } = await supabase
          .from('process_tasks')
          .insert({
            tenant_id: tenantId,
            monitored_process_id: item.monitored_processes.id,
            description: annotationText,
            title: `Anotações: ${item.monitored_processes.numero_processo}`,
            position_index: 0
          })
          .select()
          .single()
        
        if (error) throw error
        setTaskDetails(data)
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      console.error("[Prazos] Erro ao salvar anotação:", err)
    } finally {
      setIsSavingAnnotation(false)
    }
  }

  return (
    <div className={`p-8 min-h-screen bg-[#050505] text-white ${montserrat.className}`}>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h2 className={`text-[#CCA761] text-sm uppercase tracking-[0.3em] font-medium mb-2 ${montserrat.className}`}>
            Operações Jurídicas
          </h2>
          <h1 className={`text-4xl md:text-5xl font-light text-white tracking-tight ${cormorant.className}`}>
            Prazos & <span className="italic text-[#CCA761]">Audiências</span>
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 backdrop-blur-xl">
          <button 
            onClick={() => setActiveTab('prazos')}
            className={`px-8 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${activeTab === 'prazos' ? 'bg-[#CCA761] text-black shadow-lg shadow-[#CCA761]/20' : 'text-white/40 hover:text-white/70'}`}
          >
            Prazos
          </button>
          <button 
            onClick={() => setActiveTab('audiencias')}
            className={`px-8 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${activeTab === 'audiencias' ? 'bg-[#CCA761] text-black shadow-lg shadow-[#CCA761]/20' : 'text-white/40 hover:text-white/70'}`}
          >
            Audiências
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <GlassCard className="mb-8 !p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex-1 min-w-[300px] relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por processo ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-all"
            />
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
              <User size={16} className="text-[#CCA761]" />
              <select 
                value={filterResponsavel}
                onChange={(e) => setFilterResponsavel(e.target.value)}
                className="bg-transparent text-sm focus:outline-none cursor-pointer"
              >
                <option value="todos">Todos Responsáveis</option>
                <option value="sem_responsavel">Sem Responsável (Fila)</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
              <Gavel size={16} className="text-[#CCA761]" />
              <select 
                value={filterTribunal}
                onChange={(e) => setFilterTribunal(e.target.value)}
                className="bg-transparent text-sm focus:outline-none cursor-pointer"
              >
                <option value="todos">Todos Tribunais</option>
                {tribunals.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Grid de Prazos */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-48 bg-white/5 rounded-2xl border border-white/10" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
            <Calendar size={64} className="mx-auto mb-6 text-white/10" />
            <h3 className="text-xl text-white/60 mb-2">Nenhum registro encontrado</h3>
            <p className="text-white/30 max-w-md mx-auto">
              Ajuste seus filtros ou aguarde novas movimentações processuais monitoradas pela IA.
            </p>
          </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map(item => (
            <div 
              key={item.id} 
              onClick={() => handleOpenDrawer(item)}
              className="cursor-pointer"
            >
              <GlassCard className="border-[#CCA761]/50 hover:border-[#CCA761]/90 hover:scale-[1.02] transform transition-all hover:shadow-[0_0_24px_rgba(204,167,97,0.2)] h-full">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-widest border border-current uppercase`}>
                    {item.tipo}
                  </span>
                  {item.monitored_processes?.escavador_monitoramento_id ? (
                    <span className="flex items-center gap-1 text-[10px] text-green-400 font-bold bg-green-400/5 px-2 py-0.5 rounded border border-green-400/20">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                      Monitorado
                    </span>
                  ) : (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log("Solicitar monitoramento para:", item.monitored_processes?.numero_processo);
                      }}
                      className="text-[10px] text-[#CCA761] font-bold border border-[#CCA761]/30 px-2 py-0.5 rounded hover:bg-[#CCA761]/10 transition-colors"
                    >
                      + Monitorar
                    </button>
                  )}
                </div>
                <div className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all ${getUrgencyStyle(item.data_vencimento, item.status)}`}>
                  {item.status === 'concluido' ? 'CONCLUÍDO' : 
                   diasRestantes(item.data_vencimento) <= 0 ? 'PRAZO FATAL' : 
                   `${diasRestantes(item.data_vencimento)} DIAS`}
                </div>
              </div>

              <h3 className="text-lg font-medium text-white mb-2 line-clamp-2 leading-tight">
                {item.descricao}
              </h3>

              {(item.monitored_processes?.resumo_curto || item.monitored_processes?.ultima_movimentacao_texto) && (
                <p className="text-[12px] text-white/40 font-normal leading-relaxed mb-4 line-clamp-3">
                  {item.monitored_processes.resumo_curto || 
                   (item.monitored_processes.ultima_movimentacao_texto?.length > 120 
                    ? item.monitored_processes.ultima_movimentacao_texto.slice(0, 120) + '...'
                    : item.monitored_processes.ultima_movimentacao_texto)}
                </p>
              )}

              <div className="space-y-2 mb-6">
                <div className="flex items-center gap-2 text-white/40 text-[12px]">
                  <Clock size={14} className="text-[#CCA761]" />
                  <span>Vencimento: {formatarData(item.data_vencimento)}</span>
                </div>
                {item.monitored_processes?.numero_processo && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[13px] group/cnj">
                      <Gavel size={14} className="text-[#CCA761]" />
                      <span className="truncate font-medium text-[#CCA761]">Proc: {item.monitored_processes.numero_processo}</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(item.monitored_processes.numero_processo);
                          setCopiedId(item.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                        className="opacity-0 group-hover/cnj:opacity-100 p-1 hover:bg-white/10 rounded transition-all text-[#CCA761]"
                        title="Copiar CNJ"
                      >
                        {copiedId === item.id ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                    {item.monitored_processes.partes?.polo_ativo && (
                      <div className="text-[11px] text-white/30 pl-6 leading-tight">
                        {item.monitored_processes.partes.polo_ativo}
                      </div>
                    )}
                  </div>
                )}
                {item.monitored_processes?.cliente_nome && (
                  <div className="text-[11px] text-white/20 pl-6 -mt-1 mb-2">
                    Cliente: {item.monitored_processes.cliente_nome}
                  </div>
                )}
                {item.monitored_processes?.tribunal && (
                  <div className="text-[10px] text-white/20 uppercase tracking-wider pl-6">
                    {item.monitored_processes.tribunal} · {item.monitored_processes.comarca || '—'}
                  </div>
                )}
              </div>

              <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                {/* Responsável */}
                <div className="relative group/user">
                  {item.responsavel_id ? (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#CCA761]/20 border border-[#CCA761]/60 flex items-center justify-center overflow-hidden shrink-0">
                        {item.profiles?.avatar_url ? (
                          <img src={item.profiles.avatar_url} alt={item.profiles.full_name ?? ''} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[#CCA761] text-[13px] font-semibold leading-none">
                            {item.profiles?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                          </span>
                        )}
                      </div>
                      <div className="text-[13px] text-[#CCA761] font-medium truncate max-w-[100px]">
                        {item.profiles?.full_name?.split(' ')[0] ?? 'Sem responsável'}
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        atribuirResponsavel(item.id, currentUser?.id)
                      }}
                      className="flex items-center gap-2 text-[12px] text-red-400 hover:text-red-300 transition-colors bg-red-400/5 px-3 py-1.5 rounded-lg border border-red-400/20 shadow-lg shadow-red-900/10"
                    >
                      <UserPlus size={14} /> Assumir
                    </button>
                  )}
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2">
                  {item.status !== 'concluido' ? (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        updateStatus(item.id, 'concluido')
                      }}
                      className="p-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-black transition-all border border-green-500/20"
                      title="Marcar como Concluído"
                    >
                      <CheckCircle size={16} />
                    </button>
                  ) : (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        updateStatus(item.id, 'pendente')
                      }}
                      className="p-2 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-black transition-all border border-orange-500/20"
                      title="Reabrir Prazo"
                    >
                      <Clock size={16} />
                    </button>
                  )}
                  
                  <div className="relative group/menu">
                    <button 
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 rounded-lg bg-white/5 text-white/40 hover:bg-white/10 transition-all border border-white/10"
                    >
                      <ChevronDown size={16} />
                    </button>
                    {/* Minimalistic Dropdown placeholder */}
                    <div className="absolute bottom-full right-0 mb-2 w-48 bg-[#111111] border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-50 p-1">
                      <p className="text-[10px] text-white/20 px-3 py-2 uppercase tracking-widest font-bold">Atribuir a:</p>
                      {profiles.map(p => (
                        <button 
                          key={p.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            atribuirResponsavel(item.id, p.id)
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-[#CCA761] hover:text-black rounded-lg transition-all"
                        >
                          {p.full_name}
                        </button>
                      ))}
                      <div className="h-[1px] bg-white/5 my-1" />
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          atribuirResponsavel(item.id, null)
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-white/40 hover:text-white hover:bg-red-500 bg-transparent rounded-lg transition-all flex items-center justify-between"
                      >
                        Remover Responsável <UserPlus size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        ))}
        </div>
      )}

      {/* Drawer de Detalhes (Modal Centralizado) */}
      {isDrawerOpen && selectedItemId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] animate-in fade-in duration-300"
            onClick={() => setIsDrawerOpen(false)}
          />
          
          {/* Modal Content */}
          <div className="relative bg-[#0f0f0f] border border-[#CCA761]/20 z-[61] shadow-2xl flex flex-col animate-in zoom-in-95 duration-300 rounded-2xl overflow-hidden max-w-2xl w-full max-h-[90vh]">
            {(() => {
              const item = items.find(i => i.id === selectedItemId)
              if (!item) return null

              return (
                <>
                  {/* Modal Header */}
                  <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#141414]/50 shrink-0">
                    <div>
                      <h3 className="text-[#CCA761] text-[20px] font-bold tracking-tight">
                        Detalhamento do Processo
                      </h3>
                      <p className="text-white/40 text-xs uppercase tracking-[0.2em] mt-1 font-medium">
                        {item.monitored_processes?.numero_processo}
                      </p>
                    </div>
                    <button 
                      onClick={() => setIsDrawerOpen(false)}
                      className="p-2 rounded-xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Drawer Body */}
                  <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
                    {/* Header Info */}
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-[#CCA761] font-black uppercase tracking-widest">Número do Processo</label>
                        <p className="text-xl font-bold text-white tracking-wide">
                          {item.monitored_processes?.numero_processo}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-white/30 font-black uppercase tracking-widest">Autor (Polo Ativo)</label>
                          <p className="text-sm text-white/80 font-medium">
                            {item.monitored_processes?.partes?.polo_ativo || '—'}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-white/30 font-black uppercase tracking-widest">Réu (Polo Passivo)</label>
                          <p className="text-sm text-white/80 font-medium">
                            {item.monitored_processes?.partes?.polo_passivo || '—'}
                          </p>
                        </div>
                      </div>

                      <div className="pt-4 grid grid-cols-2 gap-6 border-t border-white/5">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-white/30 font-black uppercase tracking-widest">Tribunal / Comarca</label>
                          <p className="text-xs text-white/60">
                            {item.monitored_processes?.tribunal} · {item.monitored_processes?.comarca || '—'}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-white/30 font-black uppercase tracking-widest">Vencimento</label>
                          <div className="flex items-center gap-2">
                             <Clock size={12} className="text-[#CCA761]" />
                             <p className="text-xs text-[#CCA761] font-bold">
                               {formatarData(item.data_vencimento)}
                             </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Descrição do Prazo */}
                    <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
                      <label className="text-[10px] text-[#CCA761] font-black uppercase tracking-widest">Título do Prazo / Audiência</label>
                      <h4 className="text-lg font-medium text-white leading-tight">
                        {item.descricao}
                      </h4>
                      {item.monitored_processes?.resumo_curto && (
                        <div className="pt-3 border-t border-white/5">
                          <p className="text-[13px] text-white/50 leading-relaxed italic">
                            &quot;{item.monitored_processes.resumo_curto}&quot;
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Resumo do Caso (Kanban) */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                         <label className="text-[10px] text-[#CCA761] font-black uppercase tracking-widest">Anotações (Resumo do Caso)</label>
                         {loadingTask && <div className="w-4 h-4 border-2 border-[#CCA761]/30 border-t-[#CCA761] rounded-full animate-spin" />}
                      </div>
                      
                      <div className="space-y-4">
                        <textarea
                          value={annotationText}
                          onChange={(e) => setAnnotationText(e.target.value)}
                          placeholder="Escreva aqui os detalhes importantes deste caso..."
                          className="w-full h-48 p-4 bg-[#111] border border-white/10 rounded-xl text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-[#CCA761]/50 placeholder:text-white/10 resize-none transition-all"
                        />
                        
                        <div className="flex justify-end">
                          <button
                            onClick={handleSaveAnnotation}
                            disabled={isSavingAnnotation}
                            className={`px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                              saveSuccess 
                                ? 'bg-green-500/20 text-green-400 border border-green-500/50' 
                                : 'bg-[#CCA761] hover:bg-[#b39255] text-black disabled:opacity-50'
                            }`}
                          >
                            {isSavingAnnotation ? (
                              <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                            ) : saveSuccess ? (
                              <CheckCircle size={14} />
                            ) : null}
                            {saveSuccess ? 'Salvo ✓' : isSavingAnnotation ? 'Salvando...' : 'Salvar Anotação'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Drawer Footer */}
                  <div className="p-6 border-t border-white/5 bg-[#141414]/50 flex justify-end">
                    <button 
                      onClick={() => setIsDrawerOpen(false)}
                      className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white font-bold text-sm rounded-xl transition-all border border-white/5"
                    >
                      Fechar Detalhes
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
