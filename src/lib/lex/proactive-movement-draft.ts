import { createHash } from "crypto";

import {
  resolveProactiveEventPlaybook,
  type ProactiveEventPlaybook,
} from "@/lib/agent/proactive-events/registry";
import { createBrainArtifact } from "@/lib/brain/artifacts";
import { executeDraftFactoryForProcessTask } from "@/lib/lex/draft-factory";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type ProactiveMovementDraftTrigger = ProactiveEventPlaybook;

export type PrepareProactiveMovementDraftResult =
  | { status: "not_applicable"; reason: string }
  | { status: "skipped"; reason: "duplicate" }
  | {
      status: "prepared";
      artifactId: string;
      draftFactoryTaskId: string;
      draftArtifactId: string;
      recommendedPieceInput: string;
      recommendedPieceLabel: string;
      alreadyExisting?: boolean;
    }
  | { status: "failed"; reason: string };

function shortMovementHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function buildDedupeKey(params: {
  processTaskId: string;
  movementId?: string | null;
  movementText: string;
  playbookId: string;
}) {
  const movementRef = params.movementId?.trim() || shortMovementHash(params.movementText);
  return `proactive-event:${params.playbookId}:${params.processTaskId}:${movementRef}`;
}

export function classifyProactiveLegalDraftTrigger(params: {
  eventType: string | null | undefined;
  movementText?: string | null;
  deadlineDescription?: string | null;
}): ProactiveMovementDraftTrigger | null {
  return resolveProactiveEventPlaybook({
    domain: "lex",
    source: "escavador",
    eventType: params.eventType,
    text: params.movementText,
    description: params.deadlineDescription,
  });
}

async function createArtifactOnlyMission(params: {
  tenantId: string;
  userId: string | null;
  processTaskId: string;
  processNumber: string;
  playbook: ProactiveEventPlaybook;
  movementId?: string | null;
  movementDate?: string | null;
  deadlineDescription?: string | null;
  dedupeKey: string;
}) {
  const now = new Date().toISOString();
  const { data: task, error: taskError } = await supabaseAdmin
    .from("brain_tasks")
    .insert({
      tenant_id: params.tenantId,
      created_by: params.userId,
      channel: "system",
      module: params.playbook.domain,
      status: "completed",
      title: `${params.playbook.title} - ${params.processNumber}`,
      goal: params.playbook.missionGoal,
      task_input: {
        trigger: "proactive_event_registry",
        playbook_id: params.playbook.id,
        process_task_id: params.processTaskId,
        process_number: params.processNumber,
      },
      task_context: {
        source: "proactive_event_registry",
        playbook_id: params.playbook.id,
        process_task_id: params.processTaskId,
        process_number: params.processNumber,
        movement_id: params.movementId || null,
      },
      policy_snapshot: {
        risk_level: params.playbook.riskLevel,
        requires_human_review: params.playbook.requiresHumanReview,
        external_action_blocked_until_human_ok: params.playbook.blocksExternalActionUntilHumanOk,
        execution_mode: "artifact_only",
      },
      started_at: now,
      completed_at: now,
    })
    .select("id")
    .single<{ id: string }>();

  if (taskError || !task) throw taskError || new Error("Nao foi possivel criar missao proativa.");

  const { data: run, error: runError } = await supabaseAdmin
    .from("brain_runs")
    .insert({
      task_id: task.id,
      tenant_id: params.tenantId,
      attempt_number: 1,
      status: "completed",
      started_at: now,
      completed_at: now,
    })
    .select("id")
    .single<{ id: string }>();

  if (runError || !run) throw runError || new Error("Nao foi possivel criar run proativo.");

  const { data: step, error: stepError } = await supabaseAdmin
    .from("brain_steps")
    .insert({
      task_id: task.id,
      run_id: run.id,
      tenant_id: params.tenantId,
      order_index: 1,
      step_key: "proactive_event_prepare_artifact",
      title: params.playbook.title,
      step_type: "planner",
      status: "completed",
      input_payload: {
        playbook_id: params.playbook.id,
        process_task_id: params.processTaskId,
        movement_id: params.movementId || null,
      },
      output_payload: {
        checklist: params.playbook.checklist,
        requires_human_review: params.playbook.requiresHumanReview,
      },
      started_at: now,
      completed_at: now,
    })
    .select("id")
    .single<{ id: string }>();

  if (stepError || !step) throw stepError || new Error("Nao foi possivel criar step proativo.");

  const artifact = await createBrainArtifact({
    tenantId: params.tenantId,
    taskId: task.id,
    runId: run.id,
    stepId: step.id,
    artifactType: params.playbook.artifactType,
    title: `${params.playbook.title} - ${params.processNumber}`,
    sourceModule: params.playbook.domain,
    mimeType: "application/json",
    dedupeKey: params.dedupeKey,
    metadata: {
      status: "artifact_ready_for_human_review",
      reply: `${params.playbook.title} preparado automaticamente para revisao humana.`,
      process_task_id: params.processTaskId,
      process_number: params.processNumber,
      movement_id: params.movementId || null,
      movement_date: params.movementDate || null,
      playbook_id: params.playbook.id,
      playbook_reason: params.playbook.reason,
      deadline_description: params.deadlineDescription || null,
      checklist: params.playbook.checklist,
      risk_level: params.playbook.riskLevel,
      requires_human_review: params.playbook.requiresHumanReview,
      external_action_blocked_until_human_ok: params.playbook.blocksExternalActionUntilHumanOk,
    },
  });

  await supabaseAdmin.from("learning_events").insert({
    tenant_id: params.tenantId,
    task_id: task.id,
    run_id: run.id,
    step_id: step.id,
    event_type: "proactive_event_artifact_prepared",
    source_module: params.playbook.domain,
    payload: {
      process_task_id: params.processTaskId,
      process_number: params.processNumber,
      playbook_id: params.playbook.id,
      artifact_id: artifact.id,
      requires_human_review: params.playbook.requiresHumanReview,
    },
    created_by: params.userId,
  });

  return { taskId: task.id, runId: run.id, stepId: step.id, artifactId: artifact.id };
}

export async function prepareProactiveMovementDraft(params: {
  tenantId: string;
  processTaskId: string | null;
  processNumber: string;
  movementText: string;
  movementDate?: string | null;
  movementId?: string | null;
  eventType: string | null;
  deadlineDescription?: string | null;
  responsibleUserId?: string | null;
}): Promise<PrepareProactiveMovementDraftResult> {
  if (!params.processTaskId) {
    return { status: "not_applicable", reason: "Movimentacao sem card de processo vinculado." };
  }

  const trigger = classifyProactiveLegalDraftTrigger({
    eventType: params.eventType,
    movementText: params.movementText,
    deadlineDescription: params.deadlineDescription,
  });

  if (!trigger) {
    return { status: "not_applicable", reason: "Movimentacao nao exige minuta proativa nesta versao." };
  }

  const dedupeKey = buildDedupeKey({
    processTaskId: params.processTaskId,
    movementId: params.movementId,
    movementText: params.movementText,
    playbookId: trigger.id,
  });

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("brain_artifacts")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("artifact_type", trigger.artifactType)
    .eq("metadata->>dedupe_key", dedupeKey)
    .maybeSingle<{ id: string }>();

  if (existingError) {
    console.error("[lex/proactive-movement-draft] dedupe lookup", existingError.message);
  }

  if (existing?.id) {
    return { status: "skipped", reason: "duplicate" };
  }

  try {
    if (trigger.actionType === "artifact_only") {
      const mission = await createArtifactOnlyMission({
        tenantId: params.tenantId,
        userId: params.responsibleUserId || null,
        processTaskId: params.processTaskId,
        processNumber: params.processNumber,
        playbook: trigger,
        movementId: params.movementId,
        movementDate: params.movementDate,
        deadlineDescription: params.deadlineDescription,
        dedupeKey,
      });

      return {
        status: "prepared",
        artifactId: mission.artifactId,
        draftFactoryTaskId: mission.taskId,
        draftArtifactId: mission.artifactId,
        recommendedPieceInput: trigger.recommendedPieceInput || trigger.title,
        recommendedPieceLabel: trigger.recommendedPieceLabel || trigger.title,
      };
    }

    if (!trigger.recommendedPieceInput) {
      return { status: "not_applicable", reason: "Playbook sem peca juridica configurada." };
    }

    const execution = await executeDraftFactoryForProcessTask({
      tenantId: params.tenantId,
      userId: params.responsibleUserId || null,
      processTaskId: params.processTaskId,
      trigger: "movement_auto_draft_factory",
      forceNewDraft: true,
      draftPlanOverride: {
        recommendedPieceInput: trigger.recommendedPieceInput,
        recommendedPieceLabel: trigger.recommendedPieceLabel || trigger.recommendedPieceInput,
        reason: trigger.reason,
      },
    });

    const artifact = await createBrainArtifact({
      tenantId: params.tenantId,
      taskId: execution.draftFactoryTaskId,
      runId: execution.runId || null,
      stepId: execution.stepId || null,
      artifactType: trigger.artifactType,
      title: `${trigger.recommendedPieceLabel || trigger.title} preparada - ${params.processNumber}`,
      sourceModule: "lex",
      mimeType: "application/json",
      dedupeKey,
      metadata: {
        status: "draft_ready_for_human_review",
        reply: `${trigger.recommendedPieceLabel || trigger.title} preparada automaticamente para revisao humana.`,
        process_task_id: params.processTaskId,
        process_number: params.processNumber,
        movement_id: params.movementId || null,
        movement_date: params.movementDate || null,
        event_type: params.eventType,
        proactive_trigger_kind: trigger.id,
        proactive_trigger_reason: trigger.reason,
        proactive_playbook_id: trigger.id,
        proactive_playbook_checklist: trigger.checklist,
        risk_level: trigger.riskLevel,
        deadline_description: params.deadlineDescription || null,
        draft_factory_task_id: execution.draftFactoryTaskId,
        draft_artifact_id: execution.artifactId,
        recommended_piece_input: execution.recommendedPieceInput,
        recommended_piece_label: execution.recommendedPieceLabel,
        requires_human_review: trigger.requiresHumanReview,
        external_action_blocked_until_human_ok: trigger.blocksExternalActionUntilHumanOk,
      },
    });

    await supabaseAdmin.from("learning_events").insert({
      tenant_id: params.tenantId,
      task_id: execution.draftFactoryTaskId,
      run_id: execution.runId || null,
      step_id: execution.stepId || null,
      event_type: "lex_proactive_movement_draft_prepared",
      source_module: "lex",
      payload: {
        process_task_id: params.processTaskId,
        process_number: params.processNumber,
        movement_id: params.movementId || null,
        event_type: params.eventType,
        proactive_trigger_kind: trigger.id,
        proactive_trigger_reason: trigger.reason,
        proactive_playbook_id: trigger.id,
        proactive_playbook_checklist: trigger.checklist,
        proactive_artifact_id: artifact.id,
        draft_artifact_id: execution.artifactId,
        recommended_piece_input: execution.recommendedPieceInput,
        recommended_piece_label: execution.recommendedPieceLabel,
        requires_human_review: trigger.requiresHumanReview,
      },
      created_by: params.responsibleUserId || null,
    });

    return {
      status: "prepared",
      artifactId: artifact.id,
      draftFactoryTaskId: execution.draftFactoryTaskId,
      draftArtifactId: execution.artifactId,
      recommendedPieceInput: execution.recommendedPieceInput,
      recommendedPieceLabel: execution.recommendedPieceLabel,
      alreadyExisting: execution.alreadyExisting,
    };
  } catch (error: any) {
    const reason = error?.message || "Falha ao preparar minuta proativa.";
    await supabaseAdmin.from("learning_events").insert({
      tenant_id: params.tenantId,
      task_id: null,
      run_id: null,
      step_id: null,
      event_type: "lex_proactive_movement_draft_failed",
      source_module: "lex",
      payload: {
        process_task_id: params.processTaskId,
        process_number: params.processNumber,
        movement_id: params.movementId || null,
        event_type: params.eventType,
        proactive_trigger_kind: trigger.id,
        error: reason,
        requires_human_review: trigger.requiresHumanReview,
      },
      created_by: params.responsibleUserId || null,
    });
    console.error("[lex/proactive-movement-draft] prepare failed", reason);
    return { status: "failed", reason };
  }
}
