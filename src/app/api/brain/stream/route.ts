import { NextResponse } from "next/server";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";
import { isBrainExecutiveRole } from "@/lib/brain/roles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STREAM_DURATION_MS = 45_000;
const STREAM_POLL_MS = 5_000;

function createStreamCancellation() {
  let cancelled = false;
  let unblockWait: (() => void) | null = null;

  return {
    isCancelled() {
      return cancelled;
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      unblockWait?.();
    },
    wait(ms: number) {
      if (cancelled) return Promise.resolve();

      let currentUnblock: (() => void) | null = null;

      return new Promise<void>((resolve) => {
        const timeoutId = setTimeout(resolve, ms);
        currentUnblock = () => {
          clearTimeout(timeoutId);
          resolve();
        };
        unblockWait = currentUnblock;
      }).finally(() => {
        if (unblockWait === currentUnblock) {
          unblockWait = null;
        }
      });
    },
  };
}

function encodeSse(event: string, data: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function readBrainStreamState(tenantId: string) {
  const [{ data: latestEvent }, { data: latestTask }, { data: latestStep }, { count: pendingApprovals }] = await Promise.all([
    brainAdminSupabase
      .from("learning_events")
      .select("id, task_id, step_id, event_type, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    brainAdminSupabase
      .from("brain_tasks")
      .select("id, updated_at, status")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    brainAdminSupabase
      .from("brain_steps")
      .select("id, task_id, title, status, updated_at")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    brainAdminSupabase
      .from("brain_approvals")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending"),
  ]);

  return {
    latest_event_id: latestEvent?.id || null,
    latest_event_type: latestEvent?.event_type || null,
    latest_event_task_id: latestEvent?.task_id || null,
    latest_event_step_id: latestEvent?.step_id || null,
    latest_event_at: latestEvent?.created_at || null,
    latest_task_id: latestTask?.id || null,
    latest_task_status: latestTask?.status || null,
    latest_task_at: latestTask?.updated_at || null,
    latest_step_id: latestStep?.id || null,
    latest_step_task_id: latestStep?.task_id || null,
    latest_step_title: latestStep?.title || null,
    latest_step_status: latestStep?.status || null,
    latest_step_at: latestStep?.updated_at || null,
    pending_approvals: pendingApprovals || 0,
  };
}

export async function GET() {
  try {
    const auth = await getBrainAuthContext();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!isBrainExecutiveRole(auth.context.userRole)) {
      return NextResponse.json({ error: "Acesso restrito ao nivel executivo." }, { status: 403 });
    }

    const encoder = new TextEncoder();
    const tenantId = auth.context.tenantId;

    const streamCancellation = createStreamCancellation();

    const stream = new ReadableStream({
      async start(controller) {
        let lastStateKey = "";
        const startedAt = Date.now();

        const enqueue = (event: string, data: Record<string, unknown>) => {
          if (streamCancellation.isCancelled()) return;
          controller.enqueue(encoder.encode(encodeSse(event, data)));
        };

        enqueue("ready", {
          ok: true,
          refresh_after_ms: STREAM_POLL_MS,
        });

        while (!streamCancellation.isCancelled() && Date.now() - startedAt < STREAM_DURATION_MS) {
          try {
            const state = await readBrainStreamState(tenantId);
            const stateKey = JSON.stringify(state);

            if (stateKey !== lastStateKey) {
              lastStateKey = stateKey;
              enqueue("brain_activity", {
                ...state,
                emitted_at: new Date().toISOString(),
              });
            } else {
              enqueue("heartbeat", {
                emitted_at: new Date().toISOString(),
              });
            }
          } catch (error) {
            enqueue("warning", {
              message: error instanceof Error ? error.message : "Falha ao observar atividade do cerebro.",
              emitted_at: new Date().toISOString(),
            });
          }

          await streamCancellation.wait(STREAM_POLL_MS);
        }

        if (streamCancellation.isCancelled()) return;

        enqueue("close", {
          reason: "stream_window_finished",
          emitted_at: new Date().toISOString(),
        });
        streamCancellation.cancel();
        controller.close();
      },
      cancel() {
        // O browser fechou a conexao; destrava o polling sem tentar escrever no stream fechado.
        streamCancellation.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[brain/stream] fatal", error);
    return NextResponse.json({ error: "Erro interno ao abrir stream do cerebro." }, { status: 500 });
  }
}
