import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getTenantIntegrationResolved, upsertTenantIntegrationSecure } from "@/lib/integrations/server";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Helper to get Auth Client */
async function getAuthClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { }
        },
      },
    }
  );
}

/** Check Auth and Admin Role */
async function getAuthorizedUser() {
  const authClient = await getAuthClient();
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) throw new Error("Unauthorized");

  // TODO (Backlog): Substituir por userSupabase (com JWT do usuário) para respeitar estritamente o RLS
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "socio", "Sócio", "Administrador"].includes(profile.role)) {
    throw new Error("Forbidden");
  }

  return { userId: user.id, tenantId: profile.tenant_id, role: profile.role };
}

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await getAuthorizedUser();

    // Load Settings
    const { data: settings } = await adminSupabase
      .from("tenant_settings")
      .select("ai_features")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const voice_provider = settings?.ai_features?.voice_provider || "openai";
    const openai_voice = settings?.ai_features?.openai_voice || "nova";

    // Load Integration (Sem retornar API Key)
    const { data: integration } = await adminSupabase
      .from("tenant_integrations")
      .select("id, status, instance_name, metadata")
      .eq("tenant_id", tenantId)
      .eq("provider", "elevenlabs")
      .maybeSingle();

    return NextResponse.json({
      voice_provider,
      openai_voice,
      elevenlabs_configured: integration?.status === "connected",
      elevenlabs_voice_id: integration?.instance_name || "",
      elevenlabs_agent_id: integration?.metadata?.agent_id || "",
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
    return NextResponse.json({ error: "Erro ao carregar configurações de voz" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await getAuthorizedUser();
    const { provider, openai_voice, elevenlabs_api_key, elevenlabs_voice_id, elevenlabs_agent_id } = await req.json();

    // 1. Atualizar tenant_settings
    const { data: currentSettings } = await adminSupabase
      .from("tenant_settings")
      .select("ai_features")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const newFeatures = {
      ...(currentSettings?.ai_features || {}),
      voice_provider: provider,
      openai_voice: openai_voice
    };

    await adminSupabase.from("tenant_settings").upsert({
      tenant_id: tenantId,
      ai_features: newFeatures
    }, { onConflict: "tenant_id" });

    // 2. Atualizar ElevenLabs Integration
    // Buscamos se já existe para decidir entre insert ou update (ou usar um upsert direto se preferir)
    const existingIntegration = await getTenantIntegrationResolved(tenantId, "elevenlabs");

    const integrationPayload: any = {
      provider: "elevenlabs",
      instanceName: elevenlabs_voice_id,
      metadata: {
        ...(existingIntegration?.metadata || {}),
        agent_id: elevenlabs_agent_id,
      },
      status: "connected"
    };

    // Apenas atualizamos a API Key se ela foi enviada e não é a máscara
    if (elevenlabs_api_key !== undefined && elevenlabs_api_key !== null && !elevenlabs_api_key.includes("****")) {
      if (elevenlabs_api_key.trim() === "") {
        integrationPayload.clearApiKey = true;
        integrationPayload.status = "disconnected";
      } else {
        integrationPayload.apiKey = elevenlabs_api_key;
        integrationPayload.status = "connected";
      }
    } else {
      // Se não enviou chave nova, mas o registro não existe, garantimos que o status reflita a falta da chave
      if (!existingIntegration || !existingIntegration.api_key) {
        integrationPayload.status = "disconnected";
      }
    }

    await upsertTenantIntegrationSecure({
      tenantId,
      ...integrationPayload,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
    return NextResponse.json({ error: "Erro ao salvar configurações de voz" }, { status: 500 });
  }
}
