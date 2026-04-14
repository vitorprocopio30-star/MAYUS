// Force Trigger Deploy: 2026-04-10T15:40
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
  Clock,
  Quote
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
  resumo_solicitado_em?: string | null
  proxima_acao_sugerida?: string
  organizacao_ia_json?: any
  escavador_monitoramento_id?: number
  partes?: any
  fontes_tribunais_estao_arquivadas?: boolean
  status_predito?: string
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
  paginas_buscadas?: number | null
  ultima_sincronizacao?: string | null
  fonte?: 'cache' | 'escavador'
}

interface ConfirmacaoLote {
  total?: number
  custo_estimado?: number
  custo_mensal?: number
  ja_monitorados?: number
  novos: number
  gratuitos_disponiveis?: number
  excedente?: number
  preco_por_extra?: number
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
    // Detecta ISO (YYYY-MM-DD) ou Completo
    if (dataStr.includes('-')) {
      const semTime = dataStr.split('T')[0]
      const [a, m, d] = semTime.split('-').map(Number)
      return new Date(a, m - 1, d).getTime() || 0
    }
    // Formato BR (DD/MM/YYYY)
    const [d, m, a] = dataStr.split('/').map(Number)
    const date = new Date(a, m - 1, d)
    return date.getTime() || 0
  } catch { return 0 }
}

function formatarData(data: string | null) {
  if (!data) return '--/--/----'
  try {
    // Se já estiver no formato BR, retorna
    if (data.includes('/') && data.split('/').length === 3) return data
    
    // Se for ISO (YYYY-MM-DD...)
    if (data.includes('-')) {
      const semTime = data.split('T')[0]
      const [a, m, d] = semTime.split('-').map(Number)
      return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`
    }
    
    return data
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
  const custo = Number(dados.custo_mensal ?? dados.custo_estimado ?? 0)
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
             <p className="text-yellow-500 font-black text-lg">R$ {custo.toFixed(2)}</p>
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

function ProcessoCard({ p, onSelect, selecionado, onAction, onRemover, loadingId, organizandoState, onOrganizar, onAbrirResumo }: { p: Processo, onSelect: () => void, selecionado: boolean, onAction: () => void, onRemover: () => void, loadingId: string | null, organizandoState: 'idle' | 'loading' | 'done', onOrganizar: () => void, onAbrirResumo: (r: string) => void }) {
  const d = diasDesde(p.data_ultima_movimentacao)
  const isUpdating = loadingId === p.numero_processo

  return (
    <div className={`group relative bg-[#070707] border transition-all duration-700 rounded-3xl p-6 border-[#CCA761]/60 shadow-[0_0_25px_rgba(204,167,97,0.04)] bg-gradient-to-br from-[#CCA761]/5 via-transparent to-transparent ${selecionado ? 'ring-2 ring-[#CCA761] ring-offset-4 ring-offset-black' : ''}`}>
      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Checkbox Lateral */}
        <div className="hidden lg:flex flex-col items-center pt-1 shrink-0">
           <button onClick={onSelect} className={`w-6 h-6 rounded-lg border transition-all flex items-center justify-center ${selecionado ? 'bg-[#CCA761] border-[#CCA761]' : 'bg-transparent border-zinc-800 hover:border-zinc-700'}`}>
             {selecionado && <CheckCircle size={14} className="text-black" strokeWidth={3} />}
           </button>
        </div>

        {/* Conteúdo Principal */}
        <div className="flex-1 space-y-6">
          {/* Header do Card */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
               <h3 className="text-lg font-black text-[#CCA761] tracking-tight leading-none">{p.numero_processo}</h3>
               <div className="flex items-center gap-2">
                 <span className="px-2.5 py-1 rounded-full bg-[#CCA761]/10 border-[#CCA761]/20 text-[#CCA761]/90 text-[8px] font-black uppercase tracking-widest shadow-[0_0_5px_rgba(204,167,97,0.05)]">{p.tribunal}</span>
                 <StatusBadge status={p.status} />
                 {processoArquivado(p) && (
                   <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-zinc-800 text-zinc-500 border border-zinc-700">
                     ARQUIVADO
                   </span>
                 )}
                 <span className="px-2.5 py-1 rounded-full bg-green-500/5 border border-green-500/20 text-green-500/60 text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5">
                   <RefreshCw size={10} /> SINCRONIZADO
                 </span>
                 {d === 0 && (
                   <span className="px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5">
                     <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse shadow-[0_0_8px_rgba(234,179,8,1)]" /> ATENÇÃO
                   </span>
                 )}
               </div>
            </div>
          </div>

          {/* Partes */}
          <div className="flex flex-col md:flex-row gap-8 items-start">
             <div className="flex-1 space-y-1.5">
                <span className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Ativo</span>
                <p className="text-white text-[13px] font-bold leading-none">{p.polo_ativo}</p>
             </div>
             <div className="flex-1 space-y-1.5">
                <span className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Passivo</span>
                <p className="text-white text-[13px] font-bold leading-none">{p.polo_passivo}</p>
             </div>
          </div>

          {/* Área de Resumo Preview */}
          {p.resumo_curto && (
            <div className="relative group/resumo cursor-pointer" onClick={() => onAbrirResumo(p.resumo_curto!)}>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 transition-all group-hover/resumo:bg-white/10">
                 <p className="text-zinc-400 text-[11px] leading-relaxed italic line-clamp-3">
                    {p.resumo_curto}
                 </p>
                 <div className="mt-2 flex items-center gap-1.5 text-[#CCA761] text-[9px] font-black uppercase tracking-widest">
                    <ChevronDown size={12} /> LER MAIS
                 </div>
              </div>
            </div>
          )}

          {!p.resumo_curto && p.resumo_solicitado_em && (
            <div className="bg-[#CCA761]/5 border border-[#CCA761]/20 rounded-2xl p-4">
              <p className="text-[#CCA761]/90 text-[10px] font-black uppercase tracking-widest mb-1">
                Resumo em processamento
              </p>
              <p className="text-zinc-500 text-[11px] leading-relaxed">
                O monitoramento foi criado e o resumo da IA foi solicitado. Aguarde a sincronização do Escavador.
              </p>
            </div>
          )}

          {/* Rodapé Interno */}
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 bg-green-500/5 border border-green-500/10 px-3 py-1.5 rounded-full">
                <div className="w-2 h-2 rounded-full bg-green-500/60 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                <span className="text-green-500/80 text-[9px] font-black uppercase tracking-[0.2em]">Monitoramento Normal</span>
             </div>
             {d !== null && (
                <div className={`px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest flex items-center gap-3 transition-all duration-700
                  ${d === 0 
                    ? 'bg-green-500/10 border-green-500/30 text-green-400/90 shadow-[0_0_12px_rgba(34,197,94,0.15)]' 
                    : 'bg-[#CCA761]/5 border-[#CCA761]/10 text-[#CCA761]/70 shadow-[0_0_8px_rgba(204,167,97,0.08)]'
                  }`}
                >
                   <span className="opacity-60">{formatarData(p.data_ultima_movimentacao)}</span>
                   <div className="w-px h-3 bg-current opacity-20" />
                   {d === 0 && <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.5)]" />}
                   <span className="tracking-tighter">{d === 0 ? 'Atualizado Hoje' : `${d}d atrás`}</span>
                </div>
             )}
          </div>
        </div>

        {/* Ações Laterais */}
        <div className="flex flex-col gap-2 shrink-0 justify-center min-w-[160px]">
           {!p.monitorado ? (
             <button onClick={onAction} disabled={isUpdating} className="h-12 bg-[#CCA761] hover:bg-[#b89554] text-black text-[10px] font-black uppercase rounded-2xl transition-all flex items-center justify-center gap-2.5 shadow-xl shadow-[#CCA761]/10">
               {isUpdating ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} fill="currentColor" />}
               Monitorar
             </button>
           ) : (
             <>
               <button onClick={onRemover} disabled={isUpdating} className="h-11 bg-zinc-950 hover:bg-red-500/5 border border-zinc-900 hover:border-red-500/20 text-zinc-700 hover:text-red-500 text-[10px] font-black uppercase rounded-2xl transition-all flex items-center justify-center gap-2">
                 <X size={14} /> Remover
               </button>
               <button 
                onClick={onOrganizar}
                disabled={organizandoState === 'loading'}
                className="h-11 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white text-[10px] font-black uppercase rounded-2xl transition-all flex items-center justify-center gap-2"
               >
                 <Sparkles size={14} /> Organizar IA
               </button>
             </>
           )}
        </div>
      </div>
    </div>
  )
}

function processoArquivado(p: Processo): boolean {
  return (
    p.fontes_tribunais_estao_arquivadas === true ||
    p.status_predito === 'INATIVO' ||
    p.status === 'ARQUIVADO'
  )
}

// ─── Componente Principal ───

function MonitoramentoContent() {
  const [pagina, setPagina] = useState(1)
  const [sincronizandoBase, setSincronizandoBase] = useState(false)
  const [baseSincronizada, setBaseSincronizada] = useState(false)
  
  const [tab, setTab] = useState<'oab' | 'numero' | 'cpf'>('oab')
  const [importarAberto, setImportarAberto] = useState(false)
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
  const [lastExternalSyncAt, setLastExternalSyncAt] = useState<string | null>(null)

  // Estado para os botões "Organizar IA"
  const [organizando, setOrganizando] = useState<Record<string, 'idle' | 'loading' | 'done'>>({})

  // Estado para o Modo de Leitura (Documento)
  const [resumoModal, setResumoModal] = useState<string | null>(null)

  // Estado para "Organizar Todos"
  const [organizandoTodos, setOrganizandoTodos] = useState(false)
  const [progressoOrg, setProgressoOrg] = useState(0)

  const PAGE_SIZE = 20

  const setPage = (p: number) => {
    setPagina(p)
    window.scrollTo({ top: 300, behavior: 'smooth' })
  }

  const carregarBaseOab = useCallback(async (estado: string, numero: string) => {
    if (!numero.trim()) return
    try {
      const res = await fetch('/api/escavador/base-oab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oab_estado: estado,
          oab_numero: numero.trim(),
          source: 'monitoramento_ui_cached_load'
        })
      })
      const data = await res.json()
      if (!res.ok) return
      if (!data?.exists) {
        setBaseSincronizada(false)
        return
      }
      setResult(data)
      setLastExternalSyncAt(data?.ultima_sincronizacao ?? null)
      setBaseSincronizada(true)
    } catch {}
  }, [])

  useEffect(() => {
    const s = localStorage.getItem('mayus_oab_numero')
    const e = localStorage.getItem('mayus_oab_estado')
    if (s) setOabNumero(s)
    if (e) setOabEstado(e)

    if (s) {
      carregarBaseOab(e || 'RJ', s)
    }
  }, [carregarBaseOab])

  const carregarBaseSalva = useCallback(async () => {
    if (!oabNumero.trim()) return
    setError(null)
    setFeedback(null)
    setLoading(true)
    try {
      localStorage.setItem('mayus_oab_numero', oabNumero.trim())
      localStorage.setItem('mayus_oab_estado', oabEstado)
      await carregarBaseOab(oabEstado, oabNumero.trim())
      setFeedback('Base local carregada sem consumo de créditos do Escavador.')
    } finally {
      setLoading(false)
    }
  }, [carregarBaseOab, oabEstado, oabNumero])

  const buscar = useCallback(async () => {
    if (!oabNumero.trim()) return
    setLoading(true); setSincronizandoBase(true); setError(null); setFeedback(null); setSelecionados(new Set()); setPagina(1)
    try {
      localStorage.setItem('mayus_oab_numero', oabNumero.trim())
      localStorage.setItem('mayus_oab_estado', oabEstado)

      const res = await fetch('/api/escavador/sincronizar-oab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oab_estado: oabEstado,
          oab_numero: oabNumero.trim(),
          source: 'monitoramento_ui_sync_button',
          allow_paid_search: true
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Falha na varredura')
      setResult(data)
      setLastExternalSyncAt(data?.ultima_sincronizacao ?? new Date().toISOString())
      setBaseSincronizada(true)
      const qtdArquivados = (data.processos || []).filter((p: Processo) => processoArquivado(p)).length
      const totalApi = Number(data.total || 0)
      const totalBase = Number(data.total_retornado || 0)
      const diffInfo = totalApi > totalBase ? ` (${totalApi} na API)` : ''
      setFeedback(`Base sincronizada: ${totalBase} processos carregados${diffInfo} (${qtdArquivados} arquivados).`)
    } catch (e) {
      console.error('Erro na varredura:', e)
      let msg = 'Falha na varredura'
      if (e instanceof Error) {
        msg = e.message
        // Tentar extrair mensagem se for string JSON
        try {
          const parsed = JSON.parse(e.message)
          if (parsed.MESSAGE) msg = parsed.MESSAGE
          else if (parsed.error) msg = parsed.error
        } catch {}
      }
      setError(msg)
    } finally {
      setSincronizandoBase(false)
      setLoading(false)
    }
  }, [oabEstado, oabNumero])
  const monitorarLote = useCallback(async (processos: Processo[]) => {
    const monitoramentoIndividual = processos.length === 1
    const numeroAlvo = monitoramentoIndividual ? processos[0]?.numero_processo ?? null : null

    const ativos = processos.filter((p) => !processoArquivado(p))
    const qtdArquivados = processos.length - ativos.length

    if (ativos.length === 0) {
      setFeedback('Todos os processos selecionados estão arquivados — nenhum foi monitorado.')
      return
    }

    if (numeroAlvo) {
      setLoadingId(numeroAlvo)
      setFeedback('Enviando solicitação de monitoramento...')
    }

    setImportandoLote(true)
    try {
      const res = await fetch('/api/monitoramento/importar-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processos: ativos, confirmar_custo: false })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao monitorar processos no Escavador')
      }
      if (data.requer_confirmacao) {
        setConfirmacao({ ...data, processosParaImportar: ativos })
        setFeedback('Confirmação de investimento necessária para concluir o monitoramento.')
        return
      }

      const sucessosLista = Array.isArray(data.sucessos_monitoramento) ? data.sucessos_monitoramento : []
      const sucessosSet = new Set(sucessosLista.map((s: any) => s.numero_processo))
      const nowIso = new Date().toISOString()
      setResult(prev => prev ? {
        ...prev,
        processos: prev.processos.map(p => sucessosSet.has(p.numero_processo)
          ? { ...p, monitorado: true, resumo_solicitado_em: nowIso }
          : p),
        billing: { ...prev.billing, total_ja_monitorados: prev.billing.total_ja_monitorados + Number(data.importados || 0) }
      } : prev)
      setSelecionados(new Set())

      const falhasMonitoramento = Array.isArray(data.falhas_monitoramento) ? data.falhas_monitoramento.length : 0
      const resumosSolicitados = Number(data.resumos_solicitados || 0)
      const primeiraFalha = Array.isArray(data.falhas_monitoramento) && data.falhas_monitoramento.length > 0
        ? data.falhas_monitoramento[0]
        : null

      if (Number(data.importados || 0) === 0) {
        const msg =
          data?.mensagem ||
          primeiraFalha?.motivo ||
          'Nenhum monitoramento foi criado para os processos selecionados.'
        setError(msg)
        setFeedback(null)
        return
      }

      setFeedback(
        `${qtdArquivados > 0 ? `⚠️ ${qtdArquivados} arquivados ignorados. ` : ''}` +
        `✅ ${Number(data.importados || 0)} monitorados. ` +
        `🧠 ${resumosSolicitados} resumo(s) solicitado(s).` +
        `${falhasMonitoramento > 0 ? ` ❌ ${falhasMonitoramento} falha(s) de monitoramento.` : ''}`
      )
      if (monitoramentoIndividual && primeiraFalha?.motivo) setError(primeiraFalha.motivo)
    } catch (e: any) {
      setError(e?.message || 'Erro ao monitorar processos')
    } finally {
      setImportandoLote(false)
      if (numeroAlvo) setLoadingId(null)
    }
  }, [])

  const confirmarMonitoramentoLote = useCallback(async () => {
    if (!confirmacao) return

    const monitoramentoIndividual = confirmacao.processosParaImportar.length === 1
    const numeroAlvo = monitoramentoIndividual ? confirmacao.processosParaImportar[0]?.numero_processo ?? null : null

    setConfirmandoLote(true)
    setError(null)
    if (numeroAlvo) setLoadingId(numeroAlvo)

    try {
      const res = await fetch('/api/monitoramento/importar-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processos: confirmacao.processosParaImportar, confirmar_custo: true })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao confirmar monitoramento no Escavador')
      }

      const sucessosLista = Array.isArray(data.sucessos_monitoramento) ? data.sucessos_monitoramento : []
      const sucessosSet = new Set(sucessosLista.map((s: any) => s.numero_processo))
      const nowIso = new Date().toISOString()
      setResult(prev => prev ? {
        ...prev,
        processos: prev.processos.map(p => sucessosSet.has(p.numero_processo)
          ? { ...p, monitorado: true, resumo_solicitado_em: nowIso }
          : p),
        billing: { ...prev.billing, total_ja_monitorados: prev.billing.total_ja_monitorados + Number(data.importados || 0) }
      } : prev)

      const falhasMonitoramento = Array.isArray(data.falhas_monitoramento) ? data.falhas_monitoramento.length : 0
      const resumosSolicitados = Number(data.resumos_solicitados || 0)

      if (Number(data.importados || 0) === 0) {
        const primeiraFalha = Array.isArray(data.falhas_monitoramento) && data.falhas_monitoramento.length > 0
          ? data.falhas_monitoramento[0]
          : null
        setError(data?.mensagem || primeiraFalha?.motivo || 'Nenhum monitoramento foi criado após confirmação.')
        setFeedback(null)
        return
      }

      setFeedback(
        `✅ ${Number(data.importados || 0)} monitorados após confirmação de custo. ` +
        `🧠 ${resumosSolicitados} resumo(s) solicitado(s).` +
        `${falhasMonitoramento > 0 ? ` ❌ ${falhasMonitoramento} falha(s) de monitoramento.` : ''}`
      )
      setSelecionados(new Set())
      setConfirmacao(null)
    } catch (e: any) {
      setError(e?.message || 'Erro ao confirmar monitoramento')
    } finally {
      setConfirmandoLote(false)
      if (numeroAlvo) setLoadingId(null)
    }
  }, [confirmacao])

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
        else if (filtroStatus === 'ARQUIVADO') matchStatus = processoArquivado(p)
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

  const totalProcessosBase = result?.total_retornado ?? result?.processos.length ?? 0
  const totalArquivadosAmostra = result?.processos.filter((p) => processoArquivado(p)).length ?? 0
  const totalAtivosPainel = Math.max(0, totalProcessosBase - totalArquivadosAmostra)
  const totalAtivosPendentes = result?.processos.filter((p) => !p.monitorado && !processoArquivado(p)).length ?? 0
  const diferencaTotal = result?.total && result?.total_retornado && result.total !== result.total_retornado
  const minutosDesdeUltimaSync = useMemo(() => {
    const base = lastExternalSyncAt || result?.ultima_sincronizacao || null
    if (!base) return null
    const ts = new Date(base).getTime()
    if (Number.isNaN(ts)) return null
    return Math.max(0, Math.floor((Date.now() - ts) / 60000))
  }, [lastExternalSyncAt, result?.ultima_sincronizacao])

  const renderPaginacao = () => (
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
  )

  const handleFiltroStatusChange = (f: FilterStatus) => { setFiltroStatus(f); setPagina(1); }
  const handleSearchChange = (v: string) => { setSearch(v); setPagina(1); }

  return (
    <>
      {confirmacao && <ModalConfirmacaoCusto dados={confirmacao} onConfirmar={confirmarMonitoramentoLote} onCancelar={() => setConfirmacao(null)} loading={confirmandoLote} />}

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
             <div className="flex flex-col items-end gap-2">
               <div className="bg-zinc-900 px-5 py-2.5 rounded-2xl border border-zinc-800 flex items-center gap-4 shadow-inner">
                  <div className="flex flex-col items-end border-r border-zinc-800 pr-4">
                     <span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest leading-none mb-1">Responsável</span>
                     <span className="text-yellow-500 font-bold uppercase tracking-wide drop-shadow-[0_0_8px_rgba(234,179,8,0.4)]">{result.advogado_nome}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col border-l border-zinc-800 pl-4">
                       <span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest leading-none mb-1">Processos</span>
                       <span className="text-white font-black text-sm leading-none">{totalProcessosBase}</span>
                    </div>
                    <div className="flex flex-col border-l border-zinc-800 pl-4">
                       <span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest leading-none mb-1">Ativos</span>
                       <span className="text-green-400 font-black text-sm leading-none">{totalAtivosPainel}</span>
                    </div>
                    <div className="flex flex-col border-l border-zinc-800 pl-4">
                       <span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest leading-none mb-1">Arquivados</span>
                       <span className="text-red-400 font-black text-sm leading-none">{totalArquivadosAmostra}</span>
                    </div>
                  </div>
                </div>
                {diferencaTotal && (
                  <p className="text-[9px] text-zinc-500 font-black uppercase tracking-widest text-right">
                    Fonte Escavador: {result.total} | Base consolidada: {result.total_retornado}
                  </p>
                )}
             </div>
           )}
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
                  {!selecionados.size && totalAtivosPendentes > 0 && (
                     <button onClick={() => monitorarLote(result.processos.filter(p => p.status === 'ATIVO' && !p.monitorado))} className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-yellow-500/10 border-b-2 border-yellow-700">
                        Monitorar {totalAtivosPendentes} Ativos
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
                    <button key={f} onClick={() => handleFiltroStatusChange(f)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap border ${filtroStatus === f ? 'bg-[#CCA761] text-black border-[#CCA761] shadow-[0_0_15px_rgba(204,167,97,0.2)]' : 'text-zinc-600 bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
                      {f === 'nao_monitorado' ? 'PENDENTES' : f === 'monitorado' ? 'MONITORADOS' : f}
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
                renderPaginacao()
              )}
              <div className="grid grid-cols-1 gap-4">
                {processosPagina.map(p => (
                  <ProcessoCard key={p.numero_processo} p={p} onSelect={() => { const next = new Set(selecionados); if (next.has(p.numero_processo)) next.delete(p.numero_processo); else next.add(p.numero_processo); setSelecionados(next); }} selecionado={selecionados.has(p.numero_processo)} onAction={() => monitorarLote([p])} onRemover={() => desmonitorar(p)} loadingId={loadingId} organizandoState={organizando[p.id || ''] || 'idle'} onOrganizar={() => handleOrganizar(p.id || '')} onAbrirResumo={(r) => setResumoModal(r)} />
                ))}
              </div>
              {processosFiltrados.length === 0 && (
                <div className="py-32 text-center space-y-4 bg-zinc-900/10 border border-dashed border-zinc-800 rounded-3xl">
                   <div className="w-16 h-16 rounded-3xl bg-zinc-900 flex items-center justify-center mx-auto text-zinc-800"><LayoutList size={28} /></div>
                   <p className="text-zinc-500 text-xs font-black uppercase tracking-[0.3em]">Nenhum Alvo Identificado</p>
                </div>
              )}
              {totalPages > 1 && renderPaginacao()}
            </div>

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

        <div className="mt-4 bg-zinc-900/30 border border-zinc-800 rounded-2xl p-3">
          <button
            onClick={() => setImportarAberto((prev) => !prev)}
            className="w-full flex items-center justify-between px-3 py-3 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-all"
          >
            <span className="text-zinc-200 text-[11px] font-black uppercase tracking-[0.2em]">
              + Importar Processos por OAB
            </span>
            {importarAberto ? <ChevronUp size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}
          </button>

          {importarAberto && (
            <div className="mt-4 space-y-4">
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
                  <input value={oabNumero} onChange={e => setOabNumero(e.target.value)} onKeyDown={e => e.key === 'Enter' && carregarBaseSalva()} placeholder="Digite os dados para busca..." className="w-full h-full bg-zinc-950 border border-zinc-900 rounded-xl pl-11 pr-4 text-xs text-white placeholder-zinc-800 outline-none focus:border-yellow-500/50 font-medium" />
                </div>
                <button onClick={carregarBaseSalva} disabled={loading} className="px-6 h-12 bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-black rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl shadow-black/30 active:scale-95 border border-zinc-700 shrink-0 uppercase tracking-widest">
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} fill="currentColor" />}
                  CARREGAR BASE GRAVADA
                </button>
                <button
                  onClick={() => {
                    const bloqueioCurto = minutosDesdeUltimaSync !== null && minutosDesdeUltimaSync < 3
                    if (bloqueioCurto) {
                      setFeedback(`Sincronização externa realizada há ${minutosDesdeUltimaSync} min. Aguarde ao menos 3 min para evitar nova cobrança imediata.`)
                      return
                    }
                    const confirmou = window.confirm('Atualizar do Escavador consome créditos. Deseja continuar?')
                    if (confirmou) buscar()
                  }}
                  disabled={loading}
                  className="px-6 h-12 bg-yellow-500 hover:bg-yellow-400 text-black text-[11px] font-black rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2.5 shadow-xl shadow-yellow-500/20 active:scale-95 border-b-4 border-yellow-600 shrink-0 uppercase tracking-widest"
                >
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} fill="currentColor" />}
                  {loading ? (sincronizandoBase ? 'SINCRONIZANDO...' : 'BUSCANDO...') : 'ATUALIZAR ESCAVADOR'}
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest px-1">
                Carregar base usa dados salvos. Atualizar Escavador pode cobrar por requisição.
              </p>
              {result?.ultima_sincronizacao && (
                <p className="text-[10px] text-zinc-600 px-1">
                  Última sincronização externa: {formatarData(result.ultima_sincronizacao)}{result?.paginas_buscadas ? ` · ${result.paginas_buscadas} página(s)` : ''}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {resumoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
          <div 
            className="absolute inset-0 bg-black/90 backdrop-blur-xl animate-in fade-in duration-500"
            onClick={() => setResumoModal(null)}
          />
          <div className="relative bg-[#0a0a0a] border border-[#CCA761]/30 rounded-3xl w-full max-w-4xl z-10 max-h-[90vh] overflow-hidden flex flex-col shadow-[0_0_100px_rgba(204,167,97,0.1)] animate-in zoom-in-95 duration-500">
            {/* Cabeçalho do Documento */}
            <div className="p-6 border-b border-zinc-900 bg-zinc-950/50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#CCA761]/10 flex items-center justify-center border border-[#CCA761]/20">
                  <Shield size={20} className="text-[#CCA761]" />
                </div>
                <div>
                  <h2 className="text-white font-black text-sm uppercase tracking-widest">Análise Estratégica MAYUS</h2>
                  <p className="text-[#CCA761] text-[10px] font-bold uppercase tracking-tighter opacity-60">Relatório Consolidado de Inteligência</p>
                </div>
              </div>
              <button 
                onClick={() => setResumoModal(null)}
                className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-500 hover:text-white transition-all hover:rotate-90"
              >
                <X size={20} />
              </button>
            </div>

            {/* Corpo do "Documento" */}
            <div className="flex-1 overflow-y-auto p-12 bg-zinc-900/10">
              <div className="max-w-2xl mx-auto space-y-12">
                 <div className="space-y-4">
                    <div className="w-12 h-1 bg-[#CCA761]/30 rounded-full" />
                    <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em]">Resumo do Alvo</p>
                 </div>
                 
                 <div className="relative">
                    <Quote size={40} className="absolute -top-6 -left-8 text-[#CCA761]/5" />
                    <p 
                      className="text-white/90 text-xl leading-relaxed font-medium" 
                      style={{ fontFamily: 'Cormorant Garamond, serif' }}
                    >
                      {resumoModal}
                    </p>
                 </div>

                 <div className="pt-12 border-t border-zinc-900 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <CheckCircle size={14} className="text-green-500" />
                       <span className="text-zinc-600 text-[9px] font-black uppercase tracking-widest">Autenticado por MAYUS IA</span>
                    </div>
                    <p className="text-zinc-800 text-[8px] font-black uppercase tracking-[0.4em]">PROPRIEDADE ESTRATÉGICA</p>
                 </div>
              </div>
            </div>

            {/* Rodapé Lateral */}
            <div className="p-4 bg-zinc-950 border-t border-zinc-900 flex justify-end">
               <button onClick={() => setResumoModal(null)} className="px-8 py-3 bg-[#CCA761] hover:bg-[#b89554] text-black text-[10px] font-black uppercase rounded-xl transition-all shadow-lg shadow-[#CCA761]/10">
                 CONCLUIR LEITURA
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
