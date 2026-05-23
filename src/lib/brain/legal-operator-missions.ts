export type LegalOperatorStateRecord = Record<string, unknown>;

export type LegalOperatorMissionTaskRef = {
  id?: string | null;
  title?: string | null;
  goal?: string | null;
  module?: string | null;
  channel?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type LegalOperatorMissionStepRef = {
  id?: string | null;
  title?: string | null;
  status?: string | null;
  step_type?: string | null;
  capability_name?: string | null;
  handler_type?: string | null;
};

export type LegalOperatorMissionApprovalInput = {
  id: string;
  task_id?: string | null;
  step_id?: string | null;
  status: string;
  risk_level?: string | null;
  created_at: string;
  approved_at?: string | null;
  updated_at?: string | null;
  decision_notes?: string | null;
  audit_log_id?: string | null;
  approval_context?: Record<string, unknown> | null;
  awaiting_payload?: Record<string, unknown> | null;
  task?: LegalOperatorMissionTaskRef | null;
  step?: LegalOperatorMissionStepRef | null;
};

export type LegalOperatorMissionArtifactInput = {
  id: string;
  task_id?: string | null;
  artifact_type?: string | null;
  title?: string | null;
  source_module?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  task?: LegalOperatorMissionTaskRef | null;
};

export type LegalOperatorMissionEventInput = {
  id: string;
  task_id?: string | null;
  step_id?: string | null;
  event_type?: string | null;
  source_module?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
  task?: LegalOperatorMissionTaskRef | null;
  step?: LegalOperatorMissionStepRef | null;
};

export type LegalOperatorMissionTimelineItem = {
  id: string;
  source: "approval" | "artifact" | "event";
  title: string | null;
  status: string | null;
  createdAt: string;
};

export type LegalOperatorMissionPendingApproval = {
  id: string;
  auditLogId: string | null;
  riskLevel: string | null;
  skillName: string | null;
  createdAt: string;
};

export type LegalOperatorMissionSnapshot = {
  key: string;
  processTaskId: string | null;
  processNumber: string | null;
  processLabel: string | null;
  taskId: string | null;
  currentState: LegalOperatorStateRecord;
  currentSource: "approval" | "artifact" | "event";
  pendingApproval: LegalOperatorMissionPendingApproval | null;
  latestArtifactId: string | null;
  latestEventId: string | null;
  timeline: LegalOperatorMissionTimelineItem[];
  lastUpdatedAt: string;
};

type LegalOperatorMissionCandidate = {
  id: string;
  source: "approval" | "artifact" | "event";
  priority: number;
  state: LegalOperatorStateRecord;
  createdAt: string;
  processTaskId: string | null;
  processNumber: string | null;
  processLabel: string | null;
  taskId: string | null;
  title: string | null;
  status: string | null;
  pendingApproval: LegalOperatorMissionPendingApproval | null;
};

type LegalOperatorMissionAccumulator = {
  key: string;
  processTaskId: string | null;
  processNumber: string | null;
  processLabel: string | null;
  taskId: string | null;
  current: LegalOperatorMissionCandidate;
  pendingApproval: LegalOperatorMissionPendingApproval | null;
  latestArtifactId: string | null;
  latestArtifactAt: string | null;
  latestEventId: string | null;
  latestEventAt: string | null;
  timeline: LegalOperatorMissionTimelineItem[];
  lastUpdatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown) {
  return isRecord(value) ? value : null;
}

function timestampValue(value: string | null | undefined) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function newerThan(left: string | null | undefined, right: string | null | undefined) {
  return timestampValue(left) > timestampValue(right);
}

function shouldReplaceCurrent(current: LegalOperatorMissionCandidate, next: LegalOperatorMissionCandidate) {
  if (next.priority !== current.priority) return next.priority > current.priority;
  return newerThan(next.createdAt, current.createdAt);
}

function extractTaskId(input: { task_id?: string | null; task?: LegalOperatorMissionTaskRef | null }) {
  return stringValue(input.task_id) || stringValue(input.task?.id);
}

function extractStateFromApproval(approval: LegalOperatorMissionApprovalInput) {
  if (approval.status !== "pending") return null;
  const context = recordValue(approval.approval_context);
  const awaitingPayload = recordValue(approval.awaiting_payload)
    || recordValue(context?.awaiting_payload);
  return recordValue(awaitingPayload?.legalOperatorState)
    || recordValue(awaitingPayload?.legal_operator_state);
}

function extractApprovalPayload(approval: LegalOperatorMissionApprovalInput) {
  const context = recordValue(approval.approval_context);
  return recordValue(approval.awaiting_payload) || recordValue(context?.awaiting_payload);
}

function extractProcessInfo(params: {
  payload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  task?: LegalOperatorMissionTaskRef | null;
}) {
  const payload = params.payload || {};
  const metadata = params.metadata || {};
  const entities = recordValue(payload.entities);

  const processTaskId =
    stringValue(entities?.process_task_id)
    || stringValue(payload.process_task_id)
    || stringValue(metadata.process_task_id);
  const processNumber =
    stringValue(entities?.process_number)
    || stringValue(payload.process_number)
    || stringValue(metadata.process_number);
  const processLabel =
    stringValue(payload.processLabel)
    || stringValue(payload.process_label)
    || stringValue(metadata.process_label)
    || processNumber
    || stringValue(params.task?.title)
    || stringValue(params.task?.goal);

  return { processTaskId, processNumber, processLabel };
}

function missionKey(candidate: LegalOperatorMissionCandidate) {
  if (candidate.processTaskId) return `process_task:${candidate.processTaskId}`;
  if (candidate.processNumber) return `process_number:${candidate.processNumber}`;
  if (candidate.taskId) return `brain_task:${candidate.taskId}`;
  return `${candidate.source}:${candidate.id}`;
}

function candidateFromApproval(approval: LegalOperatorMissionApprovalInput): LegalOperatorMissionCandidate | null {
  const state = extractStateFromApproval(approval);
  if (!state) return null;
  const awaitingPayload = extractApprovalPayload(approval);
  const info = extractProcessInfo({ payload: awaitingPayload, task: approval.task });
  const context = recordValue(approval.approval_context);

  return {
    id: approval.id,
    source: "approval",
    priority: 3,
    state,
    createdAt: approval.created_at,
    processTaskId: info.processTaskId,
    processNumber: info.processNumber,
    processLabel: info.processLabel,
    taskId: extractTaskId(approval),
    title: stringValue(awaitingPayload?.proposedActionLabel) || stringValue(awaitingPayload?.skillName),
    status: approval.status,
    pendingApproval: {
      id: approval.id,
      auditLogId: stringValue(approval.audit_log_id) || stringValue(context?.audit_log_id),
      riskLevel: stringValue(approval.risk_level) || stringValue(awaitingPayload?.riskLevel),
      skillName: stringValue(awaitingPayload?.skillName),
      createdAt: approval.created_at,
    },
  };
}

function candidateFromArtifact(artifact: LegalOperatorMissionArtifactInput): LegalOperatorMissionCandidate | null {
  const metadata = artifact.metadata || {};
  const state = recordValue(metadata.legal_operator_state);
  if (!state) return null;
  const info = extractProcessInfo({ metadata, task: artifact.task });

  return {
    id: artifact.id,
    source: "artifact",
    priority: 2,
    state,
    createdAt: artifact.created_at,
    processTaskId: info.processTaskId,
    processNumber: info.processNumber,
    processLabel: info.processLabel,
    taskId: extractTaskId(artifact),
    title: stringValue(artifact.title) || stringValue(artifact.artifact_type),
    status: stringValue(metadata.result_status) || stringValue(metadata.process_mission_recommended_action),
    pendingApproval: null,
  };
}

function candidateFromEvent(event: LegalOperatorMissionEventInput): LegalOperatorMissionCandidate | null {
  const payload = event.payload || {};
  const state = recordValue(payload.legal_operator_state);
  if (!state) return null;
  const info = extractProcessInfo({ payload, task: event.task });

  return {
    id: event.id,
    source: "event",
    priority: 1,
    state,
    createdAt: event.created_at,
    processTaskId: info.processTaskId,
    processNumber: info.processNumber,
    processLabel: info.processLabel,
    taskId: extractTaskId(event),
    title: stringValue(event.event_type),
    status: stringValue(payload.result_status) || stringValue(payload.recommended_action),
    pendingApproval: null,
  };
}

function mergeCandidate(
  missions: Map<string, LegalOperatorMissionAccumulator>,
  candidate: LegalOperatorMissionCandidate
) {
  const key = missionKey(candidate);
  const existing = missions.get(key);
  const timelineItem: LegalOperatorMissionTimelineItem = {
    id: candidate.id,
    source: candidate.source,
    title: candidate.title,
    status: candidate.status,
    createdAt: candidate.createdAt,
  };

  if (!existing) {
    missions.set(key, {
      key,
      processTaskId: candidate.processTaskId,
      processNumber: candidate.processNumber,
      processLabel: candidate.processLabel,
      taskId: candidate.taskId,
      current: candidate,
      pendingApproval: candidate.pendingApproval,
      latestArtifactId: candidate.source === "artifact" ? candidate.id : null,
      latestArtifactAt: candidate.source === "artifact" ? candidate.createdAt : null,
      latestEventId: candidate.source === "event" ? candidate.id : null,
      latestEventAt: candidate.source === "event" ? candidate.createdAt : null,
      timeline: [timelineItem],
      lastUpdatedAt: candidate.createdAt,
    });
    return;
  }

  if (!existing.processTaskId && candidate.processTaskId) existing.processTaskId = candidate.processTaskId;
  if (!existing.processNumber && candidate.processNumber) existing.processNumber = candidate.processNumber;
  if (!existing.processLabel && candidate.processLabel) existing.processLabel = candidate.processLabel;
  if (!existing.taskId && candidate.taskId) existing.taskId = candidate.taskId;
  if (shouldReplaceCurrent(existing.current, candidate)) existing.current = candidate;
  if (candidate.pendingApproval && (!existing.pendingApproval || newerThan(candidate.createdAt, existing.pendingApproval.createdAt))) {
    existing.pendingApproval = candidate.pendingApproval;
  }
  if (candidate.source === "artifact" && (!existing.latestArtifactAt || newerThan(candidate.createdAt, existing.latestArtifactAt))) {
    existing.latestArtifactId = candidate.id;
    existing.latestArtifactAt = candidate.createdAt;
  }
  if (candidate.source === "event" && (!existing.latestEventAt || newerThan(candidate.createdAt, existing.latestEventAt))) {
    existing.latestEventId = candidate.id;
    existing.latestEventAt = candidate.createdAt;
  }
  if (newerThan(candidate.createdAt, existing.lastUpdatedAt)) existing.lastUpdatedAt = candidate.createdAt;
  existing.timeline.push(timelineItem);
}

export function buildLegalOperatorMissionSnapshots(input: {
  approvals?: LegalOperatorMissionApprovalInput[];
  artifacts?: LegalOperatorMissionArtifactInput[];
  events?: LegalOperatorMissionEventInput[];
}): LegalOperatorMissionSnapshot[] {
  const missions = new Map<string, LegalOperatorMissionAccumulator>();
  const candidates = [
    ...(input.approvals || []).map(candidateFromApproval),
    ...(input.artifacts || []).map(candidateFromArtifact),
    ...(input.events || []).map(candidateFromEvent),
  ].filter((candidate): candidate is LegalOperatorMissionCandidate => Boolean(candidate));

  for (const candidate of candidates) {
    mergeCandidate(missions, candidate);
  }

  return Array.from(missions.values())
    .map((mission) => ({
      key: mission.key,
      processTaskId: mission.processTaskId,
      processNumber: mission.processNumber,
      processLabel: mission.processLabel,
      taskId: mission.taskId,
      currentState: mission.current.state,
      currentSource: mission.current.source,
      pendingApproval: mission.pendingApproval,
      latestArtifactId: mission.latestArtifactId,
      latestEventId: mission.latestEventId,
      timeline: mission.timeline.sort((left, right) => timestampValue(right.createdAt) - timestampValue(left.createdAt)),
      lastUpdatedAt: mission.lastUpdatedAt,
    }))
    .sort((left, right) => timestampValue(right.lastUpdatedAt) - timestampValue(left.lastUpdatedAt));
}
