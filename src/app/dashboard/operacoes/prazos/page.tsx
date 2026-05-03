'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildAgendaPayloadFromProcessPrazo, syncAgendaTaskBySource } from '@/lib/agenda/userTasks'
import {
  Clock,
  Search,
  UserPlus,
  ChevronDown,
  Calendar,
  Gavel,
  CheckCircle,
  User,
  Copy,
  Check,
  X,
  PlayCircle,
  Loader2
} from 'lucide-react'
import { Montserrat, Cormorant_Garamond } from "next/font/google"

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });

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

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl overflow-hidden p-6 relative group border border-[#CCA761]/10 bg-gradient-to-b from-white/90 dark:from-[#111111]/90 to-gray-50/90 dark:to-[#050505]/90 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.4)] ring-1 ring-gray-200 dark:ring-white/5 transition-all duration-500 ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
      <div className="relative z-10 w-full h-full flex flex-col">
        {children}
      </div>
    </div>
  );
}

type TabType = 'movimentacoes' | 'prazos' | 'audiencias'

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
  const created = String(createdAt || '').trim()
  if (created) {
    const parsedCreated = new Date(created.replace(' ', 'T')).getTime()
    if (!Number.isNaN(parsedCreated)) return parsedCreated
  }

  const dataISO = normalizarDataISO(dataReferencia)
  if (!dataISO) return 0
  return new Date(`${dataISO}T12:00:00`).getTime()
}

const supabase = createClient()

export default function PrazosPage() {
  const [activeTab, setActiveTab] = useState<TabType>('prazos')
  const [items, setItems] = useState<any[]>([])
  const [movementRecords, setMovementRecords] = useState<any[]>([])
  const [movementInboxRecords, setMovementInboxRecords] = useState<any[]>([])
  const [monitoredContexts, setMonitoredContexts] = useState<any[]>([])
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
  const [executingAgenda, setExecutingAgenda] = useState(false)
  const [agendaExecutionMessage, setAgendaExecutionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const getProfileById = (profileId: string | null | undefined) => {
    if (!profileId) return null
    return profiles.find((profile) => profile.id === profileId) || null
  }

  async function syncPrazoAgenda(item: any, overrides?: Record<string, any>) {
    if (!tenantId) return

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
    const [prazosRes, movimentacoesRes, inboxRes, contextosRes] = await Promise.all([
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
      supabase
        .from('process_movimentacoes')
        .select('id, numero_cnj, data, conteudo, fonte, created_at')
        .eq('tenant_id', tenantIdValue)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('process_movimentacoes_inbox')
        .select('id, numero_cnj, oab_estado, oab_numero, latest_data, latest_conteudo, latest_fonte, latest_created_at, quantidade_eventos, movimentacoes, payload_ultimo_evento, monitorado')
        .eq('tenant_id', tenantIdValue)
        .order('latest_created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('monitored_processes')
        .select('numero_processo, partes, tribunal, comarca, vara, assunto, classe_processual, tipo_acao, fase_atual, data_ultima_movimentacao, ultima_movimentacao_texto, resumo_curto, cliente_nome, escavador_monitoramento_id')
        .eq('tenant_id', tenantIdValue)
    ])

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

    if (movimentacoesRes.error) {
      console.error('Erro ao buscar movimentações:', movimentacoesRes.error)
    } else {
      setMovementRecords(movimentacoesRes.data || [])
    }

    if (inboxRes.error) {
      console.error('Erro ao buscar inbox de movimentações:', inboxRes.error)
    } else {
      setMovementInboxRecords(inboxRes.data || [])
    }

    if (contextosRes.error) {
      console.error('Erro ao buscar contexto de processos:', contextosRes.error)
    } else {
      setMonitoredContexts(contextosRes.data || [])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      if (!profile) return

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

  const executableAgendaItems = useMemo(() => {
    if (activeTab === 'movimentacoes') return []
    return filteredItems.filter((item) => {
      if (!item?.id) return false
      return String(item.status ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() !== 'concluido'
    })
  }, [activeTab, filteredItems])

  const handleExecuteAgenda = useCallback(async () => {
    if (!tenantId || !currentUser?.id) return

    if (executableAgendaItems.length === 0) {
      setAgendaExecutionMessage({
        type: 'error',
        text: 'Nenhum prazo pendente nos filtros atuais para executar na agenda.',
      })
      return
    }

    setExecutingAgenda(true)
    setAgendaExecutionMessage(null)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Sessao expirada. Entre novamente para executar.')

      const response = await fetch('/api/prazos/executar-agenda', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prazoIds: executableAgendaItems.map((item) => item.id),
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Nao foi possivel executar os prazos na agenda.')
      }

      const falhas = Number(data?.failed_count || 0)
      const executados = Number(data?.executed_count || 0)
      const ignorados = Number(data?.skipped_count || 0)
      setAgendaExecutionMessage({
        type: falhas > 0 ? 'error' : 'success',
        text: falhas > 0
          ? `Execucao parcial: ${executados} item(ns) enviados para agenda, ${falhas} falha(s).`
          : `Executado: ${executados} item(ns) distribuido(s) na agenda${ignorados ? `, ${ignorados} ja concluidos.` : '.'}`,
      })

      await loadData(tenantId, currentUser.id, profiles)
    } catch (error: any) {
      setAgendaExecutionMessage({
        type: 'error',
        text: error?.message || 'Erro ao executar os prazos na agenda.',
      })
    } finally {
      setExecutingAgenda(false)
    }
  }, [currentUser?.id, executableAgendaItems, loadData, profiles, tenantId])

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
        id: registro?.id ? `pm-${registro.id}` : `pm-${numeroProcesso}-${index}`,
        dedupeKey: registro?.id ? `pm-${registro.id}` : `pm-${numeroProcesso}-${index}`,
        item,
        conteudo: conteudo || 'Movimentação sem descrição',
        dataReferencia,
        createdAt: registro?.created_at || null,
        tipoEvento: String(registro?.fonte ?? 'movimentacao'),
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
        const dataReferencia = mov?.criado_em || mov?.data || item.monitored_processes?.data_ultima_movimentacao || null

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
        const historico = [...mov.historico].sort((a: any, b: any) => {
          return obterTimestampMovimentacao(b.dataISO || b.dataReferencia, b.createdAt) - obterTimestampMovimentacao(a.dataISO || a.dataReferencia, a.createdAt)
        })

        const principal = historico[0]
        return {
          ...mov,
          ...principal,
          item: principal.item,
          historico,
          quantidadeMovimentacoes: historico.length,
        }
      })
      .sort((a, b) => {
        const ta = obterTimestampMovimentacao(a.dataISO || a.dataReferencia, a.createdAt)
        const tb = obterTimestampMovimentacao(b.dataISO || b.dataReferencia, b.createdAt)
        return tb - ta
      })
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

  const handleMonitorProcess = useCallback(async (event: React.MouseEvent, entry: any) => {
    event.stopPropagation()

    const payload = buildMonitoramentoPayload(entry)
    if (!payload.numero_processo || !tenantId || !currentUser?.id) return

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
      console.error('[Prazos] Responsavel inativo ou fora do tenant:', responsavelId)
      if (typeof window !== 'undefined') {
        window.alert('Este responsavel nao esta ativo neste escritorio.')
      }
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
      console.error('[Prazos] Erro ao atualizar responsavel:', error)
      if (typeof window !== 'undefined') {
        window.alert('Nao foi possivel atualizar o responsavel deste prazo.')
      }
      return
    }

    if (!data) {
      console.error('[Prazos] Nenhum prazo atualizado para responsavel:', { id, tenantId })
      if (typeof window !== 'undefined') {
        window.alert('Prazo nao encontrado neste escritorio.')
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
        console.error('[Prazos] Falha ao sincronizar agenda apos atualizar responsavel:', agendaError)
      }
    }
  }

  function getUrgencyStyle(data: string, status: string) {
    if (status === 'concluido') return 'border-green-500/20 text-green-400'
    const d = diasRestantes(data)
    if (d <= 0) return 'border-red-600 bg-red-600/10 text-red-500 shadow-[0_0_15px_rgba(220,38,38,0.3)]'
    if (d <= 3) return 'border-red-500/40 bg-red-500/10 text-red-400'
    if (d <= 7) return 'border-orange-500/40 bg-orange-500/10 text-orange-400'
    return 'border-[#CCA761]/40 bg-[#CCA761]/10 text-[#CCA761]'
  }

  async function handleOpenDrawer(item: any, movimentacao: any | null = null) {
    setSelectedItemId(item.id ?? null)
    setSelectedItemData(item ?? null)
    setSelectedMovimentacao(movimentacao)
    setIsDrawerOpen(true)
    setLoadingTask(true)
    setTaskDetails(null)
    setAnnotationText('')

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
    <div className={`p-8 min-h-screen bg-white dark:bg-[#050505] text-white ${montserrat.className}`}>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h2 className={`text-[#CCA761] text-sm uppercase tracking-[0.3em] font-medium mb-2 ${montserrat.className}`}>
            Operações Jurídicas
          </h2>
          <h1 className={`text-4xl md:text-5xl font-light text-white tracking-tight ${cormorant.className}`}>
            Prazos & <span className="italic text-[#CCA761]">Audiências</span>
          </h1>
        </div>

        <div className="flex flex-col gap-3 w-full sm:w-[520px]">
          {/* Tabs */}
          <div className="grid grid-cols-3 gap-1 w-full bg-white/5 p-1 rounded-2xl border border-white/10 backdrop-blur-xl">
          <button 
            onClick={() => setActiveTab('movimentacoes')}
            className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${activeTab === 'movimentacoes' ? 'bg-[#CCA761] text-black shadow-lg shadow-[#CCA761]/20' : 'text-gray-400 dark:text-white/40 hover:text-gray-700 dark:text-white/70'}`}
          >
            Movimentações
          </button>
          <button 
            onClick={() => setActiveTab('prazos')}
            className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${activeTab === 'prazos' ? 'bg-[#CCA761] text-black shadow-lg shadow-[#CCA761]/20' : 'text-gray-400 dark:text-white/40 hover:text-gray-700 dark:text-white/70'}`}
          >
            Prazos
          </button>
          <button 
            onClick={() => setActiveTab('audiencias')}
            className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${activeTab === 'audiencias' ? 'bg-[#CCA761] text-black shadow-lg shadow-[#CCA761]/20' : 'text-gray-400 dark:text-white/40 hover:text-gray-700 dark:text-white/70'}`}
          >
            Audiências
          </button>
          </div>

          {activeTab !== 'movimentacoes' && (
            <button
              onClick={handleExecuteAgenda}
              disabled={executingAgenda || executableAgendaItems.length === 0}
              className="h-11 w-full rounded-2xl bg-[#CCA761] hover:bg-[#b89554] text-black text-[11px] font-black uppercase tracking-[0.18em] flex items-center justify-center gap-2 shadow-lg shadow-[#CCA761]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {executingAgenda ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />}
              {executingAgenda ? 'Executando...' : `Executar ${executableAgendaItems.length} na agenda`}
            </button>
          )}
        </div>
      </div>

      {agendaExecutionMessage && (
        <div className={`mb-8 rounded-2xl border px-5 py-4 flex items-center gap-3 text-xs font-bold uppercase tracking-widest ${
          agendaExecutionMessage.type === 'success'
            ? 'bg-green-500/5 border-green-500/20 text-green-400'
            : 'bg-red-500/5 border-red-500/20 text-red-400'
        }`}>
          {agendaExecutionMessage.type === 'success' ? <CheckCircle size={18} /> : <X size={18} />}
          {agendaExecutionMessage.text}
        </div>
      )}

      {/* Filters Bar */}
      <GlassCard className="mb-8 !p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex-1 min-w-[300px] relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 dark:text-white/20" size={18} />
            <input 
              type="text" 
              placeholder={activeTab === 'movimentacoes' ? 'Buscar por processo, cliente ou movimentação...' : 'Buscar por processo ou descrição...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-all"
            />
          </div>

          {activeTab === 'movimentacoes' ? (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 min-h-[44px]">
                <Calendar size={16} className="text-[#CCA761]" />
                <input
                  type="date"
                  value={movementDateFilter}
                  onChange={(e) => setMovementDateFilter(e.target.value)}
                  className="bg-transparent text-sm focus:outline-none text-white [color-scheme:dark]"
                  title="Filtrar movimentações por data"
                />
              </div>
              {movementDateFilter && (
                <button
                  onClick={() => setMovementDateFilter('')}
                  className="h-[44px] px-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-700 dark:text-white/70 hover:text-white text-sm border border-white/10 transition-all"
                >
                  Limpar data
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
                <User size={16} className="text-[#CCA761]" />
                <select 
                  value={filterResponsavel}
                  onChange={(e) => setFilterResponsavel(e.target.value)}
                  className="bg-transparent text-sm text-white focus:outline-none cursor-pointer [color-scheme:dark]"
                >
                  <option value="todos" style={{ backgroundColor: '#101012', color: '#f4f4f5' }}>Todos Responsáveis</option>
                  <option value="sem_responsavel" style={{ backgroundColor: '#101012', color: '#f4f4f5' }}>Sem Responsável (Fila)</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id} style={{ backgroundColor: '#101012', color: '#f4f4f5' }}>{p.full_name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
                <Gavel size={16} className="text-[#CCA761]" />
                <select 
                  value={filterTribunal}
                  onChange={(e) => setFilterTribunal(e.target.value)}
                  className="bg-transparent text-sm text-white focus:outline-none cursor-pointer [color-scheme:dark]"
                >
                  <option value="todos" style={{ backgroundColor: '#101012', color: '#f4f4f5' }}>Todos Tribunais</option>
                  {tribunals.map(t => (
                    <option key={t} value={t} style={{ backgroundColor: '#101012', color: '#f4f4f5' }}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Grid de Prazos */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-48 bg-white/5 rounded-2xl border border-white/10" />
          ))}
        </div>
      ) : activeTab === 'movimentacoes' ? (
        movimentacoesFiltradas.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
            <Calendar size={64} className="mx-auto mb-6 text-gray-200 dark:text-white/10" />
            <h3 className="text-xl text-gray-600 dark:text-white/60 mb-2">Nenhuma movimentação encontrada</h3>
            <p className="text-gray-400 dark:text-white/30 max-w-md mx-auto">
              Não há movimentações registradas para os filtros atuais.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {movimentacoesFiltradas.map((mov) => (
              <div
                key={mov.id}
                onClick={() => handleOpenDrawer(mov.item, mov)}
                className="cursor-pointer"
              >
                <GlassCard className="border-[#CCA761]/40 hover:border-[#CCA761]/80 hover:scale-[1.01] transform transition-all hover:shadow-[0_0_24px_rgba(204,167,97,0.16)] h-full">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-widest border border-[#CCA761]/40 text-[#CCA761] uppercase">
                        Movimentação
                      </span>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border border-[#CCA761]/30 text-[#CCA761]/90 bg-[#CCA761]/10">
                        {mov.quantidadeMovimentacoes || 1} evento(s)
                      </span>
                      {mov.monitorado ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-400 font-bold bg-green-400/5 px-2 py-0.5 rounded border border-green-400/20">
                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                          Monitorado
                        </span>
                      ) : (
                        <button
                          onClick={(e) => handleMonitorProcess(e, mov)}
                          disabled={monitoringProcessNumber === mov.numeroProcesso}
                          className="text-[10px] text-[#CCA761] font-bold border border-[#CCA761]/30 px-2 py-0.5 rounded hover:bg-[#CCA761]/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {monitoringProcessNumber === mov.numeroProcesso ? 'Monitorando...' : '+ Monitorar'}
                        </button>
                      )}
                    </div>
                    <span className="px-3 py-1 rounded-full text-[11px] font-bold border border-white/10 text-gray-600 dark:text-white/60 bg-white/5">
                      {formatarData(mov.dataISO || mov.dataReferencia)}
                    </span>
                  </div>

                  <h3 className="text-[17px] font-medium text-white mb-3 leading-snug line-clamp-2">
                    {mov.item.descricao || 'Atualização processual'}
                  </h3>

                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 mb-4">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-white/30 font-semibold mb-2">
                      Última movimentação
                    </div>
                    <p className="text-[13px] text-gray-700 dark:text-white/70 leading-relaxed whitespace-pre-wrap break-words max-h-56 overflow-y-auto pr-1">
                      {mov.conteudo}
                    </p>
                  </div>

                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-gray-400 dark:text-white/40 text-[12px]">
                      <Clock size={14} className="text-[#CCA761]" />
                      <span>Registro: {formatarData(mov.dataISO || mov.dataReferencia)}</span>
                    </div>
                    {mov.numeroProcesso && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-[13px] group/cnj-mov">
                          <Gavel size={14} className="text-[#CCA761]" />
                          <span className="truncate font-medium text-[#CCA761]">Proc: {mov.numeroProcesso}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              navigator.clipboard.writeText(mov.numeroProcesso)
                              setCopiedId(mov.id)
                              setTimeout(() => setCopiedId(null), 2000)
                            }}
                            className="opacity-0 group-hover/cnj-mov:opacity-100 p-1 hover:bg-white/10 rounded transition-all text-[#CCA761]"
                            title="Copiar número do processo"
                          >
                            {copiedId === mov.id ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                        {mov.cliente && (
                          <div className="text-[11px] text-gray-400 dark:text-white/30 pl-6 leading-tight">
                            Cliente: {mov.cliente}
                          </div>
                        )}
                        {mov.tribunal && (
                          <div className="text-[10px] text-gray-300 dark:text-white/20 uppercase tracking-wider pl-6">
                            {mov.tribunal}{mov.comarca ? ` · ${mov.comarca}` : ''}{mov.vara ? ` · ${mov.vara}` : ''}
                          </div>
                        )}
                        {mov.assunto && (
                          <div className="text-[11px] text-white/45 pl-6 leading-tight">
                            Assunto: {mov.assunto}
                          </div>
                        )}
                        {(mov.classeProcessual || mov.tipoAcao) && (
                          <div className="text-[10px] text-white/35 uppercase tracking-wider pl-6 leading-tight">
                            {mov.classeProcessual || '—'}{mov.tipoAcao ? ` · ${mov.tipoAcao}` : ''}
                          </div>
                        )}
                        {mov.faseAtual && (
                          <div className="text-[10px] text-[#CCA761]/80 uppercase tracking-wider pl-6 leading-tight">
                            Fase: {mov.faseAtual}
                          </div>
                        )}
                        {(mov.poloAtivo || mov.poloPassivo) && (
                          <div className="text-[10px] text-white/35 pl-6 leading-tight">
                            {mov.poloAtivo ? `Ativo: ${mov.poloAtivo}` : ''}
                            {mov.poloAtivo && mov.poloPassivo ? ' · ' : ''}
                            {mov.poloPassivo ? `Passivo: ${mov.poloPassivo}` : ''}
                          </div>
                        )}
                        {mov.resumoCurto && (
                          <div className="text-[11px] text-gray-400 dark:text-white/25 italic pl-6 leading-relaxed line-clamp-2">
                            &quot;{mov.resumoCurto}&quot;
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-white/30">
                      {mov.tipoEvento}
                    </span>
                    <span className="text-[11px] text-[#CCA761]">Abrir detalhes</span>
                  </div>
                </GlassCard>
              </div>
            ))}
          </div>
        )
      ) : filteredItems.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
            <Calendar size={64} className="mx-auto mb-6 text-gray-200 dark:text-white/10" />
            <h3 className="text-xl text-gray-600 dark:text-white/60 mb-2">Nenhum registro encontrado</h3>
            <p className="text-gray-400 dark:text-white/30 max-w-md mx-auto">
              Ajuste seus filtros ou aguarde novas movimentações processuais monitoradas pela IA.
            </p>
          </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map(item => (
              <div 
                key={item.id} 
                onClick={() => handleOpenDrawer(item, null)}
                className="cursor-pointer"
              >
              <GlassCard className="border-[#CCA761]/50 hover:border-[#CCA761]/90 hover:scale-[1.02] transform transition-all hover:shadow-[0_0_24px_rgba(204,167,97,0.2)] h-full">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-widest border border-current uppercase`}>
                    {item.tipo}
                  </span>
                  {item.monitored_processes?.escavador_monitoramento_id ? (
                    <span className="flex items-center gap-1 text-[10px] text-green-400 font-bold bg-green-400/5 px-2 py-0.5 rounded border border-green-400/20">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                      Monitorado
                    </span>
                  ) : (
                    <button 
                      onClick={(e) => handleMonitorProcess(e, item)}
                      disabled={monitoringProcessNumber === item.monitored_processes?.numero_processo}
                      className="text-[10px] text-[#CCA761] font-bold border border-[#CCA761]/30 px-2 py-0.5 rounded hover:bg-[#CCA761]/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {monitoringProcessNumber === item.monitored_processes?.numero_processo ? 'Monitorando...' : '+ Monitorar'}
                    </button>
                  )}
                </div>
                <div className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all ${getUrgencyStyle(item.data_vencimento, item.status)}`}>
                  {item.status === 'concluido' ? 'CONCLUÍDO' : 
                   diasRestantes(item.data_vencimento) <= 0 ? 'PRAZO FATAL' : 
                   `${diasRestantes(item.data_vencimento)} DIAS`}
                </div>
              </div>

              <h3 className="text-lg font-medium text-white mb-2 line-clamp-2 leading-tight">
                {item.descricao}
              </h3>

              {(item.monitored_processes?.resumo_curto || item.monitored_processes?.ultima_movimentacao_texto) && (
                <p className="text-[12px] text-gray-400 dark:text-white/40 font-normal leading-relaxed mb-4 line-clamp-3">
                  {item.monitored_processes.resumo_curto || 
                   (item.monitored_processes.ultima_movimentacao_texto?.length > 120 
                    ? item.monitored_processes.ultima_movimentacao_texto.slice(0, 120) + '...'
                    : item.monitored_processes.ultima_movimentacao_texto)}
                </p>
              )}

              <div className="space-y-2 mb-6">
                <div className="flex items-center gap-2 text-gray-400 dark:text-white/40 text-[12px]">
                  <Clock size={14} className="text-[#CCA761]" />
                  <span>Vencimento: {formatarData(item.data_vencimento)}</span>
                </div>
                {ehPrazoDeSentenca(item) && (() => {
                  const vencimentoEmbargos = obterVencimentoEmbargosDeclaracao(item)
                  return (
                    <div className="ml-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-[11px] text-yellow-300">
                      {`Alerta: embargos de declaração em 5 dias úteis${vencimentoEmbargos ? ` (venc. estimado: ${formatarData(vencimentoEmbargos)})` : ''}.`}
                    </div>
                  )
                })()}
                {item.monitored_processes?.numero_processo && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[13px] group/cnj">
                      <Gavel size={14} className="text-[#CCA761]" />
                      <span className="truncate font-medium text-[#CCA761]">Proc: {item.monitored_processes.numero_processo}</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(item.monitored_processes.numero_processo);
                          setCopiedId(item.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                        className="opacity-0 group-hover/cnj:opacity-100 p-1 hover:bg-white/10 rounded transition-all text-[#CCA761]"
                        title="Copiar CNJ"
                      >
                        {copiedId === item.id ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                    {item.monitored_processes.partes?.polo_ativo && (
                      <div className="text-[11px] text-gray-400 dark:text-white/30 pl-6 leading-tight">
                        {item.monitored_processes.partes.polo_ativo}
                      </div>
                    )}
                  </div>
                )}
                {item.monitored_processes?.cliente_nome && (
                  <div className="text-[11px] text-gray-300 dark:text-white/20 pl-6 -mt-1 mb-2">
                    Cliente: {item.monitored_processes.cliente_nome}
                  </div>
                )}
                {item.monitored_processes?.tribunal && (
                  <div className="text-[10px] text-gray-300 dark:text-white/20 uppercase tracking-wider pl-6">
                    {item.monitored_processes.tribunal} · {item.monitored_processes.comarca || '—'}
                  </div>
                )}
              </div>

              <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                {/* Responsável */}
                <div className="relative group/user">
                  {item.responsavel_id ? (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#CCA761]/20 border border-[#CCA761]/60 flex items-center justify-center overflow-hidden shrink-0">
                        {item.profiles?.avatar_url ? (
                          <img src={item.profiles.avatar_url} alt={item.profiles.full_name ?? ''} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[#CCA761] text-[13px] font-semibold leading-none">
                            {item.profiles?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                          </span>
                        )}
                      </div>
                      <div className="text-[13px] text-[#CCA761] font-medium truncate max-w-[100px]">
                        {item.profiles?.full_name?.split(' ')[0] ?? 'Sem responsável'}
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        atribuirResponsavel(item.id, currentUser?.id)
                      }}
                      className="h-10 flex items-center gap-2 text-[12px] text-red-400 hover:text-red-300 transition-colors bg-red-400/5 px-4 rounded-lg border border-red-400/20 shadow-lg shadow-red-900/10"
                    >
                      <UserPlus size={14} /> Assumir
                    </button>
                  )}
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2">
                  {item.status !== 'concluido' ? (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        updateStatus(item.id, 'concluido')
                      }}
                      className="h-10 w-10 flex items-center justify-center rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-black transition-all border border-green-500/20"
                      title="Marcar como Concluído"
                    >
                      <CheckCircle size={16} />
                    </button>
                  ) : (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        updateStatus(item.id, 'pendente')
                      }}
                      className="h-10 w-10 flex items-center justify-center rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-black transition-all border border-orange-500/20"
                      title="Reabrir Prazo"
                    >
                      <Clock size={16} />
                    </button>
                  )}
                  
                  <div className="relative group/menu">
                    <button 
                      onClick={(e) => e.stopPropagation()}
                      className="h-10 w-10 flex items-center justify-center rounded-lg bg-white/5 text-gray-400 dark:text-white/40 hover:bg-white/10 transition-all border border-white/10"
                    >
                      <ChevronDown size={16} />
                    </button>
                    {/* Minimalistic Dropdown placeholder */}
                    <div className="absolute bottom-full right-0 mb-2 w-48 bg-[#111111] border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-50 p-1">
                      <p className="text-[10px] text-gray-300 dark:text-white/20 px-3 py-2 uppercase tracking-widest font-bold">Atribuir a:</p>
                      {profiles.map(p => (
                        <button 
                          key={p.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            atribuirResponsavel(item.id, p.id)
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-gray-600 dark:text-white/60 hover:text-white hover:bg-[#CCA761] hover:text-black rounded-lg transition-all"
                        >
                          {p.full_name || `Colaborador ${String(p.id).slice(0, 6)}`}
                        </button>
                      ))}
                      <div className="h-[1px] bg-white/5 my-1" />
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          atribuirResponsavel(item.id, null)
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-gray-400 dark:text-white/40 hover:text-white hover:bg-red-500 bg-transparent rounded-lg transition-all flex items-center justify-between"
                      >
                        Remover Responsável <UserPlus size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        ))}
        </div>
      )}

      {/* Drawer de Detalhes (Modal Centralizado) */}
      {isDrawerOpen && (selectedItemData || selectedItemId) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-gray-200 dark:bg-black/60 backdrop-blur-sm z-[60] animate-in fade-in duration-300"
            onClick={() => {
              setIsDrawerOpen(false)
              setSelectedItemData(null)
              setSelectedMovimentacao(null)
            }}
          />
          
          {/* Modal Content */}
          <div className="relative bg-[#0f0f0f] border border-[#CCA761]/20 z-[61] shadow-2xl flex flex-col animate-in zoom-in-95 duration-300 rounded-2xl overflow-hidden max-w-2xl w-full max-h-[90vh]">
            {(() => {
              const item = selectedItemData ?? items.find(i => i.id === selectedItemId)
              if (!item) {
                return (
                  <div className="p-8 text-center text-gray-500 dark:text-white/50">Detalhes indisponíveis para este registro.</div>
                )
              }

              return (
                <>
                  {/* Modal Header */}
                  <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gray-50 dark:bg-[#141414]/50 shrink-0">
                    <div>
                      <h3 className="text-[#CCA761] text-[20px] font-bold tracking-tight">
                        Detalhamento do Processo
                      </h3>
                      <p className="text-gray-400 dark:text-white/40 text-xs uppercase tracking-[0.2em] mt-1 font-medium">
                        {item.monitored_processes?.numero_processo}
                      </p>
                    </div>
                    <button 
                      onClick={() => {
                        setIsDrawerOpen(false)
                        setSelectedItemData(null)
                        setSelectedMovimentacao(null)
                      }}
                      className="p-2 rounded-xl bg-white/5 text-gray-400 dark:text-white/40 hover:text-white hover:bg-white/10 transition-all"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Drawer Body */}
                  <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
                    {/* Header Info */}
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-[#CCA761] font-black uppercase tracking-widest">Número do Processo</label>
                        <p className="text-xl font-bold text-white tracking-wide">
                          {item.monitored_processes?.numero_processo}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-gray-400 dark:text-white/30 font-black uppercase tracking-widest">Autor (Polo Ativo)</label>
                          <p className="text-sm text-white/80 font-medium">
                            {item.monitored_processes?.partes?.polo_ativo || '—'}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-gray-400 dark:text-white/30 font-black uppercase tracking-widest">Réu (Polo Passivo)</label>
                          <p className="text-sm text-white/80 font-medium">
                            {item.monitored_processes?.partes?.polo_passivo || '—'}
                          </p>
                        </div>
                      </div>

                      <div className="pt-4 grid grid-cols-2 gap-6 border-t border-white/5">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-gray-400 dark:text-white/30 font-black uppercase tracking-widest">Tribunal / Comarca</label>
                          <p className="text-xs text-gray-600 dark:text-white/60">
                            {item.monitored_processes?.tribunal} · {item.monitored_processes?.comarca || '—'}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-gray-400 dark:text-white/30 font-black uppercase tracking-widest">Vencimento</label>
                          <div className="flex items-center gap-2">
                             <Clock size={12} className="text-[#CCA761]" />
                             <p className="text-xs text-[#CCA761] font-bold">
                               {formatarData(item.data_vencimento)}
                             </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Movimentação Completa */}
                    {(selectedMovimentacao?.conteudo || item.monitored_processes?.ultima_movimentacao_texto) && (
                      <div className="p-6 rounded-2xl bg-gray-50 dark:bg-white/[0.03] border border-white/5 space-y-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <label className="text-[10px] text-[#CCA761] font-black uppercase tracking-widest">Movimentação Completa</label>
                          <span className="text-[11px] text-gray-400 dark:text-white/40">
                            {formatarData(selectedMovimentacao?.dataISO || selectedMovimentacao?.dataReferencia || item.monitored_processes?.data_ultima_movimentacao || null)}
                          </span>
                        </div>
                        <div className="max-h-64 overflow-y-auto pr-1">
                          <p className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap break-words">
                            {selectedMovimentacao?.conteudo || item.monitored_processes?.ultima_movimentacao_texto}
                          </p>
                        </div>
                      </div>
                    )}

                    {Array.isArray(selectedMovimentacao?.historico) && selectedMovimentacao.historico.length > 1 && (
                      <div className="p-6 rounded-2xl bg-gray-50 dark:bg-white/[0.03] border border-white/5 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-[10px] text-[#CCA761] font-black uppercase tracking-widest">Histórico de Movimentações</label>
                          <span className="text-[11px] text-gray-400 dark:text-white/40">{selectedMovimentacao.historico.length} registros</span>
                        </div>

                        <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
                          {selectedMovimentacao.historico.slice(1).map((movHist: any) => (
                            <div key={movHist.id} className="rounded-xl border border-white/10 bg-gray-200 dark:bg-black/20 p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-white/30">Movimentação</span>
                                <span className="text-[10px] text-[#CCA761]">{formatarData(movHist.dataISO || movHist.dataReferencia || null)}</span>
                              </div>
                              <p className="text-[12px] text-gray-700 dark:text-white/70 leading-relaxed whitespace-pre-wrap break-words">
                                {movHist.conteudo || 'Sem conteúdo'}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Descrição do Prazo */}
                    <div className="p-6 rounded-2xl bg-gray-50 dark:bg-white/[0.03] border border-white/5 space-y-3">
                      <label className="text-[10px] text-[#CCA761] font-black uppercase tracking-widest">Título do Prazo / Audiência</label>
                      <h4 className="text-lg font-medium text-white leading-tight">
                        {item.descricao}
                      </h4>
                      {item.monitored_processes?.resumo_curto && (
                        <div className="pt-3 border-t border-white/5">
                          <p className="text-[13px] text-gray-500 dark:text-white/50 leading-relaxed italic">
                            &quot;{item.monitored_processes.resumo_curto}&quot;
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Resumo do Caso (Kanban) */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                         <label className="text-[10px] text-[#CCA761] font-black uppercase tracking-widest">Anotações (Resumo do Caso)</label>
                         {loadingTask && <div className="w-4 h-4 border-2 border-[#CCA761]/30 border-t-[#CCA761] rounded-full animate-spin" />}
                      </div>
                      
                      <div className="space-y-4">
                        <textarea
                          value={annotationText}
                          onChange={(e) => setAnnotationText(e.target.value)}
                          placeholder="Escreva aqui os detalhes importantes deste caso..."
                          className="w-full h-48 p-4 bg-[#111] border border-white/10 rounded-xl text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-[#CCA761]/50 placeholder:text-gray-200 dark:text-white/10 resize-none transition-all"
                        />
                        
                        <div className="flex justify-end">
                          <button
                            onClick={handleSaveAnnotation}
                            disabled={isSavingAnnotation}
                            className={`px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                              saveSuccess 
                                ? 'bg-green-500/20 text-green-400 border border-green-500/50' 
                                : 'bg-[#CCA761] hover:bg-[#b39255] text-black disabled:opacity-50'
                            }`}
                          >
                            {isSavingAnnotation ? (
                              <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                            ) : saveSuccess ? (
                              <CheckCircle size={14} />
                            ) : null}
                            {saveSuccess ? 'Salvo ✓' : isSavingAnnotation ? 'Salvando...' : 'Salvar Anotação'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Drawer Footer */}
                  <div className="p-6 border-t border-white/5 bg-gray-50 dark:bg-[#141414]/50 flex justify-end">
                    <button 
                      onClick={() => {
                        setIsDrawerOpen(false)
                        setSelectedItemData(null)
                        setSelectedMovimentacao(null)
                      }}
                      className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white font-bold text-sm rounded-xl transition-all border border-white/5"
                    >
                      Fechar Detalhes
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
