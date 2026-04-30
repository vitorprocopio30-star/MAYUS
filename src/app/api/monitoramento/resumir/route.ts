import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { callLLMWithFallback } from '@/lib/llm-fallback'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()
  if (!profile?.tenant_id) return NextResponse.json({ error: 'Tenant nao encontrado' }, { status: 400 })

  const { numero_processo, movimentacoes } = await req.json()
  if (!movimentacoes || !Array.isArray(movimentacoes)) {
    return NextResponse.json({ error: 'Dados insuficientes' }, { status: 400 })
  }

  const prompt = `VOCE E O MAYUS, UM ESPECIALISTA EM DIREITO PREVIDENCIARIO.
OS DADOS ABAIXO SAO OFICIAIS E FORNECIDOS DIRETAMENTE DO TRIBUNAL.
NAO DIGA QUE NAO TEM ACESSO OU QUE PRECISA DE INTERNET. VOCE TEM OS DADOS.

Resuma o processo ${numero_processo} em EXATAMENTE 3 bullets estrategicos.
Foco:
1. Prazos fatais e urgencias.
2. Decisoes do juiz sobre beneficios, RPV ou precatorios.
3. Proximo passo imediato para o advogado.

LOG DE MOVIMENTACOES (USE ESTE CONTEUDO PARA RESUMIR):
${movimentacoes.map(m => `- [${m.data || 'S/D'}] ${m.titulo || m.texto || m.descricao}`).slice(0, 10).join('\n')}

Linguagem: Profissional, assertiva e focada na vitoria do segurado.
RESUMO (3 bullets):`

  try {
    const aiResult = await callLLMWithFallback<any>({
      supabase,
      tenantId: profile.tenant_id,
      useCase: 'resumo_juridico',
      request: {
        messages: [
          { role: 'system', content: 'Voce e um assistente juridico especializado. Use apenas os dados fornecidos. Nunca recuse um pedido alegando falta de acesso a dados em tempo real.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      },
    })

    if (aiResult.ok === false) {
      return NextResponse.json(
        {
          error: aiResult.notice.message,
          ai_notice: aiResult.notice,
        },
        { status: aiResult.failureKind === 'missing_key' || aiResult.failureKind === 'invalid_key' ? 400 : 503 }
      )
    }

    const data = aiResult.data
    const resumo = data.choices?.[0]?.message?.content || 'Nao foi possivel gerar o resumo estrategicamente.'

    return NextResponse.json({ resumo, ai_notice: aiResult.notice || null })
  } catch (err) {
    console.error('[resumir-ia]', err)
    return NextResponse.json({ error: 'Falha na IA' }, { status: 500 })
  }
}
