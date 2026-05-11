import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildAgendaPayloadFromManualTask, syncAgendaTaskBySource } from "@/lib/agenda/userTasks";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";

export const dynamic = "force-dynamic";

const EXECUTIVE_ROLES = new Set(["admin", "administrador", "socio", "mayus_admin"]);

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeUrgency(value: unknown, text: string) {
  const normalized = normalize(value).toUpperCase();
  if (normalized === "URGENTE" || normalized === "ATENCAO" || normalized === "ROTINA") return normalized;
  const base = normalize(text);
  if (/(urgente|hoje|prazo fatal|audiencia|liminar|bloqueio)/.test(base)) return "URGENTE";
  if (/(amanha|atencao|follow|retorno|revisar)/.test(base)) return "ATENCAO";
  return "ROTINA";
}

function setBusinessHour(date: Date) {
  const copy = new Date(date);
  copy.setHours(9, 0, 0, 0);
  return copy;
}

function resolveScheduledFor(scheduledFor: unknown, dueText: unknown) {
  const direct = cleanString(scheduledFor);
  if (direct) {
    const parsed = new Date(direct);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const text = normalize(dueText);
  const now = new Date();
  const dateMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]) - 1;
    const yearRaw = dateMatch[3] ? Number(dateMatch[3]) : now.getFullYear();
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const parsed = setBusinessHour(new Date(year, month, day));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  if (/\bamanha\b/.test(text)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return setBusinessHour(tomorrow).toISOString();
  }

  if (/\bhoje\b/.test(text)) return now.toISOString();

  const weekdays: Record<string, number> = {
    domingo: 0,
    segunda: 1,
    terca: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sabado: 6,
  };
  const weekday = Object.entries(weekdays).find(([name]) => text.includes(name));
  if (weekday) {
    const target = weekday[1];
    const next = new Date(now);
    const diff = (target - now.getDay() + 7) % 7 || 7;
    next.setDate(now.getDate() + diff);
    return setBusinessHour(next).toISOString();
  }

  return now.toISOString();
}

function isSensitiveTask(body: Record<string, unknown>) {
  if (body.requires_external_action === true) return true;
  const text = normalize([
    body.title,
    body.description,
    body.due_text,
  ].filter(Boolean).join(" "));

  return /(enviar|mande|whatsapp|cliente|publicar|protocolar|protocolo|pagar|pagamento|cobrar|cobranca|zapsign|asaas|drive|mover documento|excluir|apagar)/.test(text);
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getBrainAuthContext();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!EXECUTIVE_ROLES.has(normalize(auth.context.userRole))) {
      return NextResponse.json({ error: "Acesso restrito ao nivel executivo." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = cleanString(body.title).slice(0, 180);
    if (!title) {
      return NextResponse.json({
        ok: false,
        error: "Para criar a tarefa eu preciso de um titulo curto.",
      }, { status: 400 });
    }

    const description = cleanString(body.description, "Tarefa criada por comando de voz no MAYUS Realtime.");
    const clientName = cleanString(body.client_name) || null;
    const processNumber = cleanString(body.process_number) || null;
    const scheduledFor = resolveScheduledFor(body.scheduled_for, body.due_text);
    const urgency = normalizeUrgency(body.urgency, `${title} ${description} ${body.due_text || ""}`);
    const sensitive = isSensitiveTask(body);

    const payload = buildAgendaPayloadFromManualTask({
      tenantId: auth.context.tenantId,
      title: sensitive ? `Revisar/aprovar: ${title}` : title,
      description: [
        description,
        clientName ? `Cliente relacionado: ${clientName}` : null,
        processNumber ? `Processo: ${processNumber}` : null,
        sensitive ? "Pendencia criada por voz. Requer revisao humana antes de qualquer acao externa." : "Criada por voz no MAYUS Realtime.",
      ].filter(Boolean).join("\n"),
      assignedTo: auth.context.userId,
      createdBy: auth.context.userId,
      createdByRole: auth.context.userRole,
      urgency,
      scheduledFor,
      type: sensitive ? "Aprovacao" : "Tarefa",
      visibility: "global",
      processNumber,
      responsibleNotes: sensitive
        ? "Nao executar envio, pagamento, publicacao, protocolo ou alteracao externa sem aprovacao humana."
        : "Tarefa interna criada pelo MAYUS Realtime.",
      tags: [
        "openai_realtime",
        "voice",
        sensitive ? "requires_human_review" : "internal_task",
      ],
    });

    payload.source_table = "openai_realtime";
    payload.source_id = `voice-task-${auth.context.userId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    payload.created_by_agent = "mayus_realtime";
    payload.client_name = clientName;
    payload.is_critical = sensitive || urgency === "URGENTE";
    payload.category = sensitive ? "APROVACAO" : payload.category;

    const taskId = await syncAgendaTaskBySource(brainAdminSupabase, payload);

    return NextResponse.json({
      ok: true,
      requiresApproval: sensitive,
      reply: sensitive
        ? "Criei uma pendencia interna para revisao. Antes de qualquer acao externa, preciso de aprovacao humana."
        : "Tarefa criada no MAYUS.",
      task: {
        id: taskId,
        title: payload.title,
        scheduled_for: payload.scheduled_for,
        urgency: payload.urgency,
        status: payload.status || "Pendente",
      },
    });
  } catch (error) {
    console.error("[voice/realtime-task] fatal", error);
    return NextResponse.json({ error: "Erro interno ao criar tarefa pelo MAYUS Realtime." }, { status: 500 });
  }
}
