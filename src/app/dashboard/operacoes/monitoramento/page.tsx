'use client'

import { useState, useCallback, Suspense, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Search, Shield, AlertCircle, CheckCircle,
  ChevronDown, ChevronUp, Zap, Eye, Filter, RefreshCw,
  AlertTriangle, X, DollarSign, ArrowUpDown, LayoutList, CheckSquare, Square, Trash2, FileText, CloudCheck, Sparkles, Loader2
} from 'lucide-react'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Processo {
  numero_processo: string
  tribunal: string
  assunto: string
  status: string
  polo_ativo: string
  polo_passivo: string
  valor_causa: string | null
  data_distribuicao: string | null
  comarca: string | null
  vara: string | null
  classe_processual: string | null
  data_ultima_movimentacao: string | null
  ultima_movimentacao_texto: string | null
  ultima_movimentacao_resumo: string | null
  fase_atual: string
  escavador_id: string
  monitorado: boolean
  movimentacoes: Record<string, unknown>[]
  resumo_curto?: string | null
  id?: string
}

interface BillingInfo {
  total_ja_monitorados: number
  gratuitos: number
  disponivel_sem_custo: number
  ativos_nao_monitorados: number
  ja_monitorados_desta_oab: number
  excedente_se_prosseguir: number
  custo_estimado_mes: number
  preco_por_extra: number
}

interface BuscaResult {
  processos: Processo[]
  total: number
  total_retornado: number
  advogado_nome: string
  paginas_buscadas: number
  billing: BillingInfo
}

interface ConfirmacaoLote {
  novos: number
  gratuitos_disponiveis: number
  excedente: number
  custo_mensal: number
  preco_por_extra: number
  mensagem: string
  processosParaImportar: Processo[]
}

type FilterStatus = 'TODOS' | 'ATIVO' | 'ARQUIVADO' | 'monitorado' | 'nao_monitorado'
type SortOrder = 'distribuicao' | 'urgencia' | 'tribunal'
type ResumoState = 'idle' | 'loading' | 'done' | 'error'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  ATIVO: 'text-green-400 bg-green-400/10',
  ARQUIVADO: 'text-zinc-400 bg-zinc-400/10',
  BAIXADO: 'text-red-400 bg-red-400/10',
}

// CORREÇÃO 2: Função de formatação de data em DD/MM/YYYY
function formatarData(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo'
  })
}

function parseDataBR(d: string | null) {
  if (!d) return 0
  if (d.includes('/')) {
    const [dia, mes, ano] = d.split('/')
    return new Date(`${ano}-${mes}-${dia}`).getTime()
  }
  return new Date(d || 0).getTime()
}

function diasDesde(data: string | null) {
  if (!data) return null
  const timestamp = parseDataBR(data)
  if (timestamp === 0) return null
  const diff = Date.now() - timestamp
  if (diff < 0) return 0
  return Math.floor(diff / 86400000)
}

function UrgenciaBadge({ dias }: { dias: number | null }) {
  if (dias === null) return <span className="text-xs text-zinc-600">Sem registro</span>
  if (dias > 30) return <span className="text-xs text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20 font-bold">+{dias}d sem mov.</span>
  if (dias === 0) return <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20 font-bold">Atualizado hoje</span>
  return <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20 font-bold">{dias}d atrás</span>
}

// ─── Componentes de UI ────────────────────────────────────────────────────────

function ModalConfirmacaoCusto({ dados, onConfirmar, onCancelar, loading }: {
  dados: ConfirmacaoLote; onConfirmar: () => void; onCancelar: () => void; loading: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-yellow-500/40 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-yellow-500">
            <AlertTriangle size={20} />
            <span className="font-bold text-base uppercase tracking-tight">Custo do Monitoramento</span>
          </div>
          <button onClick={onCancelar} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="bg-zinc-800/60 rounded-2xl p-5 space-y-4 text-sm border border-zinc-800">
          <div className="flex justify-between"><span className="text-zinc-400 font-medium">Novos Alvos</span><span className="text-white font-bold">{dados.novos}</span></div>
          <div className="flex justify-between"><span className="text-zinc-400 font-medium">No Plano</span><span className="text-green-400 font-bold">{dados.gratuitos_disponiveis} grátis</span></div>
          <div className="h-px bg-zinc-700" />
          <div className="flex justify-between font-bold text-lg"><span className="text-white">Custo Extra</span><span className="text-yellow-500">R$ {dados.custo_mensal.toFixed(2)}<span className="text-[10px] ml-1">/mês</span></span></div>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancelar} disabled={loading} className="flex-1 py-3 rounded-2xl border border-zinc-700 text-zinc-500 hover:text-zinc-300 text-xs font-bold uppercase transition-all">Cancelar</button>
          <button onClick={onConfirmar} disabled={loading} className="flex-1 py-3 rounded-2xl bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black uppercase transition-all shadow-lg shadow-yellow-500/20 flex items-center justify-center gap-2">
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <DollarSign size={14} />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

function BillingBar({ billing }: { billing: BillingInfo }) {
  const pct = Math.min(100, (billing.total_ja_monitorados / Math.max(billing.gratuitos, 1)) * 100)
  const quaseCheno = pct >= 80
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 flex items-center gap-6">
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
          <span className="text-zinc-500">Ocupação do Plano</span>
          <span className={quaseCheno ? 'text-yellow-500' : 'text-zinc-400'}>{billing.total_ja_monitorados} de {billing.gratuitos} usados</span>
        </div>
        <div className="h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
          <div className={`h-full rounded-full transition-all duration-700 ${quaseCheno ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[10px] text-zinc-600 font-bold uppercase">
          {billing.disponivel_sem_custo > 0
            ? `${billing.disponivel_sem_custo} espaços disponíveis sem cobrança extra`
            : `Limite atingido — excedentes monitorados por R$${billing.preco_por_extra.toFixed(2)}/processo`}
        </p>
      </div>
    </div>
  )
}

// CORREÇÃO 1: Componente de Paginação Premium
function Pagination({ atual, total, totalProcessos, onChange }: { atual: number; total: number; totalProcessos: number; onChange: (p: number) => void }) {
  if (total <= 1) return null

  const start = Math.max(1, atual - 2)
  const pages = Array.from({ length: Math.min(5, total) }, (_, i) => start + i).filter(p => p <= total)

  return (
    <div className="flex items-center justify-between mt-6 px-2">
      <span className="text-white/40 text-sm">
        {totalProcessos} processos · página {atual} de {total}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onChange(Math.max(1, atual - 1))}
          disabled={atual === 1}
          className="px-4 py-2 rounded-lg border border-white/10 text-white/70 text-sm disabled:opacity-30 hover:bg-white/5 transition-colors"
        >
          ← Anterior
        </button>

        {pages.map(page => (
          <button
            key={page}
            onClick={() => onChange(page)}
            className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors
              ${page === atual
                ? 'bg-[#CCA761] text-black'
                : 'border border-white/10 text-white/70 hover:bg-white/5'
              }`}
          >
            {page}
          </button>
        ))}

        <button
          onClick={() => onChange(Math.min(total, atual + 1))}
          disabled={atual === total}
          className="px-4 py-2 rounded-lg border border-white/10 text-white/70 text-sm disabled:opacity-30 hover:bg-white/5 transition-colors"
        >
          Próxima →
        </button>
      </div>
    </div>
  )
}

function ProcessoCard({ p, onAction, onRemover, selecionado, onSelect, resumoOficial, onResumirOficial, loadingId, resumoIAState, onSolicitarResumoIA }: {
  p: Processo; onAction: () => void; onRemover: () => void; selecionado: boolean; onSelect: () => void;
  resumoOficial?: { texto?: string, status?: string, loading: boolean }; onResumirOficial: () => void;
  loadingId: string | null
  resumoIAState: { state: ResumoState; texto?: string }
  onSolicitarResumoIA: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isLoading = loadingId === p.numero_processo
  const dias = diasDesde(p.data_ultima_movimentacao)

  return (
    <div className={`rounded-2xl border transition-all ${p.monitorado ? 'border-yellow-500/30 bg-yellow-500/[0.03]' : selecionado ? 'border-yellow-500/50 bg-yellow-500/[0.05]' : 'border-zinc-800 bg-zinc-900/40'} hover:border-zinc-700`}>
      <div className="p-5 flex items-start gap-4">
        {/* Checkbox */}
        <div className="mt-1 shrink-0 cursor-pointer" onClick={onSelect}>
          {p.monitorado ? (
            <div className="w-5 h-5 rounded-md bg-yellow-500 flex items-center justify-center shadow-lg shadow-yellow-500/20">
              <CheckCircle size={14} className="text-black" />
            </div>
          ) : selecionado ? (
            <CheckSquare size={20} className="text-yellow-500" />
          ) : (
            <Square size={20} className="text-zinc-800 hover:text-zinc-600 transition-colors" />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          {/* Header Card */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-sm text-zinc-100 font-bold tracking-tight">{p.numero_processo}</span>
            <span className="text-[10px] uppercase font-bold bg-zinc-800 text-zinc-500 px-2.5 py-0.5 rounded-lg">{p.tribunal}</span>
            <span className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-lg ${STATUS_COLOR[p.status] ?? 'text-zinc-600 bg-zinc-900'}`}>{p.status}</span>
            {p.monitorado && (
              <div className="flex items-center gap-1 px-2.5 py-0.5 bg-green-500/10 border border-green-500/20 rounded-lg text-[10px] uppercase font-black text-green-400">
                 <CloudCheck size={12} /> Sincronizado
              </div>
            )}
          </div>

          {/* Partes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <div className="truncate"><span className="text-zinc-500 text-[10px] font-black mr-2 uppercase tracking-tighter">ATIVO</span><span className="text-zinc-200 font-bold">{p.polo_ativo}</span></div>
            <div className="truncate"><span className="text-zinc-500 text-[10px] font-black mr-2 uppercase tracking-tighter">PASSIVO</span><span className="text-zinc-200 font-bold">{p.polo_passivo}</span></div>
          </div>

          {/* CORREÇÃO 2: Datas formatadas em DD/MM/YYYY */}
          <div className="flex items-start gap-3">
             <div className="w-1 rounded-full bg-yellow-500/20 shrink-0 self-stretch" />
             <div className="space-y-1.5 flex-1">
                <p className="text-[11px] text-zinc-400 leading-relaxed font-medium line-clamp-2">
                  {p.ultima_movimentacao_texto || "Sem detalhes da última movimentação."}
                </p>
                <div className="flex items-center gap-4">
                   {p.data_ultima_movimentacao && <span className="text-[10px] text-zinc-600 font-black uppercase">{formatarData(p.data_ultima_movimentacao)}</span>}
                   <UrgenciaBadge dias={dias} />
                </div>
             </div>
          </div>

          {/* Resumo Oficial do Tribunal */}
          {p.monitorado && (
            <div className="p-4 bg-zinc-950/50 border border-zinc-800 rounded-2xl space-y-3">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                     <FileText size={14} className="text-yellow-500/50" /> Resumo Oficial (Tribunal)
                  </div>
                  {!resumoOficial?.texto && !resumoOficial?.loading && (
                    <button onClick={onResumirOficial} className="px-3 py-1 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 text-[10px] font-black uppercase rounded-lg border border-yellow-500/20 transition-all">Solicitar Inteligência</button>
                  )}
               </div>
               {resumoOficial?.loading ? (
                 <div className="flex items-center gap-2 text-zinc-600 italic text-xs py-1">
                   <div className="w-3 h-3 rounded-full border-2 border-yellow-500/20 border-t-yellow-500 animate-spin" /> Conectando ao robô do tribunal...
                 </div>
               ) : resumoOficial?.status === 'PENDENTE' ? (
                 <div className="flex items-center gap-2 text-yellow-500/60 italic text-xs px-2 py-1 bg-yellow-500/5 rounded-lg border border-yellow-500/10">
                   <AlertCircle size={14} /> Solicitação em processamento pelo tribunal.
                 </div>
               ) : resumoOficial?.texto ? (
                 <p className="text-xs text-zinc-300 leading-relaxed italic border-l-2 border-yellow-500/30 pl-3">&quot;{resumoOficial.texto}&quot;</p>
               ) : (
                 <p className="text-[10px] text-zinc-600 italic tracking-tight font-medium uppercase">Vigilância ativa. Clique para gerar análise oficial.</p>
               )}

               {/* CORREÇÃO 3: Resumo de IA via Escavador */}
               <div className="pt-3 border-t border-zinc-800/60">
                 {resumoIAState.state === 'done' && resumoIAState.texto ? (
                   <div className="p-3 rounded-lg bg-[#CCA761]/10 border border-[#CCA761]/20">
                     <p className="text-xs text-[#CCA761] font-medium mb-1 flex items-center gap-1">
                       <Sparkles size={12} /> RESUMO INTELIGENTE
                     </p>
                     <p className="text-white/80 text-sm leading-relaxed">{resumoIAState.texto}</p>
                   </div>
                 ) : resumoIAState.state === 'loading' ? (
                   <button disabled className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#CCA761]/5 text-[#CCA761]/60 text-[10px] font-black uppercase opacity-60 cursor-not-allowed border border-[#CCA761]/10">
                     <Loader2 size={12} className="animate-spin" /> Analisando...
                   </button>
                 ) : resumoIAState.state === 'error' ? (
                   <p className="text-[10px] text-red-400 font-bold uppercase">Erro ao solicitar resumo. Tente novamente.</p>
                 ) : (
                   <button onClick={onSolicitarResumoIA} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#CCA761]/5 hover:bg-[#CCA761]/10 text-[#CCA761] text-[10px] font-black uppercase transition-all border border-[#CCA761]/10">
                     <Sparkles size={12} /> Resumo IA (R$ 0,05)
                   </button>
                 )}
               </div>
            </div>
          )}

          {/* Expandido (Histórico) */}
          {expanded && (
            <div className="pt-4 mt-4 border-t border-zinc-800/50 space-y-4 animate-in fade-in duration-300">
               <div>
                  <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.3em] mb-4 text-center">Linha do Tempo de Andamentos</p>
                  <div className="space-y-4">
                    {p.movimentacoes?.slice(0, 15).map((m, i) => (
                      <div key={i} className="flex gap-4 group">
                        <div className="flex flex-col items-center shrink-0">
                           <div className="w-2 h-2 rounded-full border-2 border-zinc-800 group-hover:border-yellow-500 transition-colors" />
                           <div className="w-px flex-1 bg-zinc-800" />
                        </div>
                        <div className="pb-3 flex-1">
                          {/* CORREÇÃO 2: datas do histórico também formatadas */}
                          <span className="text-[10px] font-black font-mono text-zinc-600 uppercase tracking-tighter">{formatarData((m.data as string) || null)}</span>
                          <p className="text-[11px] text-zinc-400 font-bold mt-1 group-hover:text-zinc-200 transition-colors">{((m.titulo ?? m.descricao ?? m.texto) as string) || "Visualização bloqueada pelo tribunal."}</p>
                          {m.resumo && <p className="text-[10px] text-zinc-500 italic mt-2 px-3 py-1.5 bg-zinc-950 rounded-xl border border-zinc-900 border-l-yellow-500/40 border-l-2">Fato: {m.resumo as string}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Actions Sidebar */}
        <div className="flex flex-col items-end gap-3 shrink-0 h-full justify-between">
           <button
             onClick={() => setExpanded(!expanded)}
             className={`p-3 rounded-2xl transition-all border ${expanded ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-zinc-900 text-zinc-600 border-zinc-800 hover:text-white hover:border-zinc-700 shadow-xl'}`}
             title={expanded ? "Recolher Histórico" : "Ver Detalhes"}
           >
             {expanded ? <ChevronUp size={20} strokeWidth={3} /> : <Eye size={20} />}
           </button>

           <div className="mt-auto">
             {!p.monitorado ? (
               <button
                 onClick={onAction}
                 disabled={isLoading}
                 className="w-32 py-3 rounded-2xl bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl shadow-yellow-500/20 active:scale-95 border-b-4 border-yellow-600"
               >
                 {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} fill="currentColor" />}
                 Monitorar
               </button>
             ) : (
               <button
                 onClick={onRemover}
                 disabled={isLoading}
                 className="w-32 py-3 rounded-2xl bg-zinc-950 border border-red-500/40 text-red-500 hover:bg-red-500/5 text-[10px] font-black uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95"
               >
                 <X size={14} strokeWidth={3} />
                 Remover
               </button>
             )}
           </div>
        </div>
      </div>
    </div>
  )
}

// ─── Componente Principal ─────────────────────────────────────────────────────

function MonitoramentoContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // CORREÇÃO 1: Ler página da URL
  const currentPage = parseInt(searchParams.get('page') || '1', 10)

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
  const [resumosOficiais, setResumosOficiais] = useState<Record<string, { texto?: string, status?: string, loading: boolean }>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  // CORREÇÃO 3: Estado do resumo IA por processo
  const [resumosIA, setResumosIA] = useState<Record<string, { state: ResumoState; texto?: string }>>({})

  const PAGE_SIZE = 20

  // Persistir página na URL
  const setPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', p.toString())
    router.push(`?${params.toString()}`)
    window.scrollTo({ top: 300, behavior: 'smooth' })
  }

  useEffect(() => {
    const s = localStorage.getItem('mayus_oab_numero')
    const e = localStorage.getItem('mayus_oab_estado')
    if (s) setOabNumero(s)
    if (e) setOabEstado(e)
  }, [])

  const buscar = useCallback(async () => {
    if (!oabNumero.trim()) return
    setLoading(true); setError(null); setFeedback(null); setSelecionados(new Set()); setPage(1)
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro na conexão')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oabEstado, oabNumero])

  const monitorarLote = useCallback(async (processos: Processo[]) => {
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_processo: p.numero_processo })
      })
      setResult(prev => prev ? {
        ...prev,
        processos: prev.processos.map(item => item.numero_processo === p.numero_processo ? { ...item, monitorado: false } : item),
        billing: { ...prev.billing, total_ja_monitorados: Math.max(0, prev.billing.total_ja_monitorados - 1) }
      } : prev)
      setFeedback('✅ Vigilância desativada')
    } catch (e) {
      setError('Erro ao remover monitoramento')
    } finally {
      setLoadingId(null)
    }
  }, [])

  const solicitarResumoTribunal = useCallback(async (p: Processo) => {
    setResumosOficiais(prev => ({ ...prev, [p.numero_processo]: { loading: true } }))
    try {
      const res = await fetch('/api/escavador/resumo-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_processo: p.numero_processo })
      })
      const data = await res.json()
      setResumosOficiais(prev => ({ ...prev, [p.numero_processo]: { status: data.status || 'PENDENTE', loading: false } }))
    } catch (e) {
      setResumosOficiais(prev => ({ ...prev, [p.numero_processo]: { loading: false } }))
    }
  }, [])

  // CORREÇÃO 3: Solicitar resumo de IA via Escavador
  const solicitarResumoIA = useCallback(async (p: Processo) => {
    const key = p.numero_processo

    // Se já tem resumo local, exibir direto sem gastar
    if (p.resumo_curto) {
      setResumosIA(prev => ({ ...prev, [key]: { state: 'done', texto: p.resumo_curto! } }))
      return
    }

    if (!p.id) {
      setResumosIA(prev => ({ ...prev, [key]: { state: 'error' } }))
      return
    }

    setResumosIA(prev => ({ ...prev, [key]: { state: 'loading' } }))
    try {
      const res = await fetch('/api/agent/processos/resumo-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processo_id: p.id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResumosIA(prev => ({ ...prev, [key]: { state: 'done', texto: data.resumo } }))
    } catch (e) {
      setResumosIA(prev => ({ ...prev, [key]: { state: 'error' } }))
    }
  }, [])

  // ─── Lógica de Filtros ───

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

  // CORREÇÃO 1: Calcular páginas com base nos filtros
  const totalPages = Math.ceil(processosFiltrados.length / PAGE_SIZE)
  const processosPagina = useMemo(() => {
    const offset = (currentPage - 1) * PAGE_SIZE
    return processosFiltrados.slice(offset, offset + PAGE_SIZE)
  }, [processosFiltrados, currentPage])

  const totalAtivos = result?.processos.filter(p => p.status === 'ATIVO' && !p.monitorado).length ?? 0

  // Resetar página quando filtros mudarem
  const handleFiltroStatusChange = (f: FilterStatus) => {
    setFiltroStatus(f)
    setPage(1)
  }
  const handleSearchChange = (v: string) => {
    setSearch(v)
    setPage(1)
  }

  return (
    <>
      {confirmacao && <ModalConfirmacaoCusto dados={confirmacao} onConfirmar={buscar} onCancelar={() => setConfirmacao(null)} loading={confirmandoLote} />}

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header Premium (Cormorant) */}
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

        {/* Barra de Busca */}
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

            {/* Toolbar Inteligente */}
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
               </div>
            </div>

            {/* Filtros de Tribunal */}
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

            {/* Filtros de Status */}
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

            {/* Galeria de Processos */}
            <div className="grid grid-cols-1 gap-4">
               {processosPagina.map(p => (
                 <ProcessoCard
                   key={p.numero_processo}
                   p={p}
                   selecionado={selecionados.has(p.numero_processo)}
                   onSelect={() => {
                      setSelecionados(prev => {
                        const next = new Set(prev)
                        if (next.has(p.numero_processo)) next.delete(p.numero_processo)
                        else next.add(p.numero_processo)
                        return next
                      })
                   }}
                   onAction={() => monitorarLote([p])}
                   onRemover={() => desmonitorar(p)}
                   resumoOficial={resumosOficiais[p.numero_processo]}
                   onResumirOficial={() => solicitarResumoTribunal(p)}
                   loadingId={loadingId}
                   resumoIAState={resumosIA[p.numero_processo] || { state: 'idle' }}
                   onSolicitarResumoIA={() => solicitarResumoIA(p)}
                 />
               ))}

               {processosFiltrados.length === 0 && (
                 <div className="py-32 text-center space-y-4 bg-zinc-900/10 border border-dashed border-zinc-800 rounded-3xl">
                    <div className="w-16 h-16 rounded-3xl bg-zinc-900 flex items-center justify-center mx-auto text-zinc-800"><LayoutList size={28} /></div>
                    <div className="space-y-1">
                       <p className="text-zinc-500 text-xs font-black uppercase tracking-[0.3em]">Nenhum Alvo Identificado</p>
                       <p className="text-zinc-700 text-[10px] font-black uppercase">Os filtros aplicados não retornaram resultados nesta base.</p>
                    </div>
                 </div>
               )}
            </div>

            {/* CORREÇÃO 1: Paginação Premium no Rodapé */}
            <Pagination
              atual={currentPage}
              total={totalPages}
              totalProcessos={processosFiltrados.length}
              onChange={setPage}
            />

            <BillingBar billing={result.billing} />
          </div>
        )}

        {/* Empty State */}
        {!result && !loading && (
          <div className="text-center py-32 space-y-8 animate-in fade-in zoom-in-95 duration-700">
             <div className="relative inline-block">
                <div className="absolute inset-0 bg-yellow-500/5 blur-3xl rounded-full" />
                <div className="relative w-24 h-24 bg-zinc-950 border border-yellow-500/10 rounded-3xl flex items-center justify-center mx-auto shadow-2xl">
                   <Shield size={40} className="text-yellow-500/30" />
                </div>
             </div>
             <div className="space-y-3">
                <h3 className="text-white font-black text-2xl" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Inicie a Varredura Jurídica</h3>
                <p className="text-zinc-600 text-xs max-w-sm mx-auto font-black uppercase tracking-tighter leading-snug">Insira os credenciais acima para conectar-se aos tribunais via API de Inteligência e iniciar o monitoramento estratégico.</p>
             </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-40 space-y-8">
            <div className="relative w-20 h-20 mx-auto">
               <div className="absolute inset-0 border-2 border-yellow-500/5 rounded-3xl" />
               <div className="absolute inset-0 border-2 border-yellow-500 border-t-transparent border-l-transparent rounded-3xl animate-spin" />
               <div className="absolute inset-6 border border-zinc-800 rounded-2xl flex items-center justify-center">
                  <RefreshCw size={24} className="text-yellow-500/40 animate-spin" />
               </div>
            </div>
            <div className="space-y-2">
               <p className="text-white font-black text-xs uppercase tracking-[0.4em] animate-pulse">Sincronizando Canais Oficiais</p>
               <div className="flex items-center justify-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-bounce delay-75" />
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-bounce delay-150" />
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-bounce delay-300" />
               </div>
            </div>
          </div>
        )}
      </div>
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
