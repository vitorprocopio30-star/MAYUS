import { expect, test, type Page } from "@playwright/test";
import { getPlaywrightCredentials, loginThroughUi } from "./helpers/auth";

const PROCESS_NUMBER = "E2E-2026-0001";
const CLIENT_NAME = "Cliente Playwright E2E";
const CONTEXT_TASK_ID = "mayus-chat-context-task";
const DRAFT_TASK_ID = "mayus-chat-draft-task";
const SYNC_TASK_ID = "mayus-chat-sync-task";
const REVIEW_TASK_ID = "mayus-chat-review-task";
const LOOP_TASK_ID = "mayus-chat-loop-task";
const PUBLISH_PREMIUM_TASK_ID = "mayus-chat-publish-premium-task";
const PUBLISH_PREMIUM_AUDIT_LOG_ID = "mayus-publish-premium-audit-log";
const SUPPORT_STATUS_TASK_ID = "mayus-chat-support-status-task";
const SUPPORT_STATUS_HANDOFF_TASK_ID = "mayus-chat-support-status-handoff-task";
const APPROVE_TASK_ID = "mayus-chat-approve-task";
const PUBLISH_TASK_ID = "mayus-chat-publish-task";
const CASE_BRAIN_TASK_ID = "mayus-case-brain-task";
const DRAFT_FACTORY_TASK_ID = "mayus-draft-factory-task";
const CONVERSATION_ID = "mayus-conversation-e2e";
const APPROVE_AUDIT_LOG_ID = "mayus-approve-audit-log";
const PUBLISH_AUDIT_LOG_ID = "mayus-publish-audit-log";

type BrainTaskResponse = {
  task: Record<string, unknown>;
  runs: Array<Record<string, unknown>>;
  steps: Array<Record<string, unknown>>;
  approvals: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
  memories: Array<Record<string, unknown>>;
  learning_events: Array<Record<string, unknown>>;
};

function buildMissionTask(taskId: string, params: { module: string; channel?: string; goal: string; status?: string; resultSummary?: string; errorMessage?: string | null }) {
  return {
    id: taskId,
    status: params.status || "completed",
    goal: params.goal,
    module: params.module,
    channel: params.channel || "chat",
    result_summary: params.resultSummary || null,
    error_message: params.errorMessage || null,
  };
}

function buildMissionSnapshot(taskId: string, params: {
  module: string;
  goal: string;
  resultSummary?: string;
  taskStatus?: string;
  stepStatus?: string;
  approvals?: Array<Record<string, unknown>>;
  artifacts?: Array<Record<string, unknown>>;
  learningEvents?: Array<Record<string, unknown>>;
}) {
  return {
    task: buildMissionTask(taskId, {
      module: params.module,
      goal: params.goal,
      status: params.taskStatus,
      resultSummary: params.resultSummary,
    }),
    runs: [],
    steps: [
      {
        id: `${taskId}-step-1`,
        order_index: 1,
        title: params.goal,
        status: params.stepStatus || "completed",
        step_type: "capability",
        capability_name: params.module,
        handler_type: params.module,
      },
    ],
    approvals: params.approvals || [],
    artifacts: params.artifacts || [],
    memories: [],
    learning_events: params.learningEvents || [],
  } satisfies BrainTaskResponse;
}

function buildContextScenario() {
  return {
    chatReply: `Contexto jurídico resolvido para ${PROCESS_NUMBER}. A peça sugerida segue como Contestação Previdenciária e a primeira minuta permanece pronta para revisão humana.`,
    kernel: {
      status: "executed",
      taskId: CONTEXT_TASK_ID,
      runId: `${CONTEXT_TASK_ID}-run-1`,
      stepId: `${CONTEXT_TASK_ID}-step-1`,
      outputPayload: {
        process_task_id: "process-task-1",
        case_brain_task_id: CASE_BRAIN_TASK_ID,
        first_draft_status: "completed",
        first_draft_stale: false,
        recommended_piece_label: "Contestação Previdenciária",
      },
    },
    tasks: {
      [CONTEXT_TASK_ID]: buildMissionSnapshot(CONTEXT_TASK_ID, {
        module: "mayus",
        goal: `Resolver contexto jurídico do processo ${PROCESS_NUMBER}`,
        resultSummary: `Contexto jurídico resolvido para ${PROCESS_NUMBER}.`,
        artifacts: [
          {
            id: "context-artifact-1",
            artifact_type: "legal_case_context",
            title: `Contexto jurídico - ${CLIENT_NAME}`,
            metadata: {
              summary: `Contexto jurídico resolvido para ${PROCESS_NUMBER}.`,
              process_number: PROCESS_NUMBER,
              recommended_piece_label: "Contestação Previdenciária",
              first_draft_status: "completed",
            },
            created_at: "2026-04-20T22:00:00.000Z",
          },
          {
            id: "context-artifact-2",
            artifact_type: "mission_result",
            title: "Resultado da missão",
            metadata: {
              summary: `Resumo consolidado do processo ${PROCESS_NUMBER}.`,
              process_number: PROCESS_NUMBER,
            },
            created_at: "2026-04-20T22:00:01.000Z",
          },
        ],
        learningEvents: [
          {
            id: "context-event-1",
            event_type: "legal_case_context_resolved",
            source_module: "mayus",
            payload: {
              summary: `Contexto jurídico resolvido para ${PROCESS_NUMBER}.`,
            },
            created_at: "2026-04-20T22:00:02.000Z",
          },
        ],
      }),
      [CASE_BRAIN_TASK_ID]: buildMissionSnapshot(CASE_BRAIN_TASK_ID, {
        module: "lex",
        goal: `Case Brain do processo ${PROCESS_NUMBER}`,
        resultSummary: "Case Brain inicial concluído com draft plan pronto.",
        artifacts: [
          {
            id: "case-brain-artifact-1",
            artifact_type: "case_draft_plan",
            title: "Draft plan jurídico",
            metadata: {
              summary: "Contestação Previdenciária recomendada com base no source pack validado.",
              process_number: PROCESS_NUMBER,
              recommended_piece_label: "Contestação Previdenciária",
            },
            created_at: "2026-04-20T22:00:03.000Z",
          },
        ],
        learningEvents: [
          {
            id: "case-brain-event-1",
            event_type: "case_brain_draft_plan_ready",
            source_module: "lex",
            payload: {
              summary: "Draft plan pronto para a primeira minuta sugerida.",
            },
            created_at: "2026-04-20T22:00:04.000Z",
          },
        ],
      }),
    } as Record<string, BrainTaskResponse>,
  };
}

function buildDraftScenario() {
  return {
    chatReply: `A primeira minuta Contestação Previdenciária de ${PROCESS_NUMBER} foi gerada pela Draft Factory jurídica. Primeira minuta pronta para revisão humana.`,
    kernel: {
      status: "executed",
      taskId: DRAFT_TASK_ID,
      runId: `${DRAFT_TASK_ID}-run-1`,
      stepId: `${DRAFT_TASK_ID}-step-1`,
      outputPayload: {
        process_task_id: "process-task-1",
        case_brain_task_id: CASE_BRAIN_TASK_ID,
        draft_factory_task_id: DRAFT_FACTORY_TASK_ID,
        case_first_draft_artifact_id: "draft-factory-artifact-1",
        first_draft_status: "completed",
        first_draft_stale: false,
        recommended_piece_label: "Contestação Previdenciária",
      },
    },
    tasks: {
      [DRAFT_TASK_ID]: buildMissionSnapshot(DRAFT_TASK_ID, {
        module: "mayus",
        goal: `Gerar primeira minuta do processo ${PROCESS_NUMBER}`,
        resultSummary: "Primeira minuta solicitada via chat do MAYUS e concluída com sucesso.",
        artifacts: [
          {
            id: "draft-result-artifact-1",
            artifact_type: "legal_first_draft_result",
            title: `Primeira minuta - ${CLIENT_NAME}`,
            metadata: {
              summary: `A primeira minuta Contestação Previdenciária de ${PROCESS_NUMBER} foi gerada pela Draft Factory jurídica.`,
              process_number: PROCESS_NUMBER,
              recommended_piece_label: "Contestação Previdenciária",
              first_draft_status: "completed",
            },
            created_at: "2026-04-20T22:10:00.000Z",
          },
          {
            id: "draft-result-artifact-2",
            artifact_type: "mission_result",
            title: "Resultado da missão",
            metadata: {
              summary: "Primeira minuta pronta para revisão humana.",
              process_number: PROCESS_NUMBER,
            },
            created_at: "2026-04-20T22:10:01.000Z",
          },
        ],
        learningEvents: [
          {
            id: "draft-result-event-1",
            event_type: "legal_first_draft_requested_via_chat",
            source_module: "mayus",
            payload: {
              summary: "Primeira minuta solicitada via chat do MAYUS.",
              piece_label: "Contestação Previdenciária",
            },
            created_at: "2026-04-20T22:10:02.000Z",
          },
        ],
      }),
      [CASE_BRAIN_TASK_ID]: buildMissionSnapshot(CASE_BRAIN_TASK_ID, {
        module: "lex",
        goal: `Case Brain do processo ${PROCESS_NUMBER}`,
        resultSummary: "Case Brain inicial concluído com draft plan pronto.",
        artifacts: [
          {
            id: "draft-case-brain-artifact-1",
            artifact_type: "case_draft_plan",
            title: "Draft plan jurídico",
            metadata: {
              summary: "Contestação Previdenciária recomendada com base no source pack validado.",
              process_number: PROCESS_NUMBER,
              recommended_piece_label: "Contestação Previdenciária",
            },
            created_at: "2026-04-20T22:10:03.000Z",
          },
        ],
        learningEvents: [
          {
            id: "draft-case-brain-event-1",
            event_type: "case_brain_draft_plan_ready",
            source_module: "lex",
            payload: {
              summary: "Draft plan pronto para a primeira minuta sugerida.",
            },
            created_at: "2026-04-20T22:10:04.000Z",
          },
        ],
      }),
      [DRAFT_FACTORY_TASK_ID]: buildMissionSnapshot(DRAFT_FACTORY_TASK_ID, {
        module: "lex",
        goal: `Draft Factory do processo ${PROCESS_NUMBER}`,
        resultSummary: "Primeira minuta pronta para revisão humana.",
        artifacts: [
          {
            id: "draft-factory-artifact-1",
            artifact_type: "case_first_draft",
            title: "Primeira minuta jurídica",
            metadata: {
              piece_label: "Contestação Previdenciária",
              practice_area: "Previdenciário",
              process_number: PROCESS_NUMBER,
              first_draft_status: "completed",
            },
            created_at: "2026-04-20T22:10:05.000Z",
          },
        ],
        learningEvents: [
          {
            id: "draft-factory-event-1",
            event_type: "draft_factory_completed",
            source_module: "lex",
            payload: {
              summary: "Primeira minuta pronta para revisão humana.",
              piece_label: "Contestação Previdenciária",
            },
            created_at: "2026-04-20T22:10:06.000Z",
          },
        ],
      }),
    } as Record<string, BrainTaskResponse>,
  };
}

function buildSyncScenario() {
  return {
    chatReply: `## Memoria documental atualizada\n- Processo: ${PROCESS_NUMBER}\n- Documentos sincronizados: 3\n- Status da sync: synced\n- Ultima sincronizacao: 20/04/2026 22:30:00\n- Pendencias documentais: 03-Contestacao\n- Warnings da sync: audio-cliente.mp3: Formato ainda nao suportado para extração automática.\n- Proximo passo sugerido: Agora posso montar o contexto juridico atualizado com base nos documentos sincronizados.`,
    kernel: {
      status: "executed",
      taskId: SYNC_TASK_ID,
      runId: `${SYNC_TASK_ID}-run-1`,
      stepId: `${SYNC_TASK_ID}-step-1`,
      outputPayload: {
        process_task_id: "process-task-1",
        process_number: PROCESS_NUMBER,
        document_count: 3,
        sync_status: "synced",
        last_synced_at: "2026-04-20T22:30:00.000Z",
        warning_count: 1,
        missing_documents: ["03-Contestacao"],
      },
    },
    tasks: {
      [SYNC_TASK_ID]: buildMissionSnapshot(SYNC_TASK_ID, {
        module: "mayus",
        goal: `Sincronizar a memoria documental do processo ${PROCESS_NUMBER}`,
        resultSummary: `Memória documental atualizada para ${PROCESS_NUMBER} com 3 documento(s) sincronizados.`,
        artifacts: [
          {
            id: "document-sync-artifact-1",
            artifact_type: "legal_document_memory_refresh",
            title: `Memoria documental - ${CLIENT_NAME}`,
            metadata: {
              summary: `Memória documental atualizada para ${PROCESS_NUMBER} com 3 documento(s) sincronizados.`,
              process_number: PROCESS_NUMBER,
              sync_status: "synced",
              document_count: 3,
              warning_count: 1,
              missing_documents: ["03-Contestacao"],
            },
            created_at: "2026-04-20T22:30:00.000Z",
          },
        ],
        learningEvents: [
          {
            id: "document-sync-event-1",
            event_type: "legal_document_memory_refreshed",
            source_module: "mayus",
            payload: {
              summary: "Memória documental atualizada pelo MAYUS.",
              document_count: 3,
              sync_status: "synced",
            },
            created_at: "2026-04-20T22:30:01.000Z",
          },
        ],
      }),
    } as Record<string, BrainTaskResponse>,
  };
}

function buildReviewScenario() {
  return {
    chatReply: `## Revisão orientada da minuta\n- Processo: ${PROCESS_NUMBER}\n- Versão analisada: V2 · Contestação Previdenciária\n- Veredito MAYA: está utilizável, mas ainda pede reforço jurídico\n- Próximo passo sugerido: Fortalecer a minuta antes de aprovar formalmente.`,
    kernel: {
      status: "executed",
      taskId: REVIEW_TASK_ID,
      runId: `${REVIEW_TASK_ID}-run-1`,
      stepId: `${REVIEW_TASK_ID}-step-1`,
      outputPayload: {
        process_task_id: "process-task-1",
        case_brain_task_id: CASE_BRAIN_TASK_ID,
        draft_version_id: "draft-version-1",
        draft_version_number: 2,
        draft_workflow_status: "draft",
        review_verdict: "attention",
        recommended_action: "strengthen_before_approval",
        piece_label: "Contestação Previdenciária",
      },
    },
    tasks: {
      [REVIEW_TASK_ID]: buildMissionSnapshot(REVIEW_TASK_ID, {
        module: "mayus",
        goal: `Revisar juridicamente a minuta do processo ${PROCESS_NUMBER}`,
        resultSummary: `Revisão da V2 · Contestação Previdenciária de ${PROCESS_NUMBER}: a minuta está utilizável, mas ainda pede reforço jurídico.`,
        artifacts: [
          {
            id: "draft-review-artifact-1",
            artifact_type: "legal_draft_review",
            title: `Revisao da minuta - ${CLIENT_NAME}`,
            metadata: {
              summary: `Revisão da V2 · Contestação Previdenciária de ${PROCESS_NUMBER}: a minuta está utilizável, mas ainda pede reforço jurídico.`,
              process_number: PROCESS_NUMBER,
              piece_label: "Contestação Previdenciária",
              review_verdict: "attention",
              recommended_action: "strengthen_before_approval",
              draft_workflow_status: "draft",
            },
            created_at: "2026-04-20T22:12:00.000Z",
          },
        ],
        learningEvents: [
          {
            id: "draft-review-event-1",
            event_type: "legal_draft_review_prepared",
            source_module: "mayus",
            payload: {
              summary: "Checklist jurídico da minuta preparado pelo MAYUS.",
              review_verdict: "attention",
              recommended_action: "strengthen_before_approval",
            },
            created_at: "2026-04-20T22:12:01.000Z",
          },
        ],
      }),
      [CASE_BRAIN_TASK_ID]: buildMissionSnapshot(CASE_BRAIN_TASK_ID, {
        module: "lex",
        goal: `Case Brain do processo ${PROCESS_NUMBER}`,
        resultSummary: "Case Brain inicial concluído com draft plan pronto.",
        artifacts: [
          {
            id: "review-case-brain-artifact-1",
            artifact_type: "case_draft_plan",
            title: "Draft plan jurídico",
            metadata: {
              summary: "Contestação Previdenciária recomendada com base no source pack validado.",
              process_number: PROCESS_NUMBER,
              recommended_piece_label: "Contestação Previdenciária",
            },
            created_at: "2026-04-20T22:12:02.000Z",
          },
        ],
        learningEvents: [
          {
            id: "review-case-brain-event-1",
            event_type: "case_brain_draft_plan_ready",
            source_module: "lex",
            payload: {
              summary: "Draft plan pronto para a revisão orientada da minuta.",
            },
            created_at: "2026-04-20T22:12:03.000Z",
          },
        ],
      }),
    } as Record<string, BrainTaskResponse>,
  };
}

function buildRevisionLoopScenario() {
  return {
    chatReply: `## Loop supervisionado da minuta\n- Processo: ${PROCESS_NUMBER}\n- Versao analisada: V2 · Contestação Previdenciária\n- Secoes analisadas: 4\n- Secoes fracas: 3\n- Lacunas estruturais: 1\n- Veredito MAYA: attention\n- Proximo passo sugerido: Aplicar o plano de reforco por seção antes de aprovar a versao atual.`,
    kernel: {
      status: "executed",
      taskId: LOOP_TASK_ID,
      runId: `${LOOP_TASK_ID}-run-1`,
      stepId: `${LOOP_TASK_ID}-step-1`,
      outputPayload: {
        process_task_id: "process-task-1",
        case_brain_task_id: CASE_BRAIN_TASK_ID,
        draft_version_id: "draft-version-1",
        draft_version_number: 2,
        draft_workflow_status: "draft",
        review_verdict: "attention",
        recommended_action: "apply_revision_plan",
        sections_analyzed: 4,
        weak_section_count: 3,
        missing_section_count: 1,
        piece_label: "Contestação Previdenciária",
      },
    },
    tasks: {
      [LOOP_TASK_ID]: buildMissionSnapshot(LOOP_TASK_ID, {
        module: "mayus",
        goal: `Montar o loop supervisionado da minuta do processo ${PROCESS_NUMBER}`,
        resultSummary: `Loop de revisão da V2 · Contestação Previdenciária de ${PROCESS_NUMBER}: 3 seção(ões) fracas e 1 lacuna estrutural mapeadas.`,
        artifacts: [
          {
            id: "draft-loop-artifact-1",
            artifact_type: "legal_draft_revision_loop",
            title: `Loop da minuta - ${CLIENT_NAME}`,
            metadata: {
              summary: `Loop de revisão da V2 · Contestação Previdenciária de ${PROCESS_NUMBER}: 3 seção(ões) fracas e 1 lacuna estrutural mapeadas.`,
              process_number: PROCESS_NUMBER,
              piece_label: "Contestação Previdenciária",
              review_verdict: "attention",
              recommended_action: "apply_revision_plan",
              sections_analyzed: 4,
              weak_section_count: 3,
              missing_section_count: 1,
            },
            created_at: "2026-04-20T22:14:00.000Z",
          },
        ],
        learningEvents: [
          {
            id: "draft-loop-event-1",
            event_type: "legal_draft_revision_loop_prepared",
            source_module: "mayus",
            payload: {
              summary: "Plano supervisionado de reforço da minuta preparado pelo MAYUS.",
              review_verdict: "attention",
              recommended_action: "apply_revision_plan",
              weak_section_count: 3,
            },
            created_at: "2026-04-20T22:14:01.000Z",
          },
        ],
      }),
      [CASE_BRAIN_TASK_ID]: buildMissionSnapshot(CASE_BRAIN_TASK_ID, {
        module: "lex",
        goal: `Case Brain do processo ${PROCESS_NUMBER}`,
        resultSummary: "Case Brain inicial concluído com draft plan pronto.",
        artifacts: [
          {
            id: "loop-case-brain-artifact-1",
            artifact_type: "case_draft_plan",
            title: "Draft plan jurídico",
            metadata: {
              summary: "Contestação Previdenciária recomendada com base no source pack validado.",
              process_number: PROCESS_NUMBER,
              recommended_piece_label: "Contestação Previdenciária",
            },
            created_at: "2026-04-20T22:14:02.000Z",
          },
        ],
        learningEvents: [
          {
            id: "loop-case-brain-event-1",
            event_type: "case_brain_draft_plan_ready",
            source_module: "lex",
            payload: {
              summary: "Draft plan pronto para o loop supervisionado da minuta.",
            },
            created_at: "2026-04-20T22:14:03.000Z",
          },
        ],
      }),
    } as Record<string, BrainTaskResponse>,
  };
}

function buildPublishPremiumScenario() {
  const goal = `Publicar o artifact premium do processo ${PROCESS_NUMBER}`;

  return {
    chatReply: `A publicacao premium em PDF da versao atual de ${PROCESS_NUMBER} exige confirmacao humana antes da execucao.`,
    pendingKernel: {
      status: "awaiting_approval",
      taskId: PUBLISH_PREMIUM_TASK_ID,
      runId: `${PUBLISH_PREMIUM_TASK_ID}-run-1`,
      stepId: `${PUBLISH_PREMIUM_TASK_ID}-step-1`,
      auditLogId: PUBLISH_PREMIUM_AUDIT_LOG_ID,
      awaitingPayload: {
        idempotencyKey: "publish-premium-idempotency",
        skillName: "legal_artifact_publish_premium",
        riskLevel: "high",
        schemaVersion: "1",
        entities: {
          process_number: PROCESS_NUMBER,
          version_number: "2",
        },
      },
    },
    pendingTasks: {
      [PUBLISH_PREMIUM_TASK_ID]: buildMissionSnapshot(PUBLISH_PREMIUM_TASK_ID, {
        module: "mayus",
        goal,
        taskStatus: "awaiting_approval",
        stepStatus: "awaiting_approval",
        approvals: [
          {
            id: "publish-premium-approval-1",
            status: "pending",
            approval_context: {
              audit_log_id: PUBLISH_PREMIUM_AUDIT_LOG_ID,
            },
          },
        ],
      }),
    } as Record<string, BrainTaskResponse>,
    executedTasks: {
      [PUBLISH_PREMIUM_TASK_ID]: buildMissionSnapshot(PUBLISH_PREMIUM_TASK_ID, {
        module: "mayus",
        goal,
        resultSummary: `O artifact premium em PDF da V2 · Contestação Previdenciária de ${PROCESS_NUMBER} foi publicado em 09-Pecas Finais.`,
        approvals: [
          {
            id: "publish-premium-approval-1",
            status: "approved",
            approved_at: "2026-04-20T22:35:00.000Z",
          },
        ],
        artifacts: [
          {
            id: "publish-premium-artifact-1",
            artifact_type: "legal_artifact_publish_premium",
            title: `Artifact premium - ${CLIENT_NAME}`,
            metadata: {
              summary: `O artifact premium em PDF da V2 · Contestação Previdenciária de ${PROCESS_NUMBER} foi publicado em 09-Pecas Finais.`,
              process_number: PROCESS_NUMBER,
              piece_label: "Contestação Previdenciária",
              publish_format: "pdf",
              publish_status: "published",
              drive_folder_label: "09-Pecas Finais",
              learning_loop_changed: true,
              learning_loop_source_kind: "source_artifact",
              learning_loop_categories: ["substantive_expansion", "citations_enriched"],
              learning_loop_change_ratio: 0.34,
              learning_loop_summary: "Delta capturado contra a primeira minuta gerada · +1200 caracteres · +3 paragrafos · +1 secoes · +2 citacoes · 34% de variacao estimada · sinais: substantive_expansion, citations_enriched",
              drive_file_url: "https://drive.google.com/file/d/drive-file-premium-1/view",
            },
            created_at: "2026-04-20T22:35:01.000Z",
          },
        ],
        learningEvents: [
          {
            id: "publish-premium-event-1",
            event_type: "legal_artifact_publish_premium_executed",
            source_module: "mayus",
            payload: {
              summary: "Artifact premium publicado no Drive pelo MAYUS.",
              publish_format: "pdf",
              drive_folder_label: "09-Pecas Finais",
              learning_loop_summary: "Delta capturado contra a primeira minuta gerada · +1200 caracteres · +3 paragrafos · +1 secoes · +2 citacoes · 34% de variacao estimada · sinais: substantive_expansion, citations_enriched",
            },
            created_at: "2026-04-20T22:35:02.000Z",
          },
        ],
      }),
    } as Record<string, BrainTaskResponse>,
  };
}

function buildSupportStatusScenario() {
  return {
    chatReply: `## Status do caso\n- Processo: ${PROCESS_NUMBER}\n- Cliente: ${CLIENT_NAME}\n- Status atual: O caso segue em contestação com contexto jurídico consolidado. Fase atual: Contestação.\n- Fase atual: Contestação\n- Proximo passo: Revisar a documentação complementar antes do próximo movimento relevante.\n- Pendencias: nenhuma pendencia critica registrada`,
    kernel: {
      status: "executed",
      taskId: SUPPORT_STATUS_TASK_ID,
      runId: `${SUPPORT_STATUS_TASK_ID}-run-1`,
      stepId: `${SUPPORT_STATUS_TASK_ID}-step-1`,
      outputPayload: {
        process_task_id: "process-task-1",
        process_number: PROCESS_NUMBER,
        support_status_response_mode: "answer",
        support_status_confidence: "high",
        support_status_current_phase: "Contestação",
        support_status_next_step: "Revisar a documentação complementar antes do próximo movimento relevante.",
        support_status_pending_count: 0,
        support_status_handoff_reason: null,
      },
    },
    tasks: {
      [SUPPORT_STATUS_TASK_ID]: buildMissionSnapshot(SUPPORT_STATUS_TASK_ID, {
        module: "mayus",
        goal: `Responder status do caso ${PROCESS_NUMBER}`,
        resultSummary: `Status do caso ${PROCESS_NUMBER} preparado com confiança high.`,
        artifacts: [
          {
            id: "support-status-artifact-1",
            artifact_type: "support_case_status",
            title: `Status do caso - ${CLIENT_NAME}`,
            metadata: {
              summary: `Status do caso ${PROCESS_NUMBER} preparado com confiança high.`,
              reply: `Status curto preparado para ${CLIENT_NAME}.`,
              process_number: PROCESS_NUMBER,
              process_label: PROCESS_NUMBER,
              client_name: CLIENT_NAME,
              support_status_response_mode: "answer",
              support_status_confidence: "high",
              support_status_current_phase: "Contestação",
              support_status_next_step: "Revisar a documentação complementar antes do próximo movimento relevante.",
              support_status_pending_items: [],
              support_status_handoff_reason: null,
            },
            created_at: "2026-04-20T22:40:00.000Z",
          },
        ],
        learningEvents: [
          {
            id: "support-status-event-1",
            event_type: "support_case_status_resolved",
            source_module: "mayus",
            payload: {
              summary: `Status do caso ${PROCESS_NUMBER} preparado com confiança high.`,
              response_mode: "answer",
              confidence: "high",
              current_phase: "Contestação",
            },
            created_at: "2026-04-20T22:40:01.000Z",
          },
        ],
      }),
    } as Record<string, BrainTaskResponse>,
  };
}

function buildSupportStatusHandoffScenario() {
  return {
    chatReply: `## Status do caso\n- Processo: ${CLIENT_NAME}\n- Nao consegui confirmar com seguranca qual e o caso correto para esta consulta.\n- Encaminhamento: handoff humano recomendado antes de responder o cliente.`,
    kernel: {
      status: "executed",
      taskId: SUPPORT_STATUS_HANDOFF_TASK_ID,
      runId: `${SUPPORT_STATUS_HANDOFF_TASK_ID}-run-1`,
      stepId: `${SUPPORT_STATUS_HANDOFF_TASK_ID}-step-1`,
      outputPayload: {
        support_status_response_mode: "handoff",
        support_status_confidence: "low",
        support_status_handoff_reason: "ambiguous_case_match",
        error_message: "Encontrei mais de um processo juridico para essa referencia. Informe o numero do processo ou o ID interno.",
      },
    },
    tasks: {
      [SUPPORT_STATUS_HANDOFF_TASK_ID]: buildMissionSnapshot(SUPPORT_STATUS_HANDOFF_TASK_ID, {
        module: "mayus",
        goal: `Resolver status do caso por cliente ${CLIENT_NAME}`,
        resultSummary: `Status do caso ${CLIENT_NAME} encaminhado para handoff por referência ambígua.`,
        artifacts: [
          {
            id: "support-status-handoff-artifact-1",
            artifact_type: "support_case_status",
            title: `Status do caso - ${CLIENT_NAME}`,
            metadata: {
              summary: `Status do caso ${CLIENT_NAME} encaminhado para handoff por referência ambígua.`,
              reply: "Handoff humano recomendado antes de responder o cliente.",
              process_label: CLIENT_NAME,
              client_name: CLIENT_NAME,
              support_status_response_mode: "handoff",
              support_status_confidence: "low",
              support_status_handoff_reason: "ambiguous_case_match",
            },
            created_at: "2026-04-20T22:41:00.000Z",
          },
        ],
        learningEvents: [
          {
            id: "support-status-handoff-event-1",
            event_type: "support_case_status_resolved",
            source_module: "mayus",
            payload: {
              summary: `Status do caso ${CLIENT_NAME} encaminhado para handoff por referência ambígua.`,
              response_mode: "handoff",
              confidence: "low",
              handoff_reason: "ambiguous_case_match",
            },
            created_at: "2026-04-20T22:41:01.000Z",
          },
        ],
      }),
    } as Record<string, BrainTaskResponse>,
  };
}

function buildApproveWorkflowScenario() {
  const goal = `Aprovar a minuta formal do processo ${PROCESS_NUMBER}`;

  return {
    chatReply: `A aprovação formal da versão V2 de ${PROCESS_NUMBER} exige confirmação humana antes da execução.`,
    pendingKernel: {
      status: "awaiting_approval",
      taskId: APPROVE_TASK_ID,
      runId: `${APPROVE_TASK_ID}-run-1`,
      stepId: `${APPROVE_TASK_ID}-step-1`,
      auditLogId: APPROVE_AUDIT_LOG_ID,
      awaitingPayload: {
        idempotencyKey: "approve-draft-idempotency",
        skillName: "legal_draft_workflow",
        riskLevel: "high",
        schemaVersion: "1",
        entities: {
          workflow_action: "approve",
          process_number: PROCESS_NUMBER,
          version_number: "2",
        },
      },
    },
    pendingTasks: {
      [APPROVE_TASK_ID]: buildMissionSnapshot(APPROVE_TASK_ID, {
        module: "mayus",
        goal,
        taskStatus: "awaiting_approval",
        stepStatus: "awaiting_approval",
        approvals: [
          {
            id: "approval-workflow-pending-1",
            status: "pending",
            approval_context: {
              audit_log_id: APPROVE_AUDIT_LOG_ID,
            },
          },
        ],
      }),
    } as Record<string, BrainTaskResponse>,
    executedTasks: {
      [APPROVE_TASK_ID]: buildMissionSnapshot(APPROVE_TASK_ID, {
        module: "mayus",
        goal,
        resultSummary: `A versao V2 · Contestação Previdenciária de ${PROCESS_NUMBER} foi aprovada com sucesso.`,
        approvals: [
          {
            id: "approval-workflow-pending-1",
            status: "approved",
            approved_at: "2026-04-20T22:20:00.000Z",
          },
        ],
        artifacts: [
          {
            id: "approve-workflow-artifact-1",
            artifact_type: "legal_draft_workflow_result",
            title: `Workflow formal - ${CLIENT_NAME}`,
            metadata: {
              summary: `A versao V2 · Contestação Previdenciária de ${PROCESS_NUMBER} foi aprovada com sucesso.`,
              process_number: PROCESS_NUMBER,
              piece_label: "Contestação Previdenciária",
              workflow_action_requested: "approve",
              draft_workflow_status: "approved",
            },
            created_at: "2026-04-20T22:20:01.000Z",
          },
        ],
        learningEvents: [
          {
            id: "approve-workflow-event-1",
            event_type: "legal_draft_workflow_executed",
            source_module: "mayus",
            payload: {
              summary: `A versao V2 · Contestação Previdenciária de ${PROCESS_NUMBER} foi aprovada com sucesso.`,
              workflow_status: "approved",
              piece_label: "Contestação Previdenciária",
            },
            created_at: "2026-04-20T22:20:02.000Z",
          },
        ],
      }),
    } as Record<string, BrainTaskResponse>,
  };
}

function buildPublishWorkflowScenario() {
  const goal = `Publicar a minuta formal do processo ${PROCESS_NUMBER}`;

  return {
    chatReply: `A publicação formal da versão atual de ${PROCESS_NUMBER} exige confirmação humana antes da execução.`,
    pendingKernel: {
      status: "awaiting_approval",
      taskId: PUBLISH_TASK_ID,
      runId: `${PUBLISH_TASK_ID}-run-1`,
      stepId: `${PUBLISH_TASK_ID}-step-1`,
      auditLogId: PUBLISH_AUDIT_LOG_ID,
      awaitingPayload: {
        idempotencyKey: "publish-draft-idempotency",
        skillName: "legal_draft_workflow",
        riskLevel: "high",
        schemaVersion: "1",
        entities: {
          workflow_action: "publish",
          process_number: PROCESS_NUMBER,
          version_number: "2",
        },
      },
    },
    pendingTasks: {
      [PUBLISH_TASK_ID]: buildMissionSnapshot(PUBLISH_TASK_ID, {
        module: "mayus",
        goal,
        taskStatus: "awaiting_approval",
        stepStatus: "awaiting_approval",
        approvals: [
          {
            id: "publish-workflow-pending-1",
            status: "pending",
            approval_context: {
              audit_log_id: PUBLISH_AUDIT_LOG_ID,
            },
          },
        ],
      }),
    } as Record<string, BrainTaskResponse>,
    executedTasks: {
      [PUBLISH_TASK_ID]: buildMissionSnapshot(PUBLISH_TASK_ID, {
        module: "mayus",
        goal,
        resultSummary: `A versao V2 · Contestação Previdenciária de ${PROCESS_NUMBER} foi aprovada e publicada com sucesso.`,
        approvals: [
          {
            id: "publish-workflow-pending-1",
            status: "approved",
            approved_at: "2026-04-20T22:25:00.000Z",
          },
        ],
        artifacts: [
          {
            id: "publish-workflow-artifact-1",
            artifact_type: "legal_draft_workflow_result",
            title: `Workflow formal - ${CLIENT_NAME}`,
            metadata: {
              summary: `A versao V2 · Contestação Previdenciária de ${PROCESS_NUMBER} foi aprovada e publicada com sucesso.`,
              process_number: PROCESS_NUMBER,
              piece_label: "Contestação Previdenciária",
              workflow_action_requested: "publish",
              draft_workflow_status: "published",
            },
            created_at: "2026-04-20T22:25:01.000Z",
          },
        ],
        learningEvents: [
          {
            id: "publish-workflow-event-1",
            event_type: "legal_draft_workflow_executed",
            source_module: "mayus",
            payload: {
              summary: `A versao V2 · Contestação Previdenciária de ${PROCESS_NUMBER} foi aprovada e publicada com sucesso.`,
              workflow_status: "published",
              piece_label: "Contestação Previdenciária",
            },
            created_at: "2026-04-20T22:25:02.000Z",
          },
        ],
      }),
    } as Record<string, BrainTaskResponse>,
  };
}

async function mockMayusRoutes(page: Page) {
  const contextScenario = buildContextScenario();
  const draftScenario = buildDraftScenario();
  const syncScenario = buildSyncScenario();
  const reviewScenario = buildReviewScenario();
  const revisionLoopScenario = buildRevisionLoopScenario();
  const publishPremiumScenario = buildPublishPremiumScenario();
  const supportStatusScenario = buildSupportStatusScenario();
  const supportStatusHandoffScenario = buildSupportStatusHandoffScenario();
  const approveWorkflowScenario = buildApproveWorkflowScenario();
  const publishWorkflowScenario = buildPublishWorkflowScenario();
  const taskSnapshots: Record<string, BrainTaskResponse> = {
    ...contextScenario.tasks,
    ...draftScenario.tasks,
    ...syncScenario.tasks,
    ...reviewScenario.tasks,
    ...revisionLoopScenario.tasks,
    ...supportStatusScenario.tasks,
    ...supportStatusHandoffScenario.tasks,
     ...publishPremiumScenario.pendingTasks,
     ...approveWorkflowScenario.pendingTasks,
     ...publishWorkflowScenario.pendingTasks,
  };

  await page.route("**/api/brain/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        default_provider: "openrouter",
        default_model: "gpt-4.1-mini",
        available_providers: [{ provider: "openrouter", model: "gpt-4.1-mini" }],
      }),
    });
  });

  await page.route("**/api/ai/conversations", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversations: [] }),
      });
      return;
    }

    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id: CONVERSATION_ID,
            title: "Nova Conversa",
            updated_at: "2026-04-20T22:00:00.000Z",
          },
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.route(/.*\/api\/ai\/conversations\/[^/]+$/, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          message: {
            id: `message-${Date.now()}`,
            role: body.role || "model",
            content: body.content || "",
            kernel: body.kernel || {},
            created_at: "2026-04-20T22:00:00.000Z",
          },
        }),
      });
      return;
    }

    if (route.request().method() === "PATCH") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ messages: [] }),
      });
      return;
    }

    await route.continue();
  });

  await page.route("**/api/brain/chat-turn", async (route) => {
    const body = route.request().postDataJSON() as { message?: string };
    const message = String(body.message || "");
    const scenario = /cliente\s+playwright\s+e2e.*(sem\s+numero|amb[ií]gu|ambigu)/i.test(message)
      ? supportStatusHandoffScenario
      : /status\s+do\s+(caso|processo)|como\s+(est[aá]|anda)\s+(o\s+)?(caso|processo)|cliente.*(pergunt|quer\s+saber).*(caso|processo)|respon(d|da)\s+(o\s+)?cliente.*(caso|processo)/i.test(message)
        ? supportStatusScenario
      : /publica[r]?\s+(a\s+)?(minuta|vers[aã]o)|publique\s+(a\s+)?(minuta|vers[aã]o)/i.test(message)
      ? publishWorkflowScenario
      : /artifact\s+premium|pdf\s+final|peca\s+final\s+no\s+drive|suba\s+(o\s+)?pdf\s+da\s+minuta/i.test(message)
        ? publishPremiumScenario
      : /aprova[r]?\s+(a\s+)?(minuta|vers[aã]o)|aprove\s+(a\s+)?(minuta|vers[aã]o)/i.test(message)
        ? approveWorkflowScenario
        : /melhor(e|ar)\s+(a\s+)?minuta\s+por\s+se[cç][aã]o|reforc(e|ar)\s+(a\s+)?argumenta[cç][aã]o|plano\s+de\s+revis[aã]o\s+da\s+minuta|o\s+que\s+voce\s+mudaria\s+na\s+minuta|prepare\s+uma\s+nova\s+vers[aã]o\s+da\s+minuta/i.test(message)
          ? revisionLoopScenario
        : /sincroniz(ar|e)\s+(os\s+)?documentos|atualiz(ar|e)\s+(a\s+)?mem[oó]ria\s+documental|relei(a|a\s+o)\s+(o\s+)?reposit[oó]rio|atualiz(ar|e)\s+(o\s+)?acervo/i.test(message)
          ? syncScenario
        : /revis(ar|e)\s+(a\s+)?(minuta|vers[aã]o)|review\s+(da\s+)?(minuta|vers[aã]o)|checklist\s+(da\s+)?minuta|o\s+que\s+falta\s+na\s+minuta/i.test(message)
          ? reviewScenario
        : /primeira\s+minuta|draft\s+factory/i.test(message)
          ? draftScenario
          : contextScenario;

    Object.assign(taskSnapshots, "pendingTasks" in scenario ? scenario.pendingTasks : scenario.tasks);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: scenario.chatReply,
        kernel: "pendingKernel" in scenario ? scenario.pendingKernel : scenario.kernel,
        taskId: "pendingKernel" in scenario ? scenario.pendingKernel.taskId : scenario.kernel.taskId,
        runId: "pendingKernel" in scenario ? scenario.pendingKernel.runId : scenario.kernel.runId,
        stepId: "pendingKernel" in scenario ? scenario.pendingKernel.stepId : scenario.kernel.stepId,
      }),
    });
  });

  await page.route("**/api/ai/approve", async (route) => {
    const body = route.request().postDataJSON() as { auditLogId?: string; decision?: string };
    const auditLogId = String(body.auditLogId || "");

    if (body.decision === "approved" && auditLogId === APPROVE_AUDIT_LOG_ID) {
      Object.assign(taskSnapshots, approveWorkflowScenario.executedTasks);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "executed", message: "Versão aprovada com sucesso." }),
      });
      return;
    }

    if (body.decision === "approved" && auditLogId === PUBLISH_AUDIT_LOG_ID) {
      Object.assign(taskSnapshots, publishWorkflowScenario.executedTasks);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "executed", message: "Versão publicada com sucesso." }),
      });
      return;
    }

    if (body.decision === "approved" && auditLogId === PUBLISH_PREMIUM_AUDIT_LOG_ID) {
      Object.assign(taskSnapshots, publishPremiumScenario.executedTasks);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "executed", message: "Artifact premium publicado com sucesso." }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "rejected", message: "Acao rejeitada." }),
    });
  });

  await page.route("**/api/ai/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reply: "ok", kernel: { status: "success" } }),
    });
  });

  await page.route("**/api/brain/tasks/*", async (route) => {
    const taskId = route.request().url().split("/").pop() || "";
    const task = taskSnapshots[taskId];

    if (!task) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Missao nao encontrada." }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(task),
    });
  });
}

async function openMayus(page: Page) {
  await mockMayusRoutes(page);
  await loginThroughUi(page);
  await page.goto("/dashboard/mayus", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/mayus$/);
  await expect(page.getByTestId("mayus-chat-input")).toBeVisible({ timeout: 120_000 });
}

test.describe("MAYUS authenticated", () => {
  const credentials = getPlaywrightCredentials();

  test.skip(!credentials.available, "Configure PLAYWRIGHT_EMAIL e PLAYWRIGHT_PASSWORD para rodar os testes autenticados.");

  test("resolve o contexto juridico por chat e mostra a missao relacionada do Case Brain", async ({ page }) => {
    test.setTimeout(180_000);
    await openMayus(page);

    await page.getByTestId("mayus-chat-input").fill(`Quero o contexto jurídico, a peça sugerida e o status da minuta do processo ${PROCESS_NUMBER}.`);
    await page.getByTestId("mayus-send-button").click();

    await expect(page.getByText(new RegExp(`Contexto jurídico resolvido para ${PROCESS_NUMBER.replace(/[-.]/g, "\\$&")}`, "i")).first()).toBeVisible();

    const mayusMission = page.getByTestId(`mayus-mission-card-${CONTEXT_TASK_ID}`).first();
    const caseBrainMission = page.getByTestId(`mayus-mission-card-${CASE_BRAIN_TASK_ID}`).first();
    const contextArtifact = page.getByTestId("mayus-artifact-context-artifact-1").first();
    const caseBrainArtifact = page.getByTestId("mayus-artifact-case-brain-artifact-1").first();

    await expect(mayusMission).toBeVisible();
    await expect(contextArtifact).toBeVisible();
    await expect(contextArtifact).toContainText(/contexto jur[ií]dico/i);
    await expect(contextArtifact).toContainText(PROCESS_NUMBER);
    await expect(mayusMission.getByText(/minuta completed/i).first()).toBeVisible();

    await expect(caseBrainMission).toBeVisible();
    await expect(caseBrainArtifact).toBeVisible();
    await expect(caseBrainArtifact).toContainText(/draft plan/i);
    await expect(caseBrainMission.getByText(/draft plan pronto/i).first()).toBeVisible();
  });

  test("responde status do caso por chat e mostra artifact/event de suporte", async ({ page }) => {
    test.setTimeout(180_000);
    await openMayus(page);

    await page.getByTestId("mayus-chat-input").fill(`O cliente perguntou como está o caso ${PROCESS_NUMBER}. Me dê um status curto para responder.`);
    await page.getByTestId("mayus-send-button").click();

    await expect(page.getByText(/Status do caso/i).first()).toBeVisible();
    await expect(page.getByText(/Status atual:/i).first()).toBeVisible();

    const supportMission = page.getByTestId(`mayus-mission-card-${SUPPORT_STATUS_TASK_ID}`).first();
    const supportArtifact = page.getByTestId("mayus-artifact-support-status-artifact-1").first();
    const supportEvent = page.getByTestId("mayus-event-support-status-event-1").first();

    await expect(supportMission).toBeVisible();
    await expect(supportArtifact).toBeVisible();
    await expect(supportArtifact).toContainText(/status do caso/i);
    await expect(supportArtifact).toContainText(PROCESS_NUMBER);
    await expect(supportArtifact).toContainText(/modo answer/i);
    await expect(supportArtifact).toContainText(/confianca high/i);
    await expect(supportArtifact).toContainText(/fase Contestação/i);
    await expect(supportEvent).toBeVisible();
    await expect(supportEvent).toContainText(/status do caso respondido/i);
  });

  test("mostra handoff seguro quando status do caso tem referencia ambigua", async ({ page }) => {
    test.setTimeout(180_000);
    await openMayus(page);

    await page.getByTestId("mayus-chat-input").fill(`O cliente ${CLIENT_NAME} sem numero perguntou como anda o caso ambiguo. Responda o cliente com segurança.`);
    await page.getByTestId("mayus-send-button").click();

    await expect(page.getByText(/handoff humano recomendado/i).first()).toBeVisible();

    const supportMission = page.getByTestId(`mayus-mission-card-${SUPPORT_STATUS_HANDOFF_TASK_ID}`).first();
    const supportArtifact = page.getByTestId("mayus-artifact-support-status-handoff-artifact-1").first();
    const supportEvent = page.getByTestId("mayus-event-support-status-handoff-event-1").first();

    await expect(supportMission).toBeVisible();
    await expect(supportArtifact).toBeVisible();
    await expect(supportArtifact).toContainText(/status do caso/i);
    await expect(supportArtifact).toContainText(/modo handoff/i);
    await expect(supportArtifact).toContainText(/confianca low/i);
    await expect(supportArtifact).toContainText(/handoff ambiguous case match/i);
    await expect(supportEvent).toBeVisible();
    await expect(supportEvent).toContainText(/status do caso respondido/i);
  });

  test("solicita a primeira minuta por chat e acompanha a missao da Draft Factory", async ({ page }) => {
    test.setTimeout(180_000);
    await openMayus(page);

    await page.getByTestId("mayus-chat-input").fill(`Pode gerar a primeira minuta do processo ${PROCESS_NUMBER} pela Draft Factory?`);
    await page.getByTestId("mayus-send-button").click();

    await expect(page.getByText(/foi gerada pela draft factory jur[ií]dica/i).first()).toBeVisible();

    const mayusMission = page.getByTestId(`mayus-mission-card-${DRAFT_TASK_ID}`).first();
    const draftFactoryMission = page.getByTestId(`mayus-mission-card-${DRAFT_FACTORY_TASK_ID}`).first();

    await expect(mayusMission).toBeVisible();
    await expect(mayusMission.getByText(/resultado da primeira minuta/i)).toBeVisible();
    await expect(mayusMission.getByText(/contestação previdenciária/i).first()).toBeVisible();

    await expect(draftFactoryMission).toBeVisible();
    await expect(draftFactoryMission.getByText(/artifact da primeira minuta/i)).toBeVisible();
    await expect(draftFactoryMission.getByText(/previdenciário/i)).toBeVisible();
    await expect(draftFactoryMission.getByText(/primeira minuta pronta/i).first()).toBeVisible();
  });

  test("sincroniza a memoria documental por chat e mostra a missao operacional do refresh", async ({ page }) => {
    test.setTimeout(180_000);
    await openMayus(page);

    await page.getByTestId("mayus-chat-input").fill(`Sincronize os documentos do processo ${PROCESS_NUMBER} e atualize a memória documental.`);
    await page.getByTestId("mayus-send-button").click();

    await expect(page.getByText(/Memoria documental atualizada/i).first()).toBeVisible();

    const syncMission = page.getByTestId(`mayus-mission-card-${SYNC_TASK_ID}`).first();
    const syncArtifact = page.getByTestId("mayus-artifact-document-sync-artifact-1").first();

    await expect(syncMission).toBeVisible();
    await expect(syncArtifact).toBeVisible();
    await expect(syncArtifact).toContainText(/refresh documental/i);
    await expect(syncArtifact).toContainText(/sync synced/i);
    await expect(syncArtifact).toContainText(/3 docs/i);
    await expect(syncArtifact).toContainText(/1 warnings/i);
    await expect(syncArtifact).toContainText(/1 pendencias/i);
    await expect(syncMission.getByText(/3 documento\(s\) sincronizados/i).first()).toBeVisible();
  });

  test("revisa a minuta por chat e mostra o guidance juridico orientado do MAYUS", async ({ page }) => {
    test.setTimeout(180_000);
    await openMayus(page);

    await page.getByTestId("mayus-chat-input").fill(`Revise a minuta V2 do processo ${PROCESS_NUMBER} e me diga o que falta antes de aprovar.`);
    await page.getByTestId("mayus-send-button").click();

    await expect(page.getByText(/Revisão orientada da minuta/i).first()).toBeVisible();

    const reviewMission = page.getByTestId(`mayus-mission-card-${REVIEW_TASK_ID}`).first();
    const reviewArtifact = page.getByTestId("mayus-artifact-draft-review-artifact-1").first();
    const caseBrainMission = page.getByTestId(`mayus-mission-card-${CASE_BRAIN_TASK_ID}`).first();

    await expect(reviewMission).toBeVisible();
    await expect(reviewArtifact).toBeVisible();
    await expect(reviewArtifact).toContainText(/revisao da minuta/i);
    await expect(reviewArtifact).toContainText(/veredito attention/i);
    await expect(reviewArtifact).toContainText(/proximo passo strengthen before approval/i);
    await expect(reviewMission.getByText(/a minuta está utilizável, mas ainda pede reforço jurídico/i).first()).toBeVisible();

    await expect(caseBrainMission).toBeVisible();
    await expect(caseBrainMission.getByText(/draft plan/i).first()).toBeVisible();
  });

  test("monta o loop supervisionado da minuta por chat e mostra o plano de reforco por secao", async ({ page }) => {
    test.setTimeout(180_000);
    await openMayus(page);

    await page.getByTestId("mayus-chat-input").fill(`Melhore a minuta por seção e monte um plano de revisão da V2 do processo ${PROCESS_NUMBER}.`);
    await page.getByTestId("mayus-send-button").click();

    await expect(page.getByText(/Loop supervisionado da minuta/i).first()).toBeVisible();

    const loopMission = page.getByTestId(`mayus-mission-card-${LOOP_TASK_ID}`).first();
    const loopArtifact = page.getByTestId("mayus-artifact-draft-loop-artifact-1").first();

    await expect(loopMission).toBeVisible();
    await expect(loopArtifact).toBeVisible();
    await expect(loopArtifact).toContainText(/loop da minuta/i);
    await expect(loopArtifact).toContainText(/veredito attention/i);
    await expect(loopArtifact).toContainText(/proximo passo apply revision plan/i);
    await expect(loopArtifact).toContainText(/4 secoes/i);
    await expect(loopArtifact).toContainText(/3 fracas/i);
    await expect(loopArtifact).toContainText(/1 ausentes/i);
    await expect(loopMission.getByText(/3 seção\(ões\) fracas/i).first()).toBeVisible();
  });

  test("publica o artifact premium por chat e mostra o link final do Drive", async ({ page }) => {
    test.setTimeout(180_000);
    await openMayus(page);

    await page.getByTestId("mayus-chat-input").fill(`Publique o artifact premium da versão 2 do processo ${PROCESS_NUMBER} no Drive.`);
    await page.getByTestId("mayus-send-button").click();

    await expect(page.getByText(/exige confirma[cç][aã]o humana/i).first()).toBeVisible();
    await expect(page.getByText(/legal_artifact_publish_premium/i)).toBeVisible();

    await page.getByRole("button", { name: /^aprovar$/i }).click();

    await expect(page.getByText(/a[cç][aã]o executada com sucesso/i)).toBeVisible();

    const publishMission = page.getByTestId(`mayus-mission-card-${PUBLISH_PREMIUM_TASK_ID}`).first();
    const publishArtifact = page.getByTestId("mayus-artifact-publish-premium-artifact-1").first();

    await expect(publishMission).toBeVisible();
    await expect(publishArtifact).toBeVisible();
    await expect(publishArtifact).toContainText(/artifact premium/i);
    await expect(publishArtifact).toContainText(/formato pdf/i);
    await expect(publishArtifact).toContainText(/publicacao published/i);
    await expect(publishArtifact).toContainText(/Delta capturado contra a primeira minuta gerada/i);
    await expect(publishMission.getByText(/09-Pecas Finais/i).first()).toBeVisible();
    await expect(publishMission.getByText(/Delta capturado contra a primeira minuta gerada/i).first()).toBeVisible();
  });

  test("aprova a minuta formal por chat usando o approval card do MAYUS", async ({ page }) => {
    test.setTimeout(180_000);
    await openMayus(page);

    await page.getByTestId("mayus-chat-input").fill(`Pode aprovar a minuta V2 do processo ${PROCESS_NUMBER}?`);
    await page.getByTestId("mayus-send-button").click();

    await expect(page.getByText(/exige confirma[cç][aã]o humana/i).first()).toBeVisible();
    await expect(page.getByText(/legal_draft_workflow/i)).toBeVisible();
    await expect(page.getByText(/workflow_action:/i)).toBeVisible();

    await page.getByRole("button", { name: /^aprovar$/i }).click();

    await expect(page.getByText(/a[cç][aã]o executada com sucesso/i)).toBeVisible();

    const missionCard = page.getByTestId(`mayus-mission-card-${APPROVE_TASK_ID}`).first();
    const workflowArtifact = page.getByTestId("mayus-artifact-approve-workflow-artifact-1").first();

    await expect(missionCard).toBeVisible();
    await expect(workflowArtifact).toBeVisible();
    await expect(workflowArtifact).toContainText(/resultado do workflow formal/i);
    await expect(workflowArtifact).toContainText(/acao approve/i);
    await expect(workflowArtifact).toContainText(/workflow approved/i);
    await expect(missionCard.getByText(/aprovada com sucesso/i).first()).toBeVisible();
  });

  test("publica a minuta formal por chat apos confirmacao no approval card do MAYUS", async ({ page }) => {
    test.setTimeout(180_000);
    await openMayus(page);

    await page.getByTestId("mayus-chat-input").fill(`Publique a minuta do processo ${PROCESS_NUMBER}.`);
    await page.getByTestId("mayus-send-button").click();

    await expect(page.getByText(/publica[cç][aã]o formal/i).first()).toBeVisible();
    await page.getByRole("button", { name: /^aprovar$/i }).click();

    await expect(page.getByText(/a[cç][aã]o executada com sucesso/i)).toBeVisible();

    const missionCard = page.getByTestId(`mayus-mission-card-${PUBLISH_TASK_ID}`).first();
    const workflowArtifact = page.getByTestId("mayus-artifact-publish-workflow-artifact-1").first();

    await expect(missionCard).toBeVisible();
    await expect(workflowArtifact).toBeVisible();
    await expect(workflowArtifact).toContainText(/resultado do workflow formal/i);
    await expect(workflowArtifact).toContainText(/acao publish/i);
    await expect(workflowArtifact).toContainText(/workflow published/i);
    await expect(missionCard.getByText(/aprovada e publicada com sucesso/i).first()).toBeVisible();
  });
});
