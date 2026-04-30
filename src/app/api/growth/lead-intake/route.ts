import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  analyzeLeadIntake,
  buildCrmTaskPayload,
  buildLeadIntakeEventPayload,
  registerReferralIntakeBrainArtifact,
} from "@/lib/growth/lead-intake";

const LeadIntakeSchema = z.object({
  name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  origin: z.string().optional().nullable(),
  channel: z.string().optional().nullable(),
  campaign: z.string().optional().nullable(),
  contentId: z.string().optional().nullable(),
  contentTitle: z.string().optional().nullable(),
  landingPage: z.string().optional().nullable(),
  referrer: z.string().optional().nullable(),
  utmSource: z.string().optional().nullable(),
  utmMedium: z.string().optional().nullable(),
  utmCampaign: z.string().optional().nullable(),
  utmTerm: z.string().optional().nullable(),
  utmContent: z.string().optional().nullable(),
  utm_source: z.string().optional().nullable(),
  utm_medium: z.string().optional().nullable(),
  utm_campaign: z.string().optional().nullable(),
  utm_term: z.string().optional().nullable(),
  utm_content: z.string().optional().nullable(),
  content_id: z.string().optional().nullable(),
  content_title: z.string().optional().nullable(),
  landing_page: z.string().optional().nullable(),
  legalArea: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  urgency: z.string().optional().nullable(),
  pain: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  referredBy: z.string().optional().nullable(),
  referralRelationship: z.string().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
});

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {}
        },
      },
    }
  );

  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) return null;
  return user;
}

async function getOrCreateDefaultPipeline(tenantId: string) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("crm_pipelines")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return existing.id as string;

  const { data: pipeline, error: pipelineError } = await supabaseAdmin
    .from("crm_pipelines")
    .insert({
      tenant_id: tenantId,
      name: "Comercial",
    })
    .select("id")
    .single();

  if (pipelineError) throw pipelineError;

  await supabaseAdmin.from("crm_stages").insert([
    { pipeline_id: pipeline.id, name: "Novo Lead", color: "#3b82f6", order_index: 0 },
    { pipeline_id: pipeline.id, name: "Qualificacao", color: "#fbbf24", order_index: 1 },
    { pipeline_id: pipeline.id, name: "Fechado", color: "#10b981", order_index: 2, is_win: true },
    { pipeline_id: pipeline.id, name: "Perdido", color: "#ef4444", order_index: 3, is_loss: true },
  ]);

  return pipeline.id as string;
}

async function getDefaultStageId(pipelineId: string) {
  const { data, error } = await supabaseAdmin
    .from("crm_stages")
    .select("id, name, order_index")
    .eq("pipeline_id", pipelineId)
    .order("order_index", { ascending: true });

  if (error) throw error;

  const novoLead = data?.find((stage) => String(stage.name || "").toLowerCase().includes("lead"));
  const first = novoLead || data?.[0];

  if (!first?.id) {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("crm_stages")
      .insert({ pipeline_id: pipelineId, name: "Novo Lead", color: "#3b82f6", order_index: 0 })
      .select("id")
      .single();

    if (insertError) throw insertError;
    return inserted.id as string;
  }

  return first.id as string;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = LeadIntakeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos.", details: parsed.error.flatten().fieldErrors }, { status: 422 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile?.tenant_id) {
      return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
    }

    const leadInput = {
      ...parsed.data,
      utmSource: parsed.data.utmSource || parsed.data.utm_source,
      utmMedium: parsed.data.utmMedium || parsed.data.utm_medium,
      utmCampaign: parsed.data.utmCampaign || parsed.data.utm_campaign,
      utmTerm: parsed.data.utmTerm || parsed.data.utm_term,
      utmContent: parsed.data.utmContent || parsed.data.utm_content,
      contentId: parsed.data.contentId || parsed.data.content_id,
      contentTitle: parsed.data.contentTitle || parsed.data.content_title,
      landingPage: parsed.data.landingPage || parsed.data.landing_page,
    };

    const result = analyzeLeadIntake(leadInput);
    const pipelineId = await getOrCreateDefaultPipeline(profile.tenant_id);
    const stageId = await getDefaultStageId(pipelineId);
    const payload = buildCrmTaskPayload({
      tenantId: profile.tenant_id,
      pipelineId,
      stageId,
      result,
      assignedTo: parsed.data.assignedTo || null,
    });

    const { data: task, error: taskError } = await supabaseAdmin
      .from("crm_tasks")
      .insert(payload)
      .select("*")
      .single();

    if (taskError) throw taskError;

    const eventPayload = buildLeadIntakeEventPayload({
      crmTaskId: task.id,
      result,
    });

    const { error: eventError } = await supabaseAdmin.from("system_event_logs").insert({
      tenant_id: profile.tenant_id,
      user_id: user.id,
      source: "growth",
      provider: "mayus",
      event_name: result.kind === "referral" ? "referral_intake_created" : "lead_intake_created",
      status: "ok",
      payload: eventPayload,
      created_at: new Date().toISOString(),
    });

    if (eventError) {
      console.error("[growth][lead-intake][event]", eventError.message);
    }

    const brainTrace = await registerReferralIntakeBrainArtifact({
      tenantId: profile.tenant_id,
      userId: user.id,
      crmTaskId: task.id,
      result,
      supabase: supabaseAdmin,
    });

    return NextResponse.json({
      success: true,
      task,
      brainTrace,
      analysis: {
        kind: result.kind,
        score: result.score,
        scoreReason: result.scoreReason,
        tags: result.tags,
        nextStep: result.nextStep,
        needsHumanHandoff: result.needsHumanHandoff,
      },
    });
  } catch (error: any) {
    console.error("[growth][lead-intake]", error);
    return NextResponse.json({ error: error?.message || "Nao foi possivel registrar o lead." }, { status: 500 });
  }
}
