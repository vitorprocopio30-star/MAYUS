import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { recordLearningEvent } from "@/lib/agent/memory/learning-events";
import { sanitizeMemoryText } from "@/lib/agent/memory/promotion";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type CrmTaskRow = {
  id: string;
  tenant_id: string;
  stage_id: string | null;
  created_at: string | null;
  value: number | string | null;
};

type CrmStageRow = {
  id: string;
  is_win: boolean | null;
  is_loss: boolean | null;
};

function statusFromSessionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 400;
}

function messageFromSessionStatus(status: number) {
  if (status === 401) return "Nao autenticado.";
  if (status === 403) return "Acesso negado.";
  return "Tenant nao encontrado.";
}

function stringOrNull(value: unknown, max = 240) {
  if (typeof value !== "string") return null;
  const text = sanitizeMemoryText(value).slice(0, max).trim();
  return text || null;
}

function centsOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
  }
  return null;
}

function daysSince(value: string | null) {
  if (!value) return null;
  const created = new Date(value);
  if (Number.isNaN(created.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - created.getTime()) / (24 * 60 * 60 * 1000)));
}

export async function POST(request: NextRequest) {
  let session: Awaited<ReturnType<typeof getTenantSession>>;
  try {
    session = await getTenantSession();
  } catch (error) {
    const status = statusFromSessionError(error);
    return NextResponse.json({ error: messageFromSessionStatus(status) }, { status });
  }

  const body = await request.json().catch(() => null);
  const crmTaskId = stringOrNull(body?.crmTaskId, 128);
  if (!crmTaskId) {
    return NextResponse.json({ error: "crmTaskId e obrigatorio." }, { status: 422 });
  }

  const { data: task, error: taskError } = await supabaseAdmin
    .from("crm_tasks")
    .select("id, tenant_id, stage_id, created_at, value")
    .eq("id", crmTaskId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle<CrmTaskRow>();

  if (taskError) {
    console.error("[crm/lead-outcome] task lookup", taskError.message);
    return NextResponse.json({ error: "Nao foi possivel validar o lead." }, { status: 500 });
  }
  if (!task) {
    return NextResponse.json({ error: "Lead nao encontrado para este tenant." }, { status: 404 });
  }
  if (!task.stage_id) {
    return NextResponse.json({ error: "Lead sem etapa final valida." }, { status: 422 });
  }

  const { data: stage, error: stageError } = await supabaseAdmin
    .from("crm_stages")
    .select("id, is_win, is_loss")
    .eq("id", task.stage_id)
    .maybeSingle<CrmStageRow>();

  if (stageError) {
    console.error("[crm/lead-outcome] stage lookup", stageError.message);
    return NextResponse.json({ error: "Nao foi possivel validar a etapa do lead." }, { status: 500 });
  }

  const derivedOutcome = stage?.is_win === true ? "won" : stage?.is_loss === true ? "lost" : null;
  if (!derivedOutcome) {
    return NextResponse.json({ error: "Etapa atual nao representa ganho ou perda." }, { status: 409 });
  }

  await recordLearningEvent({
    supabase: supabaseAdmin,
    tenantId: session.tenantId,
    eventType: "lead_outcome_recorded",
    sourceModule: "crm",
    createdBy: session.userId,
    payload: {
      crm_task_id: task.id,
      outcome: derivedOutcome,
      requested_outcome: body?.outcome === "won" || body?.outcome === "lost" ? body.outcome : null,
      stage_id: task.stage_id,
      motivo: stringOrNull(body?.motivo, 500),
      valor_cents: centsOrNull(body?.valor) ?? centsOrNull(task.value),
      fonte: stringOrNull(body?.fonte, 120) || "crm_board",
      days_in_pipeline: daysSince(task.created_at),
    },
  });

  return NextResponse.json({ ok: true, outcome: derivedOutcome });
}
