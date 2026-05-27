import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function clampLimit(value: string | null) {
  const parsed = Number(value || 1000);
  if (!Number.isFinite(parsed)) return 1000;
  return Math.max(50, Math.min(2000, Math.trunc(parsed)));
}

function maxIso(values: Array<string | null | undefined>) {
  let current: string | null = null;
  let currentTime = 0;

  for (const value of values) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    const time = new Date(raw).getTime();
    if (!Number.isFinite(time) || time <= currentTime) continue;
    current = raw;
    currentTime = time;
  }

  return current;
}

async function countQueue(tenantId: string, status: string) {
  const { count, error } = await supabaseAdmin
    .from("process_update_queue")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", status);

  if (error) return null;
  return count ?? 0;
}

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await getTenantSession();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }

  const limit = clampLimit(req.nextUrl.searchParams.get("limit"));
  const tenantId = session.tenantId;

  const [
    movimentacoesRes,
    inboxRes,
    contextosRes,
    pendingCount,
    processingCount,
    errorCount,
    latestQueueRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("process_movimentacoes")
      .select("id, numero_cnj, data, conteudo, fonte, created_at, escavador_movimentacao_id, tipo_evento")
      .eq("tenant_id", tenantId)
      .order("data", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(limit),
    supabaseAdmin
      .from("process_movimentacoes_inbox")
      .select("id, numero_cnj, oab_estado, oab_numero, latest_data, latest_conteudo, latest_fonte, latest_created_at, quantidade_eventos, movimentacoes, payload_ultimo_evento, monitorado")
      .eq("tenant_id", tenantId)
      .order("latest_data", { ascending: false, nullsFirst: false })
      .order("latest_created_at", { ascending: false, nullsFirst: false })
      .limit(limit),
    supabaseAdmin
      .from("monitored_processes")
      .select("numero_processo, partes, tribunal, comarca, vara, assunto, classe_processual, tipo_acao, fase_atual, data_ultima_movimentacao, ultima_movimentacao_texto, resumo_curto, cliente_nome, escavador_monitoramento_id")
      .eq("tenant_id", tenantId),
    countQueue(tenantId, "PENDENTE"),
    countQueue(tenantId, "PROCESSANDO"),
    countQueue(tenantId, "ERRO"),
    supabaseAdmin
      .from("process_update_queue")
      .select("id, numero_cnj, status, processed_at, created_at")
      .eq("tenant_id", tenantId)
      .not("processed_at", "is", null)
      .order("processed_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (movimentacoesRes.error) {
    return NextResponse.json({ error: "Falha ao carregar movimentacoes.", detail: movimentacoesRes.error.message }, { status: 500 });
  }

  if (inboxRes.error) {
    return NextResponse.json({ error: "Falha ao carregar inbox de movimentacoes.", detail: inboxRes.error.message }, { status: 500 });
  }

  if (contextosRes.error) {
    return NextResponse.json({ error: "Falha ao carregar processos monitorados.", detail: contextosRes.error.message }, { status: 500 });
  }

  const movementRecords = movimentacoesRes.data || [];
  const movementInboxRecords = inboxRes.data || [];
  const latestMovement = movementRecords[0] || null;
  const latestInbox = movementInboxRecords[0] || null;
  const latestReceivedAt = maxIso([
    latestMovement?.created_at,
    latestMovement?.data,
    latestInbox?.latest_created_at,
    latestInbox?.latest_data,
  ]);

  return NextResponse.json({
    movementRecords,
    movementInboxRecords,
    monitoredContexts: contextosRes.data || [],
    health: {
      latestMovementDate: latestMovement?.data || null,
      latestMovementCreatedAt: latestMovement?.created_at || null,
      latestMovementProcess: latestMovement?.numero_cnj || null,
      latestInboxDate: latestInbox?.latest_data || null,
      latestInboxCreatedAt: latestInbox?.latest_created_at || null,
      latestReceivedAt,
      queue: {
        pending: pendingCount,
        processing: processingCount,
        error: errorCount,
        lastProcessedAt: latestQueueRes.data?.processed_at || null,
        lastProcessedProcess: latestQueueRes.data?.numero_cnj || null,
      },
    },
  });
}
