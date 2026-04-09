import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

  const { numero_processo, movimentacoes } = await req.json()
  if (!movimentacoes || !Array.isArray(movimentacoes)) {
    return NextResponse.json({ error: 'Dados insuficientes' }, { status: 400 })
  }

  // Preparar prompt focado em PREVIDENCIÁRIO (conforme pedido do usuário)
  const prompt = `VOCÊ É O MAYUS, UM ESPECIALISTA EM DIREITO PREVIDENCIÁRIO.
OS DADOS ABAIXO SÃO OFICIAIS E FORNECIDOS DIRETAMENTE DO TRIBUNAL. 
NÃO DIGA QUE NÃO TEM ACESSO OU QUE PRECISA DE INTERNET. VOCÊ TEM OS DADOS.

Resuma o processo ${numero_processo} em EXATAMENTE 3 bullets estratégicos.
Foco: 
1. Prazos fatais e urgências.
2. Decisões do juiz sobre benefícios, RPV ou precatórios.
3. Próximo passo imediato para o advogado.

LOG DE MOVIMENTAÇÕES (USE ESTE CONTEÚDO PARA RESUMIR):
${movimentacoes.map(m => `- [${m.data || 'S/D'}] ${m.titulo || m.texto || m.descricao}`).slice(0, 10).join('\n')}

Linguagem: Profissional, assertiva e focada na vitória do segurado.
RESUMO (3 bullets):`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'Você é um assistente jurídico especializado. Use apenas os dados fornecidos. Nunca recuse um pedido alegando falta de acesso a dados em tempo real.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      })
    })

    const data = await res.json()
    const resumo = data.choices?.[0]?.message?.content || 'Não foi possível gerar o resumo estrategicamente.'

    return NextResponse.json({ resumo })
  } catch (err) {
    console.error('[resumir-ia]', err)
    return NextResponse.json({ error: 'Falha na IA' }, { status: 500 })
  }
}
