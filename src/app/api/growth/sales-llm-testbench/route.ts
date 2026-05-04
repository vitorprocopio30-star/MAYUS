import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  SALES_LLM_TESTBENCH_MODELS,
  SALES_LLM_TEST_FIXTURES,
} from "@/lib/growth/sales-llm-reply";
import { runSalesLlmTestbench } from "@/lib/growth/sales-llm-testbench";

export const dynamic = "force-dynamic";

const RunSchema = z.object({
  models: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
  fixture_ids: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  persist: z.boolean().optional(),
});

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno.";

  if (message === "Unauthorized") {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  if (message === "Forbidden") {
    return NextResponse.json({ error: "Sem permissao para rodar a bancada LLM." }, { status: 403 });
  }

  if (message === "TenantNotFound") {
    return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
  }

  console.error("[growth][sales-llm-testbench]", error);
  return NextResponse.json({ error: message || "Nao foi possivel rodar a bancada LLM." }, { status: 500 });
}

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function normalizeSalesProfile(features: Record<string, any>) {
  const profile = features.sales_consultation_profile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;

  return {
    idealClient: cleanText(profile.ideal_client),
    coreSolution: cleanText(profile.core_solution),
    uniqueValueProposition: cleanText(profile.unique_value_proposition),
    valuePillars: Array.isArray(profile.value_pillars)
      ? profile.value_pillars.map((item: unknown) => cleanText(String(item))).filter((item): item is string => Boolean(item))
      : [],
    positioningSummary: cleanText(profile.positioning_summary),
  };
}

function normalizeAutonomyMode(features: Record<string, any>) {
  const whatsappAgent = features.whatsapp_agent;
  if (!whatsappAgent || typeof whatsappAgent !== "object" || Array.isArray(whatsappAgent)) {
    return "auto_respond";
  }

  return cleanText(whatsappAgent.autonomy_mode) || "auto_respond";
}

function chooseModels(inputModels?: string[]) {
  const allowed = new Set<string>(SALES_LLM_TESTBENCH_MODELS);
  const models = Array.isArray(inputModels) && inputModels.length
    ? inputModels.filter((model) => allowed.has(model as any))
    : [...SALES_LLM_TESTBENCH_MODELS];

  return Array.from(new Set(models));
}

function chooseFixtures(inputIds?: string[]) {
  if (!Array.isArray(inputIds) || !inputIds.length) return SALES_LLM_TEST_FIXTURES;
  const allowed = new Set(inputIds);
  return SALES_LLM_TEST_FIXTURES.filter((fixture) => allowed.has(fixture.id));
}

export async function GET() {
  try {
    const session = await getTenantSession({ requireFullAccess: true });
    const { data, error } = await supabaseAdmin
      .from("brain_artifacts")
      .select("id,title,metadata,created_at")
      .eq("tenant_id", session.tenantId)
      .eq("artifact_type", "sales_llm_testbench_report")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      reports: (data || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        created_at: item.created_at,
        summary: item.metadata?.summary || null,
        recommended_default_model: item.metadata?.recommended_default_model || null,
        best_average_score: item.metadata?.best_average_score || null,
        model_summaries: item.metadata?.model_summaries || [],
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getTenantSession({ requireFullAccess: true });
    const body = await request.json().catch(() => ({}));
    const parsed = RunSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos.", details: parsed.error.flatten().fieldErrors }, { status: 422 });
    }

    const models = chooseModels(parsed.data.models);
    const fixtures = chooseFixtures(parsed.data.fixture_ids);

    if (!models.length) {
      return NextResponse.json({ error: "Nenhum modelo valido informado para a bancada." }, { status: 422 });
    }

    if (!fixtures.length) {
      return NextResponse.json({ error: "Nenhuma fixture valida informada para a bancada." }, { status: 422 });
    }

    const { data: settings } = await supabaseAdmin
      .from("tenant_settings")
      .select("ai_features")
      .eq("tenant_id", session.tenantId)
      .maybeSingle();
    const features = settings?.ai_features && typeof settings.ai_features === "object"
      ? settings.ai_features as Record<string, any>
      : {};

    const report = await runSalesLlmTestbench({
      supabase: supabaseAdmin,
      tenantId: session.tenantId,
      userId: session.userId,
      models,
      fixtures,
      salesProfile: normalizeSalesProfile(features),
      autonomyMode: normalizeAutonomyMode(features),
      persist: parsed.data.persist !== false,
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
