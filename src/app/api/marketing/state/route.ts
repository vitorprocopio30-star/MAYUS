import { NextResponse } from "next/server";

import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { emptyMarketingProfile, type MarketingState } from "@/lib/marketing/local-persistence";

type TenantSettingsRecord = {
  ai_features: Record<string, any> | null;
};

function normalizeMarketingState(value: any): MarketingState {
  return {
    profile: { ...emptyMarketingProfile(), ...(value?.profile && typeof value.profile === "object" ? value.profile : {}) },
    references: Array.isArray(value?.references) ? value.references : [],
    calendar: Array.isArray(value?.calendar) ? value.calendar : [],
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : null,
  };
}

async function readTenantAiFeatures(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("tenant_settings")
    .select("ai_features")
    .eq("tenant_id", tenantId)
    .maybeSingle<TenantSettingsRecord>();

  if (error) throw error;
  return data?.ai_features && typeof data.ai_features === "object" && !Array.isArray(data.ai_features)
    ? data.ai_features
    : {};
}

export async function GET() {
  try {
    const session = await getTenantSession();
    const aiFeatures = await readTenantAiFeatures(session.tenantId);

    return NextResponse.json({
      state: normalizeMarketingState(aiFeatures.marketing_os),
      source: aiFeatures.marketing_os ? "server" : "empty",
    });
  } catch (error: any) {
    const message = error?.message || "Nao foi possivel carregar o estado de marketing.";
    const status = message === "Unauthorized" ? 401 : message === "TenantNotFound" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getTenantSession();
    const payload = await request.json().catch(() => null);
    const currentAiFeatures = await readTenantAiFeatures(session.tenantId);
    const currentState = normalizeMarketingState(currentAiFeatures.marketing_os);

    const nextState: MarketingState = {
      profile: payload?.profile ? normalizeMarketingState({ profile: payload.profile }).profile : currentState.profile,
      references: Array.isArray(payload?.references) ? payload.references : currentState.references,
      calendar: Array.isArray(payload?.calendar) ? payload.calendar : currentState.calendar,
      updatedAt: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("tenant_settings")
      .upsert({
        tenant_id: session.tenantId,
        ai_features: {
          ...currentAiFeatures,
          marketing_os: nextState,
        },
      }, { onConflict: "tenant_id" });

    if (error) throw error;

    return NextResponse.json({ state: nextState, source: "server" });
  } catch (error: any) {
    const message = error?.message || "Nao foi possivel salvar o estado de marketing.";
    const status = message === "Unauthorized" ? 401 : message === "TenantNotFound" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
