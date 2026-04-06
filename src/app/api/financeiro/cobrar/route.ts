import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { executarCobranca } from '@/lib/agent/skills/financeiro/asaas-cobrar'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const CobrarSchema = z.object({
  descricao: z.string().min(3),
  valor: z.number().positive(),
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida. Use YYYY-MM-DD.'),
})

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('tenant_id, role').eq('id', user.id)
      .maybeSingle<{ tenant_id: string | null; role: string | null }>()

    if (profileError || !profile) return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

    const rawBody = await req.json().catch(() => null)
    const parsed = CobrarSchema.safeParse({
      descricao: rawBody?.descricao,
      valor: typeof rawBody?.valor === 'string' ? Number(rawBody.valor) : rawBody?.valor,
      vencimento: rawBody?.vencimento,
    })

    if (!parsed.success)
      return NextResponse.json({ error: 'Dados inválidos.', detalhes: parsed.error.flatten().fieldErrors }, { status: 422 })

    const result = await executarCobranca({
      tenantId: profile.tenant_id ?? '',
      descricao: parsed.data.descricao,
      valor: parsed.data.valor,
      vencimento: parsed.data.vencimento,
    })

    if (!result.success)
      return NextResponse.json({ error: result.error ?? 'Falha ao gerar cobrança.' }, { status: 502 })

    return NextResponse.json({ success: true, cobrancaId: result.cobrancaId }, { status: 200 })
  } catch (err) {
    console.error('[FINANCEIRO_COBRAR] Erro inesperado:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
