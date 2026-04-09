'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'

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

export default function PrazosPage() {
  const supabase = createClient()
  const [prazos, setPrazos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      if (!profile) return

      const { data } = await supabase
        .from('process_prazos')
        .select(`
          *,
          monitored_processes(numero_processo, partes, tribunal),
          profiles(full_name)
        `)
        .eq('tenant_id', profile.tenant_id)
        .eq('status', 'pendente')
        .gte('data_vencimento', new Date().toISOString())
        .order('data_vencimento', { ascending: true })

      setPrazos(data || [])
      setLoading(false)
    }
    carregar()
  }, [supabase])

  async function marcarConcluido(id: string) {
    await supabase.from('process_prazos')
      .update({ status: 'concluido' }).eq('id', id)
    setPrazos(prev => prev.filter(p => p.id !== id))
  }

  // Agrupar por semana
  // const agora = Date.now()
  const semana   = prazos.filter(p => diasRestantes(p.data_vencimento) <= 7)
  const quinzena = prazos.filter(p => {
    const d = diasRestantes(p.data_vencimento)
    return d > 7 && d <= 15
  })
  const futuro   = prazos.filter(p => diasRestantes(p.data_vencimento) > 15)

  function corPrazo(data: string) {
    const d = diasRestantes(data)
    if (d <= 3)  return { bar: 'bg-red-500',    badge: 'border-red-500/40 bg-red-500/10 text-red-400' }
    if (d <= 7)  return { bar: 'bg-yellow-500', badge: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400' }
    return         { bar: 'bg-green-500',   badge: 'border-green-500/40 bg-green-500/10 text-green-400' }
  }

  function CardPrazo({ prazo }: { prazo: any }) {
    const cores = corPrazo(prazo.data_vencimento)
    const dias  = diasRestantes(prazo.data_vencimento)
    return (
      <div className="flex items-start gap-4 p-4 rounded-xl
                      bg-white/3 border border-white/8
                      hover:border-white/15 transition-all">
        <div className={`w-1 self-stretch rounded-full shrink-0 ${cores.bar}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-white font-medium text-sm">{prazo.descricao}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cores.badge}`}>
              {prazo.tipo.toUpperCase()}
            </span>
          </div>
          <p className="text-white/40 text-xs">
            {formatarData(prazo.data_vencimento)} · {dias}d restantes
          </p>
          {prazo.monitored_processes?.numero_processo && (
            <p className="text-white/30 text-xs mt-0.5">
              Processo: {prazo.monitored_processes.numero_processo}
            </p>
          )}
          {prazo.profiles?.full_name && (
            <p className="text-white/40 text-xs mt-0.5">
              Responsável: {prazo.profiles.full_name}
            </p>
          )}
        </div>
        <button onClick={() => marcarConcluido(prazo.id)}
          className="shrink-0 text-xs text-green-400 hover:text-green-300
                     transition-colors flex items-center gap-1">
          <CheckCircle2 size={14} /> Concluído
        </button>
      </div>
    )
  }

  function Grupo({ titulo, items }: { titulo: string, items: any[] }) {
    if (items.length === 0) return null
    return (
      <div className="mb-8">
        <h3 className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-3">
          {titulo} — {items.length} {items.length === 1 ? 'prazo' : 'prazos'}
        </h3>
        <div className="space-y-2">
          {items.map(p => <CardPrazo key={p.id} prazo={p} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-[#CCA761]/10 border border-[#CCA761]/20
                        flex items-center justify-center">
          <Clock size={20} className="text-[#CCA761]" />
        </div>
        <div>
          <h1 className="text-white text-xl font-semibold">Prazos e Audiências</h1>
          <p className="text-white/40 text-sm">{prazos.length} pendentes</p>
        </div>
      </div>

      {loading && (
        <div className="text-white/40 text-sm text-center py-12">
          Carregando prazos...
        </div>
      )}

      {!loading && prazos.length === 0 && (
        <div className="text-center py-16 text-white/30">
          <CheckCircle2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>Nenhum prazo pendente</p>
          <p className="text-xs mt-1">Os prazos criados pelo &quot;Organizar IA&quot; aparecem aqui</p>
        </div>
      )}

      <Grupo titulo="Esta semana"      items={semana} />
      <Grupo titulo="Próximas 2 semanas" items={quinzena} />
      <Grupo titulo="Futuro"           items={futuro} />
    </div>
  )
}
