import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import {
  buildCallCommercialAnalysis,
  buildCallCommercialAnalysisArtifactMetadata,
  buildCallCommercialAnalysisSystemEventPayload,
  registerCallCommercialAnalysisBrainArtifact,
} from "@/lib/growth/call-commercial-analysis";
import { supabaseAdmin } from "@/lib/supabase/admin";

const CallAnalysisSchema = z.object({
  crmTaskId: z.string().trim().min(1).max(128).optional().nullable(),
  leadName: z.string().optional().nullable(),
  legalArea: z.string().optional().nullable(),
  transcript: z.string().max(60000).optional().nullable(),
  notes: z.string().max(20000).optional().nullable(),
  currentStage: z.string().optional().nullable(),
  currentScore: z.union([z.number(), z.string()]).optional().nullable(),
}).refine((data) => Boolean(String(data.transcript || data.notes || "").trim()), {
  message: "Envie transcript ou notes em texto para a analise MVP.",
  path: ["transcript"],
});

export async function POST(request: NextRequest) {
  try {
    let session: Awaited<ReturnType<typeof getTenantSession>>;
    try {
      session = await getTenantSession();
    } catch {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = CallAnalysisSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos.", details: parsed.error.flatten().fieldErrors }, { status: 422 });
    }

    const analysis = buildCallCommercialAnalysis(parsed.data);
    const metadata = buildCallCommercialAnalysisArtifactMetadata({
      crmTaskId: parsed.data.crmTaskId,
      analysis,
    });
    let persistence: "not_requested" | "brain_artifact_and_system_event_logs" | "system_event_logs_event_only" | "brain_artifact_only" | "failed" = "not_requested";
    let brainTrace: Awaited<ReturnType<typeof registerCallCommercialAnalysisBrainArtifact>> = null;
    let eventPersisted = false;

    if (parsed.data.crmTaskId) {
      const { error: eventError } = await supabaseAdmin.from("system_event_logs").insert({
        tenant_id: session.tenantId,
        user_id: session.userId,
        source: "growth",
        provider: "mayus",
        event_name: "call_analysis_prepared",
        status: "ok",
        payload: buildCallCommercialAnalysisSystemEventPayload({
          crmTaskId: parsed.data.crmTaskId,
          analysis,
        }),
        created_at: new Date().toISOString(),
      });

      if (eventError) {
        console.error("[growth][call-analysis][event]", eventError.message);
        persistence = "failed";
      } else {
        eventPersisted = true;
        persistence = "system_event_logs_event_only";
      }

      brainTrace = await registerCallCommercialAnalysisBrainArtifact({
        tenantId: session.tenantId,
        userId: session.userId,
        crmTaskId: parsed.data.crmTaskId,
        analysis,
        supabase: supabaseAdmin,
      });

      if (brainTrace) {
        persistence = eventPersisted ? "brain_artifact_and_system_event_logs" : "brain_artifact_only";
      } else if (eventPersisted) {
        persistence = "system_event_logs_event_only";
      }
    }

    return NextResponse.json({
      success: true,
      mode: "MVP upload/analysis - text transcript/notes only",
      analysis,
      metadata: { ...metadata, persistence, brain_trace: brainTrace },
    });
  } catch (error: any) {
    console.error("[growth][call-analysis]", error);
    return NextResponse.json({ error: error?.message || "Nao foi possivel analisar a call." }, { status: 500 });
  }
}
