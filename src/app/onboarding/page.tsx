'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ESTADOS_OAB = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

export default function OnboardingPage() {
  const router = useRouter()

  const [oabNumero, setOabNumero] = useState('')
  const [oabEstado, setOabEstado] = useState('RJ')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    const numeroLimpo = oabNumero.replace(/\D/g, '')
    if (!numeroLimpo) { setError('Informe o número da OAB.'); return }
    if (!oabEstado)   { setError('Selecione o estado da OAB.'); return }

    try {
      setLoading(true)
      const res = await fetch('/api/onboarding/oab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oab_numero: numeroLimpo, oab_estado: oabEstado }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error || 'Não foi possível importar seus processos agora.'); return }
      router.push('/dashboard')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-10">
        <div className="w-full max-w-md rounded-3xl border border-[#CCA761]/20 bg-white/[0.03] p-8 shadow-2xl backdrop-blur-sm">
          <div className="mb-8">
            <div className="mb-3 inline-flex items-center rounded-full border border-[#CCA761]/25 bg-[#CCA761]/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-[#CCA761]">
              Onboarding
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">Bem-vindo ao MAYUS</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Vamos configurar seu escritório.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="oab_numero" className="text-sm font-medium text-zinc-200">
                Número da OAB
              </label>
              <div className="grid grid-cols-3 gap-3">
                <input
                  id="oab_numero" type="text" inputMode="numeric" placeholder="123456"
                  value={oabNumero} onChange={(e) => setOabNumero(e.target.value)} disabled={loading}
                  className="col-span-2 h-12 rounded-2xl border border-white/10 bg-[#111111] px-4 text-white outline-none transition placeholder:text-zinc-500 focus:border-[#CCA761]/60 focus:ring-2 focus:ring-[#CCA761]/20"
                />
                <select
                  value={oabEstado} onChange={(e) => setOabEstado(e.target.value)} disabled={loading}
                  className="h-12 rounded-2xl border border-white/10 bg-[#111111] px-4 text-white outline-none transition focus:border-[#CCA761]/60 focus:ring-2 focus:ring-[#CCA761]/20"
                >
                  {ESTADOS_OAB.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
              <p className="text-xs text-zinc-500">Use apenas o número da inscrição. Exemplo: 123456</p>
            </div>

            <button type="submit" disabled={loading}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#CCA761] px-4 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Importando...' : 'Importar meus processos'}
            </button>

            {error && <p className="text-sm text-red-400">{error}</p>}
          </form>

          <button type="button" onClick={() => router.push('/dashboard')} disabled={loading}
            className="mt-6 text-sm text-zinc-400 transition hover:text-[#CCA761] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Pular por agora → Ir para o sistema
          </button>
        </div>
      </div>
    </main>
  )
}
