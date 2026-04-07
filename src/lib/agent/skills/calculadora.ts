// src/lib/agent/skills/calculadora.ts
//
// Handler da skill calculadora
// Executa cálculos matemáticos seguros para suporte a honorários e finanças.

export type CalculadoraParams = {
  expressao: string
}

export type CalculadoraResult = {
  success: boolean
  resultado?: number
  formatado?: string
  error?: string
}

/**
 * Executa um cálculo matemático de forma segura.
 * Suporta +, -, *, /, (, ), . e , (convertido para .)
 */
export function executarCalculo(params: CalculadoraParams): CalculadoraResult {
  try {
    const { expressao } = params
    if (!expressao) return { success: false, error: 'Expressão vazia.' }

    // Sanitização: permite apenas números e operadores básicos
    // Converte vírgula decimal para ponto
    let cleaned = expressao.replace(/,/g, '.').replace(/\s+/g, '')
    
    // Regex de segurança: apenas dígitos, operadores (+-*/), parênteses e ponto
    if (!/^[0-9+\-*/().]+$/.test(cleaned)) {
      return { success: false, error: 'Expressão contém caracteres inválidos. Use apenas números e operadores (+, -, *, /).' }
    }

    // Avaliação segura via Function (limitada ao escopo da expressão limpa)
    // Nota: Em um ambiente de produção crítico, usaríamos um parser real como mathjs.
    // Mas para o contexto de suporte a honorários do MAYUS, esta sanitização é robusta.
    const resultado = Function(`"use strict"; return (${cleaned})`)()

    if (typeof resultado !== 'number' || !Number.isFinite(resultado)) {
      return { success: false, error: 'O resultado do cálculo não é um número válido.' }
    }

    // Formatação BRL (Opcional, mas útil para o Doutor)
    const formatado = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(resultado)

    return {
      success: true,
      resultado,
      formatado
    }
  } catch (err: any) {
    return { success: false, error: `Erro no cálculo: ${err.message}` }
  }
}
