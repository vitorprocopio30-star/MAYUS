import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import {
  buildDailyPlaybook,
  buildDailyPlaybookMetadata,
  normalizeDailyPlaybookPreferences,
  registerDailyPlaybookBrainArtifact,
  type DailyPlaybookChannel,
  type DailyPlaybookDetailLevel,
  type DailyPlaybookPreferences,
  type DailyPlaybookScope,
} from "@/lib/mayus/daily-playbook";
import { supabaseAdmin } from "@/lib/supabase/admin";

type TenantSettingsRecord = {
  ai_features: Record<string, any> | null;
};

const PreferencesSchema = z.object({
  enabled: z.boolean().optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  deliveryTime: z.string().trim().max(8).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  channels: z.array(z.enum(["whatsapp", "email", "mayus_panel"])).max(3).optional(),
  scope: z.enum(["executive", "growth", "legal", "full"]).optional(),
  detailLevel: z.enum(["short", "standard", "deep"]).optional(),
}).partial();

const PostSchema = z.object({
  preferences: PreferencesSchema.optional().nullable(),
  persist: z.boolean().optional(),
}).optional().nullable();

function normalizeAiFeatures(value: any) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeLatestHistoryItem(row: any) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};

  return {
    id: String(row?.id || ""),
    title: String(row?.title || "Playbook diario"),
    createdAt: row?.created_at || null,
    summary: metadata.summary || null,
    deliveryTime: metadata.delivery_time || null,
    channels: Array.isArray(metadata.channels) ? metadata.channels : [],
    scope: metadata.scope || null,
    detailLevel: metadata.detail_level || null,
    metrics: {
      crmLeadsNeedingNextStep: Number(metadata.crm_leads_needing_next_step || 0),
      agendaCriticalTasks: Number(metadata.agenda_critical_tasks || 0),
      agendaTodayTasks: Number(metadata.agenda_today_tasks || 0),
    },
    externalSideEffectsBlocked: metadata.external_side_effects_blocked !== false,
  };
}

async function readTenantAiFeatures(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("tenant_settings")
    .select("ai_features")
    .eq("tenant_id", tenantId)
    .maybeSingle<TenantSettingsRecord>();

  if (error) throw error;
  return normalizeAiFeatures(data?.ai_features);
}

function normalizeSettingsPreferences(value: any): Partial<DailyPlaybookPreferences> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  return {
    enabled: value.enabled === true,
    timezone: typeof value.timezone === "string" ? value.timezone : undefined,
    deliveryTime: typeof value.deliveryTime === "string" ? value.deliveryTime : typeof value.delivery_time === "string" ? value.delivery_time : undefined,
    weekdays: Array.isArray(value.weekdays) ? value.weekdays : undefined,
    channels: Array.isArray(value.channels) ? value.channels as DailyPlaybookChannel[] : undefined,
    scope: typeof value.scope === "string" ? value.scope as DailyPlaybookScope : undefined,
    detailLevel: typeof value.detailLevel === "string"
      ? value.detailLevel as DailyPlaybookDetailLevel
      : typeof value.detail_level === "string"
        ? value.detail_level as DailyPlaybookDetailLevel
        : undefined,
  };
}

async function fetchCrmTasks(tenantId: string) {
  const { data: pipelines, error: pipelinesError } = await supabaseAdmin
    .from("crm_pipelines")
    .select("id")
    .eq("tenant_id", tenantId);

  if (pipelinesError) throw pipelinesError;

  const pipelineIds = (pipelines || []).map((pipeline: any) => pipeline.id).filter(Boolean);
  if (pipelineIds.length === 0) return [];

  const { data: stages, error: stagesError } = await supabaseAdmin
    .from("crm_stages")
    .select("id,name,is_win,is_loss")
    .in("pipeline_id", pipelineIds);

  if (stagesError) throw stagesError;

  const stageById = new Map((stages || []).map((stage: any) => [stage.id, stage]));
  const { data, error } = await supabaseAdmin
    .from("crm_tasks")
    .select("id,title,description,tags,sector,stage_id,phone,assigned_to,created_at,data_ultima_movimentacao")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) throw error;

  return (data || []).map((task: any) => {
    const stage = stageById.get(task.stage_id);

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      tags: Array.isArray(task.tags) ? task.tags : [],
      sector: task.sector,
      stageName: stage?.name || null,
      phone: task.phone,
      isWin: stage?.is_win === true,
      isLoss: stage?.is_loss === true,
      created_at: task.created_at,
      data_ultima_movimentacao: task.data_ultima_movimentacao,
    };
  });
}

async function fetchUserTasks(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_tasks")
    .select("id,title,description,urgency,status,scheduled_for,assigned_name_snapshot,client_name,type")
    .eq("tenant_id", tenantId)
    .order("scheduled_for", { ascending: true })
    .limit(120);

  if (error) throw error;
  return data || [];
}

export async function GET() {
  try {
    const session = await getTenantSession();
    const { data, error } = await supabaseAdmin
      .from("brain_artifacts")
      .select("id,title,metadata,created_at")
      .eq("tenant_id", session.tenantId)
      .eq("artifact_type", "daily_playbook")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      history: (data || []).map(normalizeLatestHistoryItem),
      metadata: {
        source: "brain_artifacts",
        external_side_effects_blocked: true,
      },
    });
  } catch (error: any) {
    const message = error?.message || "Nao foi possivel carregar os Playbooks diarios.";
    const status = message === "Unauthorized" ? 401 : message === "TenantNotFound" ? 404 : 500;
    return NextResponse.json({ error: message === "Unauthorized" ? "Nao autenticado." : message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getTenantSession();
    const body = await request.json().catch(() => null);
    const parsed = PostSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos.", details: parsed.error.flatten().fieldErrors }, { status: 422 });
    }

    const aiFeatures = await readTenantAiFeatures(session.tenantId);
    const savedPreferences = normalizeSettingsPreferences(aiFeatures.daily_playbook);
    const requestedPreferences = parsed.data?.preferences || null;
    const preferences = normalizeDailyPlaybookPreferences({
      ...(savedPreferences || {}),
      ...(requestedPreferences || {}),
    });
    const [crmTasks, userTasks] = await Promise.all([
      fetchCrmTasks(session.tenantId),
      fetchUserTasks(session.tenantId),
    ]);

    const playbook = buildDailyPlaybook({
      firmName: typeof aiFeatures.firm_name === "string" ? aiFeatures.firm_name : null,
      preferences,
      crmTasks,
      userTasks,
    });
    const metadata = buildDailyPlaybookMetadata(playbook);
    const shouldPersist = parsed.data?.persist !== false;
    let brainTrace: Awaited<ReturnType<typeof registerDailyPlaybookBrainArtifact>> = null;
    let eventPersisted = false;

    if (shouldPersist) {
      const { error: eventError } = await supabaseAdmin.from("system_event_logs").insert({
        tenant_id: session.tenantId,
        user_id: session.userId,
        source: "mayus",
        provider: "mayus",
        event_name: "daily_playbook_prepared",
        status: "ok",
        payload: {
          ...metadata,
          persistence: "system_event_logs",
        },
        created_at: new Date().toISOString(),
      });

      if (!eventError) eventPersisted = true;
      else console.error("[mayus][daily-playbook][event]", eventError.message);

      brainTrace = await registerDailyPlaybookBrainArtifact({
        tenantId: session.tenantId,
        userId: session.userId,
        playbook,
        supabase: supabaseAdmin,
      });
    }

    return NextResponse.json({
      success: true,
      playbook,
      metadata: {
        ...metadata,
        persistence: shouldPersist
          ? brainTrace
            ? eventPersisted ? "brain_artifact_and_system_event_logs" : "brain_artifact_only"
            : eventPersisted ? "system_event_logs_event_only" : "failed"
          : "not_requested",
        brain_trace: brainTrace,
      },
    });
  } catch (error: any) {
    const message = error?.message || "Nao foi possivel gerar o Playbook diario.";
    const status = message === "Unauthorized" ? 401 : message === "TenantNotFound" ? 404 : 500;
    return NextResponse.json({ error: message === "Unauthorized" ? "Nao autenticado." : message }, { status });
  }
}
