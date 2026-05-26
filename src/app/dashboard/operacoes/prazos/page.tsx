'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import type { MouseEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildAgendaPayloadFromProcessPrazo, syncAgendaTaskBySource } from '@/lib/agenda/userTasks'
import { PrazosDesignSystemView } from './PrazosDesignSystemView'

function formatarData(v: string | null): string {
  if (!v) return '—'
  const valor = String(v).trim()

  if (valor.includes('/')) {
    const part = valor.split(' ')[0]
    if (part.split('/').length === 3) return part
  }

  if (valor.includes('-')) {
    const normalized = valor.includes(' ') && valor.includes('-') ? valor.replace(' ', 'T') : valor
    const semTime = normalized.split('T')[0]
    const [a, m, d] = semTime.split('-').map(Number)
    if (Number.isFinite(a) && Number.isFinite(m) && Number.isFinite(d)) {
      return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`
    }
  }

  return '—'
}

function diasRestantes(data: string): number {
  const diff = new Date(data).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function adicionarDiasUteis(base: Date, dias: number): Date {
  const data = new Date(base)
  let count = 0
  while (count < dias) {
    data.setDate(data.getDate() + 1)
    const diaSemana = data.getDay()
    if (diaSemana !== 0 && diaSemana !== 6) count++
  }
  return data
}

function normalizarDescricaoPrazo(value: string | null | undefined): string {
  const texto = String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!texto) return 'sem-descricao'
  if (texto.includes('replica') && texto.includes('contest')) return 'replica_contestacao'
  if (texto.includes('contrarrazo') || texto.includes('contrarraz')) return 'contrarrazoes'
  if (texto.includes('embargos') && texto.includes('declar')) return 'embargos_declaracao'
  if (texto.includes('sentenca') && (texto.includes('public') || texto.includes('grupo') || texto.includes('prolacao') || texto.includes('julg'))) {
    return 'sentenca_monitoramento'
  }

  return texto
}

function ehPrazoDeSentenca(item: any): boolean {
  const texto = normalizarDescricaoPrazo(
    `${item?.tipo ?? ''} ${item?.descricao ?? ''} ${item?.monitored_processes?.ultima_movimentacao_texto ?? ''}`
  )
  return texto.includes('sentenca') || texto === 'sentenca_monitoramento' || item?.tipo === 'sentenca'
}

function obterVencimentoEmbargosDeclaracao(item: any): string | null {
  const base = [
    item?.monitored_processes?.data_ultima_movimentacao,
    item?.created_at,
    item?.data_vencimento,
  ].find((v) => !!v)

  if (!base) return null
  const dataBase = new Date(base)
  if (Number.isNaN(dataBase.getTime())) return null

  const venc = adicionarDiasUteis(dataBase, 5)
  return venc.toISOString()
}

function deduplicarPrazos(lista: any[]): any[] {
  const mapa = new Map<string, any>()

  for (const item of lista) {
    const escId = String(item?.escavador_movimentacao_id ?? '').trim()
    const dia = item?.data_vencimento ? new Date(item.data_vencimento).toISOString().slice(0, 10) : 'sem-data'
    const categoriaDescricao = normalizarDescricaoPrazo(item?.descricao)
    const agrupaveis = ['replica_contestacao', 'contrarrazoes', 'embargos_declaracao', 'sentenca_monitoramento']
    const agruparSemDia = agrupaveis.includes(categoriaDescricao)
    const identificadorProcesso = item?.monitored_process_id ?? item?.monitored_processes?.numero_processo ?? 'sem-processo'
    const chave = agruparSemDia
      ? [identificadorProcesso, item?.tipo ?? 'sem-tipo', categoriaDescricao, 'sem-dia'].join('|')
      : escId
        ? `esc-${escId}`
      : [
          identificadorProcesso,
          item?.tipo ?? 'sem-tipo',
          categoriaDescricao,
          dia
        ].join('|')

    const atual = mapa.get(chave)
    if (!atual) {
      mapa.set(chave, item)
      continue
    }

    if (agruparSemDia) {
      const atualVenc = new Date(atual?.data_vencimento || 0).getTime()
      const novoVenc = new Date(item?.data_vencimento || 0).getTime()
      if (Number.isFinite(novoVenc) && (!Number.isFinite(atualVenc) || novoVenc < atualVenc)) {
        mapa.set(chave, item)
        continue
      }
    }

    const atualTs = new Date(atual.created_at || 0).getTime()
    const novoTs = new Date(item.created_at || 0).getTime()
    if (novoTs > atualTs) {
      mapa.set(chave, item)
    }
  }

  return Array.from(mapa.values())
}

type TabType = 'movimentacoes' | 'prazos' | 'audiencias'

const LOCAL_DEV_TENANT_ID = 'mayus-local-tenant'
const LOCAL_DEV_USER = {
  id: 'mayus-local-user',
  email: 'local@mayus.dev',
  app_metadata: {
    role: 'admin',
    tenant_id: LOCAL_DEV_TENANT_ID,
  },
}
const LOCAL_DEV_PROFILE = {
  id: LOCAL_DEV_USER.id,
  tenant_id: LOCAL_DEV_TENANT_ID,
  full_name: 'MAYUS Local',
  avatar_url: null,
  is_active: true,
}

function isLocalNoLoginMode(): boolean {
  if (typeof window === 'undefined') return false
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
}

function addDaysIso(days: number): string {
  const data = new Date()
  data.setDate(data.getDate() + days)
  return data.toISOString()
}

function buildLocalDevPrazos() {
  const processos = [
    {
      numero_processo: '0803152-79.2025.8.19.0054',
      partes: {
        polo_ativo: 'Ministério Público do Estado do Rio de Janeiro',
        polo_passivo: 'Estado do Rio de Janeiro',
      },
      tribunal: 'TJRJ',
      comarca: 'Rio de Janeiro',
      vara: '4ª Vara de Fazenda Pública',
      assunto: 'Cumprimento de sentença',
      classe_processual: 'Procedimento comum cível',
      tipo_acao: 'Obrigação de fazer',
      fase_atual: 'Sentença publicada',
      data_ultima_movimentacao: addDaysIso(0),
      ultima_movimentacao_texto: 'Sentença publicada. Intimem-se as partes para ciência e eventual interposição de recurso no prazo legal.',
      resumo_curto: 'Processo em fase recursal, com prazo crítico para análise de embargos e apelação.',
      cliente_nome: 'Vitor Procópio',
      escavador_monitoramento_id: 'local-monitoramento-1',
    },
    {
      numero_processo: '0023455-04.2019.8.19.0008',
      partes: {
        polo_ativo: 'Lucia Helena Silva Leão',
        polo_passivo: 'Estado do Rio de Janeiro',
      },
      tribunal: 'TJRJ',
      comarca: 'Belford Roxo',
      vara: '2ª Vara Cível',
      assunto: 'Cumprimento individual de sentença coletiva',
      classe_processual: 'Cumprimento de sentença',
      tipo_acao: 'Servidor público',
      fase_atual: 'Citação recebida',
      data_ultima_movimentacao: addDaysIso(-1),
      ultima_movimentacao_texto: 'Citação recebida. Aberto prazo para apresentação de contestação e manifestação sobre documentos.',
      resumo_curto: 'Prazo sem card Kanban vinculado para acompanhamento manual do escritório.',
      cliente_nome: 'Lucia Helena Silva Leão',
      escavador_monitoramento_id: null,
    },
    {
      numero_processo: '0820294-40.2025.8.19.0008',
      partes: {
        polo_ativo: 'Elizabeth Barbosa de Oliveira Ramos',
        polo_passivo: 'Banco Master S.A.',
      },
      tribunal: 'TJRJ',
      comarca: 'Nova Iguaçu',
      vara: '1º Juizado Especial Cível',
      assunto: 'Direito do consumidor',
      classe_processual: 'Procedimento do Juizado Especial Cível',
      tipo_acao: 'Bancário',
      fase_atual: 'Audiência designada',
      data_ultima_movimentacao: addDaysIso(-2),
      ultima_movimentacao_texto: 'Audiência de conciliação designada. As partes deverão comparecer munidas de documentos pessoais.',
      resumo_curto: 'Audiência próxima com necessidade de conferência de documentos e orientação da cliente.',
      cliente_nome: 'Elizabeth Barbosa de Oliveira Ramos',
      escavador_monitoramento_id: 'local-monitoramento-3',
    },
  ]

  return [
    {
      id: 'local-prazo-1',
      tenant_id: LOCAL_DEV_TENANT_ID,
      tipo: 'sentenca',
      descricao: 'Sentença publicada — analisar e verificar recurso',
      data_vencimento: addDaysIso(5),
      status: 'pendente',
      responsavel_id: LOCAL_DEV_USER.id,
      criado_por_ia: true,
      process_task_id: 'local-task-1',
      monitored_process_id: 'local-process-1',
      escavador_movimentacao_id: 'local-mov-1',
      created_at: addDaysIso(-1),
      monitored_processes: processos[0],
      process_tasks: {
        id: 'local-task-1',
        movimentacoes_timeline: [
          {
            escavador_movimentacao_id: 'local-mov-1',
            data: addDaysIso(0),
            conteudo: processos[0].ultima_movimentacao_texto,
            tipo_evento: 'sentenca',
            revisado_por_humano: false,
          },
        ],
      },
      profiles: LOCAL_DEV_PROFILE,
    },
    {
      id: 'local-prazo-2',
      tenant_id: LOCAL_DEV_TENANT_ID,
      tipo: 'citacao',
      descricao: 'Citação recebida — apresentar contestação',
      data_vencimento: addDaysIso(8),
      status: 'pendente',
      responsavel_id: null,
      criado_por_ia: true,
      process_task_id: null,
      monitored_process_id: 'local-process-2',
      escavador_movimentacao_id: 'local-mov-2',
      created_at: addDaysIso(-2),
      monitored_processes: processos[1],
      process_tasks: {
        id: null,
        movimentacoes_timeline: [
          {
            escavador_movimentacao_id: 'local-mov-2',
            data: addDaysIso(-1),
            conteudo: processos[1].ultima_movimentacao_texto,
            tipo_evento: 'citacao',
            revisado_por_humano: false,
          },
        ],
      },
      profiles: null,
    },
    {
      id: 'local-audiencia-1',
      tenant_id: LOCAL_DEV_TENANT_ID,
      tipo: 'audiencia',
      descricao: 'Audiência de conciliação — preparar cliente',
      data_vencimento: addDaysIso(12),
      status: 'pendente',
      responsavel_id: LOCAL_DEV_USER.id,
      criado_por_ia: false,
      process_task_id: 'local-task-3',
      monitored_process_id: 'local-process-3',
      escavador_movimentacao_id: 'local-mov-3',
      created_at: addDaysIso(-3),
      monitored_processes: processos[2],
      process_tasks: {
        id: 'local-task-3',
        movimentacoes_timeline: [
          {
            escavador_movimentacao_id: 'local-mov-3',
            data: addDaysIso(-2),
            conteudo: processos[2].ultima_movimentacao_texto,
            tipo_evento: 'audiencia',
            revisado_por_humano: true,
          },
        ],
      },
      profiles: LOCAL_DEV_PROFILE,
    },
  ]
}

function normalizarDataISO(valor?: string | null): string {
  if (!valor) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) {
    const [dia, mes, ano] = valor.split('/')
    return `${ano}-${mes}-${dia}`
  }

  const normalized = String(valor).trim()
  if (normalized.includes('-')) {
    const datePart = normalized.split('T')[0].split(' ')[0]
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart
  }

  const data = new Date(normalized)
  if (Number.isNaN(data.getTime())) return ''
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function obterTimestampMovimentacao(dataReferencia?: string | null, createdAt?: string | null): number {
  const dataISO = normalizarDataISO(dataReferencia)
  if (dataISO) return new Date(`${dataISO}T12:00:00`).getTime()

  return obterTimestampCriacaoMovimentacao(createdAt)
}

function obterTimestampCriacaoMovimentacao(createdAt?: string | null): number {
  const created = String(createdAt || '').trim()
  if (created) {
    const parsedCreated = new Date(created.replace(' ', 'T')).getTime()
    if (!Number.isNaN(parsedCreated)) return parsedCreated
  }

  return 0
}

function compararMovimentacoesDecrescente(a: any, b: any): number {
  const dataA = obterTimestampMovimentacao(a.dataISO || a.dataReferencia, a.createdAt)
  const dataB = obterTimestampMovimentacao(b.dataISO || b.dataReferencia, b.createdAt)
  const diffData = dataB - dataA
  if (diffData !== 0) return diffData

  const createdA = obterTimestampCriacaoMovimentacao(a.createdAt)
  const createdB = obterTimestampCriacaoMovimentacao(b.createdAt)
  const diffCriacao = createdB - createdA
  if (diffCriacao !== 0) return diffCriacao

  return String(a.id ?? '').localeCompare(String(b.id ?? ''))
}

function getDeadlineOrigin(item: any) {
  const timeline = Array.isArray(item?.process_tasks?.movimentacoes_timeline)
    ? item.process_tasks.movimentacoes_timeline
    : []
  const escavadorId = String(item?.escavador_movimentacao_id ?? '').trim()
  const matchingTimelineEntry = escavadorId
    ? timeline.find((mov: any) => String(mov?.escavador_movimentacao_id ?? '').trim() === escavadorId)
    : null
  const reviewedByHuman = Boolean(matchingTimelineEntry?.revisado_por_humano)
    || (!escavadorId && timeline.length === 1 && Boolean(timeline[0]?.revisado_por_humano))
  const hasKanbanCard = Boolean(item?.process_task_id)

  if (reviewedByHuman) {
    return {
      label: 'Revisado por humano',
      description: 'Prazo validado por revisor antes de entrar na agenda.',
      hasKanbanCard,
    }
  }

  if (item?.criado_por_ia) {
    return {
      label: 'IA alta confiança',
      description: 'Prazo criado automaticamente por regra de alta confiança.',
      hasKanbanCard,
    }
  }

  return {
    label: 'Manual',
    description: 'Prazo criado ou ajustado manualmente pela equipe.',
    hasKanbanCard,
  }
}

const supabase = createClient()

export default function PrazosPage() {
  const [activeTab, setActiveTab] = useState<TabType>('prazos')
  const [items, setItems] = useState<any[]>([])
  const [movementRecords, setMovementRecords] = useState<any[]>([])
  const [movementInboxRecords, setMovementInboxRecords] = useState<any[]>([])
  const [monitoredContexts, setMonitoredContexts] = useState<any[]>([])
  const [monitoringHealth, setMonitoringHealth] = useState<any | null>(null)
  const [profiles, setProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [movementDateFilter, setMovementDateFilter] = useState('')
  const [filterResponsavel, setFilterResponsavel] = useState<string>('todos')
  const [filterTribunal, setFilterTribunal] = useState<string>('todos')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [monitoringProcessNumber, setMonitoringProcessNumber] = useState<string | null>(null)

  // Estados para o Drawer de Detalhes
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedItemData, setSelectedItemData] = useState<any | null>(null)
  const [selectedMovimentacao, setSelectedMovimentacao] = useState<any | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [taskDetails, setTaskDetails] = useState<any | null>(null)
  const [loadingTask, setLoadingTask] = useState(false)
  const [annotationText, setAnnotationText] = useState('')
  const [isSavingAnnotation, setIsSavingAnnotation] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const getProfileById = (profileId: string | null | undefined) => {
    if (!profileId) return null
    return profiles.find((profile) => profile.id === profileId) || null
  }

  async function syncPrazoAgenda(item: any, overrides?: Record<string, any>) {
    if (!tenantId) return
    if (isLocalNoLoginMode()) return

    const nextItem = { ...item, ...(overrides || {}) }
    const assignedProfile = getProfileById(nextItem.responsavel_id)
    const currentProfile = getProfileById(currentUser?.id)

    await syncAgendaTaskBySource(
      supabase,
      buildAgendaPayloadFromProcessPrazo({
        tenantId,
        prazo: nextItem,
        assignedName: assignedProfile?.full_name || null,
        createdBy: currentUser?.id || null,
        completedBy: String(nextItem.status ?? '').toLowerCase() === 'concluido' ? currentUser?.id || null : null,
        completedByName: String(nextItem.status ?? '').toLowerCase() === 'concluido' ? currentProfile?.full_name || assignedProfile?.full_name || null : null,
      })
    )
  }

  const loadData = useCallback(async (tenantIdValue: string, loggedUserId: string, teamProfiles: any[]) => {
    setLoading(true)
    const [prazosRes, operacoesRes] = await Promise.all([
      supabase
        .from('process_prazos')
        .select(`
          *,
          monitored_processes(
            numero_processo,
            partes,
            tribunal,
            comarca,
            vara,
            assunto,
            classe_processual,
            tipo_acao,
            fase_atual,
            data_ultima_movimentacao,
            ultima_movimentacao_texto,
            resumo_curto,
            cliente_nome,
            escavador_monitoramento_id
          ),
          process_tasks:process_task_id(id, movimentacoes_timeline),
          profiles:responsavel_id(id, full_name, avatar_url)
        `)
        .eq('tenant_id', tenantIdValue)
        .in('tipo', ['sessao', 'pericia', 'audiencia', 'citacao', 'sentenca', 'recurso', 'prazo'])
        .not('descricao', 'ilike', '%Despacho%')
        .order('data_vencimento', { ascending: true }),
      fetch('/api/operacoes/movimentacoes?limit=1000', { cache: 'no-store' })
    ])

    let operacoesPayload: any = null
    if (operacoesRes.ok) {
      operacoesPayload = await operacoesRes.json().catch(() => null)
    } else {
      const errorText = await operacoesRes.text().catch(() => '')
      console.error('Erro ao buscar movimentacoes operacionais:', operacoesRes.status, errorText)
    }

    if (prazosRes.error) {
      console.error('Erro ao buscar prazos:', prazosRes.error)
    } else {
      const dedupedItems = deduplicarPrazos(prazosRes.data || [])
      setItems(dedupedItems)

      const userProfile = (teamProfiles || []).find((profile) => profile.id === loggedUserId)
      for (const prazoItem of dedupedItems) {
        try {
          const assignedProfile = prazoItem?.responsavel_id
            ? (teamProfiles || []).find((profile) => profile.id === prazoItem.responsavel_id)
            : null

          await syncAgendaTaskBySource(
            supabase,
            buildAgendaPayloadFromProcessPrazo({
              tenantId: tenantIdValue,
              prazo: prazoItem,
              assignedName: assignedProfile?.full_name || null,
              createdBy: loggedUserId,
              completedBy: String(prazoItem.status ?? '').toLowerCase() === 'concluido' ? loggedUserId : null,
              completedByName: String(prazoItem.status ?? '').toLowerCase() === 'concluido'
                ? userProfile?.full_name || assignedProfile?.full_name || null
                : null,
            })
          )
        } catch (error) {
          console.error('[Prazos] Falha ao sincronizar agenda para prazo:', prazoItem?.id, error)
        }
      }
    }

    setMovementRecords(operacoesPayload?.movementRecords || [])
    setMovementInboxRecords(operacoesPayload?.movementInboxRecords || [])
    setMonitoredContexts(operacoesPayload?.monitoredContexts || [])
    setMonitoringHealth(operacoesPayload?.health || null)

    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      if (isLocalNoLoginMode()) {
        const localItems = buildLocalDevPrazos()

        setCurrentUser(LOCAL_DEV_USER)
        setTenantId(LOCAL_DEV_TENANT_ID)
        setProfiles([LOCAL_DEV_PROFILE])
        setItems(localItems)
        setMovementRecords([])
        setMovementInboxRecords([])
        setMonitoredContexts(localItems.map((item) => item.monitored_processes).filter(Boolean))
        setMonitoringHealth(null)
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)
      if (!user) {
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      if (!profile) {
        setLoading(false)
        return
      }

      setTenantId(profile.tenant_id)

      const { data: team } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, is_active')
        .eq('tenant_id', profile.tenant_id)
        .eq('is_active', true)
        .order('full_name', { ascending: true })

      console.log('[Prazos] Perfis carregados:', team)
      setProfiles(team || [])

      await loadData(profile.tenant_id, user.id, team || [])
    }

    init()
  }, [loadData])

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Filtragem por ABA
      const tiposAudiencia = ['audiencia', 'sessao', 'pericia']
      const tiposPrazo = ['citacao', 'sentenca', 'recurso', 'prazo']
      const isAudiencia = tiposAudiencia.includes(item.tipo)
      const isPrazo = tiposPrazo.includes(item.tipo)
      if (activeTab !== 'movimentacoes') {
        if (activeTab === 'prazos' && !isPrazo) return false
        if (activeTab === 'audiencias' && !isAudiencia) return false
      }

      // Filtro por Busca (Processo ou Descrição)
      const searchLower = searchTerm.toLowerCase()
      const matchSearch =
        item.descricao.toLowerCase().includes(searchLower) ||
        item.monitored_processes?.numero_processo?.toLowerCase().includes(searchLower)
      if (!matchSearch) return false

      // Filtro por Responsável
      if (filterResponsavel !== 'todos') {
        if (filterResponsavel === 'sem_responsavel' && item.responsavel_id) return false
        if (filterResponsavel !== 'sem_responsavel' && item.responsavel_id !== filterResponsavel) return false
      }

      // Filtro por Tribunal
      if (filterTribunal !== 'todos' && item.monitored_processes?.tribunal !== filterTribunal) return false

      return true
    })
  }, [items, activeTab, searchTerm, filterResponsavel, filterTribunal])

  const tribunals = useMemo(() => {
    const list = new Set<string>()
    items.forEach(i => {
      const tribunal = String(i.monitored_processes?.tribunal ?? '').trim()
      if (tribunal) list.add(tribunal)
    })
    return Array.from(list).sort((a, b) => a.localeCompare(b))
  }, [items])

  const movimentacoesFiltradas = useMemo(() => {
    const busca = searchTerm.trim().toLowerCase()
    const dataFiltro = normalizarDataISO(movementDateFilter)
    const dedupe = new Set<string>()
    const lista: any[] = []

    const itemByNumero = new Map<string, any>()
    items.forEach((item) => {
      const numero = item.monitored_processes?.numero_processo
      if (numero && !itemByNumero.has(numero)) {
        itemByNumero.set(numero, item)
      }
    })

    const contextoByNumero = new Map<string, any>()
    monitoredContexts.forEach((ctx) => {
      if (ctx?.numero_processo) contextoByNumero.set(ctx.numero_processo, ctx)
    })

    items.forEach((item) => {
      const numero = item.monitored_processes?.numero_processo
      if (numero && !contextoByNumero.has(numero)) {
        contextoByNumero.set(numero, item.monitored_processes)
      }
    })

    const processosComHistoricoPersistido = new Set<string>()
    movementRecords.forEach((registro: any) => {
      const numeroProcesso = String(registro?.numero_cnj ?? '').trim()
      if (numeroProcesso) processosComHistoricoPersistido.add(numeroProcesso)
    })

    const processosComInbox = new Set<string>()
    movementInboxRecords.forEach((registro: any) => {
      const numeroProcesso = String(registro?.numero_cnj ?? '').trim()
      if (numeroProcesso) processosComInbox.add(numeroProcesso)
    })

    function buildFallbackItem(numeroProcesso: string, contexto: any, dataReferencia: string | null) {
      return {
        id: `mov-${numeroProcesso}-${dataReferencia || 'sem-data'}`,
        tipo: 'movimentacao',
        descricao: contexto?.assunto || contexto?.ultima_movimentacao_texto || 'Movimentação processual',
        status: 'pendente',
        data_vencimento: dataReferencia,
        process_task_id: null,
        monitored_processes: {
          numero_processo: numeroProcesso,
          partes: contexto?.partes || {},
          tribunal: contexto?.tribunal,
          comarca: contexto?.comarca,
          vara: contexto?.vara,
          assunto: contexto?.assunto,
          classe_processual: contexto?.classe_processual,
          tipo_acao: contexto?.tipo_acao,
          fase_atual: contexto?.fase_atual,
          data_ultima_movimentacao: contexto?.data_ultima_movimentacao,
          ultima_movimentacao_texto: contexto?.ultima_movimentacao_texto,
          resumo_curto: contexto?.resumo_curto,
          cliente_nome: contexto?.cliente_nome,
          escavador_monitoramento_id: contexto?.escavador_monitoramento_id
        }
      }
    }

    function pushMovimentacao(rawEvent: any) {
      const numeroProcesso = String(rawEvent?.numeroProcesso ?? '').trim()
      const dataISO = normalizarDataISO(rawEvent?.dataReferencia || rawEvent?.createdAt || null)
      const conteudo = String(rawEvent?.conteudo ?? '').trim()

      if (!numeroProcesso) return
      if (dataFiltro && dataISO !== dataFiltro) return

      const baseBusca = `${conteudo} ${numeroProcesso} ${rawEvent?.cliente ?? ''} ${rawEvent?.tribunal ?? ''} ${rawEvent?.assunto ?? ''} ${rawEvent?.classeProcessual ?? ''} ${rawEvent?.tipoAcao ?? ''} ${rawEvent?.faseAtual ?? ''} ${rawEvent?.poloAtivo ?? ''} ${rawEvent?.poloPassivo ?? ''}`.toLowerCase()
      if (busca && !baseBusca.includes(busca)) return

      const dedupeKey = String(rawEvent?.dedupeKey || `${numeroProcesso}-${dataISO}-${conteudo.toLowerCase().replace(/\s+/g, ' ').slice(0, 220)}`)
      if (dedupe.has(dedupeKey)) return
      dedupe.add(dedupeKey)

      lista.push({
        ...rawEvent,
        dataISO,
        conteudo: conteudo || 'Movimentação sem descrição',
      })
    }

    movementRecords.forEach((registro: any, index: number) => {
      const numeroProcesso = String(registro?.numero_cnj ?? '').trim()
      if (!numeroProcesso) return

      const contexto = contextoByNumero.get(numeroProcesso)
      const item = itemByNumero.get(numeroProcesso) || buildFallbackItem(numeroProcesso, contexto, registro?.data || registro?.created_at || null)
      const dataReferencia = registro?.data || registro?.created_at || contexto?.data_ultima_movimentacao || null
      const conteudo = String(registro?.conteudo ?? contexto?.ultima_movimentacao_texto ?? '').trim()
      const cliente = String(contexto?.cliente_nome ?? item?.monitored_processes?.cliente_nome ?? '')
      const tribunal = String(contexto?.tribunal ?? item?.monitored_processes?.tribunal ?? '')
      const assunto = String(contexto?.assunto ?? '')
      const classeProcessual = String(contexto?.classe_processual ?? '')
      const tipoAcao = String(contexto?.tipo_acao ?? '')
      const faseAtual = String(contexto?.fase_atual ?? '')
      const comarca = String(contexto?.comarca ?? '')
      const vara = String(contexto?.vara ?? '')
      const poloAtivo = String(contexto?.partes?.polo_ativo ?? '')
      const poloPassivo = String(contexto?.partes?.polo_passivo ?? '')
      const resumoCurto = String(contexto?.resumo_curto ?? '')

      pushMovimentacao({
        id: registro?.escavador_movimentacao_id ? `esc-${registro.escavador_movimentacao_id}` : registro?.id ? `pm-${registro.id}` : `pm-${numeroProcesso}-${index}`,
        dedupeKey: registro?.escavador_movimentacao_id ? `esc-${registro.escavador_movimentacao_id}` : registro?.id ? `pm-${registro.id}` : `pm-${numeroProcesso}-${index}`,
        item,
        conteudo: conteudo || 'Movimentação sem descrição',
        dataReferencia,
        createdAt: registro?.created_at || null,
        tipoEvento: String(registro?.tipo_evento ?? registro?.fonte ?? 'movimentacao'),
        numeroProcesso,
        cliente,
        tribunal,
        comarca,
        vara,
        assunto,
        classeProcessual,
        tipoAcao,
        faseAtual,
        poloAtivo,
        poloPassivo,
        resumoCurto,
        monitorado: Boolean(item?.monitored_processes?.escavador_monitoramento_id),
      })
    })

    movementInboxRecords.forEach((registro: any) => {
      const numeroProcesso = String(registro?.numero_cnj ?? '').trim()
      if (!numeroProcesso) return
      if (processosComHistoricoPersistido.has(numeroProcesso)) return

      const contexto = contextoByNumero.get(numeroProcesso)
      const item = itemByNumero.get(numeroProcesso) || buildFallbackItem(numeroProcesso, contexto, registro?.latest_data || registro?.latest_created_at || null)
      const historico = Array.isArray(registro?.movimentacoes) && registro.movimentacoes.length > 0
        ? registro.movimentacoes
        : [{
            id: `inbox-${registro.id}`,
            data: registro?.latest_data,
            conteudo: registro?.latest_conteudo,
            criado_em: registro?.latest_created_at,
            fonte: registro?.latest_fonte,
          }]

      historico.forEach((mov: any, index: number) => {
        const conteudo = String(mov?.conteudo ?? registro?.latest_conteudo ?? '').trim()
        const cliente = String(contexto?.cliente_nome ?? item?.monitored_processes?.cliente_nome ?? '')
        const tribunal = String(contexto?.tribunal ?? item?.monitored_processes?.tribunal ?? '')
        const assunto = String(contexto?.assunto ?? item?.descricao ?? '')
        const classeProcessual = String(contexto?.classe_processual ?? '')
        const tipoAcao = String(contexto?.tipo_acao ?? '')
        const faseAtual = String(contexto?.fase_atual ?? '')
        const comarca = String(contexto?.comarca ?? '')
        const vara = String(contexto?.vara ?? '')
        const poloAtivo = String(contexto?.partes?.polo_ativo ?? '')
        const poloPassivo = String(contexto?.partes?.polo_passivo ?? '')
        const resumoCurto = String(contexto?.resumo_curto ?? '')

        pushMovimentacao({
          id: mov?.id ? `inbox-${registro.id}-${mov.id}` : `inbox-${registro.id}-${index}`,
          dedupeKey: mov?.id ? `inbox-${registro.id}-${mov.id}` : `inbox-${registro.id}-${index}`,
          item,
          conteudo,
          dataReferencia: mov?.data || registro?.latest_data || registro?.latest_created_at || null,
          createdAt: mov?.criado_em || registro?.latest_created_at || null,
          tipoEvento: String(mov?.fonte ?? registro?.latest_fonte ?? 'movimentacao'),
          numeroProcesso,
          cliente,
          tribunal,
          comarca,
          vara,
          assunto,
          classeProcessual,
          tipoAcao,
          faseAtual,
          poloAtivo,
          poloPassivo,
          resumoCurto,
          monitorado: false,
          inboxId: registro.id,
          oabEstado: registro.oab_estado,
          oabNumero: registro.oab_numero,
        })
      })
    })

    for (const item of items) {
      const timeline = item.process_tasks?.movimentacoes_timeline
      if (!Array.isArray(timeline)) continue

      const numeroProcesso = String(item.monitored_processes?.numero_processo ?? '')
      if (numeroProcesso && (processosComHistoricoPersistido.has(numeroProcesso) || processosComInbox.has(numeroProcesso))) {
        continue
      }

      timeline.forEach((mov: any, index: number) => {
        const dataReferencia = mov?.data || mov?.criado_em || item.monitored_processes?.data_ultima_movimentacao || null

        const conteudo = String(mov?.conteudo ?? '').trim()
        const cliente = String(item.monitored_processes?.cliente_nome ?? '')
        const descricao = String(item.descricao ?? '')
        const tipoEvento = String(mov?.tipo_evento ?? item.tipo ?? 'movimentacao')
        const tribunal = String(item.monitored_processes?.tribunal ?? '')
        const comarca = String(item.monitored_processes?.comarca ?? '')
        const vara = String(item.monitored_processes?.vara ?? '')
        const assunto = String(item.monitored_processes?.assunto ?? '')
        const classeProcessual = String(item.monitored_processes?.classe_processual ?? '')
        const tipoAcao = String(item.monitored_processes?.tipo_acao ?? '')
        const faseAtual = String(item.monitored_processes?.fase_atual ?? '')
        const poloAtivo = String(item.monitored_processes?.partes?.polo_ativo ?? '')
        const poloPassivo = String(item.monitored_processes?.partes?.polo_passivo ?? '')
        const resumoCurto = String(item.monitored_processes?.resumo_curto ?? '')

        pushMovimentacao({
          id: mov?.escavador_movimentacao_id
            ? `esc-${mov.escavador_movimentacao_id}`
            : `${item.id}-${index}`,
          dedupeKey: mov?.escavador_movimentacao_id
            ? `esc-${mov.escavador_movimentacao_id}`
            : `${item.id}-${index}`,
          item,
          conteudo: conteudo || 'Movimentação sem descrição',
          dataReferencia,
          createdAt: mov?.criado_em || mov?.created_at || null,
          tipoEvento,
          numeroProcesso,
          cliente,
          tribunal,
          comarca,
          vara,
          assunto,
          classeProcessual,
          tipoAcao,
          faseAtual,
          poloAtivo,
          poloPassivo,
          resumoCurto,
          monitorado: Boolean(item?.monitored_processes?.escavador_monitoramento_id),
        })
      })
    }

    const agrupadoPorProcesso = new Map<string, any>()

    lista.forEach((mov) => {
      const chave = mov.numeroProcesso || mov.id
      const atual = agrupadoPorProcesso.get(chave)

      if (!atual) {
        agrupadoPorProcesso.set(chave, {
          ...mov,
          historico: [mov],
          quantidadeMovimentacoes: 1,
        })
        return
      }

      agrupadoPorProcesso.set(chave, {
        ...atual,
        historico: [...atual.historico, mov],
        quantidadeMovimentacoes: atual.quantidadeMovimentacoes + 1,
      })
    })

    return Array.from(agrupadoPorProcesso.values())
      .map((mov) => {
        const historico = [...mov.historico].sort(compararMovimentacoesDecrescente)

        const principal = historico[0]
        return {
          ...mov,
          ...principal,
          item: principal.item,
          historico,
          quantidadeMovimentacoes: historico.length,
        }
      })
      .sort(compararMovimentacoesDecrescente)
  }, [items, monitoredContexts, movementDateFilter, movementInboxRecords, movementRecords, searchTerm])

  const buildMonitoramentoPayload = useCallback((entry: any) => {
    const numeroProcesso = String(entry?.numeroProcesso ?? entry?.monitored_processes?.numero_processo ?? '').trim()
    return {
      numero_processo: numeroProcesso,
      tribunal: entry?.tribunal ?? entry?.monitored_processes?.tribunal ?? null,
      comarca: entry?.comarca ?? entry?.monitored_processes?.comarca ?? null,
      vara: entry?.vara ?? entry?.monitored_processes?.vara ?? null,
      assunto: entry?.assunto ?? entry?.descricao ?? entry?.item?.descricao ?? null,
      classe_processual: entry?.classeProcessual ?? entry?.monitored_processes?.classe_processual ?? null,
      tipo_acao: entry?.tipoAcao ?? entry?.monitored_processes?.tipo_acao ?? null,
      fase_atual: entry?.faseAtual ?? entry?.monitored_processes?.fase_atual ?? null,
      polo_ativo: entry?.poloAtivo ?? entry?.monitored_processes?.partes?.polo_ativo ?? null,
      polo_passivo: entry?.poloPassivo ?? entry?.monitored_processes?.partes?.polo_passivo ?? null,
      ultima_movimentacao_texto: entry?.conteudo ?? entry?.monitored_processes?.ultima_movimentacao_texto ?? null,
      data_ultima_movimentacao: entry?.dataReferencia ?? entry?.monitored_processes?.data_ultima_movimentacao ?? null,
      status: 'ATIVO',
    }
  }, [])

  const handleMonitorProcess = useCallback(async (event: MouseEvent, entry: any) => {
    event.stopPropagation()

    const payload = buildMonitoramentoPayload(entry)
    if (!payload.numero_processo || !tenantId || !currentUser?.id) return

    if (isLocalNoLoginMode()) {
      setMovementInboxRecords((prev) => prev.filter((registro) => registro?.numero_cnj !== payload.numero_processo))
      setMonitoringProcessNumber(null)
      return
    }

    const executarMonitoramento = async (confirmarCusto: boolean) => {
      const response = await fetch('/api/monitoramento/importar-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processos: [payload], confirmar_custo: confirmarCusto })
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Falha ao monitorar processo')
      }

      return data
    }

    setMonitoringProcessNumber(payload.numero_processo)
    try {
      let result = await executarMonitoramento(false)

      if (result?.requer_confirmacao) {
        const shouldProceed = typeof window !== 'undefined'
          ? window.confirm(result?.mensagem || 'Este monitoramento ultrapassa o limite gratuito. Deseja prosseguir?')
          : false

        if (!shouldProceed) return
        result = await executarMonitoramento(true)
      }

      const jaMonitorados = Array.isArray(result?.ja_monitorados_numeros) ? result.ja_monitorados_numeros : []
      const monitoradoComSucesso = Number(result?.importados || 0) > 0 || jaMonitorados.includes(payload.numero_processo)

      if (!monitoradoComSucesso) {
        throw new Error(result?.mensagem || 'Nenhum monitoramento foi criado para este processo.')
      }

      await supabase
        .from('process_movimentacoes_inbox')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('numero_cnj', payload.numero_processo)

      await loadData(tenantId, currentUser.id, profiles)
    } catch (error: any) {
      console.error('[Prazos] Falha ao monitorar processo:', error)
      if (typeof window !== 'undefined') {
        window.alert(error?.message || 'Falha ao monitorar processo.')
      }
    } finally {
      setMonitoringProcessNumber(null)
    }
  }, [buildMonitoramentoPayload, currentUser?.id, loadData, profiles, tenantId])

  async function updateStatus(id: string, newStatus: string) {
    if (isLocalNoLoginMode()) {
      setItems(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item))
      setSelectedItemData(prev => prev?.id === id ? { ...prev, status: newStatus } : prev)
      return
    }

    const { error } = await supabase
      .from('process_prazos')
      .update({ status: newStatus })
      .eq('id', id)

    if (!error) {
      const currentItem = items.find((item) => item.id === id)
      const updatedItem = currentItem ? { ...currentItem, status: newStatus } : null
      if (updatedItem) {
        await syncPrazoAgenda(updatedItem)
      }
      setItems(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item))
    }
  }

  async function atribuirResponsavel(id: string, responsavelId: string | null) {
    if (!tenantId) return

    if (responsavelId && !profiles.some((profile) => profile.id === responsavelId)) {
      console.error('[Prazos] Responsável inativo ou fora do tenant:', responsavelId)
      if (typeof window !== 'undefined') {
        window.alert('Este responsável não está ativo neste escritório.')
      }
      return
    }

    if (isLocalNoLoginMode()) {
      const profile = responsavelId ? profiles.find(p => p.id === responsavelId) : null
      setItems(prev => prev.map(item => item.id === id ? { ...item, responsavel_id: responsavelId, profiles: profile } : item))
      setSelectedItemData(prev => prev?.id === id ? { ...prev, responsavel_id: responsavelId, profiles: profile } : prev)
      return
    }

    const { data, error } = await supabase
      .from('process_prazos')
      .update({ responsavel_id: responsavelId })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('id, responsavel_id')
      .maybeSingle()

    if (error) {
      console.error('[Prazos] Erro ao atualizar responsável:', error)
      if (typeof window !== 'undefined') {
        window.alert('Não foi possível atualizar o responsável deste prazo.')
      }
      return
    }

    if (!data) {
      console.error('[Prazos] Nenhum prazo atualizado para responsável:', { id, tenantId })
      if (typeof window !== 'undefined') {
        window.alert('Prazo não encontrado neste escritório.')
      }
      return
    }

    const persistedResponsavelId = data.responsavel_id ?? null
    const profile = persistedResponsavelId ? profiles.find(p => p.id === persistedResponsavelId) : null
    const currentItem = items.find((item) => item.id === id)
    const updatedItem = currentItem ? { ...currentItem, responsavel_id: persistedResponsavelId, profiles: profile } : null

    setItems(prev => prev.map(item => item.id === id ? { ...item, responsavel_id: persistedResponsavelId, profiles: profile } : item))
    setSelectedItemData(prev => prev?.id === id ? { ...prev, responsavel_id: persistedResponsavelId, profiles: profile } : prev)

    if (updatedItem) {
      try {
        await syncPrazoAgenda(updatedItem)
      } catch (agendaError) {
        console.error('[Prazos] Falha ao sincronizar agenda após atualizar responsável:', agendaError)
      }
    }
  }

  async function excluirPrazo(id: string) {
    if (!tenantId) return

    const item = items.find((prazo) => prazo.id === id)
    const shouldDelete = typeof window !== 'undefined'
      ? window.confirm(`Excluir este registro${item?.descricao ? `: ${item.descricao}` : ''}?`)
      : false

    if (!shouldDelete) return

    if (isLocalNoLoginMode()) {
      setItems(prev => prev.filter((prazo) => prazo.id !== id))
      if (selectedItemId === id) {
        setSelectedItemId(null)
        setSelectedItemData(null)
        setSelectedMovimentacao(null)
        setIsDrawerOpen(false)
      }
      return
    }

    const { error } = await supabase
      .from('process_prazos')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) {
      console.error('[Prazos] Erro ao excluir prazo:', error)
      if (typeof window !== 'undefined') {
        window.alert('Não foi possível excluir este registro.')
      }
      return
    }

    setItems(prev => prev.filter((prazo) => prazo.id !== id))
    if (selectedItemId === id) {
      setSelectedItemId(null)
      setSelectedItemData(null)
      setSelectedMovimentacao(null)
      setIsDrawerOpen(false)
    }
  }

  async function handleOpenDrawer(item: any, movimentacao: any | null = null) {
    setSelectedItemId(item.id ?? null)
    setSelectedItemData(item ?? null)
    setSelectedMovimentacao(movimentacao)
    setIsDrawerOpen(true)
    setLoadingTask(true)
    setTaskDetails(null)
    setAnnotationText('')

    if (isLocalNoLoginMode()) {
      setTaskDetails(item.process_tasks || null)
      setAnnotationText(item.process_tasks?.description || item.monitored_processes?.resumo_curto || '')
      setLoadingTask(false)
      return
    }

    if (item.process_task_id) {
      const { data, error } = await supabase
        .from('process_tasks')
        .select('*')
        .eq('id', item.process_task_id)
        .maybeSingle()

      if (error) {
        console.error("[Prazos] Erro ao buscar process_tasks:", error)
      } else {
        setTaskDetails(data)
        setAnnotationText(data?.description || '')
      }
    }
    setLoadingTask(false)
  }

  async function handleSaveAnnotation() {
    if (!tenantId) return
    const item = selectedItemData ?? items.find(i => i.id === selectedItemId)
    if (!item?.monitored_process_id) return

    if (isLocalNoLoginMode()) {
      const savedTask = {
        ...(taskDetails || item.process_tasks || {}),
        id: taskDetails?.id ?? item.process_task_id ?? `local-task-${item.id}`,
        description: annotationText,
      }
      setTaskDetails(savedTask)
      setItems(prev => prev.map(i => i.id === selectedItemId ? { ...i, process_tasks: savedTask, process_task_id: savedTask.id } : i))
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
      return
    }

    setIsSavingAnnotation(true)

    try {
      const res = await fetch('/api/prazos/salvar-anotacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monitored_process_id: item.monitored_process_id,
          numero_processo: item.monitored_processes?.numero_processo,
          description: annotationText,
          process_task_id: taskDetails?.id ?? item.process_task_id ?? null,
          tenant_id: tenantId,
        })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao salvar')
      const savedTask = json.task ?? null
      setTaskDetails(savedTask)
      if (savedTask?.id) {
        setItems(prev => prev.map(i => i.id === selectedItemId ? { ...i, process_task_id: savedTask.id } : i))
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      console.error("[Prazos] Erro ao salvar anotação:", err)
    } finally {
      setIsSavingAnnotation(false)
    }
  }

  return (
    <PrazosDesignSystemView
      activeTab={activeTab}
      setActiveTab={(tab) => setActiveTab(tab)}
      loading={loading}
      searchTerm={searchTerm}
      setSearchTerm={setSearchTerm}
      movementDateFilter={movementDateFilter}
      setMovementDateFilter={setMovementDateFilter}
      filterResponsavel={filterResponsavel}
      setFilterResponsavel={setFilterResponsavel}
      filterTribunal={filterTribunal}
      setFilterTribunal={setFilterTribunal}
      profiles={profiles}
      tribunals={tribunals}
      filteredItems={filteredItems}
      movimentacoesFiltradas={movimentacoesFiltradas}
      monitoringHealth={monitoringHealth}
      copiedId={copiedId}
      setCopiedId={setCopiedId}
      monitoringProcessNumber={monitoringProcessNumber}
      currentUser={currentUser}
      items={items}
      formatarData={formatarData}
      diasRestantes={diasRestantes}
      getDeadlineOrigin={getDeadlineOrigin}
      ehPrazoDeSentenca={ehPrazoDeSentenca}
      obterVencimentoEmbargosDeclaracao={obterVencimentoEmbargosDeclaracao}
      handleMonitorProcess={handleMonitorProcess}
      handleOpenDrawer={handleOpenDrawer}
      updateStatus={updateStatus}
      atribuirResponsavel={atribuirResponsavel}
      excluirPrazo={excluirPrazo}
      isDrawerOpen={isDrawerOpen}
      setIsDrawerOpen={setIsDrawerOpen}
      selectedItemId={selectedItemId}
      selectedItemData={selectedItemData}
      setSelectedItemData={setSelectedItemData}
      selectedMovimentacao={selectedMovimentacao}
      setSelectedMovimentacao={setSelectedMovimentacao}
      loadingTask={loadingTask}
      annotationText={annotationText}
      setAnnotationText={setAnnotationText}
      isSavingAnnotation={isSavingAnnotation}
      saveSuccess={saveSuccess}
      handleSaveAnnotation={handleSaveAnnotation}
    />
  )
}
