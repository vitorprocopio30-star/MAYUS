import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildAgendaPayloadFromProcessPrazo,
  syncAgendaTaskBySource,
} from "@/lib/agenda/userTasks";

export const dynamic = "force-dynamic";

const PRAZO_TYPES = ["sessao", "pericia", "audiencia", "citacao", "sentenca", "recurso", "prazo"];

function normalizePrazoIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  )).slice(0, 200);
}

function normalizeStatus(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function authenticate(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: NextResponse.json({ error: "Nao autenticado." }, { status: 401 }) };

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Nao autenticado." }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("tenant_id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile?.tenant_id) {
    return { error: NextResponse.json({ error: "Tenant nao encontrado." }, { status: 403 }) };
  }

  return {
    user,
    tenantId: String(profile.tenant_id),
    actorName: String(profile.full_name || ""),
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const prazoIds = normalizePrazoIds(body?.prazoIds);

    let query = supabaseAdmin
      .from("process_prazos")
      .select(`
        *,
        monitored_processes(
          numero_processo,
          partes,
          tribunal,
          comarca,
          vara,
          assunto,
          classe_processual,
          tipo_acao,
          fase_atual,
          data_ultima_movimentacao,
          ultima_movimentacao_texto,
          resumo_curto,
          cliente_nome,
          escavador_monitoramento_id
        ),
        profiles:responsavel_id(id, full_name)
      `)
      .eq("tenant_id", auth.tenantId)
      .in("tipo", PRAZO_TYPES)
      .not("descricao", "ilike", "%Despacho%");

    if (prazoIds.length > 0) {
      query = query.in("id", prazoIds);
    }

    const { data: prazos, error: prazosError } = await query.order("data_vencimento", { ascending: true });
    if (prazosError) throw prazosError;

    const { data: team } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("tenant_id", auth.tenantId)
      .eq("is_active", true);

    const teamById = new Map((team || []).map((profile: any) => [String(profile.id), String(profile.full_name || "")]));
    const executed: Array<{ prazo_id: string; agenda_task_id: string | null; title: string; assigned_name: string | null }> = [];
    const skipped: Array<{ prazo_id: string; reason: string }> = [];
    const failed: Array<{ prazo_id: string; reason: string }> = [];

    for (const prazo of prazos || []) {
      const prazoId = String((prazo as any)?.id || "");
      if (!prazoId) continue;

      if (normalizeStatus((prazo as any)?.status) === "concluido") {
        skipped.push({ prazo_id: prazoId, reason: "prazo_concluido" });
        continue;
      }

      try {
        const responsavelId = (prazo as any)?.responsavel_id ? String((prazo as any).responsavel_id) : null;
        const assignedName = (prazo as any)?.profiles?.full_name
          || (responsavelId ? teamById.get(responsavelId) : null)
          || null;

        const agendaTaskId = await syncAgendaTaskBySource(
          supabaseAdmin,
          buildAgendaPayloadFromProcessPrazo({
            tenantId: auth.tenantId,
            prazo,
            assignedName,
            createdBy: auth.user.id,
            createdByAgent: "prazos_execute_button",
          })
        );

        executed.push({
          prazo_id: prazoId,
          agenda_task_id: agendaTaskId,
          title: String((prazo as any)?.descricao || "Prazo processual"),
          assigned_name: assignedName,
        });
      } catch (error) {
        failed.push({
          prazo_id: prazoId,
          reason: error instanceof Error ? error.message : "agenda_sync_failed",
        });
      }
    }

    await supabaseAdmin.from("system_event_logs").insert({
      tenant_id: auth.tenantId,
      user_id: auth.user.id,
      event_name: "prazos_execute_agenda",
      source: "prazos_execute_button",
      status: failed.length > 0 ? "partial" : "completed",
      payload: {
        requested_prazo_ids: prazoIds.length,
        prazos_found: (prazos || []).length,
        executed_count: executed.length,
        skipped_count: skipped.length,
        failed_count: failed.length,
      },
    });

    return NextResponse.json({
      success: failed.length === 0,
      executed_count: executed.length,
      skipped_count: skipped.length,
      failed_count: failed.length,
      total_found: (prazos || []).length,
      executed,
      skipped,
      failed,
    });
  } catch (error) {
    console.error("[prazos/executar-agenda] fatal", error);
    return NextResponse.json({ error: "Erro interno ao executar prazos na agenda." }, { status: 500 });
  }
}
