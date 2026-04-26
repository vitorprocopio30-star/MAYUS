import { brainAdminSupabase } from "@/lib/brain/server";

export interface CreateBrainArtifactInput {
  tenantId: string;
  taskId: string;
  runId?: string | null;
  stepId?: string | null;
  artifactType: string;
  title?: string | null;
  sourceModule?: string | null;
  storageUrl?: string | null;
  mimeType?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
}

function normalizeMetadata(metadata: Record<string, unknown> | undefined, dedupeKey: string | null | undefined) {
  return {
    ...(metadata || {}),
    ...(dedupeKey ? { dedupe_key: dedupeKey } : {}),
  };
}

export async function createBrainArtifact(input: CreateBrainArtifactInput) {
  const metadata = normalizeMetadata(input.metadata, input.dedupeKey);

  if (input.dedupeKey) {
    const { data: existing, error: existingError } = await brainAdminSupabase
      .from("brain_artifacts")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("task_id", input.taskId)
      .eq("artifact_type", input.artifactType)
      .eq("metadata->>dedupe_key", input.dedupeKey)
      .maybeSingle();

    if (existingError) {
      console.error("[brain/artifacts] dedupe lookup", existingError.message);
    }

    if (existing?.id) {
      return existing;
    }
  }

  const { data, error } = await brainAdminSupabase
    .from("brain_artifacts")
    .insert({
      tenant_id: input.tenantId,
      task_id: input.taskId,
      run_id: input.runId || null,
      step_id: input.stepId || null,
      artifact_type: input.artifactType,
      title: input.title || null,
      storage_url: input.storageUrl || null,
      mime_type: input.mimeType || null,
      source_module: input.sourceModule || null,
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[brain/artifacts] insert", error.message);
    throw error;
  }

  return data;
}
