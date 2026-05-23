import { describe, expect, it, vi } from "vitest";
import { cancelBrainStep, retryBrainStep } from "./step-control";

type QueryConfig = {
  maybeSingleResult?: { data: any; error: any };
  singleResult?: { data: any; error: any };
};

function makeQuery(table: string, ops: Array<Record<string, unknown>>, config: QueryConfig = {}) {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.update = vi.fn((payload) => {
    ops.push({ table, op: "update", payload });
    return query;
  });
  query.insert = vi.fn((payload) => {
    ops.push({ table, op: "insert", payload });
    return query;
  });
  query.maybeSingle = vi.fn(async () => config.maybeSingleResult ?? { data: null, error: null });
  query.single = vi.fn(async () => config.singleResult ?? { data: null, error: null });
  return query;
}

function makeClient(queries: Record<string, any[]>) {
  const ops: Array<Record<string, unknown>> = [];
  const client = {
    from: vi.fn((table: string) => {
      const next = queries[table]?.shift();
      if (next) return next;
      return makeQuery(table, ops);
    }),
  };
  return { client, ops };
}

const task = {
  id: "task-1",
  tenant_id: "tenant-1",
  module: "legal_ops",
  title: "Missao processual",
};

const failedStep = {
  id: "step-1",
  task_id: "task-1",
  run_id: "run-1",
  tenant_id: "tenant-1",
  order_index: 2,
  step_key: "legal_step",
  title: "Gerar memoria documental",
  step_type: "capability",
  capability_name: "legal_document_memory_refresh",
  handler_type: "lex_document_memory_refresh",
  approval_policy: "internal_only",
  status: "failed",
  input_payload: {
    process_task_id: "process-1",
    service_role_key: "super-secret",
  },
  output_payload: {
    note: "falha anterior",
  },
};

describe("Brain step control", () => {
  it("cancela step do tenant e registra learning event com ator e motivo sanitizado", async () => {
    const ops: Array<Record<string, unknown>> = [];
    const { client } = makeClient({
      brain_tasks: [makeQuery("brain_tasks", ops, { maybeSingleResult: { data: task, error: null } })],
      brain_steps: [
        makeQuery("brain_steps", ops, { maybeSingleResult: { data: failedStep, error: null } }),
        makeQuery("brain_steps", ops),
      ],
      learning_events: [makeQuery("learning_events", ops)],
    });

    const result = await cancelBrainStep({
      client,
      tenantId: "tenant-1",
      actorId: "user-1",
      taskId: "task-1",
      stepId: "step-1",
      reason: "Falha validada. token=sk-secret-value",
      now: "2026-05-21T15:00:00.000Z",
    });

    expect(result.status).toBe("cancelled");
    const update = ops.find((item) => item.table === "brain_steps" && item.op === "update")?.payload as any;
    expect(update).toEqual(expect.objectContaining({
      status: "cancelled",
      completed_at: "2026-05-21T15:00:00.000Z",
    }));
    expect(update.output_payload).toEqual(expect.objectContaining({
      cancelled_by: "user-1",
      reason: "Falha validada. [redacted]",
      cancel_reason: "Falha validada. [redacted]",
      previous_status: "failed",
    }));

    const event = ops.find((item) => item.table === "learning_events" && item.op === "insert")?.payload as any;
    expect(event).toEqual(expect.objectContaining({
      tenant_id: "tenant-1",
      task_id: "task-1",
      run_id: "run-1",
      step_id: "step-1",
      event_type: "brain_step_cancelled",
      source_module: "legal_ops",
      created_by: "user-1",
    }));
    expect(JSON.stringify(event)).not.toContain("sk-secret-value");
  });

  it("reabre step criando novo queued sem alterar o original", async () => {
    const ops: Array<Record<string, unknown>> = [];
    const { client } = makeClient({
      brain_tasks: [makeQuery("brain_tasks", ops, { maybeSingleResult: { data: task, error: null } })],
      brain_steps: [
        makeQuery("brain_steps", ops, { maybeSingleResult: { data: failedStep, error: null } }),
        makeQuery("brain_steps", ops, { maybeSingleResult: { data: { order_index: 4 }, error: null } }),
        makeQuery("brain_steps", ops, { singleResult: { data: { id: "step-retry-1" }, error: null } }),
      ],
      learning_events: [makeQuery("learning_events", ops)],
    });

    const result = await retryBrainStep({
      client,
      tenantId: "tenant-1",
      actorId: "user-1",
      taskId: "task-1",
      stepId: "step-1",
      reason: "Reabrir apos revisar logs",
      now: "2026-05-21T15:10:00.000Z",
    });

    expect(result).toEqual(expect.objectContaining({
      status: "retry_queued",
      retryStepId: "step-retry-1",
    }));
    expect(ops.some((item) => item.table === "brain_steps" && item.op === "update")).toBe(false);

    const retryInsert = ops.find((item) => item.table === "brain_steps" && item.op === "insert")?.payload as any;
    expect(retryInsert).toEqual(expect.objectContaining({
      tenant_id: "tenant-1",
      task_id: "task-1",
      run_id: "run-1",
      order_index: 5,
      capability_name: "legal_document_memory_refresh",
      handler_type: "lex_document_memory_refresh",
      approval_policy: "internal_only",
      status: "queued",
    }));
    expect(retryInsert.input_payload).toEqual(expect.objectContaining({
      process_task_id: "process-1",
      retry_of_step_id: "step-1",
      retry_reason: "Reabrir apos revisar logs",
      retry_requested_by: "user-1",
      previous_status: "failed",
    }));
    expect(retryInsert.input_payload.service_role_key).toBe("[redacted]");

    const event = ops.find((item) => item.table === "learning_events" && item.op === "insert")?.payload as any;
    expect(event.event_type).toBe("brain_step_retry_requested");
    expect(event.payload).toEqual(expect.objectContaining({
      retry_step_id: "step-retry-1",
      actor_id: "user-1",
      control_action: "retry",
    }));
  });
});
