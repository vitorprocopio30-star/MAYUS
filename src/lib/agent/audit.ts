import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type AgentAuditStatus =
  | "skill_executed"
  | "skill_blocked"
  | "awaiting_approval"
  | "fallback_triggered";

export type AgentApprovalStatus = "pending" | "approved" | "rejected";

type AgentAuditClient = Pick<SupabaseClient, "from">;

export type AgentAuditLog = {
  id: string;
  tenant_id: string;
  user_id: string;
  skill_invoked: string;
  intention_raw: string | null;
  payload_executed: Record<string, unknown> | null;
  status: AgentAuditStatus;
  approval_status: AgentApprovalStatus | null;
  approval_context: Record<string, unknown> | null;
  approved_by: string | null;
  approved_at: string | null;
  idempotency_key: string;
  idempotency_expires_at: string | null;
  pending_execution_payload: Record<string, unknown> | null;
};

export async function createAgentAuditLog(params: {
  tenantId: string;
  userId: string;
  skillInvoked: string;
  intentionRaw: string;
  payloadExecuted?: object;
  status: AgentAuditStatus;
  idempotencyKey: string;
  approvalStatus?: AgentApprovalStatus;
  approvalContext?: object;
  pendingExecutionPayload?: object;
  idempotencyExpiresAt?: string;
  client?: AgentAuditClient;
}): Promise<{ id?: string; error?: string }> {
  const client = params.client ?? supabaseAdmin;
  const { data, error } = await client
    .from("agent_audit_logs")
    .insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      skill_invoked: params.skillInvoked,
      intention_raw: params.intentionRaw,
      payload_executed: params.payloadExecuted ?? null,
      status: params.status,
      idempotency_key: params.idempotencyKey,
      approval_status: params.approvalStatus ?? null,
      approval_context: params.approvalContext ?? null,
      pending_execution_payload: params.pendingExecutionPayload ?? null,
      ...(params.idempotencyExpiresAt
        ? { idempotency_expires_at: params.idempotencyExpiresAt }
        : {}),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: data?.id };
}

export async function getAgentAuditLogForTenant(params: {
  auditLogId: string;
  tenantId: string;
  client?: AgentAuditClient;
}): Promise<AgentAuditLog | null> {
  const client = params.client ?? supabaseAdmin;
  const { data } = await client
    .from("agent_audit_logs")
    .select("*")
    .eq("id", params.auditLogId)
    .eq("tenant_id", params.tenantId)
    .single();

  return (data as AgentAuditLog | null) ?? null;
}

export async function markAgentAuditApprovalDecision(params: {
  auditLogId: string;
  decision: AgentApprovalStatus;
  approverId: string;
  client?: AgentAuditClient;
}): Promise<{ updated: boolean; error?: string }> {
  const client = params.client ?? supabaseAdmin;
  const { data, error } = await client
    .from("agent_audit_logs")
    .update({
      approval_status: params.decision,
      approved_by: params.approverId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", params.auditLogId)
    .eq("approval_status", "pending")
    .select("id");

  if (error) return { updated: false, error: error.message };
  return { updated: Boolean(data && data.length > 0) };
}

export async function markAgentAuditFallback(params: {
  auditLogId: string;
  approverId: string;
  client?: AgentAuditClient;
}) {
  const client = params.client ?? supabaseAdmin;
  return client
    .from("agent_audit_logs")
    .update({
      status: "fallback_triggered",
      approved_by: params.approverId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", params.auditLogId);
}

export async function markAgentAuditExecuted(params: {
  auditLogId: string;
  payloadExecuted: object;
  client?: AgentAuditClient;
}) {
  const client = params.client ?? supabaseAdmin;
  return client
    .from("agent_audit_logs")
    .update({
      payload_executed: params.payloadExecuted,
    })
    .eq("id", params.auditLogId);
}
