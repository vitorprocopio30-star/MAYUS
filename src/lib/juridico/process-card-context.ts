type ProcessParties = {
  polo_ativo?: unknown
  polo_passivo?: unknown
  ativo?: unknown
  passivo?: unknown
} | null | undefined

type ProcessCardContext = {
  cliente_nome?: unknown
  client_name?: unknown
  nome_cliente?: unknown
  cliente?: unknown
  partes?: ProcessParties
  polo_ativo?: unknown
  numero_processo?: unknown
  numero_cnj?: unknown
  tribunal?: unknown
  classe_processual?: unknown
  assunto?: unknown
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function validText(value: unknown): string {
  const text = cleanText(value)
  if (!text || text === '-' || text === '--' || text === '---') return ''
  if (text === '—' || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return ''
  return text
}

export function pickExplicitClientName(source: ProcessCardContext): string {
  return (
    validText(source.cliente_nome) ||
    validText(source.client_name) ||
    validText(source.nome_cliente) ||
    validText(source.cliente)
  )
}

export function pickProcessPartyName(source: ProcessCardContext): string {
  const partes = source.partes
  return validText(partes?.polo_ativo) || validText(partes?.ativo) || validText(source.polo_ativo)
}

export function buildProcessCardClientName(source: ProcessCardContext): string {
  return pickExplicitClientName(source) || pickProcessPartyName(source)
}

export function buildProcessCardTitle(source: ProcessCardContext): string {
  return buildProcessCardClientName(source) || validText(source.numero_processo) || validText(source.numero_cnj) || 'Processo'
}

function looksLikeRawEscavadorText(value: string): boolean {
  if (!value) return false
  if (value.length > 700) return true
  if (/^[{\[]/.test(value)) return true
  return /("conteudo"|"fontes"|"movimentacoes"|processo_fonte_id|raw_escavador)/i.test(value)
}

export function buildProcessCardDescription(params: {
  processo: ProcessCardContext
  resumoCurto?: unknown
  proximaAcao?: unknown
}): string {
  const resumo = validText(params.resumoCurto)
  if (resumo && !looksLikeRawEscavadorText(resumo)) return resumo

  const numero = validText(params.processo.numero_processo) || validText(params.processo.numero_cnj)
  const tribunal = validText(params.processo.tribunal)
  const classe = validText(params.processo.classe_processual)
  const assunto = validText(params.processo.assunto)
  const proximaAcao = validText(params.proximaAcao)

  const partes = [
    numero ? `Processo ${numero}` : 'Processo monitorado',
    tribunal ? `em ${tribunal}` : null,
    classe || assunto ? `sobre ${classe || assunto}` : null,
  ].filter(Boolean)

  const contexto = `${partes.join(' ')}.`
  return proximaAcao
    ? `${contexto} Proxima acao sugerida: ${proximaAcao}.`
    : `${contexto} Resumo processual pendente de organizacao.`
}
