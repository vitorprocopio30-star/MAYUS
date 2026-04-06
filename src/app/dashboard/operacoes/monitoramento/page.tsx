'use client'

import { useEffect, useState } from 'react'
import { Search, Shield, AlertCircle, CheckCircle, PauseCircle, Loader2, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type SearchTipo = 'numero' | 'oab' | 'cpf'

type Processo = {
  numero_cnj?: string
  numero?: string
  tribunal?: string
  assunto?: string
  ultima_movimentacao?: string
  status?: string
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

export default function MonitoramentoPage() {
  const [token, setToken] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [tipo, setTipo] = useState<SearchTipo>('numero')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [resultados, setResultados] = useState<Processo[]>([])
  const [monitorados, setMonitorados] = useState<MonitoredProcess[]>([])
  const [loadingMonitorados, setLoadingMonitorados] = useState(true)
  const [monitorandoId, setMonitorandoId] = useState<string | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token)
        fetchMonitorados(session.access_token)
      }
    })
  }, [])

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
    setSearching(true)
    setSearchError('')
    setResultados([])
    try {
      const res = await fetch('/api/processos/buscar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: query.trim(), tipo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro na busca.')
      setResultados(Array.isArray(data.processos) ? data.processos : [])
    } catch (err: any) {
      setSearchError(err.message)
    } finally {
      setSearching(false)
    }
  }

  async function handleMonitorar(processo: Processo) {
    const numero = processo.numero_cnj ?? processo.numero ?? ''
    if (!numero || !token) return
    setMonitorandoId(numero)
    setFeedbackMsg('')
    try {
      const res = await fetch('/api/processos/buscar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: numero, tipo: 'numero', acao: 'monitorar' }),
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
    <main className="min-h-screen bg-[#0a0a0a] text-white font-[DM_Sans,sans-serif]">
      <div className="mx-auto max-w-7xl px-6 py-10">

        {/* Header */}
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
          <form onSubmit={handleSearch} className="space-y-4">
            {/* Tipo selector */}
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

            {/* Input + botão */}
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

          {/* Resultados da busca */}
          {resultados.length > 0 && (
            <div className="mt-6">
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">{resultados.length} resultado(s)</p>
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02]">
                      {['Número CNJ', 'Tribunal', 'Assunto', 'Última Movimentação', 'Status', ''].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resultados.map((p, i) => (
                      <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition">
                        <td className="px-4 py-3 text-sm font-mono text-white">{p.numero_cnj ?? p.numero ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-zinc-300">{String(p.tribunal ?? '—')}</td>
                        <td className="px-4 py-3 text-sm text-zinc-300 max-w-[220px] truncate">{String(p.assunto ?? '—')}</td>
                        <td className="px-4 py-3 text-sm text-zinc-400">{String(p.ultima_movimentacao ?? '—')}</td>
                        <td className="px-4 py-3"><StatusBadge status={String(p.status ?? '')} /></td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleMonitorar(p)}
                            disabled={monitorandoId === (p.numero_cnj ?? p.numero)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#C9A84C]/30 bg-[#C9A84C]/10 text-[#C9A84C] text-xs font-semibold hover:bg-[#C9A84C]/20 transition disabled:opacity-50"
                          >
                            {monitorandoId === (p.numero_cnj ?? p.numero)
                              ? <Loader2 size={12} className="animate-spin" />
                              : <Shield size={12} />}
                            Monitorar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Processos Monitorados */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Processos Monitorados</h2>
            <span className="text-xs text-zinc-500">{loadingMonitorados ? '...' : `${monitorados.length} processo(s)`}</span>
          </div>

          {loadingMonitorados ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-zinc-600" />
            </div>
          ) : monitorados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Shield size={32} className="text-zinc-700" />
              <p className="text-sm text-zinc-600">Nenhum processo monitorado ainda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    {['Número CNJ', 'Tribunal', 'Assunto', 'Última Movimentação', 'Status'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monitorados.map((p) => (
                    <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition">
                      <td className="px-5 py-3 text-sm font-mono text-white">{p.numero_cnj}</td>
                      <td className="px-5 py-3 text-sm text-zinc-300">{p.tribunal ?? '—'}</td>
                      <td className="px-5 py-3 text-sm text-zinc-300 max-w-[220px] truncate">{p.assunto ?? '—'}</td>
                      <td className="px-5 py-3 text-sm text-zinc-400">{p.ultima_movimentacao ?? '—'}</td>
                      <td className="px-5 py-3"><StatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
