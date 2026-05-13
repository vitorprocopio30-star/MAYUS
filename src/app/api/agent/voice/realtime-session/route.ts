import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getBrainAuthContext, brainAdminSupabase } from "@/lib/brain/server";
import { requireTenantApiKey } from "@/lib/integrations/server";
import {
  MAYUS_REALTIME_MODEL,
  MAYUS_REALTIME_TOOLS,
  buildMayusRealtimeInstructions,
  isMayusRealtimeModel,
  normalizeMayusRealtimeModel,
  normalizeMayusRealtimeVoice,
} from "@/lib/voice/realtime-persona";

export const dynamic = "force-dynamic";

const EXECUTIVE_ROLES = new Set(["admin", "administrador", "socio", "sócio", "mayus_admin"]);

function normalizeRole(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function safetyIdentifier(userId: string, tenantId: string) {
  return createHash("sha256")
    .update(`${tenantId}:${userId}`)
    .digest("hex");
}

async function loadRealtimeProfile(params: { userId: string; tenantId: string }) {
  const [profileResult, tenantResult] = await Promise.all([
    brainAdminSupabase
      .from("profiles")
      .select("full_name")
      .eq("id", params.userId)
      .maybeSingle(),
    brainAdminSupabase
      .from("tenants")
      .select("name")
      .eq("id", params.tenantId)
      .maybeSingle(),
  ]);

  return {
    userName: typeof profileResult.data?.full_name === "string" ? profileResult.data.full_name : null,
    officeName: typeof tenantResult.data?.name === "string" ? tenantResult.data.name : null,
  };
}

function extractClientSecret(data: Record<string, any>) {
  return typeof data.value === "string" && data.value
    ? data.value
    : typeof data.client_secret?.value === "string"
      ? data.client_secret.value
      : null;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getBrainAuthContext();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!EXECUTIVE_ROLES.has(normalizeRole(auth.context.userRole))) {
      return NextResponse.json({ error: "Acesso restrito ao nivel executivo." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const voice = normalizeMayusRealtimeVoice(body?.voice);
    const requestedModel = typeof body?.model === "string" ? body.model.trim() : "";
    if (requestedModel && !isMayusRealtimeModel(requestedModel)) {
      return NextResponse.json({ error: "Modelo Realtime nao permitido para o MAYUS." }, { status: 400 });
    }
    const model = requestedModel ? normalizeMayusRealtimeModel(requestedModel) : MAYUS_REALTIME_MODEL;

    const { apiKey } = await requireTenantApiKey(auth.context.tenantId, "openai");
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API Key nao configurada." }, { status: 400 });
    }

    const profile = await loadRealtimeProfile({
      userId: auth.context.userId,
      tenantId: auth.context.tenantId,
    });

    const sessionConfig = {
      session: {
        type: "realtime",
        model,
        instructions: buildMayusRealtimeInstructions({
          userName: profile.userName,
          officeName: profile.officeName,
          selectedVoice: voice,
        }),
        reasoning: {
          effort: "low",
        },
        audio: {
          input: {
            transcription: {
              model: "gpt-4o-mini-transcribe",
              language: "pt",
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 650,
            },
          },
          output: {
            voice,
          },
        },
        tools: MAYUS_REALTIME_TOOLS,
        tool_choice: "auto",
      },
    };

    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier(auth.context.userId, auth.context.tenantId),
      },
      body: JSON.stringify(sessionConfig),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[voice/realtime-session] OpenAI rejected realtime session", {
        status: response.status,
        error: data?.error?.message || data?.error || "unknown",
      });
      return NextResponse.json({ error: "Falha ao criar sessao segura do Realtime." }, { status: 502 });
    }

    const clientSecret = extractClientSecret(data);
    if (!clientSecret) {
      return NextResponse.json({ error: "Sessao Realtime criada sem segredo efemero." }, { status: 502 });
    }

    return NextResponse.json({
      client_secret: clientSecret,
      model,
      voice,
      expires_at: data?.expires_at || data?.client_secret?.expires_at || null,
    });
  } catch (error) {
    console.error("[voice/realtime-session] fatal", error);
    return NextResponse.json({ error: "Erro interno ao preparar Realtime." }, { status: 500 });
  }
}
