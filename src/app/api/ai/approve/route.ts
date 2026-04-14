// src/app/api/ai/approve/route.ts
//
// Endpoint de Aprovação Humana de Skills Agênticas
//
// GARANTIAS OBRIGATÓRIAS:
// 1. userId via sessão JWT (@supabase/ssr) — nunca do body
// 2. Apenas admin/socio pode aprovar
// 3. auditLogId deve pertencer ao tenantId do aprovador (isolamento de tenant)
// 4. Se approval_status já for "approved" ou "rejected" → 409 Conflict
// 5. Verificação de expiração → 410 Gone se idempotency_expires_at passou
// 6. Guard de race condition: update atômico com .eq("approval_status", "pending")
// 7. Payload de execução vem de pending_execution_payload no banco — nunca do body

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ZapSignService } from "@/lib/services/zapsign";
import { EscavadorService } from "@/lib/services/escavador";

// ─── Constantes ───────────────────────────────────────────────────────────────

const APPROVER_ROLES = ["admin", "socio", "Administrador", "Sócio"] as const;

// ─── Service Client (singleton no módulo) ────────────────────────────────────

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Handler Principal ────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {

    // ── 1. Autenticação via sessão JWT (@supabase/ssr) ──────────────────────
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch { /* Route Handler — ignorar */ }
          },
        },
      }
    );

    const { data: { session } } = await authClient.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }
    const approverId = session.user.id;

    // ── 2. Validação do body ────────────────────────────────────────────────
    const { auditLogId, decision } = await req.json();

    if (!auditLogId || typeof auditLogId !== "string") {
      return NextResponse.json({ error: "auditLogId invalido ou ausente." }, { status: 400 });
    }
    if (decision !== "approved" && decision !== "rejected") {
      return NextResponse.json(
        { error: "decision deve ser 'approved' ou 'rejected'." },
        { status: 400 }
      );
    }

    // ── 3. Fetch do perfil do aprovador ────────────────────────────────────
    const { data: approverProfile } = await serviceClient
      .from("profiles")
      .select("role, tenant_id")
      .eq("id", approverId)
      .single();

    if (!approverProfile?.role || !approverProfile?.tenant_id) {
      return NextResponse.json({ error: "Perfil do aprovador nao encontrado." }, { status: 403 });
    }

    // ── 4. Validação de role ────────────────────────────────────────────────
    if (!APPROVER_ROLES.includes(approverProfile.role as typeof APPROVER_ROLES[number])) {
      return NextResponse.json({
        error: `Apenas perfis admin ou socio podem aprovar acoes. Perfil atual: "${approverProfile.role}".`,
      }, { status: 403 });
    }

    // ── 5. Fetch do audit log com vínculo de tenant ─────────────────────────
    // Filtra por tenant_id: impossibilita aprovar ações de outro tenant
    // mesmo que o aprovador conheça o auditLogId.
    const { data: auditLog } = await serviceClient
      .from("agent_audit_logs")
      .select("*")
      .eq("id", auditLogId)
      .eq("tenant_id", approverProfile.tenant_id)
      .single();

    if (!auditLog) {
      // 404 — não revela se o registro existe em outro tenant
      return NextResponse.json({ error: "Registro de auditoria nao encontrado." }, { status: 404 });
    }

    // ── 6. Idempotência: 409 se já processado ──────────────────────────────
    if (
      auditLog.approval_status === "approved" ||
      auditLog.approval_status === "rejected"
    ) {
      return NextResponse.json({
        error: `Acao ja processada com status "${auditLog.approval_status}". Nenhuma reexecucao permitida.`,
        currentStatus: auditLog.approval_status,
      }, { status: 409 });
    }

    // ── 7. Sanity check: deve estar em estado "pending" ─────────────────────
    if (auditLog.approval_status !== "pending") {
      return NextResponse.json({
        error: `Status inesperado "${auditLog.approval_status}". Apenas registros "pending" podem ser processados.`,
      }, { status: 422 });
    }

    // ── 8. Verificação de expiração ─────────────────────────────────────────
    // Aprovações que passaram de 24h são rejeitadas para evitar "aprovações zumbi".
    // O usuário deve iniciar a ação novamente.
    if (auditLog.idempotency_expires_at) {
      const expired = new Date(auditLog.idempotency_expires_at) < new Date();
      if (expired) {
        return NextResponse.json({
          error: "Solicitacao expirada. O usuario deve iniciar a acao novamente.",
          code: "APPROVAL_EXPIRED",
        }, { status: 410 });
      }
    }

    // ── 9. Update atômico com guard de race condition ───────────────────────
    // .eq("approval_status", "pending") garante que se dois aprovadores
    // chegarem simultaneamente, apenas um terá linhas afetadas.
    const { data: updateResult, error: updateError } = await serviceClient
      .from("agent_audit_logs")
      .update({
        approval_status: decision,
        approved_by: approverId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", auditLogId)
      .eq("approval_status", "pending") // guard atômico de race condition
      .select("id");

    if (updateError) {
      console.error("[Approve] Falha ao atualizar audit log:", updateError.message);
      return NextResponse.json({ error: "Erro interno ao registrar decisao." }, { status: 500 });
    }

    // 0 linhas afetadas = outro aprovador chegou primeiro (race condition)
    if (!updateResult || updateResult.length === 0) {
      return NextResponse.json({
        error: "Acao ja processada por outro aprovador simultaneamente.",
        code: "CONCURRENT_APPROVAL",
      }, { status: 409 });
    }

    // ── 10. Rejeição — encerra aqui ─────────────────────────────────────────
    if (decision === "rejected") {
      return NextResponse.json({
        status: "rejected",
        message: "Acao rejeitada e registrada com sucesso.",
        auditLogId,
        rejectedBy: approverId,
      });
    }

    // ── 11. Aprovação — executa usando pending_execution_payload do banco ────
    // NUNCA usa dados do body para execução.
    // pending_execution_payload é gravado pelo executor.ts no fluxo awaiting_approval.
    const pendingPayload = auditLog.pending_execution_payload as {
      entities: Record<string, string>;
      idempotencyKey: string;
      skillName: string;
      schemaVersion: string;
    } | null;

    if (!pendingPayload) {
      console.error("[Approve] pending_execution_payload ausente no audit log:", auditLogId);
      return NextResponse.json({
        error: "Payload de execucao nao encontrado. Acao aprovada mas nao executada.",
        status: "approved_not_executed",
        auditLogId,
      }, { status: 500 });
    }

    const skillName = auditLog.skill_invoked as string;
    const { entities, idempotencyKey } = pendingPayload;

    // ── 12. Lookup de handler_type em agent_skills ──────────────────────────
    // Query separada — audit log não armazena handler_type diretamente.
    // Isolamento de tenant: garante que a skill pertence ao tenant do aprovador.

    const { data: skillMeta } = await serviceClient
      .from("agent_skills")
      .select("handler_type")
      .eq("tenant_id", approverProfile.tenant_id)
      .eq("name", skillName)
      .single();

    const handlerType = skillMeta?.handler_type ?? null;

    // ── 13. Despacho por handler_type ───────────────────────────────────────
    // Nova skill no banco com handler_type existente = funciona sem código.
    // handler_type null → "approved" sem executor server-side.

    if (handlerType === "zapsign_contract") {
      try {
        const tenantId = approverProfile.tenant_id as string;

        const { data: settings } = await serviceClient
          .from("tenant_settings")
          .select("ai_features")
          .eq("tenant_id", tenantId)
          .single();

        const config = settings?.ai_features || {};

        const { data: zapIntegration } = await serviceClient
          .from("tenant_integrations")
          .select("api_key")
          .eq("tenant_id", tenantId)
          .eq("provider", "zapsign")
          .single();

        if (!zapIntegration?.api_key) {
          await serviceClient
            .from("agent_audit_logs")
            .update({ status: "fallback_triggered", approved_by: approverId, approved_at: new Date().toISOString() })
            .eq("id", auditLogId);

          return NextResponse.json({
            error: "Integracao ZapSign nao configurada (api_key ausente). Acao aprovada mas nao executada.",
            status: "approved_not_executed",
            auditLogId,
          }, { status: 500 });
        }

        const zapsignResult = await ZapSignService.createDocument({
          apiToken: zapIntegration.api_key,
          docName:  `Contrato - ${entities.signer_name ?? "Cliente"}`,
          signers: [{
            name:  entities.signer_name  ?? "",
            email: entities.signer_email ?? "",
          }],
          lang: "pt-br",
        });

        await serviceClient
          .from("agent_audit_logs")
          .update({
            payload_executed: {
              idempotencyKey,
              skill:        skillName,
              handler_type: handlerType,                          // rastreabilidade
              zapsign_document_token: zapsignResult.token,
              sign_url:     zapsignResult.signers?.[0]?.sign_url,
              executed_at:  new Date().toISOString(),
            },
          })
          .eq("id", auditLogId);

        return NextResponse.json({
          status:     "executed",
          message:    `Contrato gerado com sucesso para ${entities.signer_name}.`,
          signUrl:    zapsignResult.signers?.[0]?.sign_url,
          auditLogId,
          approvedBy: approverId,
        });

      } catch (err: any) {
        console.error("[Approve] Erro na execucao ZapSign (handler_type=zapsign_contract):", {
          message:  err.message,
          status:   err.status,
          response: err.response,
          body:     JSON.stringify(err),
        });
        return NextResponse.json({
          error:  "Falha na execucao da skill apos aprovacao.",
          status: "approved_not_executed",
          auditLogId,
        }, { status: 500 });
      }
    }

    if (handlerType === "escavador_monitor") {
      try {
        const tenantId = approverProfile.tenant_id as string;
        const { data: escavadorIntegration } = await serviceClient
          .from("tenant_integrations")
          .select("api_key")
          .eq("tenant_id", tenantId)
          .eq("provider", "escavador")
          .single();

        if (!escavadorIntegration?.api_key) {
          await serviceClient.from("agent_audit_logs").update({ status: "fallback_triggered", approved_by: approverId, approved_at: new Date().toISOString() }).eq("id", auditLogId);
          return NextResponse.json({ error: "Integração Escavador não configurada.", status: "approved_not_executed", auditLogId }, { status: 500 });
        }

        const monitor = await EscavadorService.criarMonitoramento(escavadorIntegration.api_key, entities.numero_cnj, entities.frequencia);

        if (monitor && monitor.id) {
           await serviceClient.from("monitored_processes").update({ escavador_monitoramento_id: String(monitor.id) }).eq("numero_processo", entities.numero_cnj).eq("tenant_id", tenantId);
        }

        await serviceClient.from("agent_audit_logs").update({
          payload_executed: { idempotencyKey, skill: skillName, handler_type: handlerType, escavador_monitoramento_id: monitor?.id, executed_at: new Date().toISOString() }
        }).eq("id", auditLogId);

        return NextResponse.json({ status: "executed", message: "Monitoramento criado com sucesso no Escavador.", auditLogId, approvedBy: approverId });
      } catch (err: any) {
        console.error("[Approve] Erro na execucao Escavador:", err);
        return NextResponse.json({ error: err.message || "Falha na execucao da skill", status: "approved_not_executed", auditLogId }, { status: 500 });
      }
    }
    
    if (handlerType === "kanban_import_oab") {
      return NextResponse.json({
        error: "Importação por OAB via IA está temporariamente bloqueada por proteção de custos. Use o painel de monitoramento com confirmação explícita.",
        status: "approved_not_executed",
        auditLogId,
      }, { status: 403 });
    }

    // handler_type null ou desconhecido — skill aprovada, sem executor server-side
    return NextResponse.json({
      status:     "approved",
      message:    `Acao "${skillName}" aprovada e registrada. handler_type "${handlerType ?? "nulo"}" sem execucao server-side.`,
      auditLogId,
      approvedBy: approverId,
    });


  } catch (error: any) {
    console.error("[Approve] Erro interno:", error);
    return NextResponse.json({ error: "Erro interno no processamento." }, { status: 500 });
  }
}
