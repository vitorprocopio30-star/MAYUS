'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Tenant = {
  id: string
  name: string
  plan_type: string | null
  status: 'trial' | 'ativo' | 'inadimplente' | 'cancelado' | string | null
  billing_cycle: 'mensal' | 'anual' | string | null
  created_at: string | null
  max_processos: number | null
}

function formatDate(date: string | null) {
  if (!date) return '—'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('pt-BR')
}

function statusBadgeClass(status: Tenant['status']) {
  switch (status) {
    case 'trial':        return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
    case 'ativo':        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    case 'inadimplente': return 'border-red-500/30 bg-red-500/10 text-red-300'
    case 'cancelado':    return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300'
    default:             return 'border-zinc-700 bg-zinc-800/70 text-zinc-300'
  }
}

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tenants, setTenants] = useState<Tenant[]>([])

  useEffect(() => {
    let isMounted = true
    async function loadPage() {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          router.replace('/login')
          return
        }
        // Middleware já garante que só superadmin chega aqui

        const res = await fetch('/api/admin/tenants', {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || 'Não foi possível carregar os escritórios.')
        if (isMounted) setTenants(Array.isArray(data?.tenants) ? data.tenants : [])
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : 'Erro ao carregar painel.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadPage()
    return () => { isMounted = false }
  }, [router])

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex w-fit rounded-full border border-[#CCA761]/30 bg-[#CCA761]/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-[#CCA761]">
              Superadmin
            </span>
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              ← Voltar ao Dashboard
            </button>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">Painel MAYUS</h1>
            <p className="mt-2 text-sm text-zinc-400">
              {loading ? 'Carregando...' : `${tenants.length} escritórios cadastrados`}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-2xl backdrop-blur-sm">
          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <p className="text-sm text-zinc-400">Carregando painel...</p>
            </div>
          ) : error ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
            </div>
          ) : tenants.length === 0 ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <p className="text-sm text-zinc-500">Nenhum escritório encontrado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    {['Escritório','Plano','Status','Ciclo','Criado em','Processos','Ações'].map(h => (
                      <th key={h} className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                      <td className="px-5 py-4 text-sm font-medium text-white">{t.name || '—'}</td>
                      <td className="px-5 py-4 text-sm text-zinc-300">{tenantPlan(t)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(t.status)}`}>
                          {t.status || '—'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-zinc-300">{tenantBillingCycle(t)}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-emerald-300">{formatCurrency(t.expectedMonthlyValue)}</td>
                      <td className="px-5 py-4 text-sm text-zinc-300">
                        <div>{formatDate(t.lastPaymentAt || null)}</div>
                        <div className="mt-0.5 text-xs text-zinc-500">{formatCurrency(t.lastPaymentValue)}</div>
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <span className={Number(t.daysOverdue || 0) > 0 ? 'text-red-300' : 'text-zinc-500'}>
                          {Number(t.daysOverdue || 0) > 0 ? `${t.daysOverdue} dias` : 'Em dia'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <Link href={`/admin/tenants/${t.id}`}
                          className="inline-flex items-center rounded-xl border border-[#CCA761]/30 bg-[#CCA761]/10 px-3 py-2 text-sm font-medium text-[#CCA761] transition hover:bg-[#CCA761]/15"
                        >
                          Ver
                        </Link>
                      </td>
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
