'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type TenantDetail = {
  id: string
  name: string
  plan_type: string | null
  status: 'trial' | 'ativo' | 'inadimplente' | 'cancelado' | string | null
  billing_cycle: 'mensal' | 'anual' | string | null
  created_at: string | null
  activated_at: string | null
  billing_cycle_end: string | null
  max_processos: number | null
  cnpj: string | null
  asaas_customer_id: string | null
}

type TenantUser = {
  id: string
  full_name: string | null
  email_corporativo: string | null
  role: string | null
  is_active: boolean | null
  created_at: string | null
}

type ActionType = 'ativo' | 'inadimplente' | 'cancelado'

function formatDate(date: string | null) {
  if (!date) return '—'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('pt-BR')
}

function statusBadgeClass(status: TenantDetail['status']) {
  switch (status) {
    case 'trial':        return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
    case 'ativo':        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    case 'inadimplente': return 'border-red-500/30 bg-red-500/10 text-red-300'
    case 'cancelado':    return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300'
    default:             return 'border-zinc-700 bg-zinc-800/70 text-zinc-300'
  }
}

function actionButtonClass(status: ActionType) {
  switch (status) {
    case 'ativo':        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
    case 'inadimplente': return 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/15'
    case 'cancelado':    return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300 hover:bg-zinc-500/15'
  }
}

export default function AdminTenantDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const tenantId = useMemo(() => {
    const raw = params?.id
    return Array.isArray(raw) ? raw[0] : raw
  }, [params])

  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [tenant, setTenant] = useState<TenantDetail | null>(null)
  const [users, setUsers] = useState<TenantUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<Record<ActionType, boolean>>({
    ativo: false, inadimplente: false, cancelado: false,
  })

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

        if (!tenantId) throw new Error('Tenant inválido.')
        if (isMounted) setAccessToken(session.access_token)

        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
        const [tenantRes, usersRes] = await Promise.all([
          fetch(`/api/admin/tenants/${tenantId}`, { headers }),
          fetch(`/api/admin/tenants/${tenantId}/users`, { headers }),
        ])
        const [tenantData, usersData] = await Promise.all([
          tenantRes.json().catch(() => null),
          usersRes.json().catch(() => null),
        ])
        if (!tenantRes.ok) throw new Error(tenantData?.error || 'Não foi possível carregar o tenant.')
        if (!usersRes.ok)  throw new Error(usersData?.error  || 'Não foi possível carregar os usuários.')
        if (isMounted) {
          setTenant(tenantData?.tenant ?? null)
          setUsers(Array.isArray(usersData?.users) ? usersData.users : [])
        }
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : 'Erro ao carregar página.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadPage()
    return () => { isMounted = false }
  }, [router, tenantId])

  async function handleStatusChange(nextStatus: ActionType) {
    if (!tenantId || !accessToken || !tenant) return
    const label = nextStatus === 'ativo' ? 'ativar' : nextStatus === 'inadimplente' ? 'bloquear' : 'cancelar'
    if (!window.confirm(`Tem certeza que deseja ${label} este tenant?`)) return

    setActionLoading((prev) => ({ ...prev, [nextStatus]: true }))
    setError('')
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Não foi possível atualizar o status.')
      setTenant((prev) => prev ? { ...prev, status: nextStatus } : prev)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar status.')
    } finally {
      setActionLoading((prev) => ({ ...prev, [nextStatus]: false }))
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {loading ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <p className="text-sm text-zinc-400">Carregando tenant...</p>
          </div>
        ) : error && !tenant ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-red-300">{error}</div>
        ) : tenant ? (
          <div className="space-y-8">
            <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl backdrop-blur-sm">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <Link href="/admin" className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.05] hover:text-white">
                    ← Voltar
                  </Link>
                  <span className="inline-flex w-fit rounded-full border border-[#CCA761]/30 bg-[#CCA761]/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-[#CCA761]">
                    Superadmin
                  </span>
                  <h1 className="text-3xl font-semibold tracking-tight text-white">{tenant.name || 'Tenant'}</h1>
                </div>
                <span className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-medium ${statusBadgeClass(tenant.status)}`}>
                  {tenant.status || '—'}
                </span>
              </div>
              {error && <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                ['Plano', tenant.plan_type],
                ['Ciclo', tenant.billing_cycle],
                ['Processos', tenant.max_processos],
                ['Trial ends at', formatDate(tenant.billing_cycle_end)],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</div>
                  <div className="mt-3 text-2xl font-semibold text-white">{value ?? '—'}</div>
                </div>
              ))}
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="mb-5 text-lg font-semibold text-white">Informações do tenant</h2>
              <div className="overflow-hidden rounded-2xl border border-white/10">
                <table className="min-w-full border-collapse">
                  <tbody>
                    {[
                      ['ID', tenant.id],
                      ['CNPJ', tenant.cnpj],
                      ['ASAAS Customer ID', tenant.asaas_customer_id],
                      ['Criado em', formatDate(tenant.created_at)],
                      ['Ativado em', formatDate(tenant.activated_at)],
                    ].map(([label, value]) => (
                      <tr key={String(label)} className="border-b border-white/5 last:border-b-0">
                        <td className="w-[220px] bg-white/[0.02] px-4 py-3 text-sm font-medium text-zinc-400">{label}</td>
                        <td className="px-4 py-3 text-sm text-white">{value || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="mb-5 text-lg font-semibold text-white">Usuários do tenant</h2>
              <div className="overflow-hidden rounded-2xl border border-white/10">
                {users.length === 0 ? (
                  <p className="px-4 py-8 text-sm text-zinc-500">Nenhum usuário encontrado.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.02]">
                          {['Nome','E-mail','Role','Status','Criado em'].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.id} className="border-b border-white/5 transition hover:bg-white/[0.02] last:border-b-0">
                            <td className="px-4 py-3 text-sm text-white">{u.full_name || '—'}</td>
                            <td className="px-4 py-3 text-sm text-zinc-300">{u.email_corporativo || '—'}</td>
                            <td className="px-4 py-3 text-sm text-zinc-300">{u.role || '—'}</td>
                            <td className="px-4 py-3 text-sm text-zinc-300">{u.is_active ? 'Ativo' : 'Inativo'}</td>
                            <td className="px-4 py-3 text-sm text-zinc-300">{formatDate(u.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="mb-5 text-lg font-semibold text-white">Ações</h2>
              <div className="flex flex-wrap gap-3">
                {(['ativo', 'inadimplente', 'cancelado'] as ActionType[]).map((action) => (
                  <button key={action} type="button"
                    onClick={() => handleStatusChange(action)}
                    disabled={actionLoading[action]}
                    className={`inline-flex items-center rounded-2xl border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${actionButtonClass(action)}`}
                  >
                    {actionLoading[action]
                      ? action === 'ativo' ? 'Ativando...' : action === 'inadimplente' ? 'Bloqueando...' : 'Cancelando...'
                      : action === 'ativo' ? 'Ativar' : action === 'inadimplente' ? 'Bloquear' : 'Cancelar'}
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  )
}
