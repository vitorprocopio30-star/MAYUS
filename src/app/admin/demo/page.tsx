'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type DemoTenant = {
  id: string
  name: string | null
  status: string | null
  plan_type: string | null
  created_at: string | null
  demo_mode: boolean
  drive_mode: string | null
  whatsapp_mode: string | null
  escavador_mode: string | null
  updated_at: string | null
  drive_readiness?: DriveReadiness | null
}

type DemoResetResult = {
  dryRun: boolean
  tenantId: string
  tenantName?: string
  preview?: {
    totalCases?: number
    heroCases?: number
    volumeCases?: number
    legalAreas?: string[]
  }
  inserted?: Record<string, number>
  deleted?: Record<string, number>
}

type DriveReadiness = {
  available: boolean
  connected: boolean
  status: string | null
  connected_email: string | null
  root_folder_configured: boolean
  root_folder_name: string | null
  root_folder_url: string | null
}

function formatDate(value?: string | null) {
  if (!value) return 'Sem registro'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sem registro'
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function demoBadgeClass(enabled: boolean) {
  return enabled
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : 'border-zinc-700 bg-zinc-900 text-zinc-400'
}

function countTotal(record?: Record<string, number>) {
  if (!record) return 0
  return Object.values(record).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)
}

function driveReadinessLabel(readiness?: DriveReadiness | null) {
  if (!readiness?.available) return 'Configurar OAuth'
  if (!readiness.connected) return 'Conectar conta'
  if (!readiness.root_folder_configured) return 'Definir pasta raiz'
  return 'Pronto para demonstrar'
}

function driveReadinessBadgeClass(readiness?: DriveReadiness | null) {
  if (readiness?.connected && readiness.root_folder_configured) {
    return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
  }

  return 'border-amber-400/30 bg-amber-500/10 text-amber-100'
}

export default function AdminDemoPage() {
  const router = useRouter()
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [tenants, setTenants] = useState<DemoTenant[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [lastResult, setLastResult] = useState<DemoResetResult | null>(null)

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) || null,
    [selectedTenantId, tenants],
  )

  const loadDemoStatus = useCallback(async (token: string) => {
    const response = await fetch('/api/admin/demo/status', {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.error || 'Nao foi possivel carregar a conta modelo.')

    const nextTenants = Array.isArray(data?.tenants) ? data.tenants as DemoTenant[] : []
    setTenants(nextTenants)
    setSelectedTenantId((current) => {
      if (current && nextTenants.some((tenant) => tenant.id === current)) return current
      return nextTenants.find((tenant) => tenant.demo_mode)?.id || nextTenants[0]?.id || ''
    })
  }, [])

  useEffect(() => {
    let isMounted = true

    async function load() {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          router.replace('/login')
          return
        }

        if (!isMounted) return
        setAccessToken(session.access_token)
        await loadDemoStatus(session.access_token)
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : 'Erro ao carregar painel demo.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    load()
    return () => { isMounted = false }
  }, [loadDemoStatus, router])

  async function updateDemoMode(nextValue: boolean) {
    if (!accessToken || !selectedTenant) return
    setBusy('demo-mode')
    setError('')

    try {
      const response = await fetch('/api/admin/demo/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ tenantId: selectedTenant.id, demoMode: nextValue }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Nao foi possivel atualizar o status demo.')
      await loadDemoStatus(accessToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar status demo.')
    } finally {
      setBusy(null)
    }
  }

  async function executeReset(dryRun: boolean) {
    if (!accessToken || !selectedTenant) return
    setBusy(dryRun ? 'dry-run' : 'reset')
    setError('')
    setLastResult(null)

    try {
      const response = await fetch('/api/admin/demo/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          tenantId: selectedTenant.id,
          dryRun,
          confirm: dryRun ? undefined : resetConfirm,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Nao foi possivel executar o reset demo.')
      setLastResult(data as DemoResetResult)
      if (!dryRun) setResetConfirm('')
      await loadDemoStatus(accessToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao executar reset demo.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <Link href="/admin" className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.05] hover:text-white">
              Voltar
            </Link>
            <span className="inline-flex w-fit rounded-full border border-[#CCA761]/30 bg-[#CCA761]/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-[#CCA761]">
              Demo Ops
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">Conta Modelo MAYUS</h1>
            <p className="mt-2 text-sm text-zinc-400">
              {loading ? 'Carregando...' : `${tenants.filter((tenant) => tenant.demo_mode).length} tenant(s) demo ativo(s)`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-sm text-zinc-400">Carregando painel demo...</div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
            <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="mb-5 text-lg font-semibold text-white">Tenants</h2>
              <div className="space-y-3">
                {tenants.map((tenant) => (
                  <button
                    key={tenant.id}
                    type="button"
                    onClick={() => setSelectedTenantId(tenant.id)}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${selectedTenantId === tenant.id ? 'border-[#CCA761]/40 bg-[#CCA761]/10' : 'border-white/10 bg-black/20 hover:bg-white/[0.04]'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{tenant.name || 'Tenant sem nome'}</p>
                        <p className="mt-1 truncate text-xs text-zinc-500">{tenant.id}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${demoBadgeClass(tenant.demo_mode)}`}>
                        {tenant.demo_mode ? 'Demo' : 'Normal'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-6">
              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
              )}

              {selectedTenant ? (
                <>
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Tenant selecionado</p>
                        <h2 className="mt-2 text-2xl font-semibold text-white">{selectedTenant.name || selectedTenant.id}</h2>
                        <p className="mt-2 text-sm text-zinc-400">
                          Criado em {formatDate(selectedTenant.created_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateDemoMode(!selectedTenant.demo_mode)}
                        disabled={busy === 'demo-mode'}
                        className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-60 ${selectedTenant.demo_mode ? 'border-zinc-600 bg-zinc-900 text-zinc-200 hover:bg-zinc-800' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15'}`}
                      >
                        {busy === 'demo-mode'
                          ? 'Atualizando...'
                          : selectedTenant.demo_mode ? 'Desativar demo' : 'Marcar como demo'}
                      </button>
                    </div>

                    <div className="mt-6 grid gap-3 md:grid-cols-4">
                      {[
                        ['Status', selectedTenant.status || 'Sem status'],
                        ['Plano', selectedTenant.plan_type || 'Sem plano'],
                        ['Drive', selectedTenant.drive_mode || 'real_demo_account'],
                        ['WhatsApp', selectedTenant.whatsapp_mode || 'simulator'],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
                          <p className="mt-2 truncate text-sm font-semibold text-white">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Drive dedicado</p>
                          <h3 className="mt-2 text-base font-semibold text-white">
                            {driveReadinessLabel(selectedTenant.drive_readiness)}
                          </h3>
                        </div>
                        <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${driveReadinessBadgeClass(selectedTenant.drive_readiness)}`}>
                          {selectedTenant.drive_readiness?.connected ? 'Conectado' : 'Pendente'}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        {[
                          ['Conta', selectedTenant.drive_readiness?.connected_email || 'Nao conectada'],
                          [
                            'Pasta raiz',
                            selectedTenant.drive_readiness?.root_folder_name
                              || (selectedTenant.drive_readiness?.root_folder_configured ? 'Configurada' : 'Pendente'),
                          ],
                          ['OAuth', selectedTenant.drive_readiness?.available ? (selectedTenant.drive_readiness?.status || 'disconnected') : 'Indisponivel'],
                        ].map(([label, value]) => (
                          <div key={label} className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
                            <p className="mt-2 truncate text-sm font-semibold text-white">{value}</p>
                          </div>
                        ))}
                      </div>

                      {selectedTenant.drive_readiness?.root_folder_url && (
                        <a
                          href={selectedTenant.drive_readiness.root_folder_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-flex rounded-xl border border-[#CCA761]/30 bg-[#CCA761]/10 px-3 py-2 text-sm font-semibold text-[#CCA761] transition hover:bg-[#CCA761]/15"
                        >
                          Abrir pasta raiz
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-white">Reset da Conta Modelo</h2>
                        <p className="mt-2 text-sm text-zinc-400">Dataset sintetico, OAB ficticia, WhatsApp demo e Drive real dedicado.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => executeReset(true)}
                        disabled={busy === 'dry-run' || !selectedTenant.demo_mode}
                        className="rounded-2xl border border-[#CCA761]/30 bg-[#CCA761]/10 px-4 py-3 text-sm font-semibold text-[#CCA761] transition hover:bg-[#CCA761]/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy === 'dry-run' ? 'Calculando...' : 'Dry-run'}
                      </button>
                    </div>

                    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-200">Reset real</p>
                      <div className="mt-3 flex flex-col gap-3 md:flex-row">
                        <input
                          value={resetConfirm}
                          onChange={(event) => setResetConfirm(event.target.value)}
                          placeholder="RESET_DEMO"
                          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-red-300/50"
                        />
                        <button
                          type="button"
                          onClick={() => executeReset(false)}
                          disabled={busy === 'reset' || resetConfirm !== 'RESET_DEMO' || !selectedTenant.demo_mode}
                          className="rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busy === 'reset' ? 'Resetando...' : 'Executar reset'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {lastResult && (
                    <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-6">
                      <div className="mb-5 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-emerald-200">
                            {lastResult.dryRun ? 'Dry-run concluido' : 'Reset concluido'}
                          </p>
                          <h2 className="mt-2 text-xl font-semibold text-white">{lastResult.tenantName || selectedTenant.name || lastResult.tenantId}</h2>
                        </div>
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-emerald-100">
                          OK
                        </span>
                      </div>
                      <div className="grid gap-3 md:grid-cols-4">
                        {[
                          ['Casos', lastResult.preview?.totalCases ?? 0],
                          ['Vitrine', lastResult.preview?.heroCases ?? 0],
                          ['Volume', lastResult.preview?.volumeCases ?? 0],
                          [lastResult.dryRun ? 'Inseridos' : 'Operacoes', lastResult.dryRun ? 0 : countTotal(lastResult.inserted)],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-2xl border border-emerald-400/15 bg-black/20 px-4 py-3">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-200/80">{label}</p>
                            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-sm text-zinc-400">
                  Nenhum tenant cadastrado.
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
