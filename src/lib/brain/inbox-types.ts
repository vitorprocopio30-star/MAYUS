export interface BrainInboxTaskItem {
  id: string;
  title: string | null;
  goal: string;
  module: string;
  channel: string;
  status: string;
  created_at: string;
  updated_at: string;
  result_summary?: string | null;
  error_message?: string | null;
}

export interface BrainInboxArtifactItem {
  id: string;
  artifact_type: string;
  title?: string | null;
  storage_url?: string | null;
  mime_type?: string | null;
  source_module?: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  task: BrainInboxTaskItem | null;
}

export interface BrainInboxEventItem {
  id: string;
  event_type: string;
  source_module?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
  task: BrainInboxTaskItem | null;
  step?: BrainInboxStepItem | null;
}

export interface BrainInboxStepItem {
  id: string;
  title: string;
  status: string;
  step_type: string;
  capability_name?: string | null;
  handler_type?: string | null;
}

export interface BrainInboxApprovalItem {
  id: string;
  status: string;
  risk_level?: string | null;
  created_at: string;
  approved_at?: string | null;
  decision_notes?: string | null;
  audit_log_id?: string | null;
  awaiting_payload?: {
    skillName?: string;
    riskLevel?: string;
    entities?: Record<string, string>;
    idempotencyKey?: string;
    schemaVersion?: string;
    reason?: string;
    proposedActionLabel?: string;
    processLabel?: string;
    missionGoal?: string;
  } | null;
  task: BrainInboxTaskItem | null;
  step: BrainInboxStepItem | null;
}

export interface BrainInboxResponse {
  pending_count: number;
  pending_approvals: BrainInboxApprovalItem[];
  recent_approvals: BrainInboxApprovalItem[];
  recent_tasks: BrainInboxTaskItem[];
  recent_artifacts: BrainInboxArtifactItem[];
  recent_events: BrainInboxEventItem[];
}
