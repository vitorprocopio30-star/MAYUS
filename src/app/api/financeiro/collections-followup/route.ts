import { NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { createBrainArtifact } from "@/lib/brain/artifacts";
import {
  buildCollectionsFollowupArtifactMetadata,
  buildCollectionsFollowupPlan,
} from "@/lib/finance/collections-followup";
import { loadTenantFinanceSummary, type TenantFinanceRiskItem } from "@/lib/finance/tenant-finance-summary";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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

function collectionStageFromRisk(risk: TenantFinanceRiskItem) {
  if (risk.riskLevel === "high") return "delinquency";
  if (risk.maxDaysOverdue >= 8) return "delinquency";
  if (risk.maxDaysOverdue > 0 || risk.overdueAmount > 0) return "light_overdue";
  return "light_overdue";
}

function collectionToneFromRisk(risk: TenantFinanceRiskItem) {
  return risk.riskLevel === "high" ? "firm" : "neutral";
}

function buildDedupeKey(risk: TenantFinanceRiskItem) {
  return [
    "collections-risk",
    risk.key,
    risk.oldestDueDate || "sem-data",
    String(Math.round(risk.openAmount * 100)),
  ].join(":");
}

async function findExistingArtifact(params: { tenantId: string; dedupeKey: string }) {
  const { data, error } = await supabaseAdmin
    .from("brain_artifacts")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("artifact_type", "collections_followup_plan")
    .eq("metadata->>dedupe_key", params.dedupeKey)
    .maybeSingle();

  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

async function createFinanceBrainTask(params: {
  tenantId: string;
  userId: string;
  risk: TenantFinanceRiskItem;
  planSummary: string;
}) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("brain_tasks")
    .insert({
      tenant_id: params.tenantId,
      created_by: params.userId,
      channel: "dashboard",
      module: "finance",
      status: "completed",
      title: `Plano de cobranca - ${params.risk.clientName || params.risk.label}`,
      goal: "Gerar plano supervisionado de cobranca a partir de risco financeiro do dashboard.",
      task_input: {
        risk_key: params.risk.key,
      },
      task_context: {
        risk_item: params.risk,
      },
      policy_snapshot: {
        external_side_effects_blocked: true,
        requires_human_approval: true,
      },
      result_summary: params.planSummary,
      started_at: now,
      completed_at: now,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Brain task nao retornou id.");
  return String(data.id);
}

export async function POST(req: Request) {
  try {
    let session: Awaited<ReturnType<typeof getTenantSession>>;
    try {
      session = await getTenantSession({ requireFullAccess: true });
    } catch (error) {
      const status = statusFromSessionError(error);
      return NextResponse.json({ error: messageFromSessionStatus(status) }, { status });
    }

    const body = await req.json().catch(() => null);
    const riskKey = typeof body?.riskKey === "string" ? body.riskKey.trim() : "";
    if (!riskKey) {
      return NextResponse.json({ error: "riskKey e obrigatorio." }, { status: 400 });
    }

    const summary = await loadTenantFinanceSummary({
      supabase: supabaseAdmin,
      tenantId: session.tenantId,
    });
    const risk = summary.financials.riskItems.find((item) => item.key === riskKey);
    if (!risk) {
      return NextResponse.json({ error: "Risco financeiro nao encontrado para este tenant." }, { status: 404 });
    }

    const plan = buildCollectionsFollowupPlan({
      clientName: risk.clientName || risk.label,
      amount: risk.openAmount,
      daysOverdue: risk.maxDaysOverdue,
      dueDate: risk.oldestDueDate,
      stage: collectionStageFromRisk(risk),
      tone: collectionToneFromRisk(risk),
      channel: "whatsapp",
      notes: risk.nextBestAction,
    });
    const dedupeKey = buildDedupeKey(risk);
    const metadata = {
      ...buildCollectionsFollowupArtifactMetadata({ plan }),
      risk_key: risk.key,
      risk_label: risk.label,
      risk_level: risk.riskLevel,
      case_id: risk.caseId,
      open_amount: risk.openAmount,
      overdue_amount: risk.overdueAmount,
      forecast_amount: risk.forecastAmount,
      open_count: risk.openCount,
      overdue_count: risk.overdueCount,
      oldest_due_date: risk.oldestDueDate,
      source: "dashboard_finance_risk",
    };

    const existingArtifactId = await findExistingArtifact({ tenantId: session.tenantId, dedupeKey });
    if (existingArtifactId) {
      return NextResponse.json({
        ok: true,
        artifactId: existingArtifactId,
        plan,
        deduped: true,
      });
    }

    const taskId = await createFinanceBrainTask({
      tenantId: session.tenantId,
      userId: session.userId,
      risk,
      planSummary: plan.summary,
    });
    const artifact = await createBrainArtifact({
      tenantId: session.tenantId,
      taskId,
      artifactType: "collections_followup_plan",
      title: `Cobranca supervisionada - ${plan.clientName}`,
      sourceModule: "finance",
      mimeType: "application/json",
      dedupeKey,
      metadata,
    });

    return NextResponse.json({
      ok: true,
      artifactId: artifact.id,
      plan,
      deduped: false,
    });
  } catch (error: any) {
    console.error("[financeiro/collections-followup]", error?.message || error);
    return NextResponse.json({ error: "Nao foi possivel gerar o plano de cobranca." }, { status: 500 });
  }
}
