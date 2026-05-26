export type MayusInternalAgentId =
  | "mayus_integrator"
  | "setup_agent"
  | "legal_operations_agent"
  | "monitoring_agent"
  | "client_service_agent"
  | "growth_agent"
  | "finance_agent";

export type MayusAgentHealthStatus =
  | "ready"
  | "needs_setup"
  | "blocked"
  | "degraded"
  | "disabled";

export type MayusAgentControlModule =
  | "core"
  | "setup"
  | "legal_ops"
  | "monitoring"
  | "client_service"
  | "growth"
  | "finance"
  | "documents";

export type MayusAgenticWorkstreamId =
  | "front_0_metodologia"
  | "front_a_juridico_lex"
  | "front_b_agentic_core";

export type MayusAgenticCoordinationStatus = "clear" | "needs_coordination" | "blocked";

export type MayusAgenticHandoffStatus = MayusAgenticCoordinationStatus | "not_observed";

export type MayusAgentControlPlaneMethodologySignal = {
  missionId: string | null;
  tenantId: string | null;
  module: MayusAgentControlModule | null;
  source: string | null;
  status: string | null;
  activation: string | null;
  canGuideInternalDecisions: boolean | null;
  requiresHumanReview: boolean;
  area: string | null;
  reviewReasons: string[];
  expectedDocuments: string[];
  handoffRequired: boolean;
  handoffReason: string;
  lastUpdatedAt: string | null;
};

export type MayusAgentControlPlaneHandoffSignal = {
  id: "methodology_to_lex" | "lex_to_agentic_core";
  fromWorkstreamId: MayusAgenticWorkstreamId;
  toWorkstreamId: MayusAgenticWorkstreamId;
  label: string;
  status: MayusAgenticHandoffStatus;
  tenantId: string | null;
  sourceMissionId: string | null;
  signal: string;
};

export type MayusAgentControlPlaneCollisionBlocker = {
  id: string;
  sourceWorkstreamId: MayusAgenticWorkstreamId;
  protectedWorkstreamId: MayusAgenticWorkstreamId;
  label: string;
  reason: string;
  blockedWhen: string;
  requiredHandoff: string;
};

export type MayusAgentControlPlaneAgentCoordination = {
  agentId: MayusInternalAgentId;
  agentLabel: string;
  workstreamId: MayusAgenticWorkstreamId;
  workstreamLabel: string;
  workstreamOwner: string;
  runtimeOwner: MayusAgentControlPlaneProfile["owner"];
  ownership: string[];
  collisionBlockers: string[];
  handoff: string;
  handoffRequired: boolean;
  coordinatedNextStep: string;
};

export type MayusAgentControlPlaneWorkstream = {
  id: MayusAgenticWorkstreamId;
  label: string;
  owner: string;
  scope: string;
  internalAgentIds: MayusInternalAgentId[];
  ownedModules: MayusAgentControlModule[];
  ownedSurfaces: string[];
  ownership: string[];
  collisionBlockers: string[];
  handoff: string;
  status: MayusAgenticCoordinationStatus;
  pendingApprovals: number;
  blockers: number;
  coordinatedNextStep: string;
};

export type MayusAgentControlPlaneCoordination = {
  status: MayusAgenticCoordinationStatus;
  workstreams: MayusAgentControlPlaneWorkstream[];
  agentMap: MayusAgentControlPlaneAgentCoordination[];
  collisionBlockers: MayusAgentControlPlaneCollisionBlocker[];
  handoffChain: MayusAgentControlPlaneHandoffSignal[];
  methodologySignals: MayusAgentControlPlaneMethodologySignal[];
  nextCoordinatedStep: string;
};

export type MayusPublicAgentPrimitiveId = "paperclip" | "openclaw" | "hermes";

export type MayusPublicAgentMatrixStatus =
  | "working"
  | "ready"
  | "awaiting_approval"
  | "needs_attention"
  | "blocked"
  | "read_only";
export type MayusTenantAgentReadinessStatus =
  | "ready"
  | "blocked"
  | "awaiting_approval"
  | "insufficient_evidence";

export type MayusTenantAgentPrimitiveReadiness = {
  id: MayusPublicAgentPrimitiveId;
  label: string;
  status: MayusTenantAgentReadinessStatus;
  evidence: string[];
  blockers: string[];
  nextAction: string;
};

export type MayusPublicAgentMatrixItem = {
  id: MayusPublicAgentPrimitiveId;
  label: string;
  reusedAs: string;
  matrixMode: "read_only_status";
  owner: "MAYUS Operating Partner";
  status: MayusPublicAgentMatrixStatus;
  evidence: string[];
  blockers: string[];
  nextAction: string;
  operational: {
    status: MayusPublicAgentMatrixStatus;
    modulesCovered: string[];
    latestSignalAt: string | null;
    approvals: number;
    blockerCount: number;
    gaps: string[];
    nextAction: string;
  };
  paperclip?: {
    heartbeat: string;
    routines: {
      total: number;
      enabled: number;
      blocked: number;
      awaitingApproval: number;
    };
    approvals: number;
    budget: {
      hardStops: number;
      policyLabels: string[];
    };
    activity: {
      latestMissionAt: string | null;
      activeOwners: string[];
      handoff: {
        chain: string[];
        latestTenantId: string | null;
        methodologyStatus: string | null;
        legalStatus: string | null;
        agenticStatus: string | null;
        nextAction: string;
      };
    };
    portability: {
      status: "pending_preflight";
      reason: string;
    };
  };
  openclaw?: {
    coverage: "mission_snapshot_policy";
    requiresFullMatrix: false;
    precedence: readonly string[];
    surfaces: string[];
    outcomes: string[];
    blockedLayer: string | null;
    reason: string | null;
    nextModules: string[];
    methodology: {
      status: string | null;
      activation: string | null;
      requiresHumanReview: boolean;
      reviewReasons: string[];
      blockedLayer: string | null;
      reason: string | null;
    } | null;
  };
  hermes?: {
    source: "mission_snapshots_read_only";
    missionsObserved: number;
    latestStatus: string | null;
    latestMemoryId: string | null;
    lifecycleStatus: string | null;
    lastEventSummary: string | null;
    tenantLearning: {
      scope: "tenant_only";
      signalsObserved: number;
      latestTenantId: string | null;
      latestMethodologyStatus: string | null;
      latestActivation: string | null;
      lastReviewReason: string | null;
    };
  };
};

export type MayusAgentControlPlaneProfile = {
  id: MayusInternalAgentId;
  label: string;
  role: string;
  module: MayusAgentControlModule;
  allowedSurfaces: string[];
  autonomyMode: "manual" | "supervised" | "auto_low_risk";
  budgetPolicy: {
    label: string;
    paidExternalActions: "blocked_without_approval" | "approval_required" | "disabled";
    maxAutomaticCostCents: number;
  };
  owner: "MAYUS Operating Partner" | "Socio responsavel" | "Admin financeiro" | "Operador juridico";
  enabled: boolean;
  controlPlane: {
    paperclip: boolean;
    openclaw: boolean;
    hermes: boolean;
  };
};

type RoutineLike = {
  id: string;
  label?: string | null;
  source?: string | null;
  agentId?: string | null;
  module?: string | null;
  enabled?: boolean | null;
  paused?: boolean | null;
  status?: string | null;
  reason?: string | null;
  nextAction?: string | null;
  lastResult?: {
    status?: string | null;
    reason?: string | null;
    approvalId?: string | null;
    taskId?: string | null;
  } | null;
};

type MissionSnapshotLike = {
  missionId?: string | null;
  taskId?: string | null;
  module?: string | null;
  agentSource?: string | null;
  status?: string | null;
  goal?: string | null;
  lastUpdatedAt?: string | null;
  tenantId?: string | null;
  tenant_id?: string | null;
  tenant?: {
    id?: string | null;
    tenantId?: string | null;
    tenant_id?: string | null;
    methodology?: Record<string, unknown> | null;
    operationalMethodology?: Record<string, unknown> | null;
    operational_methodology?: Record<string, unknown> | null;
  } | null;
  methodology?: Record<string, unknown> | null;
  operationalMethodology?: Record<string, unknown> | null;
  operational_methodology?: Record<string, unknown> | null;
  processMissionContext?: {
    methodology?: Record<string, unknown> | null;
  } | null;
  process_mission_context?: {
    methodology?: Record<string, unknown> | null;
  } | null;
  pendingApproval?: {
    id?: string | null;
    riskLevel?: string | null;
    skillName?: string | null;
    createdAt?: string | null;
  } | null;
  blockers?: string[];
  nextSafeAction?: string | null;
  latestArtifactId?: string | null;
  latestEventId?: string | null;
  policy?: {
    outcome?: string | null;
    surface?: string | null;
    module?: string | null;
    requiresApproval?: boolean | null;
    canExecuteNow?: boolean | null;
    reason?: string | null;
    source?: string | null;
    debugger?: {
      precedence?: readonly string[];
      blockedLayer?: string | null;
      blockedReasonCode?: string | null;
      appliedLayers?: Array<{
        scope?: string | null;
        key?: string | null;
        enabled?: boolean | null;
        requiresApproval?: boolean | null;
        hasAllow?: boolean | null;
        hasDeny?: boolean | null;
      }>;
    } | null;
  } | null;
  timeline?: Array<{
    id?: string | null;
    source?: string | null;
    title?: string | null;
    status?: string | null;
    createdAt?: string | null;
  }>;
  routine?: {
    routineId?: string | null;
    agentId?: string | null;
    internalAgentId?: string | null;
    internalAgentLabel?: string | null;
    status?: string | null;
  } | null;
  trajectory?: {
    status?: string | null;
    latestMemoryId?: string | null;
    lifecycleStatus?: string | null;
    lifecycleKind?: string | null;
    lastEventSummary?: string | null;
  } | null;
  legalOperatorMission?: {
    currentState?: Record<string, unknown> | null;
  } | null;
  legal_operator_mission?: {
    current_state?: Record<string, unknown> | null;
  } | null;
};

export type MayusAgentRoutineControlSummary = {
  id: string;
  label: string;
  source: string | null;
  status: string;
  enabled: boolean;
  paused: boolean;
  reason: string | null;
  nextAction: string | null;
  lastTaskId: string | null;
  approvalId: string | null;
};

export type MayusAgentControlPlaneAgent = MayusAgentControlPlaneProfile & {
  coordination: MayusAgentControlPlaneAgentCoordination;
  health: {
    status: MayusAgentHealthStatus;
    reason: string;
    lastActivityAt: string | null;
    nextAction: string;
  };
  routines: {
    total: number;
    enabled: number;
    blocked: number;
    awaitingApproval: number;
    items: MayusAgentRoutineControlSummary[];
  };
  approvalsPending: number;
  blockersCount: number;
  memoryLifecycle: {
    applied: number;
    pendingProposals: number;
    suggestedSkills: number;
    revocations: number;
  };
  activity: {
    latestMission: {
      id: string;
      status: string | null;
      goal: string | null;
      lastUpdatedAt: string | null;
      nextSafeAction: string | null;
    } | null;
    pendingApproval: {
      id: string;
      riskLevel: string | null;
      skillName: string | null;
      createdAt: string | null;
    } | null;
    latestArtifact: {
      id: string;
      title: string | null;
      artifactType: string | null;
      createdAt: string | null;
    } | null;
    latestEvent: {
      id: string;
      eventType: string | null;
      createdAt: string | null;
    } | null;
    latestBlocker: string | null;
    methodology: MayusAgentControlPlaneMethodologySignal | null;
  };
  openclaw: {
    outcome: string | null;
    surface: string | null;
    source: string | null;
    reason: string | null;
    blockedLayer: string | null;
    appliedLayersCount: number;
    precedence: readonly string[];
    methodology: {
      status: string | null;
      activation: string | null;
      requiresHumanReview: boolean;
      reviewReasons: string[];
    } | null;
  };
  hermes: {
    status: string | null;
    latestMemoryId: string | null;
    lifecycleStatus: string | null;
    lifecycleKind: string | null;
    lastEventSummary: string | null;
    tenantMethodology: {
      tenantId: string | null;
      status: string | null;
      activation: string | null;
      scope: "tenant_only";
    } | null;
  };
  readiness: {
    tenantId: string | null;
    status: MayusTenantAgentReadinessStatus;
    evidenceSufficient: boolean;
    evidence: string[];
    blockers: string[];
    nextAction: string;
    primitives: MayusTenantAgentPrimitiveReadiness[];
  };
};

export type MayusAgentControlPlaneSummary = {
  totalAgents: number;
  enabledAgents: number;
  readyAgents: number;
  blockedAgents: number;
  degradedAgents: number;
  pendingApprovals: number;
  blockers: number;
  nextAction: string;
  policyPrecedence: readonly string[];
  coordination: {
    status: MayusAgenticCoordinationStatus;
    workstreams: number;
    collisionBlockers: number;
    methodologySignals: number;
    nextCoordinatedStep: string;
  };
};

export type MayusAgentControlPlane = {
  agents: MayusAgentControlPlaneAgent[];
  summary: MayusAgentControlPlaneSummary;
  coordination: MayusAgentControlPlaneCoordination;
  publicAgents: MayusPublicAgentMatrixItem[];
  tenant_readiness: {
    tenantId: string | null;
    summary: {
      ready: number;
      blocked: number;
      awaitingApproval: number;
      insufficientEvidence: number;
    };
    agents: Array<{
      agentId: MayusInternalAgentId;
      agentLabel: string;
      module: MayusAgentControlModule;
      status: MayusTenantAgentReadinessStatus;
      evidenceSufficient: boolean;
      evidence: string[];
      blockers: string[];
      nextAction: string;
      primitives: MayusTenantAgentPrimitiveReadiness[];
    }>;
  };
};

export type MayusInternalAgentSummary = Pick<
  MayusAgentControlPlaneProfile,
  "id" | "label" | "role" | "module" | "owner" | "allowedSurfaces" | "autonomyMode" | "budgetPolicy"
>;

export const MAYUS_AGENT_POLICY_PRECEDENCE = [
  "global",
  "tenant",
  "module",
  "agent",
  "tool",
  "channel",
] as const;

type MayusAgenticWorkstreamProfile = Omit<
  MayusAgentControlPlaneWorkstream,
  "status" | "pendingApprovals" | "blockers" | "coordinatedNextStep"
> & {
  defaultNextStep: string;
};

export const MAYUS_AGENTIC_WORKSTREAM_REGISTRY: MayusAgenticWorkstreamProfile[] = [
  {
    id: "front_0_metodologia",
    label: "Frente 0 Metodologia Individual",
    owner: "Time Setup/Metodologia",
    scope: "Metodologia operacional tenant-scoped, aprovacoes e lacunas de configuracao do escritorio.",
    internalAgentIds: ["setup_agent"],
    ownedModules: ["setup"],
    ownedSurfaces: ["configuracoes", "brain", "artifacts", "aprovacoes"],
    ownership: [
      "Manter a metodologia operacional isolada por tenant.",
      "Publicar status, ativacao, lacunas e motivos de revisao como mission snapshot.",
      "Garantir que metodologia draft/recommended seja apenas sugestao supervisionada.",
    ],
    collisionBlockers: [
      "Nao alterar Lex, Draft Factory, Control Plane ou rotinas fora do handoff.",
      "Nao transformar metodologia de um escritorio em aprendizado de outro escritorio.",
    ],
    handoff: "Entrega metodologia, status de aprovacao, area, documentos esperados e review reasons para Lex e Agentic Core.",
    defaultNextStep: "Frente 0 publica metodologia tenant-scoped; Frente A usa como contexto juridico e Frente B apenas supervisiona runtime.",
  },
  {
    id: "front_a_juridico_lex",
    label: "Frente A Juridico/Lex",
    owner: "Time Juridico/Lex",
    scope: "Processos, movimentacoes, Case Brain, documentos, Draft Factory e revisao humana.",
    internalAgentIds: ["legal_operations_agent"],
    ownedModules: ["legal_ops", "documents"],
    ownedSurfaces: ["lex", "documentos", "prazos", "aprovacoes", "brain"],
    ownership: [
      "Gerar contexto processual e proxima acao segura.",
      "Manter lifecycle juridico, documentos e rascunhos Lex sob revisao humana.",
      "Consumir metodologia do tenant como contexto read-only e publicar mission snapshots para o Agentic Core.",
    ],
    collisionBlockers: [
      "Nao alterar Control Plane, rotinas, profiles, Hermes, OpenClaw ou Paperclip por dentro da Frente A.",
      "Nao transformar decisao juridica, envio externo ou protocolo em acao automatica sem approval.",
    ],
    handoff: "Recebe metodologia tenant-scoped da Frente 0 e entrega mission snapshot, legal operator state, artifact e blockers para o Control Plane.",
    defaultNextStep: "Frente A publica contexto juridico seguro com sinais de metodologia; Frente B reconstrui runtime e health sem assumir o trabalho Lex.",
  },
  {
    id: "front_b_agentic_core",
    label: "Frente B Agentes Publicos / Core Agentico",
    owner: "Time Agentes Publicos/Core",
    scope: "Control Plane, rotinas, profiles, Paperclip, OpenClaw, Hermes, approvals, health e mission snapshots.",
    internalAgentIds: [
      "mayus_integrator",
      "monitoring_agent",
      "client_service_agent",
      "growth_agent",
      "finance_agent",
    ],
    ownedModules: ["core", "monitoring", "client_service", "growth", "finance"],
    ownedSurfaces: ["dashboard", "brain", "configuracoes", "aprovacoes", "monitoramento", "crm", "financeiro"],
    ownership: [
      "Coordenar runtime agentico, policy OpenClaw, budget Paperclip, trajectory Hermes e approvals.",
      "Expor health, bloqueios, memoria e proximo passo coordenado por agente.",
      "Consumir sinais de metodologia e juridico como snapshot read-only quando outras frentes forem donas do contexto.",
    ],
    collisionBlockers: [
      "Nao alterar analisador, movement reviews, Case Brain, Draft Factory, dashboards juridicos, docs ou migrations pela Frente B.",
      "Nao mover ownership de Lex para o Agentic Core sem handoff explicito.",
    ],
    handoff: "Recebe snapshots da Frente 0 e Frente A e devolve status, policy, approval, blocker e proximo passo coordenado.",
    defaultNextStep: "Frente B consolida ownership, collision blockers e approvals; Frente 0 e Frente A seguem donas do contexto.",
  },
];

export const MAYUS_AGENTIC_COLLISION_BLOCKERS: MayusAgentControlPlaneCollisionBlocker[] = [
  {
    id: "front_b_does_not_mutate_methodology_state",
    sourceWorkstreamId: "front_b_agentic_core",
    protectedWorkstreamId: "front_0_metodologia",
    label: "Frente B nao altera metodologia do tenant",
    reason: "Paperclip, OpenClaw e Hermes leem metodologia como sinal de supervisao e nao editam o metodo do escritorio.",
    blockedWhen: "A mudanca tenta aprovar, rejeitar, reescrever ou promover metodologia fora da Frente 0.",
    requiredHandoff: "Pedir a Frente 0 um mission snapshot com status, ativacao, review reasons e proxima pergunta de aprovacao.",
  },
  {
    id: "front_a_does_not_mutate_methodology_state",
    sourceWorkstreamId: "front_a_juridico_lex",
    protectedWorkstreamId: "front_0_metodologia",
    label: "Frente A consome metodologia como contexto",
    reason: "Lex usa a metodologia tenant-scoped para orientar documentos, fases e bloqueios, mas nao altera a fonte de verdade.",
    blockedWhen: "A mudanca tenta gravar metodologia operacional a partir de fluxo juridico sem approval/handoff do setup.",
    requiredHandoff: "Publicar lacuna juridica como sugestao ou review reason para a Frente 0 revisar com o escritorio.",
  },
  {
    id: "front_b_does_not_mutate_lex_state",
    sourceWorkstreamId: "front_b_agentic_core",
    protectedWorkstreamId: "front_a_juridico_lex",
    label: "Frente B nao altera estado Juridico/Lex",
    reason: "O Agentic Core consome contexto juridico como snapshot e nao assume analisador, reviews, Draft Factory ou estado Lex.",
    blockedWhen: "A mudanca tenta escrever estado juridico, reprocessar movement reviews ou editar contrato Lex fora do handoff.",
    requiredHandoff: "Pedir a Frente A um snapshot ou artifact com payload esperado, blockers e approval humano quando houver risco.",
  },
  {
    id: "front_a_does_not_mutate_agentic_runtime",
    sourceWorkstreamId: "front_a_juridico_lex",
    protectedWorkstreamId: "front_b_agentic_core",
    label: "Frente A nao altera runtime Agentic Core",
    reason: "Lex produz contexto; o Control Plane reconstrui agentes, rotinas, health, approvals, OpenClaw e Hermes.",
    blockedWhen: "A mudanca tenta alterar Control Plane, rotinas, profiles, trajectory, Paperclip, OpenClaw ou Hermes.",
    requiredHandoff: "Publicar mission snapshot e deixar a Frente B ajustar o runtime de coordenacao.",
  },
];

const SECRET_TEXT_PATTERNS: readonly RegExp[] = [
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|bearer[_-]?token|service[_-]?role[_-]?key|asaas[_-]?key|escavador[_-]?key|oauth[_-]?token|token|secret|password|senha|authorization)\b\s*[:=]\s*["']?[^"'\s,;]+/gi,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
];

export const MAYUS_INTERNAL_AGENT_REGISTRY: MayusAgentControlPlaneProfile[] = [
  {
    id: "mayus_integrator",
    label: "MAYUS Integrator",
    role: "Integra rotinas, policies, memoria e trabalho visivel do Operating Partner.",
    module: "core",
    allowedSurfaces: ["dashboard", "brain", "configuracoes", "aprovacoes"],
    autonomyMode: "supervised",
    budgetPolicy: {
      label: "Sem custo externo automatico",
      paidExternalActions: "blocked_without_approval",
      maxAutomaticCostCents: 0,
    },
    owner: "MAYUS Operating Partner",
    enabled: true,
    controlPlane: { paperclip: true, openclaw: true, hermes: true },
  },
  {
    id: "setup_agent",
    label: "Setup Agent",
    role: "Diagnostica readiness, lacunas de configuracao e proximas perguntas do escritorio.",
    module: "setup",
    allowedSurfaces: ["configuracoes", "brain", "artifacts"],
    autonomyMode: "auto_low_risk",
    budgetPolicy: {
      label: "Setup interno sem custo externo",
      paidExternalActions: "blocked_without_approval",
      maxAutomaticCostCents: 0,
    },
    owner: "MAYUS Operating Partner",
    enabled: true,
    controlPlane: { paperclip: true, openclaw: true, hermes: true },
  },
  {
    id: "legal_operations_agent",
    label: "Legal Operations Agent",
    role: "Organiza movimentacoes, prazos, documentos juridicos e revisoes humanas.",
    module: "legal_ops",
    allowedSurfaces: ["lex", "documentos", "prazos", "aprovacoes", "brain"],
    autonomyMode: "supervised",
    budgetPolicy: {
      label: "Sem publicacao, protocolo ou decisao juridica final sem approval",
      paidExternalActions: "blocked_without_approval",
      maxAutomaticCostCents: 0,
    },
    owner: "Operador juridico",
    enabled: true,
    controlPlane: { paperclip: true, openclaw: true, hermes: true },
  },
  {
    id: "monitoring_agent",
    label: "Monitoring Agent",
    role: "Cuida do monitoramento Escavador cache-first, bloqueios de custo e sinais operacionais.",
    module: "monitoring",
    allowedSurfaces: ["monitoramento", "aprovacoes", "brain", "dashboard"],
    autonomyMode: "supervised",
    budgetPolicy: {
      label: "Busca paga Escavador exige aceite explicito",
      paidExternalActions: "approval_required",
      maxAutomaticCostCents: 0,
    },
    owner: "MAYUS Operating Partner",
    enabled: true,
    controlPlane: { paperclip: true, openclaw: true, hermes: true },
  },
  {
    id: "client_service_agent",
    label: "Client Service Agent",
    role: "Prepara atendimento, respostas supervisionadas e status para clientes.",
    module: "client_service",
    allowedSurfaces: ["whatsapp", "clientes", "aprovacoes", "brain"],
    autonomyMode: "supervised",
    budgetPolicy: {
      label: "Envio externo exige policy e aprovacao quando houver risco",
      paidExternalActions: "blocked_without_approval",
      maxAutomaticCostCents: 0,
    },
    owner: "Socio responsavel",
    enabled: true,
    controlPlane: { paperclip: true, openclaw: true, hermes: true },
  },
  {
    id: "growth_agent",
    label: "Growth Agent",
    role: "Organiza oportunidades, reativacao, rascunhos comerciais e proximos passos.",
    module: "growth",
    allowedSurfaces: ["crm", "whatsapp", "growth", "aprovacoes", "brain"],
    autonomyMode: "supervised",
    budgetPolicy: {
      label: "Nenhum envio comercial externo sem aprovacao",
      paidExternalActions: "blocked_without_approval",
      maxAutomaticCostCents: 0,
    },
    owner: "MAYUS Operating Partner",
    enabled: true,
    controlPlane: { paperclip: true, openclaw: true, hermes: true },
  },
  {
    id: "finance_agent",
    label: "Finance Agent",
    role: "Revisa recebiveis, excedentes, aceite de custo e cobrancas supervisionadas.",
    module: "finance",
    allowedSurfaces: ["financeiro", "monitoramento", "aprovacoes", "brain"],
    autonomyMode: "supervised",
    budgetPolicy: {
      label: "Cobranca real e custo externo exigem aprovacao",
      paidExternalActions: "approval_required",
      maxAutomaticCostCents: 0,
    },
    owner: "Admin financeiro",
    enabled: true,
    controlPlane: { paperclip: true, openclaw: true, hermes: true },
  },
];

function sanitizeText(value: unknown, maxLength = 280) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return SECRET_TEXT_PATTERNS
    .reduce((text, pattern) => text.replace(pattern, "[redacted]"), trimmed)
    .slice(0, maxLength);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringList(value: unknown, maxLength = 120) {
  return Array.isArray(value)
    ? value.map((item) => sanitizeText(item, maxLength)).filter((item): item is string => Boolean(item))
    : [];
}

function getProfile(id: MayusInternalAgentId): MayusAgentControlPlaneProfile {
  return MAYUS_INTERNAL_AGENT_REGISTRY.find((agent) => agent.id === id) || MAYUS_INTERNAL_AGENT_REGISTRY[0]!;
}

function normalizeModule(module: unknown): MayusAgentControlModule {
  const value = typeof module === "string" ? module : "";
  if ([
    "core",
    "setup",
    "legal_ops",
    "monitoring",
    "client_service",
    "growth",
    "finance",
    "documents",
  ].includes(value)) {
    return value as MayusAgentControlModule;
  }
  return "core";
}

export function resolveMayusInternalAgentId(params: {
  agentId?: string | null;
  module?: string | null;
  routineId?: string | null;
}): MayusInternalAgentId {
  const agentId = String(params.agentId || "").trim().toLowerCase();
  const routineModule = normalizeModule(params.module);

  if (agentId === "setup_agent") return "setup_agent";
  if (agentId === "legal_operations_agent" || agentId === "legal_operator") return "legal_operations_agent";
  if (agentId === "monitoring_agent") return "monitoring_agent";
  if (agentId === "client_service_agent" || agentId === "attendance_agent") return "client_service_agent";
  if (agentId === "growth_agent") return "growth_agent";
  if (agentId === "finance_agent") return "finance_agent";
  if (agentId === "mayus_integrator" || agentId === "mayus_self_improvement") return "mayus_integrator";

  if (agentId === "paperclip" || agentId === "operating_partner" || !agentId) {
    if (routineModule === "setup") return "setup_agent";
    if (routineModule === "legal_ops" || routineModule === "documents") return "legal_operations_agent";
    if (routineModule === "monitoring") return "monitoring_agent";
    if (routineModule === "client_service") return "client_service_agent";
    if (routineModule === "growth") return "growth_agent";
    if (routineModule === "finance") return "finance_agent";
  }

  return "mayus_integrator";
}

export function resolveMayusInternalAgentForRoutine(routine: RoutineLike): MayusAgentControlPlaneProfile {
  return getProfile(resolveMayusInternalAgentId({
    agentId: routine.agentId,
    module: routine.module,
    routineId: routine.id,
  }));
}

export function summarizeMayusInternalAgent(
  agent: MayusAgentControlPlaneProfile
): MayusInternalAgentSummary {
  return {
    id: agent.id,
    label: agent.label,
    role: agent.role,
    module: agent.module,
    owner: agent.owner,
    allowedSurfaces: agent.allowedSurfaces,
    autonomyMode: agent.autonomyMode,
    budgetPolicy: agent.budgetPolicy,
  };
}

function routineStatus(routine: RoutineLike) {
  return sanitizeText(routine.lastResult?.status)
    || sanitizeText(routine.status)
    || (routine.paused ? "skipped" : routine.enabled ? "ready" : "skipped");
}

function summarizeRoutine(routine: RoutineLike): MayusAgentRoutineControlSummary {
  return {
    id: routine.id,
    label: sanitizeText(routine.label) || routine.id,
    source: sanitizeText(routine.source),
    status: routineStatus(routine) || "skipped",
    enabled: routine.enabled === true,
    paused: routine.paused === true,
    reason: sanitizeText(routine.lastResult?.reason) || sanitizeText(routine.reason),
    nextAction: sanitizeText(routine.nextAction),
    lastTaskId: sanitizeText(routine.lastResult?.taskId, 120),
    approvalId: sanitizeText(routine.lastResult?.approvalId, 120),
  };
}

function missionBelongsToAgent(mission: MissionSnapshotLike, agent: MayusAgentControlPlaneProfile) {
  const internalAgentId = sanitizeText(mission.routine?.internalAgentId, 120);
  if (internalAgentId) return internalAgentId === agent.id;
  const rawAgentId = mission.routine?.agentId || mission.agentSource || null;
  const rawModule = mission.module || null;
  if (!rawAgentId && !rawModule && !mission.routine?.routineId) return agent.id === "mayus_integrator";
  const resolved = resolveMayusInternalAgentId({
    agentId: rawAgentId,
    module: rawModule,
    routineId: mission.routine?.routineId,
  });
  return resolved === agent.id;
}

function latestDate(left: string | null, right: string | null) {
  const leftTime = Date.parse(String(left || ""));
  const rightTime = Date.parse(String(right || ""));
  if (!Number.isFinite(leftTime)) return right || null;
  if (!Number.isFinite(rightTime)) return left || null;
  return leftTime >= rightTime ? left : right;
}

function latestMission(missions: MissionSnapshotLike[]) {
  return [...missions].sort((left, right) => (
    Date.parse(String(right.lastUpdatedAt || "")) - Date.parse(String(left.lastUpdatedAt || ""))
  ))[0] || null;
}

function latestTimelineItem(missions: MissionSnapshotLike[], source: "artifact" | "event") {
  return missions
    .flatMap((mission) => mission.timeline || [])
    .filter((item) => item.source === source)
    .sort((left, right) => (
      Date.parse(String(right.createdAt || "")) - Date.parse(String(left.createdAt || ""))
    ))[0] || null;
}

function firstRecord(...values: unknown[]) {
  for (const value of values) {
    const record = recordValue(value);
    if (record) return record;
  }
  return null;
}

function extractMethodologyRecord(mission: MissionSnapshotLike) {
  const missionRecord = recordValue(mission);
  const tenant = firstRecord(mission.tenant, missionRecord?.tenant);
  const processMissionContext = firstRecord(
    mission.processMissionContext,
    mission.process_mission_context,
    missionRecord?.processMissionContext,
    missionRecord?.process_mission_context,
  );
  const legalOperatorMission = firstRecord(mission.legalOperatorMission, mission.legal_operator_mission);
  const legalCurrentState = firstRecord(
    mission.legalOperatorMission?.currentState,
    mission.legal_operator_mission?.current_state,
    legalOperatorMission?.currentState,
    legalOperatorMission?.current_state,
  );
  const evidenceSummary = firstRecord(legalCurrentState?.evidenceSummary, legalCurrentState?.evidence_summary);

  return firstRecord(
    mission.methodology,
    mission.operationalMethodology,
    mission.operational_methodology,
    missionRecord?.methodology,
    missionRecord?.operationalMethodology,
    missionRecord?.operational_methodology,
    tenant?.methodology,
    tenant?.operationalMethodology,
    tenant?.operational_methodology,
    processMissionContext?.methodology,
    legalCurrentState?.methodology,
    legalCurrentState?.operationalMethodology,
    legalCurrentState?.operational_methodology,
    evidenceSummary,
  );
}

function extractTenantId(mission: MissionSnapshotLike) {
  const missionRecord = recordValue(mission);
  const tenant = firstRecord(mission.tenant, missionRecord?.tenant);
  return sanitizeText(mission.tenantId, 120)
    || sanitizeText(mission.tenant_id, 120)
    || sanitizeText(missionRecord?.tenantId, 120)
    || sanitizeText(missionRecord?.tenant_id, 120)
    || sanitizeText(tenant?.tenantId, 120)
    || sanitizeText(tenant?.tenant_id, 120)
    || sanitizeText(tenant?.id, 120);
}

function buildMethodologyHandoffReason(params: {
  status: string | null;
  activation: string | null;
  requiresHumanReview: boolean;
  reviewReasons: string[];
}) {
  if (params.status === "approved" && params.activation === "active_internal" && !params.requiresHumanReview) {
    return "Metodologia aprovada orienta decisoes internas deste tenant.";
  }

  if (params.status === "rejected" || params.activation === "rejected") {
    return "Metodologia do tenant rejeitada; exigir revisao humana antes de orientar Lex ou automacoes.";
  }

  if (params.status === "missing" || params.activation === "missing") {
    return "Metodologia operacional ausente; Setup precisa concluir a fonte de verdade do tenant.";
  }

  if (params.status === "draft" || params.status === "recommended" || params.activation === "supervised_suggestion") {
    return "Metodologia ainda e sugestao supervisionada; Lex pode usar como contexto, mas acao sensivel exige revisao.";
  }

  if (params.reviewReasons[0]) {
    return `Metodologia requer revisao: ${params.reviewReasons[0]}.`;
  }

  return "Metodologia observada como sinal tenant-scoped para supervisao.";
}

function buildMethodologySignal(mission: MissionSnapshotLike): MayusAgentControlPlaneMethodologySignal | null {
  const record = extractMethodologyRecord(mission);
  if (!record) return null;

  const areaMethod = firstRecord(record.areaMethod, record.area_method);
  const status = sanitizeText(record.status, 120)
    || sanitizeText(record.methodologyStatus, 120)
    || sanitizeText(record.methodology_status, 120);
  const activation = sanitizeText(record.activation, 120)
    || sanitizeText(record.methodologyActivation, 120)
    || sanitizeText(record.methodology_activation, 120);
  const reviewReasons = [
    ...stringList(record.reviewReasons),
    ...stringList(record.review_reasons),
    ...stringList(record.methodologyReviewReasons),
    ...stringList(record.methodology_review_reasons),
  ];
  const expectedDocuments = [
    ...stringList(record.expectedDocuments),
    ...stringList(record.expected_documents),
    ...stringList(record.requiredDocuments),
    ...stringList(record.required_documents),
    ...stringList(areaMethod?.requiredDocuments),
    ...stringList(areaMethod?.required_documents),
  ];
  const requiresHumanReview = booleanValue(record.requiresHumanReview)
    ?? booleanValue(record.requires_human_review)
    ?? booleanValue(record.areaNeedsReview)
    ?? booleanValue(record.area_needs_review)
    ?? false;
  const canGuideInternalDecisions = booleanValue(record.canGuideInternalDecisions)
    ?? booleanValue(record.can_guide_internal_decisions);
  const area = sanitizeText(record.area, 120)
    || sanitizeText(record.legalArea, 120)
    || sanitizeText(record.legal_area, 120)
    || sanitizeText(areaMethod?.area, 120);
  const source = sanitizeText(record.source, 160) || "tenant_settings.ai_features.operational_methodology";
  const hasMethodologySignal = Boolean(
    status
    || activation
    || area
    || reviewReasons.length > 0
    || expectedDocuments.length > 0
    || canGuideInternalDecisions !== null
    || requiresHumanReview
  );

  if (!hasMethodologySignal) return null;

  const handoffRequired = requiresHumanReview
    || status === "missing"
    || status === "draft"
    || status === "recommended"
    || status === "rejected"
    || activation === "missing"
    || activation === "supervised_suggestion"
    || activation === "rejected"
    || reviewReasons.length > 0;

  return {
    missionId: sanitizeText(mission.missionId, 120) || sanitizeText(mission.taskId, 120),
    tenantId: extractTenantId(mission),
    module: mission.module ? normalizeModule(mission.module) : null,
    source,
    status,
    activation,
    canGuideInternalDecisions,
    requiresHumanReview,
    area,
    reviewReasons: Array.from(new Set(reviewReasons)).slice(0, 8),
    expectedDocuments: Array.from(new Set(expectedDocuments)).slice(0, 8),
    handoffRequired,
    handoffReason: buildMethodologyHandoffReason({ status, activation, requiresHumanReview, reviewReasons }),
    lastUpdatedAt: sanitizeText(mission.lastUpdatedAt, 120),
  };
}

function collectMethodologySignals(missions: MissionSnapshotLike[]) {
  return missions.map(buildMethodologySignal).filter((signal): signal is MayusAgentControlPlaneMethodologySignal => Boolean(signal));
}

function latestMethodologySignal(missions: MissionSnapshotLike[]) {
  return collectMethodologySignals(missions).sort((left, right) => (
    Date.parse(String(right.lastUpdatedAt || "")) - Date.parse(String(left.lastUpdatedAt || ""))
  ))[0] || null;
}

function buildMemoryLifecycle(missions: MissionSnapshotLike[]) {
  return missions.reduce((acc, mission) => {
    const status = sanitizeText(mission.trajectory?.lifecycleStatus, 120);
    const kind = sanitizeText(mission.trajectory?.lifecycleKind, 120);
    if (status === "active" || status === "approved" || status === "promoted") acc.applied += 1;
    if (status === "proposed" || status === "pending_review") acc.pendingProposals += 1;
    if (kind === "skill_proposal" || kind === "procedure_proposal") acc.suggestedSkills += 1;
    if (status === "revoked" || kind === "revocation") acc.revocations += 1;
    return acc;
  }, {
    applied: 0,
    pendingProposals: 0,
    suggestedSkills: 0,
    revocations: 0,
  });
}

function buildAgentActivity(missions: MissionSnapshotLike[]): MayusAgentControlPlaneAgent["activity"] {
  const mission = latestMission(missions);
  const artifact = latestTimelineItem(missions, "artifact");
  const event = latestTimelineItem(missions, "event");
  const pendingApprovalMission = missions.find((item) => item.pendingApproval?.id);
  const firstBlocker = missions.flatMap((item) => item.blockers || []).find(Boolean);
  const methodology = latestMethodologySignal(missions);

  return {
    latestMission: mission?.missionId
      ? {
          id: sanitizeText(mission.missionId, 120) || mission.missionId,
          status: sanitizeText(mission.status, 120),
          goal: sanitizeText(mission.goal),
          lastUpdatedAt: sanitizeText(mission.lastUpdatedAt, 120),
          nextSafeAction: sanitizeText(mission.nextSafeAction),
        }
      : null,
    pendingApproval: pendingApprovalMission?.pendingApproval?.id
      ? {
          id: sanitizeText(pendingApprovalMission.pendingApproval.id, 120) || pendingApprovalMission.pendingApproval.id,
          riskLevel: sanitizeText(pendingApprovalMission.pendingApproval.riskLevel, 120),
          skillName: sanitizeText(pendingApprovalMission.pendingApproval.skillName),
          createdAt: sanitizeText(pendingApprovalMission.pendingApproval.createdAt, 120),
        }
      : null,
    latestArtifact: artifact?.id
      ? {
          id: sanitizeText(artifact.id, 120) || artifact.id,
          title: sanitizeText(artifact.title),
          artifactType: sanitizeText(artifact.status || artifact.title, 120),
          createdAt: sanitizeText(artifact.createdAt, 120),
        }
      : mission?.latestArtifactId
        ? {
            id: sanitizeText(mission.latestArtifactId, 120) || mission.latestArtifactId,
            title: null,
            artifactType: null,
            createdAt: sanitizeText(mission.lastUpdatedAt, 120),
          }
        : null,
    latestEvent: event?.id
      ? {
          id: sanitizeText(event.id, 120) || event.id,
          eventType: sanitizeText(event.title || event.status, 120),
          createdAt: sanitizeText(event.createdAt, 120),
        }
      : mission?.latestEventId
        ? {
            id: sanitizeText(mission.latestEventId, 120) || mission.latestEventId,
            eventType: null,
            createdAt: sanitizeText(mission.lastUpdatedAt, 120),
          }
        : null,
    latestBlocker: sanitizeText(firstBlocker),
    methodology,
  };
}

function buildAgentOpenClaw(missions: MissionSnapshotLike[]): MayusAgentControlPlaneAgent["openclaw"] {
  const mission = missions.find((item) => item.policy) || latestMission(missions);
  const policy = mission?.policy || null;
  const debuggerInfo = policy?.debugger || null;
  const methodology = latestMethodologySignal(missions);
  return {
    outcome: sanitizeText(policy?.outcome, 120),
    surface: sanitizeText(policy?.surface, 120),
    source: sanitizeText(policy?.source, 120),
    reason: sanitizeText(policy?.reason) || (methodology?.handoffRequired ? methodology.handoffReason : null),
    blockedLayer: sanitizeText(debuggerInfo?.blockedLayer, 120)
      || (methodology?.handoffRequired ? "tenant_methodology" : null),
    appliedLayersCount: Array.isArray(debuggerInfo?.appliedLayers) ? debuggerInfo.appliedLayers.length : 0,
    precedence: debuggerInfo?.precedence?.length ? debuggerInfo.precedence : MAYUS_AGENT_POLICY_PRECEDENCE,
    methodology: methodology
      ? {
          status: methodology.status,
          activation: methodology.activation,
          requiresHumanReview: methodology.requiresHumanReview,
          reviewReasons: methodology.reviewReasons,
        }
      : null,
  };
}

function buildAgentHermes(missions: MissionSnapshotLike[]): MayusAgentControlPlaneAgent["hermes"] {
  const mission = missions.find((item) => item.trajectory) || latestMission(missions);
  const methodology = latestMethodologySignal(missions);
  return {
    status: sanitizeText(mission?.trajectory?.status, 120),
    latestMemoryId: sanitizeText(mission?.trajectory?.latestMemoryId, 120),
    lifecycleStatus: sanitizeText(mission?.trajectory?.lifecycleStatus, 120),
    lifecycleKind: sanitizeText(mission?.trajectory?.lifecycleKind, 120),
    lastEventSummary: sanitizeText(mission?.trajectory?.lastEventSummary),
    tenantMethodology: methodology
      ? {
          tenantId: methodology.tenantId,
          status: methodology.status,
          activation: methodology.activation,
          scope: "tenant_only",
        }
      : null,
  };
}

function computeHealth(params: {
  agent: MayusAgentControlPlaneProfile;
  routines: MayusAgentRoutineControlSummary[];
  missions: MissionSnapshotLike[];
}): MayusAgentControlPlaneAgent["health"] {
  const { agent, routines, missions } = params;
  const blockers = missions.flatMap((mission) => mission.blockers || []);
  const pendingApprovals = missions.filter((mission) => Boolean(mission.pendingApproval)).length
    + routines.filter((routine) => Boolean(routine.approvalId) || routine.status === "awaiting_approval").length;
  const methodologyReviewSignal = collectMethodologySignals(missions).find((signal) => signal.handoffRequired);
  const blockedRoutine = routines.find((routine) => routine.status === "blocked");
  const enabledRoutines = routines.filter((routine) => routine.enabled && !routine.paused);
  const lastActivityAt = missions.reduce<string | null>((latest, mission) => (
    latestDate(latest, sanitizeText(mission.lastUpdatedAt, 120))
  ), null);

  if (!agent.enabled) {
    return {
      status: "disabled",
      reason: "Agente desabilitado no registro interno.",
      lastActivityAt,
      nextAction: "Reativar agente somente com policy e owner definidos.",
    };
  }

  if (blockers.length > 0 || blockedRoutine) {
    return {
      status: "blocked",
      reason: sanitizeText(blockers[0]) || blockedRoutine?.reason || "Existe bloqueio operacional ou de policy.",
      lastActivityAt,
      nextAction: "Resolver bloqueio antes de permitir nova execucao.",
    };
  }

  if (pendingApprovals > 0) {
    return {
      status: "degraded",
      reason: `${pendingApprovals} approval(s) pendente(s) para este agente.`,
      lastActivityAt,
      nextAction: "Revisar approvals pendentes em /dashboard/aprovacoes.",
    };
  }

  if (methodologyReviewSignal) {
    return {
      status: "degraded",
      reason: methodologyReviewSignal.handoffReason,
      lastActivityAt,
      nextAction: "Revisar metodologia operacional do tenant antes de liberar nova acao sensivel.",
    };
  }

  if (enabledRoutines.length > 0) {
    return {
      status: "ready",
      reason: "Agente com rotina habilitada e sem bloqueio critico.",
      lastActivityAt,
      nextAction: enabledRoutines[0]?.nextAction || "Rodar dry-run ou aguardar scheduler supervisionado.",
    };
  }

  return {
    status: "needs_setup",
    reason: "Agente registrado, mas sem rotina habilitada para este tenant.",
    lastActivityAt,
    nextAction: "Ativar uma rotina recomendada ou concluir setup do modulo.",
  };
}

function getWorkstreamProfile(id: MayusAgenticWorkstreamId): MayusAgenticWorkstreamProfile {
  return MAYUS_AGENTIC_WORKSTREAM_REGISTRY.find((workstream) => workstream.id === id)
    || MAYUS_AGENTIC_WORKSTREAM_REGISTRY.find((workstream) => workstream.id === "front_b_agentic_core")
    || MAYUS_AGENTIC_WORKSTREAM_REGISTRY[0]!;
}

function resolveWorkstreamForAgent(agent: MayusAgentControlPlaneProfile): MayusAgenticWorkstreamProfile {
  return MAYUS_AGENTIC_WORKSTREAM_REGISTRY.find((workstream) => workstream.internalAgentIds.includes(agent.id))
    || getWorkstreamProfile("front_b_agentic_core");
}

function coordinationStatus(params: {
  blockers: number;
  pendingApprovals: number;
  hasDegradedAgent?: boolean;
}): MayusAgenticCoordinationStatus {
  if (params.blockers > 0) return "blocked";
  if (params.pendingApprovals > 0 || params.hasDegradedAgent) return "needs_coordination";
  return "clear";
}

function buildAgentCoordinatedNextStep(params: {
  agent: MayusAgentControlPlaneProfile;
  health: MayusAgentControlPlaneAgent["health"];
  workstream: MayusAgenticWorkstreamProfile;
}) {
  const { agent, health, workstream } = params;

  if (health.status === "blocked") {
    return `${workstream.label} resolve ${agent.label}: ${health.nextAction}`;
  }

  if (health.status === "degraded") {
    return `${workstream.label} revisa approvals de ${agent.label} antes de liberar nova acao.`;
  }

  if (health.status === "needs_setup") {
    return `${workstream.label} conclui setup de ${agent.label} mantendo handoff entre frentes.`;
  }

  return workstream.defaultNextStep;
}

function buildAgentCoordination(params: {
  agent: MayusAgentControlPlaneProfile;
  health: MayusAgentControlPlaneAgent["health"];
}): MayusAgentControlPlaneAgentCoordination {
  const { agent, health } = params;
  const workstream = resolveWorkstreamForAgent(agent);

  return {
    agentId: agent.id,
    agentLabel: agent.label,
    workstreamId: workstream.id,
    workstreamLabel: workstream.label,
    workstreamOwner: workstream.owner,
    runtimeOwner: agent.owner,
    ownership: workstream.ownership,
    collisionBlockers: workstream.collisionBlockers,
    handoff: workstream.handoff,
    handoffRequired: health.status === "blocked" || health.status === "degraded",
    coordinatedNextStep: buildAgentCoordinatedNextStep({ agent, health, workstream }),
  };
}

function buildWorkstreamCoordination(
  workstream: MayusAgenticWorkstreamProfile,
  agents: MayusAgentControlPlaneAgent[]
): MayusAgentControlPlaneWorkstream {
  const workstreamAgents = agents.filter((agent) => agent.coordination.workstreamId === workstream.id);
  const pendingApprovals = workstreamAgents.reduce((total, agent) => total + agent.approvalsPending, 0);
  const blockers = workstreamAgents.reduce((total, agent) => total + agent.blockersCount, 0);
  const firstBlocked = workstreamAgents.find((agent) => agent.health.status === "blocked");
  const firstDegraded = workstreamAgents.find((agent) => agent.health.status === "degraded");
  const focusAgent = firstBlocked || firstDegraded;

  return {
    id: workstream.id,
    label: workstream.label,
    owner: workstream.owner,
    scope: workstream.scope,
    internalAgentIds: workstream.internalAgentIds,
    ownedModules: workstream.ownedModules,
    ownedSurfaces: workstream.ownedSurfaces,
    ownership: workstream.ownership,
    collisionBlockers: workstream.collisionBlockers,
    handoff: workstream.handoff,
    status: coordinationStatus({
      blockers,
      pendingApprovals,
      hasDegradedAgent: Boolean(firstDegraded),
    }),
    pendingApprovals,
    blockers,
    coordinatedNextStep: focusAgent?.coordination.coordinatedNextStep || workstream.defaultNextStep,
  };
}

function handoffStatusFromMethodology(
  signal: MayusAgentControlPlaneMethodologySignal | null
): MayusAgenticHandoffStatus {
  if (!signal) return "not_observed";
  if (signal.status === "missing" || signal.status === "rejected" || signal.activation === "missing" || signal.activation === "rejected") {
    return "blocked";
  }
  if (signal.handoffRequired) return "needs_coordination";
  return "clear";
}

function missionHasLegalContext(mission: MissionSnapshotLike) {
  return normalizeModule(mission.module) === "legal_ops"
    || normalizeModule(mission.module) === "documents"
    || Boolean(mission.legalOperatorMission || mission.legal_operator_mission);
}

function handoffStatusFromMission(mission: MissionSnapshotLike | null): MayusAgenticHandoffStatus {
  if (!mission) return "not_observed";
  if ((mission.blockers || []).length > 0 || mission.status === "blocked" || mission.status === "failed") return "blocked";
  if (mission.pendingApproval || mission.status === "awaiting_approval") return "needs_coordination";
  return "clear";
}

function buildHandoffChain(missions: MissionSnapshotLike[]): MayusAgentControlPlaneHandoffSignal[] {
  const methodology = latestMethodologySignal(missions);
  const legalMission = latestMission(missions.filter(missionHasLegalContext));

  return [
    {
      id: "methodology_to_lex",
      fromWorkstreamId: "front_0_metodologia",
      toWorkstreamId: "front_a_juridico_lex",
      label: "Metodologia -> Juridico/Lex",
      status: handoffStatusFromMethodology(methodology),
      tenantId: methodology?.tenantId || null,
      sourceMissionId: methodology?.missionId || null,
      signal: methodology?.handoffReason
        || "Aguardando snapshot de metodologia tenant-scoped para orientar o contexto juridico.",
    },
    {
      id: "lex_to_agentic_core",
      fromWorkstreamId: "front_a_juridico_lex",
      toWorkstreamId: "front_b_agentic_core",
      label: "Juridico/Lex -> Agentic Core",
      status: handoffStatusFromMission(legalMission),
      tenantId: methodology?.tenantId || extractTenantId(legalMission || {}),
      sourceMissionId: sanitizeText(legalMission?.missionId, 120) || sanitizeText(legalMission?.taskId, 120),
      signal: legalMission
        ? sanitizeText(legalMission.nextSafeAction)
          || sanitizeText(legalMission.goal)
          || "Lex publicou snapshot; Agentic Core deve consumir como leitura supervisionada."
        : "Aguardando mission snapshot Lex para Paperclip/OpenClaw/Hermes supervisionarem sem assumir o trabalho juridico.",
    },
  ];
}

function buildControlPlaneCoordination(
  agents: MayusAgentControlPlaneAgent[],
  missions: MissionSnapshotLike[]
): MayusAgentControlPlaneCoordination {
  const workstreams = MAYUS_AGENTIC_WORKSTREAM_REGISTRY.map((workstream) => (
    buildWorkstreamCoordination(workstream, agents)
  ));
  const blockedWorkstream = workstreams.find((workstream) => workstream.status === "blocked");
  const needsCoordinationWorkstream = workstreams.find((workstream) => workstream.status === "needs_coordination");
  const focusWorkstream = blockedWorkstream || needsCoordinationWorkstream;
  const status: MayusAgenticCoordinationStatus = blockedWorkstream
    ? "blocked"
    : needsCoordinationWorkstream
      ? "needs_coordination"
      : "clear";

  return {
    status,
    workstreams,
    agentMap: agents.map((agent) => agent.coordination),
    collisionBlockers: MAYUS_AGENTIC_COLLISION_BLOCKERS,
    handoffChain: buildHandoffChain(missions),
    methodologySignals: collectMethodologySignals(missions),
    nextCoordinatedStep: focusWorkstream?.coordinatedNextStep
      || "Manter contrato aditivo: Frente 0 publica metodologia; Frente A publica contexto; Frente B coordena runtime, approvals e health.",
  };
}

function uniqueSanitizedTexts(values: unknown[], maxLength = 120) {
  return Array.from(new Set(
    values
      .map((value) => sanitizeText(value, maxLength))
      .filter((value): value is string => Boolean(value))
  ));
}

function buildPaperclipPublicAgent(
  agents: MayusAgentControlPlaneAgent[],
  missions: MissionSnapshotLike[]
): MayusPublicAgentMatrixItem {
  const routineItems = agents.flatMap((agent) => (
    agent.routines.items.map((routine) => ({ ...routine, owner: agent.label }))
  ));
  const total = routineItems.length;
  const enabled = routineItems.filter((routine) => routine.enabled && !routine.paused).length;
  const blocked = routineItems.filter((routine) => routine.status === "blocked").length;
  const awaitingApproval = routineItems.filter((routine) => (
    routine.status === "awaiting_approval" || Boolean(routine.approvalId)
  )).length;
  const approvals = agents.reduce((totalApprovals, agent) => totalApprovals + agent.approvalsPending, 0);
  const hardStopAgents = agents.filter((agent) => (
    agent.budgetPolicy.maxAutomaticCostCents === 0 ||
    agent.budgetPolicy.paidExternalActions === "blocked_without_approval"
  ));
  const latestMissionAt = missions.reduce<string | null>((latest, mission) => (
    latestDate(latest, sanitizeText(mission.lastUpdatedAt, 120))
  ), null);
  const handoffChain = buildHandoffChain(missions);
  const methodologySignals = collectMethodologySignals(missions);
  const methodology = latestMethodologySignal(missions);
  const legalMission = latestMission(missions.filter(missionHasLegalContext));
  const agenticMission = latestMission(missions.filter((mission) => normalizeModule(mission.module) === "core"));
  const activeOwners = uniqueSanitizedTexts(
    agents
      .filter((agent) => agent.routines.total > 0 || agent.activity.latestMission)
      .map((agent) => agent.label)
  );
  const status: MayusPublicAgentMatrixStatus = blocked > 0
    ? "blocked"
    : approvals > 0 || awaitingApproval > 0
      ? "awaiting_approval"
      : enabled > 0
        ? "working"
        : total > 0
          ? "needs_attention"
          : "read_only";
  const modulesCovered = uniqueSanitizedTexts(
    agents
      .filter((agent) => agent.routines.total > 0)
      .map((agent) => agent.module)
  );
  const operationalGaps = uniqueSanitizedTexts([
    total === 0 ? "paperclip_routines_missing" : null,
    total > 0 && enabled === 0 ? "no_enabled_routines" : null,
    activeOwners.length === 0 ? "no_active_owner_signal" : null,
    approvals > 0 ? "approval_pending_before_next_wakeup" : null,
  ]);
  const nextAction = status === "blocked"
    ? "Resolver rotinas bloqueadas antes de acordar novo trabalho."
    : status === "awaiting_approval"
      ? "Revisar approvals pendentes em /dashboard/aprovacoes antes de novos wakeups sensiveis."
      : status === "read_only"
        ? "Habilitar rotina Paperclip ou rodar dry-run para gerar heartbeat operacional."
        : "Manter heartbeat supervisionado e preparar preflight de portabilidade.";

  return {
    id: "paperclip",
    label: "Paperclip",
    reusedAs: "Heartbeat, rotinas e wakeups supervisionados do Operating Partner.",
    matrixMode: "read_only_status",
    owner: "MAYUS Operating Partner",
    status,
    evidence: [
      `${enabled}/${total} rotinas habilitadas`,
      `${approvals} approval(s) pendente(s)`,
      `${hardStopAgents.length} hard stop(s) de budget`,
      `${methodologySignals.length} sinal(is) de metodologia tenant-scoped`,
    ],
    blockers: uniqueSanitizedTexts([
      ...routineItems.filter((routine) => routine.status === "blocked").map((routine) => routine.reason),
      ...agents.flatMap((agent) => agent.activity.latestBlocker ? [agent.activity.latestBlocker] : []),
    ]),
    nextAction,
    operational: {
      status,
      modulesCovered,
      latestSignalAt: latestMissionAt,
      approvals,
      blockerCount: blocked,
      gaps: operationalGaps,
      nextAction,
    },
    paperclip: {
      heartbeat: blocked > 0 ? "blocked" : enabled > 0 ? "working" : "needs_setup",
      routines: {
        total,
        enabled,
        blocked,
        awaitingApproval,
      },
      approvals,
      budget: {
        hardStops: hardStopAgents.length,
        policyLabels: uniqueSanitizedTexts(hardStopAgents.map((agent) => agent.budgetPolicy.label)),
      },
      activity: {
        latestMissionAt,
        activeOwners,
        handoff: {
          chain: handoffChain.map((item) => item.label),
          latestTenantId: methodology?.tenantId || null,
          methodologyStatus: methodology?.status || null,
          legalStatus: sanitizeText(legalMission?.status, 120),
          agenticStatus: sanitizeText(agenticMission?.status, 120),
          nextAction: handoffChain.find((item) => item.status === "blocked" || item.status === "needs_coordination")?.signal
            || "Manter handoff Metodologia -> Juridico/Lex -> Agentic Core em leitura supervisionada.",
        },
      },
      portability: {
        status: "pending_preflight",
        reason: "Portabilidade Paperclip fica visivel como preflight; este corte nao exporta nem importa tenant.",
      },
    },
  };
}

function buildOpenClawPublicAgent(
  agents: MayusAgentControlPlaneAgent[],
  missions: MissionSnapshotLike[]
): MayusPublicAgentMatrixItem {
  const policyMissions = missions.filter((mission) => Boolean(mission.policy));
  const blockedPolicy = policyMissions.find((mission) => (
    mission.policy?.outcome === "blocked" || Boolean(mission.policy?.debugger?.blockedLayer)
  ));
  const firstPolicy = blockedPolicy || policyMissions[0] || null;
  const methodology = latestMethodologySignal(missions);
  const methodologyBlockedLayer = methodology?.handoffRequired ? "tenant_methodology" : null;
  const blockedLayer = sanitizeText(firstPolicy?.policy?.debugger?.blockedLayer, 120) || methodologyBlockedLayer;
  const reason = sanitizeText(firstPolicy?.policy?.reason)
    || sanitizeText(firstPolicy?.policy?.debugger?.blockedReasonCode, 120)
    || (methodology?.handoffRequired ? methodology.handoffReason : null);
  const surfaces = uniqueSanitizedTexts(policyMissions.map((mission) => mission.policy?.surface));
  const outcomes = uniqueSanitizedTexts(policyMissions.map((mission) => mission.policy?.outcome));
  const modulesWithPolicy = new Set(policyMissions.map((mission) => normalizeModule(mission.policy?.module || mission.module)));
  const nextModules = uniqueSanitizedTexts(
    agents
      .filter((agent) => agent.enabled && !modulesWithPolicy.has(agent.module))
      .map((agent) => agent.module)
  ).slice(0, 5);
  const approvals = outcomes.filter((outcome) => outcome === "requires_approval").length
    + (methodology?.requiresHumanReview ? 1 : 0);
  const latestSignalAt = policyMissions.reduce<string | null>((latest, mission) => (
    latestDate(latest, sanitizeText(mission.lastUpdatedAt, 120))
  ), null);
  const status: MayusPublicAgentMatrixStatus = blockedLayer
    ? "blocked"
    : approvals > 0
      ? "awaiting_approval"
      : policyMissions.length > 0
        ? "working"
        : "needs_attention";
  const operationalGaps = uniqueSanitizedTexts([
    ...nextModules.map((module) => `missing_policy_snapshot:${module}`),
    surfaces.length === 0 ? "no_surface_policy_snapshot" : null,
    outcomes.length === 0 ? "no_recent_policy_outcome" : null,
  ]);
  const nextAction = blockedLayer
    ? "Revisar camada bloqueada antes de permitir execucao inferior."
    : approvals > 0
      ? "Aguardar approval humano exigido por policy ou metodologia."
      : nextModules.length > 0
        ? `Expandir cobertura por mission snapshot para: ${nextModules.join(", ")}.`
        : "Manter leitura de policy por mission snapshot sem exigir matriz completa.";

  return {
    id: "openclaw",
    label: "OpenClaw",
    reusedAs: "Policy debugger, precedencia e cobertura minima por superficie.",
    matrixMode: "read_only_status",
    owner: "MAYUS Operating Partner",
    status,
    evidence: [
      `${surfaces.length} superficie(s) observada(s)`,
      `${outcomes.length} outcome(s) recente(s)`,
      `${nextModules.length} modulo(s) no proximo ciclo`,
      methodology ? `metodologia ${methodology.status || "sem status"} / ${methodology.activation || "sem ativacao"}` : "metodologia sem snapshot",
    ],
    blockers: blockedLayer ? [`${blockedLayer}: ${reason || "policy bloqueou a acao."}`] : [],
    nextAction,
    operational: {
      status,
      modulesCovered: uniqueSanitizedTexts(policyMissions.map((mission) => normalizeModule(mission.policy?.module || mission.module))),
      latestSignalAt,
      approvals,
      blockerCount: blockedLayer ? 1 : 0,
      gaps: operationalGaps,
      nextAction,
    },
    openclaw: {
      coverage: "mission_snapshot_policy",
      requiresFullMatrix: false,
      precedence: firstPolicy?.policy?.debugger?.precedence?.length
        ? firstPolicy.policy.debugger.precedence
        : MAYUS_AGENT_POLICY_PRECEDENCE,
      surfaces,
      outcomes,
      blockedLayer,
      reason,
      nextModules,
      methodology: methodology
        ? {
            status: methodology.status,
            activation: methodology.activation,
            requiresHumanReview: methodology.requiresHumanReview,
            reviewReasons: methodology.reviewReasons,
            blockedLayer: methodologyBlockedLayer,
            reason: methodology.handoffReason,
          }
        : null,
    },
  };
}

function buildHermesPublicAgent(missions: MissionSnapshotLike[]): MayusPublicAgentMatrixItem {
  const trajectoryMissions = missions.filter((mission) => Boolean(mission.trajectory));
  const mission = latestMission(trajectoryMissions) || trajectoryMissions[0] || null;
  const methodologySignals = collectMethodologySignals(missions);
  const methodology = latestMethodologySignal(missions);
  const pendingLifecycle = trajectoryMissions.filter((item) => (
    item.trajectory?.lifecycleStatus === "proposed" || item.trajectory?.lifecycleStatus === "pending_review"
  )).length;
  const blockerTexts = uniqueSanitizedTexts(missions.flatMap((item) => item.blockers || []));
  const blocked = blockerTexts.length;
  const latestSignalAt = trajectoryMissions.reduce<string | null>((latest, item) => (
    latestDate(latest, sanitizeText(item.lastUpdatedAt, 120))
  ), null);
  const status: MayusPublicAgentMatrixStatus = blocked > 0
    ? "blocked"
    : pendingLifecycle > 0
      ? "awaiting_approval"
      : trajectoryMissions.length > 0
        ? "working"
        : "read_only";
  const operationalGaps = uniqueSanitizedTexts([
    trajectoryMissions.length === 0 ? "no_hermes_trajectory_snapshot" : null,
    pendingLifecycle > 0 ? "memory_or_lifecycle_pending_review" : null,
    methodologySignals.length === 0 ? "tenant_learning_signal_missing" : null,
  ]);
  const nextAction = blocked > 0
    ? "Resolver blockers de trajectory antes de promover memoria, skill ou procedimento."
    : pendingLifecycle > 0
      ? "Acompanhar lifecycle pendente sem autoaprovar memoria, skill ou procedimento."
      : trajectoryMissions.length > 0
        ? "Manter Hermes lendo trajectories tenant-only dos mission snapshots."
        : "Consumir Hermes apenas como leitura dos mission snapshots.";

  return {
    id: "hermes",
    label: "Hermes",
    reusedAs: "Leitura de trajetoria, memoria e lifecycle via mission snapshots.",
    matrixMode: "read_only_status",
    owner: "MAYUS Operating Partner",
    status,
    evidence: [
      `${trajectoryMissions.length} snapshot(s) com trajectory`,
      `${pendingLifecycle} lifecycle(s) pendente(s)`,
      `${blocked} blocker(s) em missoes observadas`,
      `${methodologySignals.length} sinal(is) de metodologia tenant-only`,
    ],
    blockers: blockerTexts,
    nextAction,
    operational: {
      status,
      modulesCovered: uniqueSanitizedTexts(trajectoryMissions.map((item) => normalizeModule(item.module))),
      latestSignalAt,
      approvals: pendingLifecycle,
      blockerCount: blocked,
      gaps: operationalGaps,
      nextAction,
    },
    hermes: {
      source: "mission_snapshots_read_only",
      missionsObserved: trajectoryMissions.length,
      latestStatus: sanitizeText(mission?.trajectory?.status, 120),
      latestMemoryId: sanitizeText(mission?.trajectory?.latestMemoryId, 120),
      lifecycleStatus: sanitizeText(mission?.trajectory?.lifecycleStatus, 120),
      lastEventSummary: sanitizeText(mission?.trajectory?.lastEventSummary),
      tenantLearning: {
        scope: "tenant_only",
        signalsObserved: methodologySignals.length,
        latestTenantId: methodology?.tenantId || null,
        latestMethodologyStatus: methodology?.status || null,
        latestActivation: methodology?.activation || null,
        lastReviewReason: methodology?.reviewReasons[0] || null,
      },
    },
  };
}

function buildPublicAgentMatrix(params: {
  agents: MayusAgentControlPlaneAgent[];
  missions: MissionSnapshotLike[];
}): MayusPublicAgentMatrixItem[] {
  return [
    buildPaperclipPublicAgent(params.agents, params.missions),
    buildOpenClawPublicAgent(params.agents, params.missions),
    buildHermesPublicAgent(params.missions),
  ];
}

function primitiveStatusFromBlockedOrApproval(params: {
  hasBlocker: boolean;
  hasApproval: boolean;
  hasEvidence: boolean;
}): MayusTenantAgentReadinessStatus {
  if (params.hasBlocker) return "blocked";
  if (params.hasApproval) return "awaiting_approval";
  if (!params.hasEvidence) return "insufficient_evidence";
  return "ready";
}

function buildPaperclipReadiness(agent: MayusAgentControlPlaneAgent): MayusTenantAgentPrimitiveReadiness {
  const evidence = [
    `${agent.routines.enabled}/${agent.routines.total} rotinas habilitadas`,
    `${agent.routines.awaitingApproval} approval(s) Paperclip`,
  ];
  const blockers = uniqueSanitizedTexts(
    agent.routines.items
      .filter((routine) => routine.status === "blocked")
      .map((routine) => routine.reason || routine.label)
  );
  const status = primitiveStatusFromBlockedOrApproval({
    hasBlocker: blockers.length > 0,
    hasApproval: agent.routines.awaitingApproval > 0,
    hasEvidence: agent.routines.total > 0,
  });

  return {
    id: "paperclip",
    label: "Paperclip",
    status,
    evidence,
    blockers,
    nextAction: status === "blocked"
      ? "Resolver rotina bloqueada antes de acordar novo trabalho."
      : status === "awaiting_approval"
        ? "Revisar approval da rotina antes do proximo heartbeat."
        : status === "insufficient_evidence"
          ? "Habilitar rotina ou acordar dry-run Paperclip para gerar evidencia."
          : agent.routines.items.find((routine) => routine.enabled && !routine.paused)?.nextAction
            || "Manter heartbeat supervisionado.",
  };
}

function buildOpenClawReadiness(agent: MayusAgentControlPlaneAgent): MayusTenantAgentPrimitiveReadiness {
  const hasEvidence = Boolean(
    agent.openclaw.outcome
    || agent.openclaw.surface
    || agent.openclaw.source
    || agent.openclaw.appliedLayersCount > 0
    || agent.openclaw.methodology
  );
  const blockers = uniqueSanitizedTexts([
    agent.openclaw.blockedLayer ? `${agent.openclaw.blockedLayer}: ${agent.openclaw.reason || "policy bloqueou a acao."}` : null,
  ]);
  const hasApproval = String(agent.openclaw.outcome || "").includes("approval")
    || agent.openclaw.methodology?.requiresHumanReview === true;
  const status = primitiveStatusFromBlockedOrApproval({
    hasBlocker: blockers.length > 0,
    hasApproval,
    hasEvidence,
  });

  return {
    id: "openclaw",
    label: "OpenClaw",
    status,
    evidence: uniqueSanitizedTexts([
      agent.openclaw.outcome ? `outcome: ${agent.openclaw.outcome}` : null,
      agent.openclaw.surface ? `surface: ${agent.openclaw.surface}` : null,
      `${agent.openclaw.appliedLayersCount} camada(s) aplicada(s)`,
      agent.openclaw.methodology?.status ? `metodologia: ${agent.openclaw.methodology.status}` : null,
    ]),
    blockers,
    nextAction: status === "blocked"
      ? "Revisar camada bloqueada antes de permitir execucao inferior."
      : status === "awaiting_approval"
        ? "Aguardar approval humano exigido por policy ou metodologia."
        : status === "insufficient_evidence"
          ? "Gerar mission snapshot com policy OpenClaw para este agente."
          : "Manter policy debugger como evidencia de execucao segura.",
  };
}

function buildHermesReadiness(agent: MayusAgentControlPlaneAgent): MayusTenantAgentPrimitiveReadiness {
  const hasEvidence = Boolean(
    agent.hermes.status
    || agent.hermes.latestMemoryId
    || agent.hermes.lifecycleStatus
    || agent.hermes.lastEventSummary
    || agent.hermes.tenantMethodology
  );
  const lifecycleStatus = agent.hermes.lifecycleStatus;
  const hasApproval = lifecycleStatus === "proposed"
    || lifecycleStatus === "pending_review"
    || agent.hermes.status === "waiting_approval"
    || agent.hermes.status === "awaiting_approval";
  const status = primitiveStatusFromBlockedOrApproval({
    hasBlocker: agent.hermes.status === "blocked",
    hasApproval,
    hasEvidence,
  });

  return {
    id: "hermes",
    label: "Hermes",
    status,
    evidence: uniqueSanitizedTexts([
      agent.hermes.status ? `trajectory: ${agent.hermes.status}` : null,
      agent.hermes.lifecycleStatus ? `lifecycle: ${agent.hermes.lifecycleStatus}` : null,
      agent.hermes.latestMemoryId ? `memory: ${agent.hermes.latestMemoryId}` : null,
      agent.hermes.tenantMethodology?.status ? `tenant methodology: ${agent.hermes.tenantMethodology.status}` : null,
    ]),
    blockers: agent.hermes.status === "blocked"
      ? uniqueSanitizedTexts([agent.hermes.lastEventSummary || "Trajectory Hermes bloqueada."])
      : [],
    nextAction: status === "blocked"
      ? "Revisar trajectory Hermes bloqueada antes de promover memoria ou skill."
      : status === "awaiting_approval"
        ? "Acompanhar lifecycle pendente sem autoaprovar memoria, skill ou procedimento."
        : status === "insufficient_evidence"
          ? "Vincular trajectory ou lifecycle Hermes ao proximo mission snapshot."
          : "Usar lifecycle Hermes como evidencia tenant-only.",
  };
}

function buildAgentReadiness(params: {
  tenantId: string | null;
  agent: MayusAgentControlPlaneAgent;
}): MayusAgentControlPlaneAgent["readiness"] {
  const primitives = [
    buildPaperclipReadiness(params.agent),
    buildOpenClawReadiness(params.agent),
    buildHermesReadiness(params.agent),
  ];
  const evidence = uniqueSanitizedTexts(primitives.flatMap((primitive) => primitive.evidence));
  const blockers = uniqueSanitizedTexts([
    ...primitives.flatMap((primitive) => primitive.blockers),
    params.agent.activity.latestBlocker,
  ]);
  const hasApproval = params.agent.approvalsPending > 0
    || primitives.some((primitive) => primitive.status === "awaiting_approval");
  const evidenceSufficient = primitives.some((primitive) => primitive.status !== "insufficient_evidence")
    || Boolean(params.agent.activity.latestMission);
  const status: MayusTenantAgentReadinessStatus = blockers.length > 0 || params.agent.health.status === "blocked"
    ? "blocked"
    : hasApproval
      ? "awaiting_approval"
      : evidenceSufficient && params.agent.health.status === "ready"
        ? "ready"
        : "insufficient_evidence";

  return {
    tenantId: params.tenantId,
    status,
    evidenceSufficient,
    evidence,
    blockers,
    nextAction: status === "blocked"
      ? params.agent.health.nextAction
      : status === "awaiting_approval"
        ? "Revisar approvals pendentes antes de liberar nova acao."
        : status === "insufficient_evidence"
          ? "Gerar evidencia Paperclip/OpenClaw/Hermes antes de marcar o agente como pronto."
          : params.agent.health.nextAction,
    primitives,
  };
}

function buildTenantReadiness(params: {
  tenantId: string | null;
  agents: MayusAgentControlPlaneAgent[];
}): MayusAgentControlPlane["tenant_readiness"] {
  const agents = params.agents.map((agent) => ({
    agentId: agent.id,
    agentLabel: agent.label,
    module: agent.module,
    status: agent.readiness.status,
    evidenceSufficient: agent.readiness.evidenceSufficient,
    evidence: agent.readiness.evidence,
    blockers: agent.readiness.blockers,
    nextAction: agent.readiness.nextAction,
    primitives: agent.readiness.primitives,
  }));

  return {
    tenantId: params.tenantId,
    summary: {
      ready: agents.filter((agent) => agent.status === "ready").length,
      blocked: agents.filter((agent) => agent.status === "blocked").length,
      awaitingApproval: agents.filter((agent) => agent.status === "awaiting_approval").length,
      insufficientEvidence: agents.filter((agent) => agent.status === "insufficient_evidence").length,
    },
    agents,
  };
}

export function buildMayusAgentControlPlane(input: {
  routines?: RoutineLike[];
  missionSnapshots?: MissionSnapshotLike[];
  tenantId?: string | null;
} = {}): MayusAgentControlPlane {
  const routines = input.routines || [];
  const missions = input.missionSnapshots || [];
  const tenantId = sanitizeText(input.tenantId, 120)
    || extractTenantId(latestMission(missions) || {});

  const agents = MAYUS_INTERNAL_AGENT_REGISTRY.map((agent) => {
    const agentRoutines = routines.filter((routine) => resolveMayusInternalAgentForRoutine(routine).id === agent.id);
    const routineSummaries = agentRoutines.map(summarizeRoutine);
    const agentMissions = missions.filter((mission) => missionBelongsToAgent(mission, agent));
    const methodologyReviewSignals = collectMethodologySignals(agentMissions).filter((signal) => signal.handoffRequired);
    const approvalsPending = agentMissions.filter((mission) => Boolean(mission.pendingApproval)).length
      + methodologyReviewSignals.length
      + routineSummaries.filter((routine) => Boolean(routine.approvalId) || routine.status === "awaiting_approval").length;
    const blockersCount = agentMissions.reduce((total, mission) => total + (mission.blockers?.length || 0), 0)
      + routineSummaries.filter((routine) => routine.status === "blocked").length;
    const health = computeHealth({ agent, routines: routineSummaries, missions: agentMissions });
    const coordination = buildAgentCoordination({ agent, health });

    const agentWithoutReadiness = {
      ...agent,
      coordination,
      health,
      routines: {
        total: routineSummaries.length,
        enabled: routineSummaries.filter((routine) => routine.enabled && !routine.paused).length,
        blocked: routineSummaries.filter((routine) => routine.status === "blocked").length,
        awaitingApproval: routineSummaries.filter((routine) => routine.status === "awaiting_approval" || Boolean(routine.approvalId)).length,
        items: routineSummaries,
      },
      approvalsPending,
      blockersCount,
      memoryLifecycle: buildMemoryLifecycle(agentMissions),
      activity: buildAgentActivity(agentMissions),
      openclaw: buildAgentOpenClaw(agentMissions),
      hermes: buildAgentHermes(agentMissions),
    } as Omit<MayusAgentControlPlaneAgent, "readiness">;

    return {
      ...agentWithoutReadiness,
      readiness: buildAgentReadiness({
        tenantId,
        agent: agentWithoutReadiness as MayusAgentControlPlaneAgent,
      }),
    } satisfies MayusAgentControlPlaneAgent;
  });

  const blockedAgents = agents.filter((agent) => agent.health.status === "blocked").length;
  const degradedAgents = agents.filter((agent) => agent.health.status === "degraded").length;
  const readyAgents = agents.filter((agent) => agent.health.status === "ready").length;
  const pendingApprovals = agents.reduce((total, agent) => total + agent.approvalsPending, 0);
  const blockers = agents.reduce((total, agent) => total + agent.blockersCount, 0);
  const firstAction = agents.find((agent) => agent.health.status === "blocked" || agent.health.status === "degraded")
    || agents.find((agent) => agent.health.status === "needs_setup")
    || agents[0];
  const coordination = buildControlPlaneCoordination(agents, missions);
  const publicAgents = buildPublicAgentMatrix({ agents, missions });
  const tenantReadiness = buildTenantReadiness({ tenantId, agents });

  return {
    agents,
    summary: {
      totalAgents: agents.length,
      enabledAgents: agents.filter((agent) => agent.enabled).length,
      readyAgents,
      blockedAgents,
      degradedAgents,
      pendingApprovals,
      blockers,
      nextAction: firstAction?.health.nextAction || "Manter rotinas supervisionadas e auditadas.",
      policyPrecedence: MAYUS_AGENT_POLICY_PRECEDENCE,
      coordination: {
        status: coordination.status,
        workstreams: coordination.workstreams.length,
        collisionBlockers: coordination.collisionBlockers.length,
        methodologySignals: coordination.methodologySignals.length,
        nextCoordinatedStep: coordination.nextCoordinatedStep,
      },
    },
    coordination,
    publicAgents,
    tenant_readiness: tenantReadiness,
  };
}
