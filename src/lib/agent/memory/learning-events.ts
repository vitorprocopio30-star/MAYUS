import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeMemoryText } from "@/lib/agent/memory/promotion";

type LearningEventClient = Pick<SupabaseClient, "from"> | { from: (table: string) => any };

export type RecordLearningEventInput = {
  supabase: LearningEventClient;
  tenantId: string;
  eventType: string;
  sourceModule: string;
  payload?: Record<string, unknown>;
  createdBy?: string | null;
  taskId?: string | null;
  runId?: string | null;
  stepId?: string | null;
};

export type RecordLearningEventResult = {
  ok: boolean;
  error?: string;
};

function sanitizePayloadValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeMemoryText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(sanitizePayloadValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        sanitizeMemoryText(key).slice(0, 120),
        sanitizePayloadValue(item),
      ]),
    );
  }
  return sanitizeMemoryText(String(value));
}

export function sanitizeLearningEventPayload(payload?: Record<string, unknown>): Record<string, unknown> {
  return sanitizePayloadValue(payload || {}) as Record<string, unknown>;
}

export async function recordLearningEvent(input: RecordLearningEventInput): Promise<RecordLearningEventResult> {
  try {
    if (!input.tenantId || !input.eventType || !input.sourceModule) {
      return { ok: false, error: "missing_required_learning_event_fields" };
    }

    const query = input.supabase.from("learning_events");
    if (typeof query?.insert !== "function") {
      return { ok: false, error: "learning_events_insert_unavailable" };
    }

    const { error } = await query.insert({
      tenant_id: input.tenantId,
      task_id: input.taskId || null,
      run_id: input.runId || null,
      step_id: input.stepId || null,
      event_type: sanitizeMemoryText(input.eventType).slice(0, 120),
      source_module: sanitizeMemoryText(input.sourceModule).slice(0, 120),
      payload: sanitizeLearningEventPayload(input.payload),
      created_by: input.createdBy || null,
    });

    if (error) {
      const message = sanitizeMemoryText(error.message || "learning_event_insert_failed");
      console.warn("[recordLearningEvent]", message);
      return { ok: false, error: message };
    }

    return { ok: true };
  } catch (error) {
    const message = sanitizeMemoryText(error instanceof Error ? error.message : String(error));
    console.warn("[recordLearningEvent]", message);
    return { ok: false, error: message };
  }
}
