'use client'

import { useState, useCallback, Suspense } from 'react'
import {
  Search, Shield, AlertCircle, CheckCircle,
  ChevronDown, ChevronUp, Zap, Eye, Filter, RefreshCw,
  AlertTriangle, X, DollarSign
} from 'lucide-react'

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
  fase_atual: string
  escavador_id: string
  monitorado: boolean
  movimentacoes: Record<string, unknown>[]
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

const STATUS_COLOR: Record<string, string> = {
  ATIVO: 'text-green-400 bg-green-400/10',
  ARQUIVADO: 'text-zinc-400 bg-zinc-400/10',
  BAIXADO: 'text-red-400 bg-red-400/10',
}

function diasDesde(data: string | null) {
  if (!data) return null
  return Math.floor((Date.now() - new Date(data).getTime()) / 86400000)
}

function UrgenciaBadge({ dias }: { dias: number | null }) {
  if (dias === null) return <span className="text-xs text-zinc-600">Sem registro</span>
  if (dias > 30) return <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">+{dias}d sem mov.</span>
  return <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">{dias}d atrás</span>
}

function ModalConfirmacaoCusto({ dados, onConfirmar, onCancelar, loading }: {
  dados: ConfirmacaoLote; onConfirmar: () => void; onCancelar: () => void; loading: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-yellow-500/30 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-yellow-500">
            <AlertTriangle size={20} />
            <span className="font-semibold text-base">Confirmar cobrança</span>
          </div>
          <button onClick={onCancelar} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="bg-zinc-800/60 rounded-xl p-4 space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-zinc-400">Processos a monitorar</span><span className="text-white font-semibold">{dados.novos}</span></div>
          <div className="flex justify-between"><span className="text-zinc-400">Incluídos no plano</span><span className="text-green-400 font-semibold">{dados.gratuitos_disponiveis} grátis</span></div>
          <div className="h-px bg-zinc-700" />
          <div className="flex justify-between"><span className="text-zinc-400">Excedentes</span><span className="text-yellow-400 font-semibold">{dados.excedente}</span></div>
          <div className="flex justify-between"><span className="text-zinc-400">Preço por processo</span><span className="text-zinc-300">R$ {dados.preco_por_extra.toFixed(2)}/mês</span></div>
          <div className="h-px bg-zinc-700" />
          <div className="flex justify-between text-base"><span className="text-white font-semibold">Custo adicional/mês</span><span className="text-yellow-500 font-bold">R$ {dados.custo_mensal.toFixed(2)}</span></div>
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">Este valor será adicionado à sua próxima fatura MAYUS. Você pode desativar processos individuais a qualquer momento.</p>
        <div className="flex gap-3">
          <button onClick={onCancelar} disabled={loading} className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-sm hover:text-zinc-200 transition-colors disabled:opacity-50">Cancelar</button>
          <button onClick={onConfirmar} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <DollarSign size={14} />}
            {loading ? 'Processando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProcessoCard({ p, onMonitorar, loadingId }: {
  p: Processo; onMonitorar: (p: Processo) => void; loadingId: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const isLoading = loadingId === p.numero_processo
  const dias = diasDesde(p.data_ultima_movimentacao)

  return (
    <div className={`rounded-xl border transition-all ${p.monitorado ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-zinc-800 bg-zinc-900/60'}`}>
      <div className="p-4 flex items-start gap-4">
        <div className="mt-1 shrink-0">
          {p.monitorado ? <CheckCircle size={16} className="text-yellow-500" /> : <div className="w-4 h-4 rounded-full border border-zinc-700" />}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          {/* Linha 1: número + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-white font-medium">{p.numero_processo}</span>
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">{p.tribunal}</span>
            {p.comarca && <span className="text-xs bg-zinc-800/50 text-zinc-500 px-2 py-0.5 rounded">{p.comarca}</span>}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[p.status] ?? 'text-zinc-400 bg-zinc-400/10'}`}>{p.status}</span>
            {p.monitorado && <span className="text-xs text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">● Monitorado</span>}
          </div>

          {/* Linha 2: partes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-sm">
            <div><span className="text-zinc-500">Ativo: </span><span className="text-zinc-200">{p.polo_ativo}</span></div>
            <div><span className="text-zinc-500">Passivo: </span><span className="text-zinc-200">{p.polo_passivo}</span></div>
          </div>

          {/* Linha 3: metadados */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-zinc-400">{p.assunto}</span>
            {p.classe_processual && <><span className="text-zinc-700">·</span><span className="text-zinc-500">{p.classe_processual}</span></>}
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-500">Fase: {p.fase_atual}</span>
            {p.vara && <><span className="text-zinc-700">·</span><span className="text-zinc-500">{p.vara}</span></>}
          </div>

          {/* Linha 4: financeiro + urgência */}
          <div className="flex items-center gap-3 flex-wrap text-xs">
            {p.valor_causa && p.valor_causa !== 'N/I' && (
              <span className="text-yellow-400/80 bg-yellow-400/5 px-2 py-0.5 rounded border border-yellow-400/20">
                💰 {p.valor_causa}
              </span>
            )}
            {p.data_distribuicao && (
              <span className="text-zinc-500">Distribuído: {new Date(p.data_distribuicao).toLocaleDateString('pt-BR')}</span>
            )}
            <UrgenciaBadge dias={dias} />
          </div>

          {/* Expandido: última movimentação */}
          {expanded && (
            <div className="mt-2 space-y-2">
              {p.ultima_movimentacao_texto && (
                <div className="p-3 bg-zinc-800/50 rounded-lg text-sm text-zinc-300 border-l-2 border-yellow-500/40">
                  <p className="text-xs text-zinc-500 mb-1 uppercase tracking-wider">Última movimentação</p>
                  {p.ultima_movimentacao_texto}
                </div>
              )}
              {p.movimentacoes?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Histórico recente</p>
                  {p.movimentacoes.slice(0, 5).map((m, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-400 py-1 border-b border-zinc-800/50">
                      <span className="text-zinc-600 shrink-0">{(m.data as string) ? new Date(m.data as string).toLocaleDateString('pt-BR') : '—'}</span>
                      <span>{((m.titulo ?? m.descricao ?? m.tipo) as string) ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(p.ultima_movimentacao_texto || p.movimentacoes?.length > 0) && (
            <button onClick={() => setExpanded(v => !v)} className="text-zinc-500 hover:text-zinc-300 p-1 transition-colors">
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
          {!p.monitorado && (
            <button onClick={() => onMonitorar(p)} disabled={isLoading}
              className="text-xs px-3 py-1.5 rounded-lg border border-yellow-500/40 text-yellow-500 hover:bg-yellow-500/10 transition-all disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap">
              {isLoading && <RefreshCw size={11} className="animate-spin" />}
              {isLoading ? '...' : 'Monitorar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

type FilterStatus = 'TODOS' | 'ATIVO' | 'ARQUIVADO' | 'nao_monitorado'

function BillingBar({ billing }: { billing: BillingInfo }) {
  const pct = Math.min(100, (billing.total_ja_monitorados / Math.max(billing.gratuitos, 1)) * 100)
  const quaseCheno = pct >= 80
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 flex items-center gap-4">
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400">Processos no plano</span>
          <span className={quaseCheno ? 'text-yellow-400 font-semibold' : 'text-zinc-400'}>{billing.total_ja_monitorados} / {billing.gratuitos} usados</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${quaseCheno ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-zinc-500">
          {billing.disponivel_sem_custo > 0
            ? `${billing.disponivel_sem_custo} disponíveis sem custo adicional`
            : `Plano esgotado — extras a R$${billing.preco_por_extra.toFixed(2)}/processo/mês`}
        </p>
      </div>
      {billing.excedente_se_prosseguir > 0 && (
        <div className="text-right shrink-0">
          <p className="text-xs text-yellow-400 font-semibold">+R$ {billing.custo_estimado_mes.toFixed(2)}/mês</p>
          <p className="text-xs text-zinc-500">se monitorar todos ativos</p>
        </div>
      )}
    </div>
  )
}

function MonitoramentoContent() {
  const [tab, setTab] = useState<'oab' | 'numero' | 'cpf'>('oab')
  const [oabEstado, setOabEstado] = useState('RJ')
  const [oabNumero, setOabNumero] = useState('')
  const [loading, setLoading] = useState(false)
  const [importandoLote, setImportandoLote] = useState(false)
  const [result, setResult] = useState<BuscaResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtroStatus, setFiltroStatus] = useState<FilterStatus>('TODOS')
  const [search, setSearch] = useState('')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoLote | null>(null)
  const [confirmandoLote, setConfirmandoLote] = useState(false)

  const buscar = useCallback(async () => {
    if (!oabNumero.trim()) return
    setLoading(true); setError(null); setResult(null); setFeedback(null)
    try {
      const res = await fetch('/api/escavador/buscar-completo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oab_estado: oabEstado, oab_numero: oabNumero.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro na busca')
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [oabEstado, oabNumero])

  const executarImportacao = useCallback(async (processos: Processo[], confirmar_custo: boolean) => {
    const res = await fetch('/api/monitoramento/importar-lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processos, confirmar_custo })
    })
    return res.json()
  }, [])

  const monitorarUm = useCallback(async (p: Processo) => {
    setLoadingId(p.numero_processo)
    try {
      const data = await executarImportacao([p], true)
      if (data.error) throw new Error(data.error)
      setResult(prev => prev
        ? { ...prev, processos: prev.processos.map(proc => proc.numero_processo === p.numero_processo ? { ...proc, monitorado: true } : proc) }
        : prev)
      setFeedback(data.mensagem)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao monitorar')
    } finally {
      setLoadingId(null)
    }
  }, [executarImportacao])

  const monitorarTodosAtivos = useCallback(async () => {
    if (!result) return
    const ativos = result.processos.filter(p => p.status === 'ATIVO' && !p.monitorado)
    if (!ativos.length) return
    setImportandoLote(true)
    try {
      const data = await executarImportacao(ativos, false)
      if (data.requer_confirmacao) {
        setConfirmacao({ ...data, processosParaImportar: ativos })
        return
      }
      setResult(prev => prev
        ? { ...prev, processos: prev.processos.map(p => p.status === 'ATIVO' ? { ...p, monitorado: true } : p) }
        : prev)
      setFeedback(`✅ ${data.mensagem}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao importar')
    } finally {
      setImportandoLote(false)
    }
  }, [result, executarImportacao])

  const confirmarLote = useCallback(async () => {
    if (!confirmacao) return
    setConfirmandoLote(true)
    try {
      const data = await executarImportacao(confirmacao.processosParaImportar, true)
      if (data.error) throw new Error(data.error)
      setResult(prev => prev
        ? { ...prev, processos: prev.processos.map(p => p.status === 'ATIVO' ? { ...p, monitorado: true } : p) }
        : prev)
      setFeedback(`✅ ${data.mensagem}`)
      setConfirmacao(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao confirmar')
    } finally {
      setConfirmandoLote(false)
    }
  }, [confirmacao, executarImportacao])

  const processosFiltrados = result?.processos.filter(p => {
    const matchStatus = filtroStatus === 'TODOS'
      ? true
      : filtroStatus === 'nao_monitorado'
        ? !p.monitorado
        : p.status === filtroStatus
    const matchSearch = !search || [p.numero_processo, p.polo_ativo, p.polo_passivo, p.assunto]
      .some(s => s?.toLowerCase().includes(search.toLowerCase()))
    return matchStatus && matchSearch
  }) ?? []

  const totalAtivosNaoMonitorados = result?.processos.filter(p => p.status === 'ATIVO' && !p.monitorado).length ?? 0
  const totalMonitorados = result?.processos.filter(p => p.monitorado).length ?? 0

  return (
    <>
      {confirmacao && (
        <ModalConfirmacaoCusto
          dados={confirmacao}
          onConfirmar={confirmarLote}
          onCancelar={() => setConfirmacao(null)}
          loading={confirmandoLote}
        />
      )}

      <div className="p-6 max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-yellow-500/10 flex items-center justify-center">
            <Shield size={18} className="text-yellow-500" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
              Monitoramento de Processos
            </h1>
            <p className="text-sm text-zinc-400">Busca completa · Monitoramento em lote · Alertas automáticos</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
          {([['oab', 'OAB'], ['numero', 'Nº Processo'], ['cpf', 'CPF / CNPJ']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === key ? 'bg-yellow-500 text-black' : 'text-zinc-400 hover:text-zinc-300'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex gap-3">
          {tab === 'oab' && (
            <select
              value={oabEstado}
              onChange={e => setOabEstado(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-300 focus:outline-none focus:border-yellow-500/50"
            >
              {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(e => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          )}
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={oabNumero}
              onChange={e => setOabNumero(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscar()}
              placeholder={tab === 'oab' ? 'Número OAB...' : tab === 'numero' ? 'Nº CNJ...' : 'CPF ou CNPJ...'}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-yellow-500/50"
            />
          </div>
          <button
            onClick={buscar}
            disabled={loading}
            className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            <AlertCircle size={15} />{error}
          </div>
        )}
        {feedback && (
          <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-400">
            <CheckCircle size={15} />{feedback}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <BillingBar billing={result.billing} />

            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 text-sm flex-wrap">
                <span className="text-zinc-300">
                  <span className="text-yellow-500 font-bold">{result.total_retornado}</span>
                  <span className="text-zinc-500"> de </span>
                  <span className="font-medium">{result.total}</span>
                  <span className="text-zinc-500"> processos</span>
                  {result.total_retornado < result.total && (
                    <span className="text-xs text-zinc-600 ml-1">(paginando {result.paginas_buscadas} pág.)</span>
                  )}
                </span>
                {result.advogado_nome && <span className="text-zinc-500 text-xs">— {result.advogado_nome}</span>}
                <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle size={11} />{totalMonitorados} monitorados
                </span>
              </div>
              {totalAtivosNaoMonitorados > 0 && (
                <button
                  onClick={monitorarTodosAtivos}
                  disabled={importandoLote}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold rounded-xl transition-all disabled:opacity-50"
                >
                  {importandoLote
                    ? <><RefreshCw size={14} className="animate-spin" />Verificando...</>
                    : <><Zap size={14} />Monitorar {totalAtivosNaoMonitorados} ativos</>}
                </button>
              )}
            </div>

            {/* Filtros */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={13} className="text-zinc-500" />
              {(['TODOS', 'ATIVO', 'ARQUIVADO', 'nao_monitorado'] as FilterStatus[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFiltroStatus(f)}
                  className={`text-xs px-3 py-1 rounded-full transition-all ${filtroStatus === f ? 'bg-yellow-500 text-black font-semibold' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-300'}`}
                >
                  {f === 'nao_monitorado' ? 'Não monitorados' : f}
                </button>
              ))}
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filtrar por nome, processo..."
                className="ml-auto bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-yellow-500/50 w-52"
              />
            </div>

            {/* Lista */}
            <div className="space-y-3">
              {processosFiltrados.map(p => (
                <ProcessoCard key={p.numero_processo} p={p} onMonitorar={monitorarUm} loadingId={loadingId} />
              ))}
              {processosFiltrados.length === 0 && (
                <div className="text-center py-12 text-zinc-500 text-sm">
                  <Eye size={32} className="mx-auto mb-3 text-zinc-700" />
                  Nenhum processo com esses filtros.
                </div>
              )}
            </div>
          </div>
        )}

        {!result && !loading && (
          <div className="text-center py-16">
            <Shield size={40} className="mx-auto mb-4 text-zinc-700" />
            <p className="text-zinc-400 text-sm">Busque por OAB para carregar todos os processos</p>
            <p className="text-zinc-600 text-xs mt-1">Paginação automática · Sem limite de resultados · Proteção contra duplicatas</p>
          </div>
        )}

        {loading && (
          <div className="text-center py-16 space-y-3">
            <RefreshCw size={32} className="mx-auto text-yellow-500 animate-spin" />
            <p className="text-zinc-400 text-sm">Buscando todos os processos...</p>
            <p className="text-zinc-600 text-xs">Paginando automaticamente — aguarde</p>
          </div>
        )}
      </div>
    </>
  )
}

export default function MonitoramentoPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <MonitoramentoContent />
    </Suspense>
  )
}
