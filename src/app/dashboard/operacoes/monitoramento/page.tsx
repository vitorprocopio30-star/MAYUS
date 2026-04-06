'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Shield, AlertCircle, CheckCircle, PauseCircle, Loader2, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type SearchTipo = 'numero' | 'oab' | 'cpf'

type Processo = {
  numero_cnj?: string
  numero?: string
  tribunal?: string
  assunto?: string
  polo_ativo?: string
  polo_passivo?: string
  ultima_movimentacao?: string
  valor_causa?: string
  status?: string
  data_inicio?: string
  [key: string]: unknown
}

type MonitoredProcess = {
  id: string
  numero_cnj: string
  tribunal: string | null
  assunto: string | null
  ultima_movimentacao: string | null
  status: string | null
  created_at: string | null
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? '').toLowerCase()
  if (s === 'ativo' || s === 'em andamento')
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"><CheckCircle size={11} /> Ativo</span>
  if (s === 'encerrado' || s === 'arquivado')
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border border-zinc-500/30 bg-zinc-500/10 text-zinc-400"><Eye size={11} /> Encerrado</span>
  if (s === 'suspenso')
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border border-yellow-500/30 bg-yellow-500/10 text-yellow-400"><PauseCircle size={11} /> Suspenso</span>
  return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border border-zinc-700 bg-zinc-800/60 text-zinc-400">—</span>
}

function MonitoramentoContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [token, setToken] = useState<string | null>(null)
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [tipo, setTipo] = useState<SearchTipo>((searchParams.get('tipo') as SearchTipo) ?? 'numero')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [resultados, setResultados] = useState<Processo[]>([])
  const [totalResultados, setTotalResultados] = useState<number | null>(null)
  const [advogado, setAdvogado] = useState<{ nome?: string; oab_numero?: string; oab_estado?: string } | null>(null)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const POR_PAGINA = 20
  const [monitorados, setMonitorados] = useState<MonitoredProcess[]>([])
  const [loadingMonitorados, setLoadingMonitorados] = useState(true)
  const [monitorandoId, setMonitorandoId] = useState<string | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState('')
  const [selectedProcess, setSelectedProcess] = useState<Processo | null>(null)

  const totalPaginas = Math.max(1, Math.ceil(resultados.length / POR_PAGINA))
  const resultadosPagina = resultados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  // Fechar Drawer ao apertar ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedProcess(null)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  const executarBusca = useCallback(async (q: string, t: SearchTipo, tok: string) => {
    // ... (mesma lógica de busca)
    if (!q.trim()) return
    setSearching(true)
    setSearchError('')
    setResultados([])
    setTotalResultados(null)
    setAdvogado(null)
    setPaginaAtual(1)
    try {
      const res = await fetch('/api/processos/buscar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ query: q.trim(), tipo: t }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro na busca.')
      setResultados(Array.isArray(data.processos) ? data.processos : [])
      setTotalResultados(typeof data.total === 'number' ? data.total : null)
      setAdvogado(data.advogado ?? null)
    } catch (err: any) {
      setSearchError(err.message)
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token)
        fetchMonitorados(session.access_token)
        const q = searchParams.get('q') ?? ''
        const t = (searchParams.get('tipo') as SearchTipo) ?? 'numero'
        if (q) executarBusca(q, t, session.access_token)
      }
    })
  }, [searchParams, executarBusca])

  async function fetchMonitorados(tok: string) {
    setLoadingMonitorados(true)
    try {
      const res = await fetch('/api/processos/monitorados', {
        headers: { Authorization: `Bearer ${tok}` },
      })
      const data = await res.json()
      setMonitorados(Array.isArray(data.processos) ? data.processos : [])
    } catch {
      setMonitorados([])
    } finally {
      setLoadingMonitorados(false)
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim() || !token) return
    router.push(`?tipo=${tipo}&q=${encodeURIComponent(query.trim())}`)
    await executarBusca(query.trim(), tipo, token)
  }

  async function handleMonitorar(processo: Processo) {
    const numero = processo.numero_cnj ?? processo.numero ?? ''
    if (!numero || !token) return
    setMonitorandoId(numero)
    setFeedbackMsg('')
    try {
      const res = await fetch('/api/processos/monitorados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(processo),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao monitorar.')
      setFeedbackMsg(`Processo ${numero} adicionado ao monitoramento.`)
      if (token) fetchMonitorados(token)
    } catch (err: any) {
      setFeedbackMsg(err.message)
    } finally {
      setMonitorandoId(null)
    }
  }

  const tipoLabels: Record<SearchTipo, string> = {
    numero: 'Número CNJ',
    oab: 'OAB (ex: SP/123456)',
    cpf: 'CPF / CNPJ',
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white font-[DM_Sans,sans-serif] relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 py-10">

        {/* ... (Header) */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/30 flex items-center justify-center">
              <Shield size={18} className="text-[#C9A84C]" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C9A84C]">Operação Jurídica</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Monitoramento de Processos</h1>
          <p className="mt-1.5 text-sm text-zinc-500">Busque e monitore processos via Escavador</p>
        </div>

        {/* Busca */}
        <div className="mb-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
          {/* ... (Form) */}
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex gap-2">
              {(['numero', 'oab', 'cpf'] as SearchTipo[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all border ${
                    tipo === t
                      ? 'bg-[#C9A84C]/15 border-[#C9A84C]/40 text-[#C9A84C]'
                      : 'border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20'
                  }`}
                >
                  {t === 'numero' ? 'Nº Processo' : t === 'oab' ? 'OAB' : 'CPF / CNPJ'}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tipoLabels[tipo]}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white/[0.05] border border-white/10 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#C9A84C]/50 transition"
                />
              </div>
              <button
                type="submit"
                disabled={searching || !query.trim()}
                className="px-6 py-3 rounded-2xl bg-[#C9A84C] text-black text-sm font-semibold hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                Buscar
              </button>
            </div>
          </form>

          {searchError && (
            <div className="mt-4 flex items-center gap-2 text-sm text-red-400 border border-red-500/20 bg-red-500/10 rounded-2xl px-4 py-3">
              <AlertCircle size={15} /> {searchError}
            </div>
          )}
          {feedbackMsg && (
            <div className="mt-4 flex items-center gap-2 text-sm text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 rounded-2xl px-4 py-3">
              <CheckCircle size={15} /> {feedbackMsg}
            </div>
          )}

          {resultados.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3 px-1">
                <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium">
                  {totalResultados ?? resultados.length} PROCESSO(S) ENCONTRADO(S)
                  {advogado?.nome && (
                    <span className="ml-2 text-[#C9A84C] normal-case tracking-normal">
                      — {advogado.nome}
                      {advogado.oab_numero && advogado.oab_estado && ` (OAB/${advogado.oab_estado} ${advogado.oab_numero})`}
                    </span>
                  )}
                </p>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-white/10 shadow-2xl">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.04]">
                      <th className="sticky left-0 bg-[#0a0a0a] z-20 px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 whitespace-nowrap min-w-[220px]">Número CNJ</th>
                      <th className="px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 whitespace-nowrap min-w-[90px]">Tribunal</th>
                      <th className="px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 whitespace-nowrap min-w-[180px]">Assunto</th>
                      <th className="px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 whitespace-nowrap min-w-[160px]">Polo Ativo</th>
                      <th className="px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 whitespace-nowrap min-w-[160px]">Polo Passivo</th>
                      <th className="px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 whitespace-nowrap min-w-[110px]">Última Mov.</th>
                      <th className="px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 whitespace-nowrap min-w-[110px]">Valor</th>
                      <th className="px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 whitespace-nowrap min-w-[90px]">Status</th>
                      <th className="sticky right-0 bg-[#0a0a0a] z-20 px-4 py-4 text-right text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 min-w-[120px]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultadosPagina.map((p, i) => {
                      const cnj = p.numero_cnj ?? p.numero
                      return (
                        <tr 
                          key={i} 
                          onClick={() => setSelectedProcess(p)}
                          className="border-b border-white/5 last:border-0 hover:bg-white/[0.04] transition cursor-pointer group"
                        >
                          <td className="sticky left-0 bg-[#0a0a0a] group-hover:bg-[#111] z-10 px-4 py-4 text-[13px] font-mono font-medium text-white whitespace-nowrap border-r border-white/5">{cnj ?? '—'}</td>
                          <td className="px-4 py-4 text-[13px] text-zinc-300 whitespace-nowrap">{String(p.tribunal ?? '—')}</td>
                          <td className="px-4 py-4 text-[13px] text-zinc-300 max-w-[180px] truncate">{String(p.assunto ?? '—')}</td>
                          <td className="px-4 py-4 text-[13px] text-zinc-300 max-w-[160px] truncate">{String(p.polo_ativo ?? '—')}</td>
                          <td className="px-4 py-4 text-[13px] text-zinc-300 max-w-[160px] truncate">{String(p.polo_passivo ?? '—')}</td>
                          <td className="px-4 py-4 text-[13px] text-zinc-400 whitespace-nowrap">{String(p.ultima_movimentacao ?? '—')}</td>
                          <td className="px-4 py-4 text-[13px] text-zinc-400 whitespace-nowrap">{String(p.valor_causa ?? '—')}</td>
                          <td className="px-4 py-4"><StatusBadge status={String(p.status ?? '')} /></td>
                          <td className="sticky right-0 bg-[#0a0a0a] group-hover:bg-[#111] z-10 px-4 py-4 text-right border-l border-white/5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMonitorar(p)
                              }}
                              disabled={monitorandoId === (cnj)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#C9A84C]/30 bg-[#C9A84C]/10 text-[#C9A84C] text-[11px] font-bold hover:bg-[#C9A84C]/20 transition disabled:opacity-50 whitespace-nowrap"
                            >
                              {monitorandoId === (cnj)
                                ? <Loader2 size={12} className="animate-spin" />
                                : <Shield size={12} />}
                              Monitorar
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination (mesma coisa) */}
              {totalPaginas > 1 && (
                <div className="mt-6 flex items-center justify-between px-1">
                  <button
                    onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                    disabled={paginaAtual === 1}
                    className="px-4 py-2 rounded-xl border border-white/10 text-xs text-zinc-400 hover:text-white hover:border-white/20 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ← Anterior
                  </button>
                  <span className="text-xs text-zinc-500">
                    Página <span className="text-white font-semibold">{paginaAtual}</span> de <span className="text-white font-semibold">{totalPaginas}</span>
                  </span>
                  <button
                    onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                    disabled={paginaAtual === totalPaginas}
                    className="px-4 py-2 rounded-xl border border-white/10 text-xs text-zinc-400 hover:text-white hover:border-white/20 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Próximo →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ... (Monitorados) */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Processos Monitorados</h2>
            <span className="text-xs text-zinc-500 font-medium px-3 py-1 rounded-full bg-white/5 border border-white/10">{loadingMonitorados ? '...' : `${monitorados.length} processo(s)`}</span>
          </div>

          {loadingMonitorados ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-zinc-700" />
            </div>
          ) : monitorados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
              <Shield size={40} className="text-zinc-700" />
              <p className="text-sm text-zinc-500 tracking-wide">Nenhum processo monitorado no momento.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.01]">
                    {['Número CNJ', 'Tribunal', 'Assunto', 'Última Movimentação', 'Status'].map((h) => (
                      <th key={h} className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monitorados.map((p) => (
                    <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition">
                      <td className="px-6 py-4 text-[13px] font-mono font-medium text-white">{p.numero_cnj}</td>
                      <td className="px-6 py-4 text-[13px] text-zinc-300">{p.tribunal ?? '—'}</td>
                      <td className="px-6 py-4 text-[13px] text-zinc-300 max-w-[240px] truncate">{p.assunto ?? '—'}</td>
                      <td className="px-6 py-4 text-[13px] text-zinc-400">{p.ultima_movimentacao ?? '—'}</td>
                      <td className="px-6 py-4"><StatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Process Summary Drawer */}
      {selectedProcess && (
        <>
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] transition-opacity"
            onClick={() => setSelectedProcess(null)}
          />
          <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-[#0d0d0d] border-l border-white/10 z-[101] shadow-2xl flex flex-col transform transition-transform animate-in slide-in-from-right duration-500">
            <div className="p-8 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A84C] mb-1.5">Resumo do Processo</h3>
                <p className="text-xl font-mono font-bold text-white tracking-tight">{selectedProcess.numero_cnj ?? selectedProcess.numero}</p>
              </div>
              <button 
                onClick={() => setSelectedProcess(null)}
                className="p-2.5 rounded-xl hover:bg-white/5 text-zinc-500 hover:text-white transition"
              >
                <Eye size={20} className="rotate-45" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Status</span>
                  <div><StatusBadge status={String(selectedProcess.status ?? '')} /></div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tribunal</span>
                  <p className="text-sm font-semibold text-zinc-200">{String(selectedProcess.tribunal ?? '—')}</p>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Assunto Principal</span>
                <p className="text-sm leading-relaxed text-zinc-200 bg-white/5 p-4 rounded-2xl border border-white/5">{String(selectedProcess.assunto ?? '—')}</p>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Polo Ativo</span>
                  <div className="text-sm font-medium text-zinc-300 bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/10 whitespace-pre-wrap">{String(selectedProcess.polo_ativo ?? '—')}</div>
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Polo Passivo</span>
                  <div className="text-sm font-medium text-zinc-300 bg-red-500/5 p-4 rounded-2xl border border-red-500/10 whitespace-pre-wrap">{String(selectedProcess.polo_passivo ?? '—')}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 pt-4 border-t border-white/5">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Valor da Causa</span>
                  <p className="text-base font-bold text-[#C9A84C]">{String(selectedProcess.valor_causa ?? '—')}</p>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Data de Início</span>
                  <p className="text-sm font-semibold text-zinc-200">{String(selectedProcess.data_inicio ?? '—')}</p>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-white/5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Última Movimentação</span>
                <div className="text-[13px] leading-relaxed text-zinc-400 bg-white/[0.02] p-5 rounded-2xl border border-white/10 italic">
                  "{String(selectedProcess.ultima_movimentacao ?? 'Nenhuma movimentação recente encontrada.')}"
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-white/10 bg-white/[0.02]">
              <button 
                onClick={() => {
                  handleMonitorar(selectedProcess)
                  setSelectedProcess(null)
                }}
                disabled={monitorandoId === (selectedProcess.numero_cnj ?? selectedProcess.numero)}
                className="w-full py-4 rounded-2xl bg-[#C9A84C] text-black font-bold hover:brightness-110 transition disabled:opacity-50 shadow-xl shadow-[#C9A84C]/10 flex items-center justify-center gap-3"
              >
                {monitorandoId === (selectedProcess.numero_cnj ?? selectedProcess.numero)
                  ? <Loader2 size={18} className="animate-spin" />
                  : <Shield size={18} />}
                MONITORAR ESTE PROCESSO
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  )
}

export default function MonitoramentoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] text-white p-8">Carregando...</div>}>
      <MonitoramentoContent />
    </Suspense>
  )
}
