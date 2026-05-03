'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type SupportTenant = {
  id: string
  name: string | null
  status: string | null
  plan_type: string | null
  created_at: string | null
  demo_mode: boolean
  active_users: number
  integrations: {
    total: number
    connected: number
    pending: number
    drive_connected: boolean
    whatsapp_connected: boolean
    billing_connected: boolean
    signature_connected: boolean
    escavador_connected: boolean
  }
  support: {
    can_view_setup_without_grant: boolean
    requires_grant_for_sensitive_access: boolean
    grant_status: string
    active_grant: {
      id: string
      scope: string[]
      status: string
      expires_at: string
      requested_by: string | null
      created_at: string | null
    } | null
  }
}

type SensitiveSummary = {
  tenant: {
    id: string
    name: string | null
  }
  grant: {
    id: string
    expires_at: string
    scope: string[]
  }
  summary: {
    raw_data_included: boolean
    active_users: number
    users_by_role: Record<string, number>
    integrations_by_status: Record<string, number>
    recent_events: Array<{
      event_name: string
      status: string | null
      source: string | null
      created_at: string | null
    }>
  }
}

type SupportInboxItem = {
  id: string
  tenant_id: string | null
  user_id: string | null
  event_name: string
  source: string | null
  status: string | null
  created_at: string | null
  payload: {
    tenant_id: string | null
    grant_id: string | null
    scope: string[]
    duration_minutes: number | null
    summary_type: string | null
    sensitive_data_included: boolean
  }
}

function statusBadgeClass(status: string | null) {
  switch (status) {
    case 'ativo':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    case 'trial':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200'
    case 'inadimplente':
      return 'border-red-500/30 bg-red-500/10 text-red-200'
    case 'cancelado':
      return 'border-zinc-600 bg-zinc-900 text-zinc-300'
    default:
      return 'border-white/10 bg-white/[0.03] text-zinc-300'
  }
}

function readinessText(tenant: SupportTenant) {
  const checks = [
    tenant.integrations.drive_connected,
    tenant.integrations.whatsapp_connected,
    tenant.integrations.billing_connected,
    tenant.integrations.signature_connected,
    tenant.integrations.escavador_connected,
  ]
  const ready = checks.filter(Boolean).length
  return `${ready}/5`
}

export default function AdminSupportPage() {
  const router = useRouter()
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [grantReasons, setGrantReasons] = useState<Record<string, string>>({})
  const [tenants, setTenants] = useState<SupportTenant[]>([])
  const [summary, setSummary] = useState<SensitiveSummary | null>(null)
  const [inboxItems, setInboxItems] = useState<SupportInboxItem[]>([])

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

        if (isMounted) setAccessToken(session.access_token)
        const response = await fetch('/api/admin/support/tenants', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Nao foi possivel carregar suporte MAYUS.')
        if (isMounted) setTenants(Array.isArray(data?.tenants) ? data.tenants : [])

        const inboxResponse = await fetch('/api/admin/support/inbox', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        })
        const inboxData = await inboxResponse.json().catch(() => null)
        if (inboxResponse.ok && isMounted) {
          setInboxItems(Array.isArray(inboxData?.items) ? inboxData.items : [])
        }
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : 'Erro ao carregar suporte MAYUS.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadPage()
    return () => { isMounted = false }
  }, [router])

  async function reloadTenants(token = accessToken) {
    if (!token) return
    const response = await fetch('/api/admin/support/tenants', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.error || 'Nao foi possivel atualizar suporte MAYUS.')
    setTenants(Array.isArray(data?.tenants) ? data.tenants : [])
    await reloadInbox(token)
  }

  async function reloadInbox(token = accessToken) {
    if (!token) return
    const response = await fetch('/api/admin/support/inbox', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const data = await response.json().catch(() => null)
    if (response.ok) setInboxItems(Array.isArray(data?.items) ? data.items : [])
  }

  async function createGrant(tenant: SupportTenant) {
    if (!accessToken) return
    const reason = (grantReasons[tenant.id] || '').trim()
    if (reason.length < 8) {
      setError('Informe um motivo com pelo menos 8 caracteres para criar o grant.')
      return
    }

    setBusy(`grant:${tenant.id}`)
    setError('')
    try {
      const response = await fetch('/api/admin/support/grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          tenantId: tenant.id,
          reason,
          durationMinutes: 60,
          scope: ['tenant_sensitive_readonly', 'support_case'],
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Nao foi possivel criar grant de suporte.')
      setGrantReasons((current) => ({ ...current, [tenant.id]: '' }))
      await reloadTenants()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar grant de suporte.')
    } finally {
      setBusy(null)
    }
  }

  async function revokeGrant(tenant: SupportTenant) {
    if (!accessToken || !tenant.support.active_grant?.id) return
    setBusy(`revoke:${tenant.id}`)
    setError('')
    try {
      const response = await fetch(`/api/admin/support/grants/${tenant.support.active_grant.id}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Nao foi possivel revogar grant de suporte.')
      await reloadTenants()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao revogar grant de suporte.')
    } finally {
      setBusy(null)
    }
  }

  async function loadSensitiveSummary(tenant: SupportTenant) {
    if (!accessToken) return
    setBusy(`summary:${tenant.id}`)
    setError('')
    setSummary(null)
    try {
      const response = await fetch(`/api/admin/support/tenants/${tenant.id}/sensitive-summary`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Nao foi possivel carregar resumo protegido.')
      setSummary(data as SensitiveSummary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar resumo protegido.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <Link href="/admin" className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.05] hover:text-white">
              Voltar
            </Link>
            <span className="inline-flex w-fit rounded-full border border-[#CCA761]/30 bg-[#CCA761]/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-[#CCA761]">
              Suporte
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">Suporte MAYUS</h1>
            <p className="mt-2 text-sm text-zinc-400">
              {loading ? 'Carregando...' : `${tenants.length} tenant(s) visiveis para suporte operacional`}
            </p>
          </div>
        </div>

        <section className="mb-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#CCA761]">Inbox de suporte</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Eventos operacionais recentes</h2>
            </div>
            <button
              type="button"
              onClick={() => reloadInbox()}
              disabled={busy === 'inbox'}
              className="w-fit rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.06] disabled:opacity-60"
            >
              Atualizar
            </button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {inboxItems.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhum evento de suporte recente.</p>
            ) : inboxItems.slice(0, 6).map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{item.event_name}</p>
                    <p className="mt-1 truncate text-xs text-zinc-500">{item.source || 'sem fonte'} - {item.status || 'sem status'}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[#CCA761]/30 bg-[#CCA761]/10 px-2 py-1 text-[10px] font-semibold text-[#CCA761]">
                    {item.payload.sensitive_data_included ? 'sensivel' : 'redigido'}
                  </span>
                </div>
                <p className="mt-3 truncate text-xs text-zinc-500">
                  {item.payload.grant_id ? `Grant ${item.payload.grant_id}` : item.tenant_id ? `Tenant ${item.tenant_id}` : 'Plataforma'}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-2xl backdrop-blur-sm">
          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center text-sm text-zinc-400">Carregando suporte...</div>
          ) : error ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
            </div>
          ) : tenants.length === 0 ? (
            <div className="flex min-h-[320px] items-center justify-center text-sm text-zinc-500">Nenhum tenant encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    {['Tenant', 'Status', 'Usuarios', 'Integracoes', 'Setup', 'Acesso', 'Grant'].map((heading) => (
                      <th key={heading} className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                      <td className="px-5 py-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{tenant.name || tenant.id}</p>
                          <p className="mt-1 truncate text-xs text-zinc-500">{tenant.plan_type || 'Sem plano'} {tenant.demo_mode ? '- Demo' : ''}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(tenant.status)}`}>
                          {tenant.status || 'Sem status'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-zinc-300">{tenant.active_users}</td>
                      <td className="px-5 py-4 text-sm text-zinc-300">
                        {tenant.integrations.connected}/{tenant.integrations.total} conectadas
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full border border-[#CCA761]/30 bg-[#CCA761]/10 px-2.5 py-1 text-xs font-semibold text-[#CCA761]">
                          {readinessText(tenant)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-zinc-300">
                        {tenant.support.requires_grant_for_sensitive_access ? 'Grant exigido' : 'Livre'}
                      </td>
                      <td className="px-5 py-4">
                        {tenant.support.active_grant ? (
                          <div className="flex min-w-[220px] flex-col gap-2">
                            <span className="w-fit rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                              Ativo ate {new Date(tenant.support.active_grant.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <button
                              type="button"
                              onClick={() => loadSensitiveSummary(tenant)}
                              disabled={busy === `summary:${tenant.id}`}
                              className="w-fit rounded-xl border border-[#CCA761]/30 bg-[#CCA761]/10 px-3 py-2 text-xs font-semibold text-[#CCA761] transition hover:bg-[#CCA761]/15 disabled:opacity-60"
                            >
                              {busy === `summary:${tenant.id}` ? 'Carregando...' : 'Resumo protegido'}
                            </button>
                            <button
                              type="button"
                              onClick={() => revokeGrant(tenant)}
                              disabled={busy === `revoke:${tenant.id}`}
                              className="w-fit rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/15 disabled:opacity-60"
                            >
                              {busy === `revoke:${tenant.id}` ? 'Revogando...' : 'Revogar'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex min-w-[280px] flex-col gap-2">
                            <input
                              value={grantReasons[tenant.id] || ''}
                              onChange={(event) => setGrantReasons((current) => ({ ...current, [tenant.id]: event.target.value }))}
                              placeholder="Motivo do atendimento"
                              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-[#CCA761]/50"
                            />
                            <button
                              type="button"
                              onClick={() => createGrant(tenant)}
                              disabled={busy === `grant:${tenant.id}`}
                              className="w-fit rounded-xl border border-[#CCA761]/30 bg-[#CCA761]/10 px-3 py-2 text-xs font-semibold text-[#CCA761] transition hover:bg-[#CCA761]/15 disabled:opacity-60"
                            >
                              {busy === `grant:${tenant.id}` ? 'Criando...' : 'Criar grant 60min'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {summary && (
          <section className="mt-6 rounded-3xl border border-[#CCA761]/20 bg-[#CCA761]/10 p-6">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#CCA761]">Resumo protegido</p>
                <h2 className="mt-2 text-xl font-semibold text-white">{summary.tenant.name || summary.tenant.id}</h2>
                <p className="mt-2 text-sm text-zinc-300">Dados redigidos, sem payload bruto, token, cliente externo ou segredo.</p>
              </div>
              <span className="w-fit rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                Grant ativo
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {[
                ['Usuarios ativos', summary.summary.active_users],
                ['Roles', Object.keys(summary.summary.users_by_role).length],
                ['Status integracoes', Object.keys(summary.summary.integrations_by_status).length],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Usuarios por papel</p>
                <div className="mt-3 space-y-2">
                  {Object.entries(summary.summary.users_by_role).map(([role, count]) => (
                    <div key={role} className="flex items-center justify-between text-sm text-zinc-300">
                      <span>{role}</span>
                      <span className="font-semibold text-white">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Eventos recentes</p>
                <div className="mt-3 space-y-2">
                  {summary.summary.recent_events.length === 0 ? (
                    <p className="text-sm text-zinc-500">Sem eventos recentes.</p>
                  ) : summary.summary.recent_events.map((event) => (
                    <div key={`${event.event_name}-${event.created_at}`} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <p className="truncate text-sm font-semibold text-white">{event.event_name}</p>
                      <p className="mt-1 truncate text-xs text-zinc-500">{event.source || 'sem fonte'} - {event.status || 'sem status'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
