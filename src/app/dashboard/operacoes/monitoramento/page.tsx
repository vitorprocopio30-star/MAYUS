'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { 
  Search, 
  RefreshCw, 
  Shield, 
  Zap, 
  LayoutList, 
  CheckCircle, 
  AlertCircle,
  Filter,
  X,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  History,
  FileText,
  Clock
} from 'lucide-react'

// ─── Interfaces e Tipos ───

interface Processo {
  numero_processo: string
  tribunal: string
  status: string
  data_distribuicao: string | null
  data_ultima_movimentacao: string | null
  polo_ativo: string
  polo_passivo: string
  assunto: string
  instancia: number
  movimentacoes?: any[]
  id?: string
  monitorado?: boolean
  link_estudo?: string
  resumo_curto?: string
  proxima_acao_sugerida?: string
  organizacao_ia_json?: any
  escavador_monitoramento_id?: number
}

interface Billing {
  total_disponivel: number
  total_pago: number
  custo_por_processo: number
  total_ja_monitorados: number
}

interface BuscaResult {
  advogado_nome: string
  total: number
  total_retornado?: number
  processos: Processo[]
  billing: Billing
  next_url?: string
}

interface ConfirmacaoLote {
  total: number
  custo_estimado: number
  ja_monitorados: number
  novos: number
  processosParaImportar: Processo[]
}

type FilterStatus = 'TODOS' | 'ATIVO' | 'ARQUIVADO' | 'monitorado' | 'nao_monitorado'
type SortOrder = 'distribuicao' | 'urgencia' | 'tribunal'

const STATUS_COLOR: Record<string, string> = {
  'ATIVO': 'text-green-400 bg-green-500/10 border-green-500/20',
  'ARQUIVADO': 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20',
  'SUSPENSO': 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
}

// ─── Funções Auxiliares ───

function parseDataBR(dataStr: string | null): number {
  if (!dataStr) return 0
  try {
    const [d, m, a] = dataStr.split('/').map(Number)
    return new Date(a, m - 1, d).getTime()
  } catch { return 0 }
}

function formatarData(dataIso: string | null) {
  if (!dataIso) return '--/--/----'
  try {
    const d = new Date(dataIso)
    return d.toLocaleDateString('pt-BR')
  } catch { return '--/--/----' }
}

function diasDesde(data: string | null) {
  if (!data) return null
  const timestamp = parseDataBR(data)
  if (timestamp === 0) return null
  
  const h = new Date()
  const m = new Date(timestamp)
  
  // Zera horas para comparação de dias de calendário (fuso local)
  h.setHours(0, 0, 0, 0)
  m.setHours(0, 0, 0, 0)
  
  const diff = h.getTime() - m.getTime()
  const dias = Math.round(diff / 86400000)
  
  return dias < 0 ? 0 : dias
}

// ─── Sub-componentes ───

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] || 'text-zinc-400 bg-zinc-900 border-zinc-800'
  return (
    <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${color}`}>
      {status}
    </span>
  )
}

function BillingBar({ billing }: { billing: Billing }) {
  const percent = Math.min(100, (billing.total_ja_monitorados / billing.total_disponivel) * 100)
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="space-y-1 text-center md:text-left">
        <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest leading-none">Capacidade do Plano</p>
        <p className="text-white font-black text-lg">{billing.total_ja_monitorados} <span className="text-zinc-600">/</span> {billing.total_disponivel} <span className="text-zinc-600 text-[10px] uppercase ml-2 tracking-tighter">Processos</span></p>
      </div>
      <div className="flex-1 w-full max-w-md h-3 bg-zinc-950 rounded-full border border-zinc-800 p-0.5 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 rounded-full shadow-[0_0_12px_rgba(234,179,8,0.3)] transition-all duration-1000" style={{ width: `${percent}%` }} />
      </div>
      <div className="text-center md:text-right">
        <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest leading-none">Status de Créditos</p>
        <p className="text-green-500 font-bold text-xs uppercase tracking-widest mt-1">Suficiente para Varredura</p>
      </div>
    </div>
  )
}

function ModalConfirmacaoCusto({ dados, onConfirmar, onCancelar, loading }: { dados: ConfirmacaoLote, onConfirmar: () => void, onCancelar: () => void, loading: boolean }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl space-y-6">
        <div className="w-16 h-16 bg-yellow-500/10 rounded-2xl flex items-center justify-center mx-auto text-yellow-500 mb-2">
          <Zap size={32} fill="currentColor" />
        </div>
        <div className="text-center space-y-2">
           <h3 className="text-white font-black text-xl uppercase tracking-tighter">Investimento Requerido</h3>
           <p className="text-zinc-500 text-xs leading-relaxed font-medium">A monitoração desses {dados.novos} novos processos requer o uso de créditos da API Escavador.</p>
        </div>
        <div className="bg-zinc-950 rounded-2xl p-6 border border-zinc-800 grid grid-cols-2 gap-4 divide-x divide-zinc-900">
          <div className="text-center">
             <p className="text-[9px] text-zinc-600 font-black uppercase mb-1">Processos</p>
             <p className="text-white font-black text-lg">+{dados.novos}</p>
          </div>
          <div className="text-center pl-4">
             <p className="text-[9px] text-zinc-600 font-black uppercase mb-1">Custo Estimado</p>
             <p className="text-yellow-500 font-black text-lg">R$ {dados.custo_estimado.toFixed(2)}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancelar} className="flex-1 py-4 rounded-xl text-[10px] font-black uppercase text-zinc-500 hover:text-white transition-all">Cancelar</button>
          <button onClick={onConfirmar} disabled={loading} className="flex-[2] py-4 bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase rounded-xl transition-all shadow-xl shadow-yellow-500/20 active:scale-95 border-b-4 border-yellow-700">
            {loading ? 'Confirmando...' : 'Autorizar Investimento'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProcessoCard({ p, onSelect, selecionado, onAction, onRemover, loadingId, organizandoState, onOrganizar, onAbrirDetalhes }: { p: Processo, onSelect: () => void, selecionado: boolean, onAction: () => void, onRemover: () => void, loadingId: string | null, organizandoState: 'idle' | 'loading' | 'done', onOrganizar: () => void, onAbrirDetalhes: () => void }) {
  const d = diasDesde(p.data_ultima_movimentacao)
  const isUpdating = loadingId === p.numero_processo
  const [resumoExpandido, setResumoExpandido] = useState(false)

  return (
    <div className={`group relative bg-zinc-900/40 border transition-all duration-500 rounded-3xl p-6 hover:bg-zinc-900/60 ${selecionado ? 'border-yellow-500 ring-1 ring-yellow-500/20 bg-zinc-900/80 shadow-2xl shadow-yellow-500/5' : 'border-zinc-800/50 hover:border-zinc-700'}`}>
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Controle Lateral */}
        <div className="flex flex-row lg:flex-col items-center gap-4 border-b lg:border-b-0 lg:border-r border-zinc-800 pb-4 lg:pb-0 lg:pr-6 shrink-0">
           <button onClick={onSelect} className={`w-6 h-6 rounded-lg border transition-all flex items-center justify-center ${selecionado ? 'bg-yellow-500 border-yellow-500' : 'bg-zinc-950 border-zinc-800 group-hover:border-zinc-700'}`}>
             {selecionado && <CheckCircle size={14} className="text-black" strokeWidth={3} />}
           </button>
           <div className="h-px lg:h-8 w-8 lg:w-px bg-zinc-800" />
           <div className="flex lg:flex-col gap-2">
              <StatusBadge status={p.status} />
              {p.monitorado && (
                <span className="px-2 py-1 rounded-md bg-yellow-500/5 border border-yellow-500/10 text-yellow-500/70 text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                   <Shield size={10} fill="currentColor" /> Vigiado
                </span>
              )}
           </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="flex-1 space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-1">
               <div className="flex items-center gap-2">
                 <h3 className="text-lg font-black text-white tracking-tight cursor-pointer hover:text-yellow-500 transition-colors" onClick={onAbrirDetalhes}>
                   {p.numero_processo}
                 </h3>
                 <button onClick={onAbrirDetalhes} className="text-zinc-700 hover:text-white transition-colors">
                   <ExternalLink size={14} />
                 </button>
               </div>
               <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em]">{p.tribunal} · {p.assunto || 'ASSUNTO NÃO IDENTIFICADO'}</p>
            </div>
            <div className="flex flex-col items-end shrink-0">
               {d !== null && (
                 <div className={`px-4 py-1.5 rounded-full flex items-center gap-2 border ${d === 0 ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.2)]' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${d === 0 ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,1)]' : 'bg-zinc-800'}`} />
                    <span className="text-[10px] font-black uppercase tracking-widest">{d === 0 ? 'Atualizado hoje' : `Atualizado há ${d} dia${d > 1 ? 's' : ''}`}</span>
                 </div>
               )}
               <p className="text-[9px] text-zinc-700 font-black uppercase tracking-widest mt-2">{p.instancia}ª Instância</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-zinc-950/30 p-5 rounded-2xl border border-zinc-800/30">
             <div className="space-y-2">
                <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-800" /> Polo Ativo
                </p>
                <p className="text-zinc-300 text-xs font-bold leading-relaxed">{p.polo_ativo}</p>
             </div>
             <div className="space-y-2">
                <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-800" /> Polo Passivo
                </p>
                <p className="text-zinc-300 text-xs font-bold leading-relaxed">{p.polo_passivo}</p>
             </div>
          </div>

          {p.resumo_curto && (
            <div className="space-y-2">
              <div 
                onClick={() => setResumoExpandido(!resumoExpandido)} 
                className="cursor-pointer group/resumo"
              >
                <div className={`text-white/70 text-[11px] leading-relaxed bg-white/[0.03] p-4 rounded-xl border border-white/5 transition-all group-hover/resumo:border-white/10 ${resumoExpandido ? '' : 'line-clamp-2'}`}>
                  <span className="text-[#CCA761] font-black uppercase text-[9px] tracking-widest mb-1 block">Análise MAYUS IA:</span>
                  {p.resumo_curto}
                </div>
                <span className="text-white/20 text-[9px] uppercase tracking-widest mt-2 flex items-center gap-1 group-hover/resumo:text-white/40">
                  {resumoExpandido ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  {resumoExpandido ? 'recolher insight' : 'expandir insight completo'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="flex flex-col gap-2 shrink-0 justify-center">
           {!p.monitorado ? (
             <button onClick={onAction} disabled={isUpdating} className="w-full lg:w-44 h-12 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white text-[10px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2.5">
               {isUpdating ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
               Ativar Vigilância
             </button>
           ) : (
             <div className="space-y-2">
               <button 
                onClick={onOrganizar}
                disabled={organizandoState === 'loading'}
                className={`w-full lg:w-44 h-12 border text-[10px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2.5 
                  ${organizandoState === 'loading' ? 'bg-zinc-950 border-zinc-800 text-zinc-600' : 
                    organizandoState === 'done' ? 'bg-green-500/10 border-green-500/20 text-green-500' :
                    'bg-[#CCA761]/10 border-[#CCA761]/30 text-[#CCA761] hover:bg-[#CCA761]/20'}`}
               >
                 {organizandoState === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                 {organizandoState === 'loading' ? 'Organizando...' : 'Arrumar com IA'}
               </button>

               <button onClick={onRemover} disabled={isUpdating} className="w-full lg:w-44 h-11 bg-transparent border border-zinc-900 hover:border-red-500/20 text-zinc-800 hover:text-red-500/50 text-[9px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2">
                 Parar Monitoramento
               </button>
             </div>
           )}
        </div>
      </div>
    </div>
  )
}

// ─── Componente Principal ───

function MonitoramentoContent() {
  const [pagina, setPagina] = useState(1)
  const [nextCursor, setNextCursor] = useState<string|null>(null)
  const [carregandoMais, setCarregandoMais] = useState(false)
  
  // Estados para Automação de Carga
  const [carregandoTodos, setCarregandoTodos] = useState(false)
  const [automationBatchesCount, setAutomationBatchesCount] = useState(0)
  const [progressoCarregamento, setProgressoCarregamento] = useState("")

  const [tab, setTab] = useState<'oab' | 'numero' | 'cpf'>('oab')
  const [oabEstado, setOabEstado] = useState('RJ')
  const [oabNumero, setOabNumero] = useState('')
  const [loading, setLoading] = useState(false)
  const [importandoLote, setImportandoLote] = useState(false)
  const [result, setResult] = useState<BuscaResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtroStatus, setFiltroStatus] = useState<FilterStatus>('TODOS')
  const [filtroTribunal, setFiltroTribunal] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoLote | null>(null)
  const [confirmandoLote, setConfirmandoLote] = useState(false)
  const [ordenacao, setOrdenacao] = useState<SortOrder>('urgencia')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [loadingId, setLoadingId] = useState<string | null>(null)

  // Estado para os botões "Organizar IA"
  const [organizando, setOrganizando] = useState<Record<string, 'idle' | 'loading' | 'done'>>({})

  // Estado para Drawer Lateral (Painel de Detalhes)
  const [processoSelecionado, setProcessoSelecionado] = useState<Processo | null>(null)

  // Estado para "Organizar Todos"
  const [organizandoTodos, setOrganizandoTodos] = useState(false)
  const [progressoOrg, setProgressoOrg] = useState(0)

  const PAGE_SIZE = 20

  const setPage = (p: number) => {
    setPagina(p)
    window.scrollTo({ top: 300, behavior: 'smooth' })
  }

  useEffect(() => {
    const s = localStorage.getItem('mayus_oab_numero')
    const e = localStorage.getItem('mayus_oab_estado')
    if (s) setOabNumero(s)
    if (e) setOabEstado(e)

    const saved = sessionStorage.getItem('mon_result')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setResult(parsed)
        setNextCursor(parsed.next_url ?? null)
      } catch {}
    }
  }, [])

  const buscar = useCallback(async () => {
    if (!oabNumero.trim()) return
    setLoading(true); setError(null); setFeedback(null); setSelecionados(new Set()); setPagina(1)
    try {
      localStorage.setItem('mayus_oab_numero', oabNumero.trim())
      localStorage.setItem('mayus_oab_estado', oabEstado)

      const res = await fetch('/api/escavador/buscar-completo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oab_estado: oabEstado, oab_numero: oabNumero.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Falha na varredura')
      setResult(data)
      setNextCursor(data.next_url ?? null)
      setCarregandoTodos(!!data.next_url)
      setAutomationBatchesCount(0)
      try { sessionStorage.setItem('mon_result', JSON.stringify(data)) } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro na conexão')
    } finally {
      setLoading(false)
    }
  }, [oabEstado, oabNumero])

  const carregarMais = useCallback(async () => {
    if (!nextCursor || carregandoMais) return
    setCarregandoMais(true)
    try {
      const res = await fetch('/api/escavador/buscar-completo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oab_estado: oabEstado,
          oab_numero: oabNumero,
          next_url: nextCursor
        })
      })
      const data = await res.json()
      setNextCursor(data.next_url ?? null)
      setResult(prev => prev ? {
        ...prev,
        processos: [...prev.processos, ...data.processos],
        total_retornado: (prev.total_retornado ?? 0) + data.processos.length
      } : data)
      try {
         const currentSavedStr = sessionStorage.getItem('mon_result')
         if (currentSavedStr) {
            const currentSaved = JSON.parse(currentSavedStr)
            sessionStorage.setItem('mon_result', JSON.stringify({
              ...currentSaved,
              processos: [...(currentSaved.processos ?? []), ...data.processos],
              total_retornado: (currentSaved.total_retornado ?? 0) + data.processos.length,
              next_url: data.next_url ?? null
            }))
         }
      } catch {}
    } finally {
      setCarregandoMais(false)
    }
  }, [nextCursor, oabEstado, oabNumero, carregandoMais])

  useEffect(() => {
    if (nextCursor && carregandoTodos && !carregandoMais && automationBatchesCount < 10) {
      const timer = setTimeout(() => {
        carregarMais()
        setAutomationBatchesCount(prev => prev + 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else if (automationBatchesCount >= 10 || !nextCursor) {
      setCarregandoTodos(false)
    }
  }, [nextCursor, carregandoTodos, carregandoMais, automationBatchesCount, carregarMais])

  useEffect(() => {
    if (result) {
      setProgressoCarregamento(`${result.total_retornado}/${result.total}`)
    }
  }, [result])

  const monitorarLote = useCallback(async (processos: Processo[]) => {
    if (processos.length === 0) return
    setImportandoLote(true)
    try {
      const res = await fetch('/api/monitoramento/importar-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processos, confirmar_custo: false })
      })
      const data = await res.json()
      if (data.requer_confirmacao) {
        setConfirmacao({ ...data, processosParaImportar: processos })
        return
      }
      setResult(prev => prev ? {
        ...prev,
        processos: prev.processos.map(p => processos.some(a => a.numero_processo === p.numero_processo) ? { ...p, monitorado: true } : p),
        billing: { ...prev.billing, total_ja_monitorados: prev.billing.total_ja_monitorados + processos.length }
      } : prev)
      setSelecionados(new Set())
      setFeedback(`✅ ${processos.length} processos agora sob vigilância estratégica`)
    } catch (e) {
      setError('Erro ao monitorar processos')
    } finally {
      setImportandoLote(false)
    }
  }, [])

  const desmonitorar = useCallback(async (p: Processo) => {
    setLoadingId(p.numero_processo)
    try {
      await fetch('/api/monitoramento/remover', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processo_id: p.id || p.numero_processo })
      })
      setResult(prev => prev ? {
        ...prev,
        processos: prev.processos.filter(item => item.numero_processo !== p.numero_processo),
        total_retornado: Math.max(0, (prev.total_retornado || 1) - 1),
        billing: { ...prev.billing, total_ja_monitorados: Math.max(0, prev.billing.total_ja_monitorados - 1) }
      } : prev)
      setFeedback('✅ Vigilância desativada e processo ocultado')
    } catch (e) {
      setError('Erro ao remover monitoramento')
    } finally {
      setLoadingId(null)
    }
  }, [])

  const handleOrganizar = useCallback(async (processoId: string) => {
    setOrganizando(prev => ({ ...prev, [processoId]: 'loading' }))
    try {
      const res = await fetch('/api/agent/processos/organizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processo_id: processoId })
      })
      const data = await res.json()
      if (data.success) {
        setOrganizando(prev => ({ ...prev, [processoId]: 'done' }))
        setResult(prev => prev ? {
          ...prev,
          processos: prev.processos.map(p => p.id === processoId ? { ...p, ...data.processo_atualizado } : p)
        } : prev)
      } else {
        setOrganizando(prev => ({ ...prev, [processoId]: 'idle' }))
      }
    } catch {
      setOrganizando(prev => ({ ...prev, [processoId]: 'idle' }))
    }
  }, [])

  const handleOrganizarTodos = useCallback(async () => {
    if (!result) return
    const monitorados = result.processos.filter(p => p.id)
    if (monitorados.length === 0) return

    setOrganizandoTodos(true)
    setProgressoOrg(0)

    for (let i = 0; i < monitorados.length; i++) {
      const pid = monitorados[i].id!
      setOrganizando(prev => ({ ...prev, [pid]: 'loading' }))
      try {
        const res = await fetch('/api/agent/processos/organizar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ processo_id: pid })
        })
        const data = await res.json()
        if (data.success) {
          setOrganizando(prev => ({ ...prev, [pid]: 'done' }))
          setResult(prev => prev ? {
            ...prev,
            processos: prev.processos.map(p => p.id === pid ? { ...p, ...data.processo_atualizado } : p)
          } : prev)
        } else {
          setOrganizando(prev => ({ ...prev, [pid]: 'idle' }))
        }
      } catch {
        setOrganizando(prev => ({ ...prev, [pid]: 'idle' }))
      }
      setProgressoOrg(i + 1)
      if (i < monitorados.length - 1) await new Promise(r => setTimeout(r, 1000))
    }
    setOrganizandoTodos(false)
  }, [result])

  const tribunaisUnicos = useMemo(() => {
    if (!result) return []
    return Array.from(new Set(result.processos.map(p => p.tribunal))).sort()
  }, [result])

  const processosFiltrados = useMemo(() => {
    if (!result) return []
    return result.processos
      .filter(p => {
        let matchStatus = true
        if (filtroStatus === 'monitorado') matchStatus = p.monitorado
        else if (filtroStatus === 'nao_monitorado') matchStatus = !p.monitorado
        else if (filtroStatus !== 'TODOS') matchStatus = p.status === filtroStatus
        const matchTribunal = !filtroTribunal || p.tribunal === filtroTribunal
        const matchSearch = !search || [p.numero_processo, p.polo_ativo, p.polo_passivo, p.assunto].some(s => s?.toLowerCase().includes(search.toLowerCase()))
        return matchStatus && matchSearch && matchTribunal
      })
      .sort((a, b) => {
        if (ordenacao === 'distribuicao') return parseDataBR(b.data_distribuicao) - parseDataBR(a.data_distribuicao)
        if (ordenacao === 'urgencia') return parseDataBR(b.data_ultima_movimentacao) - parseDataBR(a.data_ultima_movimentacao)
        if (ordenacao === 'tribunal') return a.tribunal.localeCompare(b.tribunal)
        return 0
      })
  }, [result, filtroStatus, filtroTribunal, search, ordenacao])

  const totalPages = Math.ceil(processosFiltrados.length / PAGE_SIZE)
  const processosPagina = useMemo(() => {
    const offset = (pagina - 1) * PAGE_SIZE
    return processosFiltrados.slice(offset, offset + PAGE_SIZE)
  }, [processosFiltrados, pagina])

  const totalAtivos = result?.processos.filter(p => p.status === 'ATIVO' && !p.monitorado).length ?? 0

  const handleFiltroStatusChange = (f: FilterStatus) => { setFiltroStatus(f); setPagina(1); }
  const handleSearchChange = (v: string) => { setSearch(v); setPagina(1); }

  return (
    <>
      {confirmacao && <ModalConfirmacaoCusto dados={confirmacao} onConfirmar={buscar} onCancelar={() => setConfirmacao(null)} loading={confirmandoLote} />}

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
           <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20 shadow-lg shadow-yellow-500/5">
                <Shield size={22} className="text-yellow-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Monitoramento Estratégico</h1>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-black opacity-60">Varredura Judicial em Tempo Real</p>
              </div>
           </div>
           {result?.advogado_nome && (
             <div className="bg-zinc-900 px-5 py-2.5 rounded-2xl border border-zinc-800 flex items-center gap-4 shadow-inner">
                <div className="flex flex-col items-end border-r border-zinc-800 pr-4">
                   <span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest leading-none mb-1">Responsável</span>
                   <span className="text-yellow-500 font-bold uppercase tracking-wide drop-shadow-[0_0_8px_rgba(234,179,8,0.4)]">{result.advogado_nome}</span>
                </div>
                <div className="flex flex-col">
                   <span className="text-white font-black text-lg leading-none">{result.total}</span>
                   <span className="text-[9px] text-zinc-600 uppercase font-black">Processos</span>
                </div>
             </div>
           )}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-2 flex flex-col md:flex-row gap-2 shadow-2xl">
           <div className="flex bg-zinc-950 rounded-xl p-1 border border-zinc-800 shrink-0">
             {([['oab', 'OAB'], ['numero', 'Nº CNJ'], ['cpf', 'DOCS']] as const).map(([k, l]) => (
               <button key={k} onClick={() => setTab(k)} className={`px-5 py-2 rounded-lg text-xs font-black transition-all ${tab === k ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'text-zinc-600 hover:text-zinc-300'}`}>{l}</button>
             ))}
           </div>
           {tab === 'oab' && (
             <select value={oabEstado} onChange={e => setOabEstado(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 text-xs font-bold text-zinc-400 focus:border-yellow-500/50 outline-none hover:bg-zinc-900 transition-colors">
               {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(e => <option key={e} value={e}>{e}</option>)}
             </select>
           )}
           <div className="flex-1 relative">
             <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700" />
             <input value={oabNumero} onChange={e => setOabNumero(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()} placeholder="Digite os dados para busca..." className="w-full h-full bg-zinc-950 border border-zinc-900 rounded-xl pl-11 pr-4 text-xs text-white placeholder-zinc-800 outline-none focus:border-yellow-500/50 font-medium" />
           </div>
           <button onClick={buscar} disabled={loading} className="px-8 h-12 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2.5 shadow-xl shadow-yellow-500/20 active:scale-95 border-b-4 border-yellow-600 shrink-0 uppercase tracking-widest">
             {loading ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} fill="currentColor" />}
             {loading ? 'BUSCANDO...' : 'INICIAR VARREDURA'}
           </button>
        </div>

        {error && <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-xs font-bold animate-shake uppercase tracking-widest"><AlertCircle size={18} /> {error}</div>}
        {feedback && <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-2xl flex items-center gap-3 text-green-400 text-xs font-bold animate-in slide-in-from-top-4 uppercase tracking-widest"><CheckCircle size={18} strokeWidth={3} /> {feedback}</div>}

        {result && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl shadow-xl">
               <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                     {(['distribuicao', 'urgencia', 'tribunal'] as SortOrder[]).map(o => (
                       <button key={o} onClick={() => setOrdenacao(o)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${ordenacao === o ? 'bg-zinc-800 text-yellow-500 border border-zinc-700 shadow-inner' : 'text-zinc-600 hover:text-zinc-400'}`}>
                          {o === 'distribuicao' ? 'Por Data' : o === 'urgencia' ? 'Por Urgência' : 'Por Tribunal'}
                       </button>
                     ))}
                  </div>
                  <div className="h-4 w-px bg-zinc-800" />
                  {!selecionados.size && totalAtivos > 0 && (
                     <button onClick={() => monitorarLote(result.processos.filter(p => p.status === 'ATIVO' && !p.monitorado))} className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-yellow-500/10 border-b-2 border-yellow-700">
                        Monitorar {totalAtivos} Ativos
                     </button>
                  )}
                  {selecionados.size > 0 && (
                     <button onClick={() => monitorarLote(result.processos.filter(p => selecionados.has(p.numero_processo)))} className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase rounded-xl transition-all flex items-center gap-2 border-b-2 border-yellow-700">
                        Vigiar {selecionados.size} Selecionados
                     </button>
                  )}
                  {result.processos.filter(p => p.id).length > 0 && (
                    <button
                      onClick={handleOrganizarTodos}
                      disabled={organizandoTodos}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl
                                 bg-[#CCA761]/10 border border-[#CCA761]/30
                                 text-[#CCA761] text-xs font-bold uppercase
                                 hover:bg-[#CCA761]/20 transition-all disabled:opacity-60">
                      {organizandoTodos ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Organizando {progressoOrg}/{result.processos.filter(p => p.id).length}...
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} /> Organizar Todos com IA
                        </>
                      )}
                    </button>
                  )}
               </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <Filter size={14} className="text-zinc-700 mx-2" />
                <button onClick={() => setFiltroTribunal(null)} className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase transition-all whitespace-nowrap border ${!filtroTribunal ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-600 border-zinc-800 hover:text-zinc-400'}`}>
                   TODAS AS JURISDIÇÕES
                </button>
                {tribunaisUnicos.map(t => (
                  <button key={t} onClick={() => setFiltroTribunal(t)} className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase transition-all whitespace-nowrap border ${filtroTribunal === t ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 shadow-lg shadow-yellow-500/5' : 'bg-zinc-900/50 text-zinc-600 border-zinc-800 hover:text-zinc-500'}`}>
                    {t}
                  </button>
                ))}
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
               <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                 {(['TODOS', 'ATIVO', 'ARQUIVADO', 'monitorado', 'nao_monitorado'] as FilterStatus[]).map(f => (
                   <button key={f} onClick={() => handleFiltroStatusChange(f)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap border ${filtroStatus === f ? 'bg-zinc-100 text-black border-zinc-100' : 'text-zinc-600 bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
                     {f === 'nao_monitorado' ? 'PENDENTES' : f === 'monitorado' ? 'VIGIADOS' : f}
                   </button>
                 ))}
               </div>
               <div className="relative w-full md:w-72">
                  <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700" />
                  <input value={search} onChange={e => handleSearchChange(e.target.value)} placeholder="Identificar na lista..." className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-11 pr-4 py-2 text-[11px] font-black uppercase text-zinc-500 outline-none focus:border-zinc-700 placeholder:opacity-30" />
               </div>
            </div>

            <div className="space-y-4">
              {totalPages > 1 && (
                <div className="flex items-center justify-between py-4 px-2 bg-zinc-900/20 rounded-2xl border border-zinc-800/50">
                  <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest px-2">{processosFiltrados.length} processos · pág {pagina}/{totalPages}</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => setPage(1)} disabled={pagina === 1} className="px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-500 text-[9px] font-black uppercase disabled:opacity-20 hover:border-zinc-700 hover:text-zinc-300">« Primeira</button>
                    <button onClick={() => setPage(Math.max(1, pagina - 1))} disabled={pagina === 1} className="px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-500 text-[9px] font-black uppercase disabled:opacity-20 hover:border-zinc-700 hover:text-zinc-300">Anterior</button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const start = Math.max(1, Math.min(pagina - 2, totalPages - 4))
                      const n = start + i
                      if (n < 1 || n > totalPages) return null
                      return (
                        <button key={n} onClick={() => setPage(n)} className={`w-7 h-7 rounded-lg text-[9px] font-black ${n === pagina ? 'bg-yellow-500 text-black' : 'border border-zinc-800 bg-zinc-950 text-zinc-600 uppercase'}`}>{n}</button>
                      )
                    })}
                    <button onClick={() => setPage(Math.min(totalPages, pagina + 1))} disabled={pagina === totalPages} className="px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-500 text-[9px] font-black uppercase disabled:opacity-20 hover:border-zinc-700 hover:text-zinc-300">Próxima</button>
                    <button onClick={() => setPage(totalPages)} disabled={pagina === totalPages} className="px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-500 text-[9px] font-black uppercase disabled:opacity-20 hover:border-zinc-700 hover:text-zinc-300">Última »</button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4">
                {processosPagina.map(p => (
                  <ProcessoCard key={p.numero_processo} p={p} onSelect={() => { const next = new Set(selecionados); if (next.has(p.numero_processo)) next.delete(p.numero_processo); else next.add(p.numero_processo); setSelecionados(next); }} selecionado={selecionados.has(p.numero_processo)} onAction={() => monitorarLote([p])} onRemover={() => desmonitorar(p)} loadingId={loadingId} organizandoState={organizando[p.id || ''] || 'idle'} onOrganizar={() => handleOrganizar(p.id || '')} onAbrirDetalhes={() => setProcessoSelecionado(p)} />
                ))}
              </div>
              {processosFiltrados.length === 0 && (
                <div className="py-32 text-center space-y-4 bg-zinc-900/10 border border-dashed border-zinc-800 rounded-3xl">
                   <div className="w-16 h-16 rounded-3xl bg-zinc-900 flex items-center justify-center mx-auto text-zinc-800"><LayoutList size={28} /></div>
                   <p className="text-zinc-500 text-xs font-black uppercase tracking-[0.3em]">Nenhum Alvo Identificado</p>
                </div>
              )}
            </div>

            {nextCursor && (
              <div className="mt-8">
                {carregandoTodos ? (
                  <div className="w-full py-6 flex flex-col items-center justify-center gap-3 bg-zinc-900/40 rounded-2xl border border-zinc-800 animate-pulse">
                    <Loader2 size={24} className="text-[#CCA761] animate-spin" />
                    <p className="text-[#CCA761] text-[10px] font-black uppercase tracking-[0.3em]">Carregando processos... {progressoCarregamento}</p>
                  </div>
                ) : (
                  <button onClick={() => { setCarregandoTodos(true); setAutomationBatchesCount(0); }} disabled={carregandoMais} className="w-full py-4 rounded-2xl border border-[#CCA761]/30 bg-[#CCA761]/5 text-[#CCA761] text-[10px] font-black uppercase tracking-widest hover:bg-[#CCA761]/10 transition-all flex items-center justify-center gap-2">
                    {automationBatchesCount >= 10 ? `Continuar carregando (${result.total - (result.total_retornado || 0)} restantes)` : `Carregar mais processos (${result.total - (result.total_retornado || 0)} restantes)`}
                  </button>
                )}
              </div>
            )}
            <BillingBar billing={result.billing} />
          </div>
        )}

        {!result && !loading && (
          <div className="text-center py-32 space-y-8 animate-in fade-in zoom-in-95 duration-700">
             <div className="relative w-24 h-24 bg-zinc-950 border border-yellow-500/10 rounded-3xl flex items-center justify-center mx-auto shadow-2xl"><Shield size={40} className="text-yellow-500/30" /></div>
             <div className="space-y-3">
                <h3 className="text-white font-black text-2xl" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Inicie a Varredura Jurídica</h3>
                <p className="text-zinc-600 text-xs max-w-sm mx-auto font-black uppercase tracking-tighter">Insira os credenciais acima para conectar-se aos tribunais.</p>
             </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-40 space-y-8">
            <div className="relative w-20 h-20 mx-auto">
               <div className="absolute inset-0 border-2 border-yellow-500 border-t-transparent border-l-transparent rounded-3xl animate-spin" />
               <div className="absolute inset-6 border border-zinc-800 rounded-2xl flex items-center justify-center"><RefreshCw size={24} className="text-yellow-500/40 animate-spin" /></div>
            </div>
            <p className="text-white font-black text-xs uppercase tracking-[0.4em] animate-pulse">Sincronizando Canais Oficiais</p>
          </div>
        )}
      </div>

      {processoSelecionado && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setProcessoSelecionado(null)} />
          <div className="relative w-full max-w-2xl h-full bg-[#0a0a0a] border-l border-white/10 overflow-y-auto p-8 animate-in slide-in-from-right duration-500 shadow-2xl z-10 font-sans">
            <button onClick={() => setProcessoSelecionado(null)} className="absolute top-6 right-6 text-white/40 hover:text-white"><X size={24} /></button>
            <div className="mb-8">
              <span className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] mb-2 block">Detalhes do Processo</span>
              <h2 className="text-white font-bold text-2xl tracking-tight mb-2">{processoSelecionado.numero_processo}</h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold bg-zinc-800 text-zinc-400 px-3 py-1 rounded-lg">{processoSelecionado.tribunal}</span>
                <span className={`text-[10px] uppercase font-bold px-3 py-1 rounded-lg ${STATUS_COLOR[processoSelecionado.status] ?? 'text-zinc-600 bg-zinc-900'}`}>{processoSelecionado.status}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/[0.02] border border-white/5 p-6 rounded-2xl mb-8">
              <div><p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">Polo Ativo</p><p className="text-white font-bold text-sm">{(processoSelecionado.partes as any)?.polo_ativo || processoSelecionado.polo_ativo}</p></div>
              <div><p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">Polo Passivo</p><p className="text-white font-bold text-sm">{(processoSelecionado.partes as any)?.polo_passivo || processoSelecionado.polo_passivo}</p></div>
            </div>
            {processoSelecionado.resumo_curto && (
              <div className="mb-8">
                <p className="text-white/30 text-[10px] uppercase font-black tracking-widest mb-4">Análise Resumida</p>
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10 relative overflow-hidden"><div className="absolute top-0 left-0 w-1 h-full bg-[#CCA761]/40" /><p className="text-white/70 text-sm leading-relaxed italic font-medium">&quot;{processoSelecionado.resumo_curto}&quot;</p></div>
              </div>
            )}
            {processoSelecionado.proxima_acao_sugerida && (
              <div className="mb-8"><div className="bg-[#CCA761]/10 border border-[#CCA761]/20 rounded-2xl p-6"><div className="flex items-center gap-2 mb-3"><Zap size={16} className="text-[#CCA761]" fill="currentColor" /><p className="text-[#CCA761] text-[10px] font-black uppercase tracking-widest">Ação Sugerida pela IA</p></div><p className="text-white/80 text-sm font-medium leading-relaxed">{processoSelecionado.proxima_acao_sugerida}</p></div></div>
            )}
            {(processoSelecionado.organizacao_ia_json as any)?.tarefas?.length > 0 && (
              <div className="mb-8">
                <p className="text-white/30 text-[10px] uppercase font-black tracking-widest mb-4">Plano de Ação</p>
                <div className="space-y-3">
                  {(processoSelecionado.organizacao_ia_json as any).tarefas.map((t: any, i: number) => (
                    <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/5 flex gap-4 items-start"><div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 shrink-0 border border-zinc-700">{i + 1}</div><div><p className="text-white/80 text-sm font-bold">{t.titulo}</p><p className="text-white/40 text-xs mt-1 leading-relaxed">{t.descricao}</p></div></div>
                  ))}
                </div>
              </div>
            )}
            <div className="mb-12">
              <p className="text-white/30 text-[10px] uppercase font-black tracking-widest mb-6">Histórico Completo</p>
              <div className="space-y-6 relative ml-1">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-zinc-800" />
                {processoSelecionado.movimentacoes?.slice(0, 30).map((m, i) => (
                  <div key={i} className="flex gap-6 group relative">
                    <div className="w-4 h-4 rounded-full border-2 border-zinc-800 bg-[#0a0a0a] group-hover:border-[#CCA761] transition-colors shrink-0 z-10" />
                    <div className="pb-1 transition-all group-hover:translate-x-1"><span className="text-[10px] font-black font-mono text-zinc-600 uppercase">{formatarData((m.data as string) || null)}</span><p className="text-sm text-zinc-300 font-bold mt-1 leading-snug">{((m.titulo ?? m.descricao ?? m.texto) as string) || "Visualização bloqueada."}</p>
                      {m.resumo && <div className="mt-2 p-3 bg-zinc-950 rounded-xl border border-zinc-900 border-l-[#CCA761]/40 border-l-2 shadow-inner"><p className="text-[11px] text-zinc-500 italic leading-relaxed"><span className="text-[#CCA761]/60 font-bold not-italic mr-1">Análise:</span>{m.resumo as string}</p></div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="sticky bottom-0 left-0 right-0 pt-6 pb-2 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent">
               <button onClick={() => { if (processoSelecionado.id) handleOrganizar(processoSelecionado.id); }} disabled={organizando[processoSelecionado.id || ''] === 'loading'} className="w-full h-14 bg-[#CCA761]/10 border border-[#CCA761]/30 text-[#CCA761] text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-[#CCA761]/20 transition-all shadow-xl shadow-[#CCA761]/5 flex items-center justify-center gap-3 disabled:opacity-50">
                 {organizando[processoSelecionado.id || ''] === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                 {organizando[processoSelecionado.id || ''] === 'loading' ? 'Analisando Contexto...' : 'Reorganizar com IA'}
               </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function MonitoramentoPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-black font-black text-yellow-500 tracking-[1em] text-[10px]">MAYUS INITIALIZING...</div>}>
      <MonitoramentoContent />
    </Suspense>
  )
}
