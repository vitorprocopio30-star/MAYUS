'use client'

import type { Dispatch, MouseEvent, ReactNode, SetStateAction } from 'react'
import {
  Calendar,
  CheckCircle,
  ChevronDown,
  Clock,
  Gavel,
  Search,
  Trash2,
  User,
  UserPlus,
  X,
} from 'lucide-react'
import {
  MayusAvatar,
  MayusButton,
  MayusCard,
  MayusDateField,
  MayusEmptyState,
  MayusIconButton,
  MayusInputField,
  MayusModal,
  MayusPageShell,
  MayusProcessNumber,
  MayusSelectField,
  MayusTabs,
  MayusTag,
  MayusTextarea,
} from '@/components/ui/mayus'
import { cn } from '@/lib/utils'

type TabType = 'movimentacoes' | 'prazos' | 'audiencias'
type StatusVariant = 'neutral' | 'watch' | 'fatal' | 'done'

const optionStyle = { backgroundColor: '#131009', color: '#f0ead8' }

function prazoStatusLabel(item: any, diasRestantes: (data: string) => number) {
  if (item.status === 'concluido') return 'CONCLUÍDO'
  const dias = diasRestantes(item.data_vencimento)
  if (dias <= 0) return 'PRAZO FATAL'
  return `${dias} DIAS`
}

function prazoDiasDetalhe(item: any, activeTab: TabType, diasRestantes: (data: string) => number) {
  if (item.status === 'concluido') return 'Prazo concluído'

  const dias = diasRestantes(item.data_vencimento)
  const isAudiencia = activeTab === 'audiencias'

  if (dias < 0) {
    const atraso = Math.abs(dias)
    return `${atraso} ${atraso === 1 ? 'dia em atraso' : 'dias em atraso'}`
  }

  if (dias === 0) return isAudiencia ? 'Hoje' : 'Vence hoje'
  if (dias === 1) return isAudiencia ? 'Falta 1 dia' : 'Falta 1 dia de prazo'

  return isAudiencia ? `Faltam ${dias} dias` : `Faltam ${dias} dias de prazo`
}

function prazoStatusVariant(item: any, diasRestantes: (data: string) => number): StatusVariant {
  if (item.status === 'concluido') return 'done'
  const dias = diasRestantes(item.data_vencimento)
  if (dias <= 3) return 'fatal'
  return 'watch'
}

function deadlineOriginVariant(label: string): StatusVariant {
  const normalized = label.toLowerCase()
  if (normalized.includes('humano')) return 'done'
  if (normalized.includes('ia')) return 'watch'
  return 'neutral'
}

function processCopyHandler(id: string, setCopiedId: Dispatch<SetStateAction<string | null>>) {
  setCopiedId(id)
  window.setTimeout(() => setCopiedId(null), 2000)
}

function cardMetaLine(parts: Array<string | null | undefined>) {
  return parts.filter((part) => String(part ?? '').trim()).join(' / ')
}

function tipoRegistroLabel(tipo?: string | null) {
  const labels: Record<string, string> = {
    audiencia: 'Audiência',
    citacao: 'Citação',
    movimentacao: 'Movimentação',
    pericia: 'Perícia',
    prazo: 'Prazo',
    recurso: 'Recurso',
    sentenca: 'Sentença',
    sessao: 'Sessão',
  }
  const normalized = String(tipo ?? '').toLowerCase()
  return labels[normalized] || tipo || 'Registro'
}

export function PrazosDesignSystemView({
  activeTab,
  setActiveTab,
  loading,
  searchTerm,
  setSearchTerm,
  movementDateFilter,
  setMovementDateFilter,
  filterResponsavel,
  setFilterResponsavel,
  filterTribunal,
  setFilterTribunal,
  profiles,
  tribunals,
  filteredItems,
  movimentacoesFiltradas,
  copiedId,
  setCopiedId,
  monitoringProcessNumber,
  currentUser,
  items,
  formatarData,
  diasRestantes,
  getDeadlineOrigin,
  ehPrazoDeSentenca,
  obterVencimentoEmbargosDeclaracao,
  handleMonitorProcess,
  handleOpenDrawer,
  updateStatus,
  atribuirResponsavel,
  excluirPrazo,
  isDrawerOpen,
  setIsDrawerOpen,
  selectedItemId,
  selectedItemData,
  setSelectedItemData,
  selectedMovimentacao,
  setSelectedMovimentacao,
  loadingTask,
  annotationText,
  setAnnotationText,
  isSavingAnnotation,
  saveSuccess,
  handleSaveAnnotation,
}: {
  activeTab: TabType
  setActiveTab: (tab: TabType) => void
  loading: boolean
  searchTerm: string
  setSearchTerm: Dispatch<SetStateAction<string>>
  movementDateFilter: string
  setMovementDateFilter: Dispatch<SetStateAction<string>>
  filterResponsavel: string
  setFilterResponsavel: Dispatch<SetStateAction<string>>
  filterTribunal: string
  setFilterTribunal: Dispatch<SetStateAction<string>>
  profiles: any[]
  tribunals: string[]
  filteredItems: any[]
  movimentacoesFiltradas: any[]
  copiedId: string | null
  setCopiedId: Dispatch<SetStateAction<string | null>>
  monitoringProcessNumber: string | null
  currentUser: any
  items: any[]
  formatarData: (value: string | null) => string
  diasRestantes: (data: string) => number
  getDeadlineOrigin: (item: any) => { label: string; description: string; hasKanbanCard: boolean }
  ehPrazoDeSentenca: (item: any) => boolean
  obterVencimentoEmbargosDeclaracao: (item: any) => string | null
  handleMonitorProcess: (event: MouseEvent, entry: any) => void
  handleOpenDrawer: (item: any, movimentacao?: any | null) => void
  updateStatus: (id: string, newStatus: string) => void
  atribuirResponsavel: (id: string, responsavelId: string | null) => void
  excluirPrazo: (id: string) => void
  isDrawerOpen: boolean
  setIsDrawerOpen: Dispatch<SetStateAction<boolean>>
  selectedItemId: string | null
  selectedItemData: any | null
  setSelectedItemData: Dispatch<SetStateAction<any | null>>
  selectedMovimentacao: any | null
  setSelectedMovimentacao: Dispatch<SetStateAction<any | null>>
  loadingTask: boolean
  annotationText: string
  setAnnotationText: Dispatch<SetStateAction<string>>
  isSavingAnnotation: boolean
  saveSuccess: boolean
  handleSaveAnnotation: () => void
}) {
  const selectedItem = selectedItemData ?? items.find((item) => item.id === selectedItemId)

  const closeModal = () => {
    setIsDrawerOpen(false)
    setSelectedItemData(null)
    setSelectedMovimentacao(null)
  }

  return (
    <MayusPageShell
      className="mayus-ops-gold"
      eyebrow="Operações Jurídicas"
      title={
        <>
          Prazos & <em>Audiências</em>
        </>
      }
      actions={
        <MayusTabs
          className="sm:min-w-[34rem]"
          activeValue={activeTab}
          onChange={(value) => setActiveTab(value as TabType)}
          items={[
            { value: 'movimentacoes', label: 'Movimentações' },
            { value: 'prazos', label: 'Prazos' },
            { value: 'audiencias', label: 'Audiências' },
          ]}
        />
      }
    >
      <div className="mb-8">
        <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
          <MayusInputField
            icon={<Search size={18} />}
            type="text"
            placeholder={activeTab === 'movimentacoes' ? 'Buscar movimentação...' : 'Buscar processo ou prazo...'}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          {activeTab === 'movimentacoes' ? (
            <div className="flex flex-wrap items-center gap-3">
              <MayusDateField
                icon={<Calendar size={16} />}
                value={movementDateFilter}
                onChange={(event) => setMovementDateFilter(event.target.value)}
                title="Filtrar movimentações por data"
                className="min-w-[13rem]"
              />
              {movementDateFilter ? (
                <MayusButton onClick={() => setMovementDateFilter('')}>Limpar data</MayusButton>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[33rem]">
              <MayusSelectField
                icon={<User size={16} />}
                value={filterResponsavel}
                onChange={(event) => setFilterResponsavel(event.target.value)}
              >
                <option value="todos" style={optionStyle}>Todos responsáveis</option>
                <option value="sem_responsavel" style={optionStyle}>Sem responsável</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id} style={optionStyle}>
                    {profile.full_name}
                  </option>
                ))}
              </MayusSelectField>

              <MayusSelectField
                icon={<Gavel size={16} />}
                value={filterTribunal}
                onChange={(event) => setFilterTribunal(event.target.value)}
              >
                <option value="todos" style={optionStyle}>Todos tribunais</option>
                {tribunals.map((tribunal) => (
                  <option key={tribunal} value={tribunal} style={optionStyle}>
                    {tribunal}
                  </option>
                ))}
              </MayusSelectField>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className="mayus-card h-56 animate-pulse" />
          ))}
        </div>
      ) : activeTab === 'movimentacoes' ? (
        <MovimentacoesGrid
          movimentacoes={movimentacoesFiltradas}
          copiedId={copiedId}
          setCopiedId={setCopiedId}
          monitoringProcessNumber={monitoringProcessNumber}
          formatarData={formatarData}
          handleMonitorProcess={handleMonitorProcess}
          handleOpenDrawer={handleOpenDrawer}
        />
      ) : (
        <PrazosGrid
          items={filteredItems}
          activeTab={activeTab}
          copiedId={copiedId}
          setCopiedId={setCopiedId}
          monitoringProcessNumber={monitoringProcessNumber}
          currentUser={currentUser}
          profiles={profiles}
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
        />
      )}

      <MayusModal open={isDrawerOpen && Boolean(selectedItem)} onClose={closeModal}>
        {selectedItem ? (
          <ProcessDetailModal
            item={selectedItem}
            selectedMovimentacao={selectedMovimentacao}
            closeModal={closeModal}
            loadingTask={loadingTask}
            annotationText={annotationText}
            setAnnotationText={setAnnotationText}
            isSavingAnnotation={isSavingAnnotation}
            saveSuccess={saveSuccess}
            handleSaveAnnotation={handleSaveAnnotation}
            formatarData={formatarData}
          />
        ) : null}
      </MayusModal>
    </MayusPageShell>
  )
}

function MovimentacoesGrid({
  movimentacoes,
  copiedId,
  setCopiedId,
  monitoringProcessNumber,
  formatarData,
  handleMonitorProcess,
  handleOpenDrawer,
}: {
  movimentacoes: any[]
  copiedId: string | null
  setCopiedId: Dispatch<SetStateAction<string | null>>
  monitoringProcessNumber: string | null
  formatarData: (value: string | null) => string
  handleMonitorProcess: (event: MouseEvent, entry: any) => void
  handleOpenDrawer: (item: any, movimentacao?: any | null) => void
}) {
  if (movimentacoes.length === 0) {
    return (
      <MayusEmptyState
        icon={<Calendar size={56} />}
        title="Nenhuma movimentação encontrada"
        description="Não há movimentações registradas para os filtros atuais."
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {movimentacoes.map((mov) => (
        <div key={mov.id} className="cursor-pointer" onClick={() => handleOpenDrawer(mov.item, mov)}>
          <MayusCard interactive className="h-full">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="t-label mb-2 text-[var(--gold)]">Última movimentação</div>
                <div className="flex items-center gap-2 font-ui text-sm text-[var(--ink-2)]">
                  <Clock size={14} className="text-[var(--gold)]" />
                  <span>{formatarData(mov.dataISO || mov.dataReferencia)}</span>
                </div>
              </div>
              <span className="font-ui text-xs text-[var(--gold)]">Abrir detalhes</span>
            </div>

            <h2 className="t-title mb-3 line-clamp-2 text-[1.35rem] leading-tight">
              {mov.item.descricao || 'Atualização processual'}
            </h2>

            <div className="mb-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg)]/55 p-4">
              <p className="t-body max-h-56 overflow-y-auto whitespace-pre-wrap break-words pr-1 text-sm leading-relaxed">
                {mov.conteudo}
              </p>
            </div>

            <div className="mb-5 space-y-2">
              <MayusProcessNumber
                value={mov.numeroProcesso}
                copied={copiedId === mov.id}
                onCopy={() => processCopyHandler(mov.id, setCopiedId)}
              />

              {mov.cliente ? <p className="pl-1 text-xs text-[var(--ink-2)]">Cliente: {mov.cliente}</p> : null}
              {mov.tribunal ? (
                <p className="pl-1 font-ui text-xs uppercase text-[var(--ink-3)]">
                  {cardMetaLine([mov.tribunal, mov.comarca, mov.vara])}
                </p>
              ) : null}
              {mov.assunto ? <p className="pl-1 text-xs text-[var(--ink-2)]">Assunto: {mov.assunto}</p> : null}
              {(mov.classeProcessual || mov.tipoAcao) ? (
                <p className="pl-1 font-ui text-xs uppercase text-[var(--ink-3)]">
                  {cardMetaLine([mov.classeProcessual, mov.tipoAcao])}
                </p>
              ) : null}
              {mov.faseAtual ? <p className="pl-1 font-ui text-xs uppercase text-[var(--gold)]">Fase: {mov.faseAtual}</p> : null}
              {(mov.poloAtivo || mov.poloPassivo) ? (
                <p className="pl-1 text-xs leading-relaxed text-[var(--ink-3)]">
                  {cardMetaLine([mov.poloAtivo ? `Ativo: ${mov.poloAtivo}` : null, mov.poloPassivo ? `Passivo: ${mov.poloPassivo}` : null])}
                </p>
              ) : null}
              {mov.resumoCurto ? (
                <p className="t-body line-clamp-2 pl-1 text-xs italic text-[var(--ink-2)]">
                  &quot;{mov.resumoCurto}&quot;
                </p>
              ) : null}
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
              <MayusTag>{tipoRegistroLabel(mov.tipoEvento || 'movimentacao')}</MayusTag>
              <MayusTag variant="watch">{mov.quantidadeMovimentacoes || 1} evento(s)</MayusTag>
              {mov.monitorado ? (
                <MayusTag variant="done" dot>Monitorado</MayusTag>
              ) : (
                <MayusButton
                  variant="primary"
                  className="min-h-7 px-3 text-[0.68rem]"
                  disabled={monitoringProcessNumber === mov.numeroProcesso}
                  onClick={(event) => handleMonitorProcess(event, mov)}
                >
                  {monitoringProcessNumber === mov.numeroProcesso ? 'Monitorando...' : '+ Monitorar'}
                </MayusButton>
              )}
            </div>
          </MayusCard>
        </div>
      ))}
    </div>
  )
}

function PrazosGrid({
  items,
  activeTab,
  copiedId,
  setCopiedId,
  monitoringProcessNumber,
  currentUser,
  profiles,
  formatarData,
  diasRestantes,
  getDeadlineOrigin,
  ehPrazoDeSentenca,
  obterVencimentoEmbargosDeclaracao,
  handleMonitorProcess,
  handleOpenDrawer,
  updateStatus,
  atribuirResponsavel,
  excluirPrazo,
}: {
  items: any[]
  activeTab: TabType
  copiedId: string | null
  setCopiedId: Dispatch<SetStateAction<string | null>>
  monitoringProcessNumber: string | null
  currentUser: any
  profiles: any[]
  formatarData: (value: string | null) => string
  diasRestantes: (data: string) => number
  getDeadlineOrigin: (item: any) => { label: string; description: string; hasKanbanCard: boolean }
  ehPrazoDeSentenca: (item: any) => boolean
  obterVencimentoEmbargosDeclaracao: (item: any) => string | null
  handleMonitorProcess: (event: MouseEvent, entry: any) => void
  handleOpenDrawer: (item: any, movimentacao?: any | null) => void
  updateStatus: (id: string, newStatus: string) => void
  atribuirResponsavel: (id: string, responsavelId: string | null) => void
  excluirPrazo: (id: string) => void
}) {
  if (items.length === 0) {
    return (
      <MayusEmptyState
        icon={<Calendar size={56} />}
        title="Nenhum registro encontrado"
        description="Ajuste os filtros ou aguarde novas movimentações processuais monitoradas pela IA."
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const deadlineOrigin = getDeadlineOrigin(item)
        const statusVariant = prazoStatusVariant(item, diasRestantes)
        const deadlineDaysLabel = prazoDiasDetalhe(item, activeTab, diasRestantes)
        const originVariant = deadlineOriginVariant(deadlineOrigin.label)
        const processNumber = item.monitored_processes?.numero_processo

        return (
          <div key={item.id} className="cursor-pointer" onClick={() => handleOpenDrawer(item, null)}>
            <MayusCard interactive className="h-full">
              <h2 className="t-title mb-2 line-clamp-2 text-[1.35rem] leading-tight">{item.descricao}</h2>

              {(item.monitored_processes?.resumo_curto || item.monitored_processes?.ultima_movimentacao_texto) ? (
                <p className="t-body mb-4 line-clamp-3 text-sm leading-relaxed text-[var(--ink-2)]">
                  {item.monitored_processes.resumo_curto ||
                    (item.monitored_processes.ultima_movimentacao_texto?.length > 120
                      ? `${item.monitored_processes.ultima_movimentacao_texto.slice(0, 120)}...`
                      : item.monitored_processes.ultima_movimentacao_texto)}
                </p>
              ) : null}

              <div className="mb-6 space-y-2">
                <div className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                  <Clock size={14} className="text-[var(--gold)]" />
                  <span>{activeTab === 'audiencias' ? 'Data:' : 'Vencimento:'} {formatarData(item.data_vencimento)}</span>
                </div>
                <div
                  className={cn(
                    'mayus-deadline-days mt-3',
                    statusVariant === 'fatal' && 'mayus-deadline-days-fatal',
                    item.status === 'concluido' && 'mayus-deadline-days-done',
                  )}
                >
                  <Calendar size={14} />
                  <span>{deadlineDaysLabel}</span>
                </div>

                {ehPrazoDeSentenca(item) ? (
                  <EmbargosNotice
                    item={item}
                    formatarData={formatarData}
                    obterVencimentoEmbargosDeclaracao={obterVencimentoEmbargosDeclaracao}
                  />
                ) : null}

                <MayusProcessNumber
                  value={processNumber}
                  copied={copiedId === item.id}
                  onCopy={() => processCopyHandler(item.id, setCopiedId)}
                />

                {item.monitored_processes?.partes?.polo_ativo ? (
                  <p className="pl-1 text-xs leading-relaxed text-[var(--ink-2)]">
                    {item.monitored_processes.partes.polo_ativo}
                  </p>
                ) : null}
                {item.monitored_processes?.cliente_nome ? (
                  <p className="pl-1 text-xs text-[var(--ink-2)]">Cliente: {item.monitored_processes.cliente_nome}</p>
                ) : null}
                {item.monitored_processes?.tribunal ? (
                  <p className="pl-1 font-ui text-xs uppercase text-[var(--ink-3)]">
                    {cardMetaLine([item.monitored_processes.tribunal, item.monitored_processes.comarca])}
                  </p>
                ) : null}
              </div>

              {!deadlineOrigin.hasKanbanCard ? (
                <div className="mt-auto rounded-[var(--radius-card)] border border-[var(--fatal-line)] bg-[var(--fatal-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--fatal)]">
                  Prazo sem card Kanban vinculado. Revise o processo para garantir acompanhamento no quadro processual.
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
                <MayusTag variant="watch">{tipoRegistroLabel(item.tipo)}</MayusTag>
                {item.monitored_processes?.escavador_monitoramento_id ? (
                  <MayusTag variant="done" dot>Monitorado</MayusTag>
                ) : (
                  <MayusButton
                    variant="primary"
                    className="min-h-7 px-3 text-[0.68rem]"
                    disabled={monitoringProcessNumber === processNumber}
                    onClick={(event) => handleMonitorProcess(event, item)}
                  >
                    {monitoringProcessNumber === processNumber ? 'Monitorando...' : '+ Monitorar'}
                  </MayusButton>
                )}
                <MayusTag variant={originVariant} title={deadlineOrigin.description}>
                  {deadlineOrigin.label}
                </MayusTag>
                {!deadlineOrigin.hasKanbanCard ? (
                  <MayusTag variant="fatal" title="Este prazo não está vinculado a um card Kanban processual.">
                    Sem card
                  </MayusTag>
                ) : null}
                <MayusTag variant={statusVariant}>{prazoStatusLabel(item, diasRestantes)}</MayusTag>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                {item.responsavel_id ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <MayusAvatar src={item.profiles?.avatar_url} name={item.profiles?.full_name} />
                    <span className="truncate font-ui text-sm text-[var(--gold)]">
                      {item.profiles?.full_name?.split(' ')[0] ?? 'Sem responsável'}
                    </span>
                  </div>
                ) : (
                  <MayusButton
                    variant="danger"
                    className="min-h-10"
                    onClick={(event) => {
                      event.stopPropagation()
                      atribuirResponsavel(item.id, currentUser?.id)
                    }}
                  >
                    <UserPlus size={14} /> Assumir
                  </MayusButton>
                )}

                <div className="flex items-center gap-2">
                  {item.status !== 'concluido' ? (
                    <MayusIconButton
                      variant="done"
                      title="Marcar como concluído"
                      onClick={(event) => {
                        event.stopPropagation()
                        updateStatus(item.id, 'concluido')
                      }}
                    >
                      <CheckCircle size={16} />
                    </MayusIconButton>
                  ) : (
                    <MayusIconButton
                      variant="primary"
                      title="Reabrir prazo"
                      onClick={(event) => {
                        event.stopPropagation()
                        updateStatus(item.id, 'pendente')
                      }}
                    >
                      <Clock size={16} />
                    </MayusIconButton>
                  )}

                  <MayusIconButton
                    variant="danger"
                    title="Excluir registro"
                    onClick={(event) => {
                      event.stopPropagation()
                      excluirPrazo(item.id)
                    }}
                  >
                    <Trash2 size={16} />
                  </MayusIconButton>

                  <AssigneeMenu item={item} profiles={profiles} atribuirResponsavel={atribuirResponsavel} />
                </div>
              </div>
            </MayusCard>
          </div>
        )
      })}
    </div>
  )
}

function EmbargosNotice({
  item,
  formatarData,
  obterVencimentoEmbargosDeclaracao,
}: {
  item: any
  formatarData: (value: string | null) => string
  obterVencimentoEmbargosDeclaracao: (item: any) => string | null
}) {
  const vencimentoEmbargos = obterVencimentoEmbargosDeclaracao(item)

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--watch-line)] bg-[var(--watch-bg)] px-3 py-2 text-xs text-[var(--gold)]">
      {`Alerta: embargos de declaração em 5 dias úteis${vencimentoEmbargos ? ` (venc. estimado: ${formatarData(vencimentoEmbargos)})` : ''}.`}
    </div>
  )
}

function AssigneeMenu({
  item,
  profiles,
  atribuirResponsavel,
}: {
  item: any
  profiles: any[]
  atribuirResponsavel: (id: string, responsavelId: string | null) => void
}) {
  return (
    <div className="group/menu relative">
      <MayusIconButton onClick={(event) => event.stopPropagation()} title="Atribuir responsável">
        <ChevronDown size={16} />
      </MayusIconButton>
      <div className="invisible absolute bottom-full right-0 z-50 mb-2 w-56 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg-1)] p-1 opacity-0 shadow-2xl transition-all group-hover/menu:visible group-hover/menu:opacity-100">
        <p className="t-label px-3 py-2 text-[var(--ink-3)]">Atribuir a</p>
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              atribuirResponsavel(item.id, profile.id)
            }}
            className="w-full rounded-md px-3 py-2 text-left font-ui text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--gold)] hover:text-[var(--gold-ink)]"
          >
            {profile.full_name || `Colaborador ${String(profile.id).slice(0, 6)}`}
          </button>
        ))}
        <div className="my-1 h-px bg-[var(--line)]" />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            atribuirResponsavel(item.id, null)
          }}
          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left font-ui text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--fatal-bg)] hover:text-[var(--fatal)]"
        >
          Remover responsável <UserPlus size={12} />
        </button>
      </div>
    </div>
  )
}

function ProcessDetailModal({
  item,
  selectedMovimentacao,
  closeModal,
  loadingTask,
  annotationText,
  setAnnotationText,
  isSavingAnnotation,
  saveSuccess,
  handleSaveAnnotation,
  formatarData,
}: {
  item: any
  selectedMovimentacao: any | null
  closeModal: () => void
  loadingTask: boolean
  annotationText: string
  setAnnotationText: Dispatch<SetStateAction<string>>
  isSavingAnnotation: boolean
  saveSuccess: boolean
  handleSaveAnnotation: () => void
  formatarData: (value: string | null) => string
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--bg-2)]/70 p-6">
        <div>
          <div className="t-eyebrow mb-2">Detalhamento do processo</div>
          <h2 className="t-title text-3xl leading-none">Registro operacional</h2>
          <MayusProcessNumber value={item.monitored_processes?.numero_processo} className="mt-3" />
        </div>
        <MayusIconButton onClick={closeModal} title="Fechar detalhes">
          <X size={20} />
        </MayusIconButton>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6 no-scrollbar">
        <div className="grid gap-4 md:grid-cols-2">
          <DetailBlock label="Autor" value={item.monitored_processes?.partes?.polo_ativo || '-'} />
          <DetailBlock label="Réu" value={item.monitored_processes?.partes?.polo_passivo || '-'} />
          <DetailBlock label="Cliente" value={item.monitored_processes?.cliente_nome || selectedMovimentacao?.cliente || '-'} />
          <DetailBlock
            label="Tribunal / Comarca"
            value={cardMetaLine([
              selectedMovimentacao?.tribunal || item.monitored_processes?.tribunal,
              selectedMovimentacao?.comarca || item.monitored_processes?.comarca,
              selectedMovimentacao?.vara || item.monitored_processes?.vara,
            ]) || '-'}
          />
          <DetailBlock label="Vencimento" value={formatarData(item.data_vencimento)} icon={<Clock size={14} />} tone="gold" />
          <DetailBlock label="Assunto" value={selectedMovimentacao?.assunto || item.monitored_processes?.assunto || '-'} />
          <DetailBlock label="Classe / tipo" value={cardMetaLine([
            selectedMovimentacao?.classeProcessual || item.monitored_processes?.classe_processual,
            selectedMovimentacao?.tipoAcao || item.monitored_processes?.tipo_acao,
          ]) || '-'} />
          <DetailBlock label="Fase atual" value={selectedMovimentacao?.faseAtual || item.monitored_processes?.fase_atual || '-'} tone="gold" />
          {selectedMovimentacao ? (
            <DetailBlock
              label="Origem / eventos"
              value={cardMetaLine([
                tipoRegistroLabel(selectedMovimentacao.tipoEvento),
                `${selectedMovimentacao.quantidadeMovimentacoes || 1} evento(s)`,
                selectedMovimentacao.oabEstado && selectedMovimentacao.oabNumero
                  ? `OAB ${selectedMovimentacao.oabEstado} ${selectedMovimentacao.oabNumero}`
                  : null,
              ]) || '-'}
            />
          ) : null}
        </div>

        {(selectedMovimentacao?.conteudo || item.monitored_processes?.ultima_movimentacao_texto) ? (
          <section className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg)]/55 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="t-label text-[var(--gold)]">Movimentação completa</div>
              <span className="font-ui text-xs text-[var(--ink-2)]">
                {formatarData(selectedMovimentacao?.dataISO || selectedMovimentacao?.dataReferencia || item.monitored_processes?.data_ultima_movimentacao || null)}
              </span>
            </div>
            <p className="t-body max-h-64 overflow-y-auto whitespace-pre-wrap break-words pr-1 text-sm leading-relaxed">
              {selectedMovimentacao?.conteudo || item.monitored_processes?.ultima_movimentacao_texto}
            </p>
          </section>
        ) : null}

        {Array.isArray(selectedMovimentacao?.historico) && selectedMovimentacao.historico.length > 1 ? (
          <section className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg)]/55 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="t-label text-[var(--gold)]">Histórico de movimentações</div>
              <span className="font-ui text-xs text-[var(--ink-2)]">{selectedMovimentacao.historico.length} registros</span>
            </div>
            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {selectedMovimentacao.historico.slice(1).map((movHist: any) => (
                <div key={movHist.id} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg-1)] p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="font-ui text-xs uppercase text-[var(--ink-3)]">Movimentação</span>
                    <span className="font-ui text-xs text-[var(--gold)]">{formatarData(movHist.dataISO || movHist.dataReferencia || null)}</span>
                  </div>
                  <p className="t-body whitespace-pre-wrap break-words text-sm leading-relaxed">{movHist.conteudo || 'Sem conteúdo'}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg)]/55 p-5">
          <div className="t-label mb-3 text-[var(--gold)]">Título do prazo / audiência</div>
          <h3 className="t-title text-2xl leading-tight">{item.descricao}</h3>
          {item.monitored_processes?.resumo_curto ? (
            <p className="t-body mt-3 border-t border-[var(--line)] pt-3 text-sm italic text-[var(--ink-2)]">
              &quot;{item.monitored_processes.resumo_curto}&quot;
            </p>
          ) : null}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="t-label text-[var(--gold)]">Anotações do caso</div>
            {loadingTask ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--line-gold)] border-t-[var(--gold)]" /> : null}
          </div>
          <MayusTextarea
            value={annotationText}
            onChange={(event) => setAnnotationText(event.target.value)}
            placeholder="Escreva aqui os detalhes importantes deste caso..."
          />
          <div className="flex justify-end">
            <MayusButton
              variant={saveSuccess ? 'done' : 'primary'}
              onClick={handleSaveAnnotation}
              disabled={isSavingAnnotation}
            >
              {isSavingAnnotation ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--gold-ink)]/30 border-t-[var(--gold-ink)]" />
              ) : saveSuccess ? (
                <CheckCircle size={14} />
              ) : null}
              {saveSuccess ? 'Salvo' : isSavingAnnotation ? 'Salvando...' : 'Salvar anotação'}
            </MayusButton>
          </div>
        </section>
      </div>

      <div className="flex justify-end border-t border-[var(--line)] bg-[var(--bg-2)]/70 p-6">
        <MayusButton onClick={closeModal}>Fechar detalhes</MayusButton>
      </div>
    </>
  )
}

function DetailBlock({
  label,
  value,
  icon,
  tone = 'muted',
}: {
  label: string
  value: string
  icon?: ReactNode
  tone?: 'muted' | 'gold'
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg)]/55 p-4">
      <div className="t-label mb-2 text-[var(--ink-3)]">{label}</div>
      <div className={cn("flex items-center gap-2 text-sm leading-relaxed", tone === 'gold' ? "font-ui text-[var(--gold)]" : "t-body")}>
        {icon ? <span>{icon}</span> : null}
        <span>{value}</span>
      </div>
    </div>
  )
}
