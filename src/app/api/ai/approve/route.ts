// src/app/api/ai/approve/route.ts
//
// Endpoint de Aprovação Humana de Skills Agênticas
//
// GARANTIAS OBRIGATÓRIAS:
// 1. userId via sessão JWT (@supabase/ssr) — nunca do body
// 2. Apenas admin/socio pode aprovar
// 3. auditLogId deve pertencer ao tenantId do aprovador (isolamento de tenant)
// 4. Se approval_status já for "approved" ou "rejected" → 409 Conflict
// 5. Verificação de expiração → 410 Gone se idempotency_expires_at passou
// 6. Guard de race condition: update atômico com .eq("approval_status", "pending")
// 7. Payload de execução vem de pending_execution_payload no banco — nunca do body

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { dispatchCapabilityExecution } from "@/lib/agent/capabilities/dispatcher";
import { fetchAgentSkillByName } from "@/lib/agent/capabilities/registry";
import { isBrainExecutiveRole } from "@/lib/brain/roles";
import {
  getAgentAuditLogForTenant,
  markAgentAuditApprovalDecision,
  markAgentAuditExecuted,
  markAgentAuditFallback,
} from "@/lib/agent/audit";

// ─── Constantes ───────────────────────────────────────────────────────────────

// ─── Service Client (singleton no módulo) ────────────────────────────────────

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type BrainApprovalLink = {
  id: string;
  task_id: string;
  run_id: string | null;
  step_id: string | null;
};

type BrainMissionSyncInput = {
  brainApproval: BrainApprovalLink | null;
  approvalStatus: "approved" | "rejected";
  approverId: string;
  taskStatus: "awaiting_approval" | "completed" | "completed_with_warnings" | "failed" | "cancelled";
  runStatus: "awaiting_approval" | "completed" | "completed_with_warnings" | "failed" | "cancelled";
  stepStatus: "awaiting_approval" | "completed" | "failed" | "cancelled";
  message?: string | null;
  error?: string | null;
  outputPayload?: Record<string, unknown>;
  decisionNotes?: string | null;
};

async function findBrainApproval(tenantId: string, auditLogId: string): Promise<BrainApprovalLink | null> {
  const { data, error } = await serviceClient
    .from("brain_approvals")
    .select("id, task_id, run_id, step_id")
    .eq("tenant_id", tenantId)
    .eq("approval_context->>audit_log_id", auditLogId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[Approve] Falha ao localizar brain_approval:", error.message);
    return null;
  }

  return data;
}

async function syncBrainMissionFromApproval(params: BrainMissionSyncInput) {
  if (!params.brainApproval) {
    return;
  }

  const completedAt = new Date().toISOString();

  await Promise.all([
    serviceClient
      .from("brain_approvals")
      .update({
        status: params.approvalStatus,
        approved_by: params.approverId,
        approved_at: completedAt,
        decision_notes: params.decisionNotes ?? params.message ?? params.error ?? null,
      })
      .eq("id", params.brainApproval.id),
    serviceClient
      .from("brain_tasks")
      .update({
        status: params.taskStatus,
        result_summary: params.message ?? null,
        error_message: params.error ?? null,
        completed_at: completedAt,
      })
      .eq("id", params.brainApproval.task_id),
    params.brainApproval.run_id
      ? serviceClient
          .from("brain_runs")
          .update({
            status: params.runStatus,
            summary: params.message ?? null,
            error_message: params.error ?? null,
            completed_at: completedAt,
          })
          .eq("id", params.brainApproval.run_id)
      : Promise.resolve(),
    params.brainApproval.step_id
      ? serviceClient
          .from("brain_steps")
          .update({
            status: params.stepStatus,
            output_payload: params.outputPayload ?? {},
            error_payload: params.error ? { error: params.error } : {},
            completed_at: completedAt,
          })
          .eq("id", params.brainApproval.step_id)
      : Promise.resolve(),
  ]);
}

// ─── Handler Principal ────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {

    // ── 1. Autenticação via sessão JWT (@supabase/ssr) ──────────────────────
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch { /* Route Handler — ignorar */ }
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }
    const approverId = user.id;

    // ── 2. Validação do body ────────────────────────────────────────────────
    const { auditLogId, decision } = await req.json();

    if (!auditLogId || typeof auditLogId !== "string") {
      return NextResponse.json({ error: "auditLogId invalido ou ausente." }, { status: 400 });
    }
    if (decision !== "approved" && decision !== "rejected") {
      return NextResponse.json(
        { error: "decision deve ser 'approved' ou 'rejected'." },
        { status: 400 }
      );
    }

    // ── 3. Fetch do perfil do aprovador ────────────────────────────────────
    const { data: approverProfile } = await serviceClient
      .from("profiles")
      .select("role, tenant_id")
      .eq("id", approverId)
      .single();

    if (!approverProfile?.role || !approverProfile?.tenant_id) {
      return NextResponse.json({ error: "Perfil do aprovador nao encontrado." }, { status: 403 });
    }

    const tenantId = approverProfile.tenant_id as string;

    // ── 4. Validação de role ────────────────────────────────────────────────
    if (!isBrainExecutiveRole(approverProfile.role)) {
      return NextResponse.json({
        error: `Apenas perfis executivos podem aprovar acoes. Perfil atual: "${approverProfile.role}".`,
      }, { status: 403 });
    }

    // ── 5. Fetch do audit log com vínculo de tenant ─────────────────────────
    // Filtra por tenant_id: impossibilita aprovar ações de outro tenant
    // mesmo que o aprovador conheça o auditLogId.
    const auditLog = await getAgentAuditLogForTenant({
      auditLogId,
      tenantId,
      client: serviceClient,
    });

    const brainApproval = await findBrainApproval(tenantId, auditLogId);

    if (!auditLog) {
      // 404 — não revela se o registro existe em outro tenant
      return NextResponse.json({ error: "Registro de auditoria nao encontrado." }, { status: 404 });
    }

    // ── 6. Idempotência: 409 se já processado ──────────────────────────────
    if (
      auditLog.approval_status === "approved" ||
      auditLog.approval_status === "rejected"
    ) {
      return NextResponse.json({
        error: `Acao ja processada com status "${auditLog.approval_status}". Nenhuma reexecucao permitida.`,
        currentStatus: auditLog.approval_status,
      }, { status: 409 });
    }

    // ── 7. Sanity check: deve estar em estado "pending" ─────────────────────
    if (auditLog.approval_status !== "pending") {
      return NextResponse.json({
        error: `Status inesperado "${auditLog.approval_status}". Apenas registros "pending" podem ser processados.`,
      }, { status: 422 });
    }

    // ── 8. Verificação de expiração ─────────────────────────────────────────
    // Aprovações que passaram de 24h são rejeitadas para evitar "aprovações zumbi".
    // O usuário deve iniciar a ação novamente.
    if (auditLog.idempotency_expires_at) {
      const expired = new Date(auditLog.idempotency_expires_at) < new Date();
      if (expired) {
        return NextResponse.json({
          error: "Solicitacao expirada. O usuario deve iniciar a acao novamente.",
          code: "APPROVAL_EXPIRED",
        }, { status: 410 });
      }
    }

    // ── 9. Update atômico com guard de race condition ───────────────────────
    // .eq("approval_status", "pending") garante que se dois aprovadores
    // chegarem simultaneamente, apenas um terá linhas afetadas.
    const decisionResult = await markAgentAuditApprovalDecision({
      auditLogId,
      decision,
      approverId,
      client: serviceClient,
    });

    if (decisionResult.error) {
      console.error("[Approve] Falha ao atualizar audit log:", decisionResult.error);
      return NextResponse.json({ error: "Erro interno ao registrar decisao." }, { status: 500 });
    }

    // 0 linhas afetadas = outro aprovador chegou primeiro (race condition)
    if (!decisionResult.updated) {
      return NextResponse.json({
        error: "Acao ja processada por outro aprovador simultaneamente.",
        code: "CONCURRENT_APPROVAL",
      }, { status: 409 });
    }

    // ── 10. Rejeição — encerra aqui ─────────────────────────────────────────
    if (decision === "rejected") {
      await syncBrainMissionFromApproval({
        brainApproval,
        approvalStatus: "rejected",
        approverId,
        taskStatus: "cancelled",
        runStatus: "cancelled",
        stepStatus: "cancelled",
        message: "Acao rejeitada pelo aprovador.",
        outputPayload: {
          status: "rejected",
          auditLogId,
        },
      });

      return NextResponse.json({
        status: "rejected",
        message: "Acao rejeitada e registrada com sucesso.",
        auditLogId,
        rejectedBy: approverId,
      });
    }

    // ── 11. Aprovação — executa usando pending_execution_payload do banco ────
    // NUNCA usa dados do body para execução.
    // pending_execution_payload é gravado pelo executor.ts no fluxo awaiting_approval.
    const pendingPayload = auditLog.pending_execution_payload as {
      entities: Record<string, string>;
      idempotencyKey: string;
      skillName: string;
      schemaVersion: string;
    } | null;

    if (!pendingPayload) {
      console.error("[Approve] pending_execution_payload ausente no audit log:", auditLogId);

      await syncBrainMissionFromApproval({
        brainApproval,
        approvalStatus: "approved",
        approverId,
        taskStatus: "failed",
        runStatus: "failed",
        stepStatus: "failed",
        error: "Payload de execucao nao encontrado. Acao aprovada mas nao executada.",
        outputPayload: {
          status: "approved_not_executed",
          auditLogId,
        },
      });

      return NextResponse.json({
        error: "Payload de execucao nao encontrado. Acao aprovada mas nao executada.",
        status: "approved_not_executed",
        auditLogId,
      }, { status: 500 });
    }

    const skillName = auditLog.skill_invoked as string;
    const { entities, idempotencyKey } = pendingPayload;

    // ── 12. Lookup de handler_type em agent_skills ──────────────────────────
    // Query separada — audit log não armazena handler_type diretamente.
    // Isolamento de tenant: garante que a skill pertence ao tenant do aprovador.

    const skillMeta = await fetchAgentSkillByName({ tenantId, name: skillName });
    const handlerType = skillMeta?.handler_type ?? null;

    // ── 13. Despacho por handler_type ───────────────────────────────────────
    // Nova skill no banco com handler_type existente = funciona sem código.
    // handler_type null → "approved" sem executor server-side.

    const dispatchResult = await dispatchCapabilityExecution({
      handlerType,
      capabilityName: skillName,
      tenantId,
      userId: approverId,
      entities,
      auditLogId,
      brainContext: brainApproval
        ? {
            taskId: brainApproval.task_id,
            runId: brainApproval.run_id,
            stepId: brainApproval.step_id,
            sourceModule: "mayus",
          }
        : undefined,
    });

    if (dispatchResult.status === "awaiting_approval") {
      await syncBrainMissionFromApproval({
        brainApproval,
        approvalStatus: "approved",
        approverId,
        taskStatus: "awaiting_approval",
        runStatus: "awaiting_approval",
        stepStatus: "awaiting_approval",
        message: dispatchResult.reply,
        outputPayload: {
          ...(dispatchResult.outputPayload || {}),
          status: "awaiting_approval",
          auditLogId,
          handler_type: handlerType,
        },
      });

      return NextResponse.json({
        status: "awaiting_approval",
        message: dispatchResult.reply,
        auditLogId,
        approvedBy: approverId,
        awaitingApproval: dispatchResult.outputPayload || {},
      }, { status: 202 });
    }

    if (dispatchResult.status === "unsupported") {
      await syncBrainMissionFromApproval({
        brainApproval,
        approvalStatus: "approved",
        approverId,
        taskStatus: "completed_with_warnings",
        runStatus: "completed_with_warnings",
        stepStatus: "completed",
        message: dispatchResult.reply,
        outputPayload: {
          ...(dispatchResult.outputPayload || {}),
          status: "approved",
          auditLogId,
          handler_type: handlerType,
        },
      });

      return NextResponse.json({
        status: "approved",
        message: dispatchResult.reply,
        auditLogId,
        approvedBy: approverId,
      });
    }

    if (dispatchResult.status === "blocked") {
      await syncBrainMissionFromApproval({
        brainApproval,
        approvalStatus: "approved",
        approverId,
        taskStatus: "failed",
        runStatus: "failed",
        stepStatus: "failed",
        error: dispatchResult.reply,
        outputPayload: {
          ...(dispatchResult.outputPayload || {}),
          status: "approved_not_executed",
          auditLogId,
          handler_type: handlerType,
        },
      });

      return NextResponse.json({
        error: dispatchResult.reply,
        status: "approved_not_executed",
        auditLogId,
      }, { status: 403 });
    }

    if (dispatchResult.status === "failed") {
      await markAgentAuditFallback({
        auditLogId,
        approverId,
        client: serviceClient,
      });

      await syncBrainMissionFromApproval({
        brainApproval,
        approvalStatus: "approved",
        approverId,
        taskStatus: "failed",
        runStatus: "failed",
        stepStatus: "failed",
        error: dispatchResult.reply,
        outputPayload: {
          ...(dispatchResult.outputPayload || {}),
          status: "approved_not_executed",
          auditLogId,
          handler_type: handlerType,
        },
      });

      return NextResponse.json({
        error: dispatchResult.reply,
        status: "approved_not_executed",
        auditLogId,
      }, { status: 500 });
    }

    await markAgentAuditExecuted({
      auditLogId,
      payloadExecuted: {
        idempotencyKey,
        skill: skillName,
        handler_type: handlerType,
        executed_at: new Date().toISOString(),
        ...(dispatchResult.outputPayload || {}),
      },
      client: serviceClient,
    });

    await syncBrainMissionFromApproval({
      brainApproval,
      approvalStatus: "approved",
      approverId,
      taskStatus: "completed",
      runStatus: "completed",
      stepStatus: "completed",
      message: dispatchResult.reply,
      outputPayload: {
        ...(dispatchResult.outputPayload || {}),
        status: "executed",
        auditLogId,
        handler_type: handlerType,
      },
    });

    return NextResponse.json({
      status: "executed",
      message: dispatchResult.reply,
      auditLogId,
      approvedBy: approverId,
      ...(dispatchResult.data && typeof dispatchResult.data === "object" ? (dispatchResult.data as Record<string, unknown>) : {}),
    });


  } catch (error: any) {
    console.error("[Approve] Erro interno:", error);
    return NextResponse.json({ error: "Erro interno no processamento." }, { status: 500 });
  }
}
