type SupabaseLikeClient = {
  from: (table: string) => any;
};

export type MovementAnalysisContractPayload = {
  tipo_evento?: string | null;
  requer_acao?: boolean | null;
  acao_sugerida?: string | null;
  prazo_extraido_dias?: number | null;
  data_vencimento_extraida?: string | null;
  confianca_analise?: string | null;
  confidence?: string | null;
  confidence_reason?: string | null;
  evidencia?: string | null;
  polo_representado?: string | null;
  obrigacao_de_quem?: string | null;
  review_required?: boolean | null;
  motivo?: string | null;
  origem?: string | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function cleanNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function reviewStatus(payload: MovementAnalysisContractPayload, fallback?: string | null) {
  if (fallback) return fallback;
  if (payload.review_required === true) return "review_required";
  if (payload.review_required === false) return "auto_resolved";
  return "pending";
}

export async function upsertMovementAnalysisContract(params: {
  client: SupabaseLikeClient;
  tenantId: string;
  numeroCnj: string;
  processMovimentacaoId?: string | null;
  escavadorMovimentacaoId?: string | null;
  processoId?: string | null;
  linkedProcessTaskId?: string | null;
  linkedDeadlineId?: string | null;
  auditUserId?: string | null;
  auditSource?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  reviewStatus?: string | null;
  payload: MovementAnalysisContractPayload;
}) {
  const payload = params.payload || {};
  const row = {
    tenant_id: params.tenantId,
    numero_cnj: params.numeroCnj,
    process_movimentacao_id: params.processMovimentacaoId || null,
    escavador_movimentacao_id: params.escavadorMovimentacaoId || null,
    processo_id: params.processoId || null,
    tipo_evento: cleanString(payload.tipo_evento),
    requer_acao: payload.requer_acao === true,
    acao_sugerida: cleanString(payload.acao_sugerida),
    prazo_extraido_dias: cleanNumber(payload.prazo_extraido_dias),
    data_vencimento_extraida: cleanString(payload.data_vencimento_extraida),
    confianca_analise: cleanString(payload.confianca_analise),
    confidence: cleanString(payload.confidence) || cleanString(payload.confianca_analise),
    confidence_reason: cleanString(payload.confidence_reason) || cleanString(payload.motivo),
    evidencia: cleanString(payload.evidencia),
    polo_representado: cleanString(payload.polo_representado),
    obrigacao_de_quem: cleanString(payload.obrigacao_de_quem),
    review_required: payload.review_required === true,
    review_status: reviewStatus(payload, params.reviewStatus),
    reviewed_by: params.reviewedBy || null,
    reviewed_at: params.reviewedAt || null,
    review_note: params.reviewNote || null,
    human_decision: params.reviewStatus || params.reviewedBy || params.reviewedAt || params.reviewNote
      ? {
          status: params.reviewStatus || reviewStatus(payload),
          reviewed_by: params.reviewedBy || null,
          reviewed_at: params.reviewedAt || null,
          note: params.reviewNote || null,
        }
      : null,
    linked_process_task_id: params.linkedProcessTaskId || null,
    linked_deadline_id: params.linkedDeadlineId || null,
    source_payload: payload,
    updated_at: new Date().toISOString(),
  };

  try {
    if (params.processMovimentacaoId || params.escavadorMovimentacaoId) {
      const conflictTarget = params.processMovimentacaoId
        ? "tenant_id,process_movimentacao_id"
        : "tenant_id,escavador_movimentacao_id";
      const { error } = await params.client
        .from("legal_movement_analysis_contracts")
        .upsert(row, { onConflict: conflictTarget });
      if (error) throw error;
    } else {
      const { error } = await params.client
        .from("legal_movement_analysis_contracts")
        .insert(row);
      if (error) throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await params.client.from("system_event_logs").insert({
        tenant_id: params.tenantId,
        user_id: params.auditUserId || params.reviewedBy || null,
        source: params.auditSource || "juridico",
        provider: "mayus",
        event_name: "legal_movement_analysis_contract_persist_failed",
        status: "error",
        payload: {
          numero_cnj: params.numeroCnj,
          process_movimentacao_id: params.processMovimentacaoId || null,
          escavador_movimentacao_id: params.escavadorMovimentacaoId || null,
          processo_id: params.processoId || null,
          review_status: row.review_status,
          error: message,
        },
        created_at: new Date().toISOString(),
      });
    } catch (auditError) {
      console.warn("[movement-analysis-contract] falha ao auditar erro de persistencia", auditError);
    }
    throw error;
  }

  return row;
}
