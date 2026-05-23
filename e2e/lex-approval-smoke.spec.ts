import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { getPlaywrightCredentials, loginThroughUi } from "./helpers/auth";

const PROCESS_NUMBER = "E2E-2026-0001";
const AUDIT_LOG_ID = "approval-audit-draft-1";

function readLocalEnv(key: string) {
  const direct = process.env[key]?.trim();
  if (direct) return direct;

  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return "";

  const match = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith(`${key}=`));

  return match ? match.slice(key.length + 1).trim() : "";
}

async function forceAdminBrowserProfile(page: Parameters<typeof loginThroughUi>[0]) {
  const supabaseUrl = readLocalEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseUrl) return;

  const supabaseOrigin = new URL(supabaseUrl).origin;
  await page.route(`${supabaseOrigin}/rest/v1/profiles**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/vnd.pgrst.object+json",
      body: JSON.stringify({
        id: "playwright-user",
        tenant_id: "playwright-tenant",
        full_name: "Playwright E2E",
        role: "admin",
        is_active: true,
        avatar_url: null,
        custom_permissions: [],
        email_corporativo: null,
        oab_registro: null,
        is_superadmin: false,
      }),
    });
  });
}

test.describe("Lex supervised approval smoke", () => {
  const credentials = getPlaywrightCredentials();

  test.skip(!credentials.available, "Configure PLAYWRIGHT_EMAIL e PLAYWRIGHT_PASSWORD para rodar os testes autenticados.");

  test("mostra approval juridico no inbox e aprova a geracao da minuta", async ({ page }) => {
    test.setTimeout(180_000);
    let approved = false;
    let retryRequested = false;

    const task = {
      id: "brain-task-lex-smoke",
      title: `Executar proximo passo seguro do processo ${PROCESS_NUMBER}`,
      goal: `Executar proximo passo seguro do processo ${PROCESS_NUMBER}`,
      module: "mayus",
      channel: "chat",
      status: "awaiting_approval",
      created_at: "2026-05-12T18:00:00.000Z",
      updated_at: "2026-05-12T18:00:00.000Z",
      result_summary: "Missao juridica supervisionada aguardando aprovacao humana.",
      error_message: null,
    };
    const legalOperatorState = {
      phase: "Contestacao",
      status: "awaiting_human_approval",
      safeNextAction: {
        action: "generate_first_draft",
        label: "Pedir aprovacao para gerar primeira minuta",
        canAutoExecute: false,
        requiresApproval: true,
        externalSideEffectsBlocked: true,
      },
      humanGate: {
        required: true,
        reason: "Geracao de minuta juridica exige aprovacao humana antes de chamar a Draft Factory.",
        blocksExternalAction: true,
      },
      blockers: [],
      evidenceSummary: {
        confidence: "high",
        factualSources: ["case_brain"],
        inferenceNotes: [],
        missingSignals: [],
        documentFreshness: "fresh",
        documentCount: 3,
        draftStatus: "idle",
      },
    };
    const draftVerificationChecklist = [
      "Confirmar se Contestacao Previdenciaria e compativel com a fase atual.",
      "Validar documentos e fatos usados antes de citar.",
      "Manter minuta como artefato interno sem protocolo, envio externo ou publicacao automatica.",
    ];
    const pieceContext = {
      piece_label: "Contestacao Previdenciaria",
      phase: "Contestacao",
      documents_used: ["case_brain", "memoria_documental"],
      expected_documents: ["procuracao", "documento pessoal"],
      missing_documents: ["CNIS atualizado"],
      gaps: ["validar CNIS atualizado antes de assinatura"],
      case_brain: {
        high_risk_count: 0,
        high_contradiction_count: 0,
        grounding_gap_count: 1,
      },
      draft_verification_checklist: draftVerificationChecklist,
      draftVerificationChecklist,
      external_side_effects_blocked: true,
    };
    const openclawPolicy = {
      surface: "legal_decision",
      outcome: "requires_approval",
      requires_approval: true,
      reason: "Geracao de minuta juridica exige aprovacao humana antes de chamar a Draft Factory.",
    };
    const sideEffectGuardrail = {
      protectedSideEffects: ["protocol_filing", "client_or_court_message", "external_publication"],
      approvalGate: "human_review_required",
    };
    const retryMission = () => ({
      missionId: "brain-task-retry-smoke",
      taskId: "brain-task-retry-smoke",
      module: "mayus",
      agentSource: "paperclip",
      status: "executing",
      goal: "Reabrir etapa operacional supervisionada",
      currentStep: retryRequested
        ? {
            id: "brain-step-retry-smoke-queued",
            title: "Retry - Atualizar memoria documental",
            status: "queued",
            stepType: "capability",
            capabilityName: "legal_document_memory_refresh",
            handlerType: "lex_document_memory_refresh",
          }
        : {
            id: "brain-step-retry-smoke",
            title: "Atualizar memoria documental",
            status: "failed",
            stepType: "capability",
            capabilityName: "legal_document_memory_refresh",
            handlerType: "lex_document_memory_refresh",
          },
      pendingApproval: null,
      blockers: retryRequested
        ? ["Retry aguardando execucao: Retry - Atualizar memoria documental"]
        : ["Falha anterior validada pelo operador."],
      policy: null,
      trajectory: null,
      routine: {
        routineId: "paperclip_deadline_guardian",
        label: "Guardiao de prazos",
        source: "paperclip",
        agentId: "paperclip",
        status: retryRequested ? "queued" : "failed",
        budgetStatus: "ok",
        owner: "paperclip",
      },
      latestArtifactId: null,
      latestEventId: retryRequested ? "event-retry-smoke" : null,
      timeline: retryRequested
        ? [{
            id: "event-retry-smoke",
            source: "event",
            title: "Retry solicitado",
            status: "retry",
            createdAt: "2026-05-12T18:03:00.000Z",
          }]
        : [{
            id: "brain-step-retry-smoke",
            source: "step",
            title: "Atualizar memoria documental",
            status: "failed",
            createdAt: "2026-05-12T18:02:00.000Z",
          }],
      nextSafeAction: retryRequested
        ? "Executar etapa segura: Retry - Atualizar memoria documental."
        : "Revisar motivo da falha antes de reabrir.",
      legalOperatorMission: null,
      lastUpdatedAt: retryRequested ? "2026-05-12T18:03:00.000Z" : "2026-05-12T18:02:00.000Z",
    });
    const approval = {
      id: "brain-approval-lex-smoke",
      status: approved ? "approved" : "pending",
      risk_level: "high",
      created_at: "2026-05-12T18:00:00.000Z",
      approved_at: approved ? "2026-05-12T18:05:00.000Z" : null,
      decision_notes: approved ? "Primeira minuta gerada pela Draft Factory apos aprovacao." : null,
      audit_log_id: AUDIT_LOG_ID,
      awaiting_payload: {
        entities: {
          process_task_id: "process-task-1",
          process_number: PROCESS_NUMBER,
          recommended_piece_input: "Contestacao",
          recommended_piece_label: "Contestacao Previdenciaria",
        },
        idempotencyKey: "lex-smoke-idempotency",
        skillName: "legal_first_draft_generate",
        riskLevel: "high",
        schemaVersion: "1.0.0",
        reason: "Geracao de minuta juridica exige aprovacao humana antes de chamar a Draft Factory.",
        proposedActionLabel: "Gerar primeira minuta juridica",
        processLabel: PROCESS_NUMBER,
        missionGoal: "Gerar a primeira minuta juridica com base no contexto e na memoria documental do processo.",
        legalOperatorState,
        methodology: {
          status: "approved",
          expectedDocuments: ["procuracao", "documento pessoal"],
        },
        sources: {
          factual: ["case_brain", "memoria_documental"],
        },
        gaps: {
          all: ["validar CNIS atualizado antes de assinatura"],
        },
        piece_context: pieceContext,
        pieceContext,
        draft_verification_checklist: draftVerificationChecklist,
        draftVerificationChecklist,
        sideEffectGuardrail,
        openclawPolicy,
        agenticGovernance: {
          openclaw_policy: openclawPolicy,
          paperclip: {
            owner: "legal_operator",
            next_action: "Aguardar aprovacao humana para gerar minuta interna.",
          },
          hermes: {
            trajectory: ["objective", "step", "decision", "approval"],
          },
        },
      },
      task,
      step: {
        id: "brain-step-lex-smoke",
        title: "Aguardar aprovacao da primeira minuta",
        status: "awaiting_approval",
        step_type: "capability",
        capability_name: "legal_first_draft_generate",
        handler_type: "lex_first_draft_generate",
      },
    };

    await page.route("**/*", async (route) => {
      if (!route.request().url().includes("/api/brain/inbox")) {
        return route.fallback();
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pending_count: approved ? 0 : 1,
          pending_approvals: approved ? [] : [approval],
          recent_approvals: approved ? [{ ...approval, status: "approved", approved_at: "2026-05-12T18:05:00.000Z" }] : [],
          recent_tasks: [task],
          recent_artifacts: approved
            ? [
                {
                  id: "artifact-draft-1",
                  artifact_type: "legal_first_draft_result",
                  title: "Primeira minuta - Cliente Playwright E2E",
                  storage_url: null,
                  mime_type: "text/markdown",
                  source_module: "mayus",
                  metadata: {
                    process_task_id: "process-task-1",
                    process_number: PROCESS_NUMBER,
                    recommended_piece_label: "Contestacao Previdenciaria",
                    legal_operator_state: {
                      ...legalOperatorState,
                      status: "awaiting_supervision",
                    },
                  },
                  created_at: "2026-05-12T18:05:00.000Z",
                  task,
                },
              ]
            : [],
          recent_events: [],
          legal_operator_missions: [
            {
              key: "process_task:process-task-1",
              processTaskId: "process-task-1",
              processNumber: PROCESS_NUMBER,
              processLabel: PROCESS_NUMBER,
              taskId: "brain-task-lex-smoke",
              currentState: approved ? { ...legalOperatorState, status: "awaiting_supervision" } : legalOperatorState,
              currentSource: approved ? "artifact" : "approval",
              pendingApproval: approved
                ? null
                : {
                    id: "brain-approval-lex-smoke",
                    auditLogId: AUDIT_LOG_ID,
                    riskLevel: "high",
                    skillName: "legal_first_draft_generate",
                    createdAt: "2026-05-12T18:00:00.000Z",
                  },
              latestArtifactId: approved ? "artifact-draft-1" : null,
              latestEventId: null,
              timeline: [{
                id: approved ? "artifact-draft-1" : "brain-approval-lex-smoke",
                source: approved ? "artifact" : "approval",
                title: approved ? "Primeira minuta - Cliente Playwright E2E" : "Gerar primeira minuta juridica",
                status: approved ? "awaiting_supervision" : "pending",
                createdAt: approved ? "2026-05-12T18:05:00.000Z" : "2026-05-12T18:00:00.000Z",
              }],
              lastUpdatedAt: approved ? "2026-05-12T18:05:00.000Z" : "2026-05-12T18:00:00.000Z",
            },
          ],
          mission_control_snapshots: [
            {
              missionId: "brain-task-lex-smoke",
              taskId: "brain-task-lex-smoke",
              module: "mayus",
              agentSource: "legal_operator",
              status: approved ? "completed" : "awaiting_approval",
              goal: `Executar proximo passo seguro do processo ${PROCESS_NUMBER}`,
              currentStep: {
                id: "brain-step-lex-smoke",
                title: "Aguardar aprovacao da primeira minuta",
                status: approved ? "completed" : "awaiting_approval",
                stepType: "capability",
                capabilityName: "legal_first_draft_generate",
                handlerType: "lex_first_draft_generate",
              },
              pendingApproval: approved
                ? null
                : {
                    id: "brain-approval-lex-smoke",
                    auditLogId: AUDIT_LOG_ID,
                    riskLevel: "high",
                    skillName: "legal_first_draft_generate",
                    createdAt: "2026-05-12T18:00:00.000Z",
                  },
              blockers: approved ? [] : ["Approval humano pendente: legal_first_draft_generate"],
              policy: {
                outcome: "requires_approval",
                surface: "legal_decision",
                module: "mayus",
                requiresApproval: true,
                canExecuteNow: false,
                credentialGate: false,
                budgetGate: null,
                reason: "Geracao de minuta juridica exige aprovacao humana antes de chamar a Draft Factory.",
                source: "openclaw_policy",
              },
              trajectory: {
                status: approved ? "completed" : "waiting_approval",
                eventsCount: approved ? 3 : 2,
                lastEventType: approved ? "result" : "approval",
                lastEventSummary: approved ? "Primeira minuta gerada." : "Aguardar socio.",
                lifecycleStatus: null,
                lifecycleKind: null,
                latestMemoryId: null,
              },
              routine: null,
              latestArtifactId: approved ? "artifact-draft-1" : null,
              latestEventId: null,
              timeline: [{
                id: approved ? "artifact-draft-1" : "brain-approval-lex-smoke",
                source: approved ? "artifact" : "approval",
                title: approved ? "Primeira minuta - Cliente Playwright E2E" : "legal_first_draft_generate",
                status: approved ? "completed" : "pending",
                createdAt: approved ? "2026-05-12T18:05:00.000Z" : "2026-05-12T18:00:00.000Z",
              }],
              nextSafeAction: approved
                ? "Revisar minuta gerada antes de qualquer publicacao."
                : "Aguardar approval humano para legal_first_draft_generate.",
              legalOperatorMission: {
                key: "process_task:process-task-1",
                processTaskId: "process-task-1",
                processNumber: PROCESS_NUMBER,
                processLabel: PROCESS_NUMBER,
                taskId: "brain-task-lex-smoke",
                currentState: approved ? { ...legalOperatorState, status: "awaiting_supervision" } : legalOperatorState,
                currentSource: approved ? "artifact" : "approval",
                pendingApproval: null,
                latestArtifactId: approved ? "artifact-draft-1" : null,
                latestEventId: null,
                timeline: [],
                lastUpdatedAt: approved ? "2026-05-12T18:05:00.000Z" : "2026-05-12T18:00:00.000Z",
              },
              lastUpdatedAt: approved ? "2026-05-12T18:05:00.000Z" : "2026-05-12T18:00:00.000Z",
            },
            retryMission(),
          ],
        }),
      });
    });

    await page.context().route(/\/api\/brain\/tasks\/brain-task-retry-smoke\/steps\/brain-step-retry-smoke\/retry(?:\?|$)/, async (route) => {
      const body = route.request().postDataJSON() as { reason?: string };
      expect(body).toEqual({ reason: "Reabrir para smoke" });
      retryRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            status: "retry_queued",
            taskId: "brain-task-retry-smoke",
            stepId: "brain-step-retry-smoke",
            retryStepId: "brain-step-retry-smoke-queued",
            reason: "Reabrir para smoke",
          },
        }),
      });
    });

    await page.context().route(/\/api\/ai\/approve(?:\?|$)/, async (route) => {
      const body = route.request().postDataJSON() as { auditLogId?: string; decision?: string };
      expect(body).toEqual({ auditLogId: AUDIT_LOG_ID, decision: "approved" });
      approved = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "executed",
          auditLogId: AUDIT_LOG_ID,
          approvedBy: "playwright-user",
          artifactId: "artifact-draft-1",
          message: "Primeira minuta gerada pela Draft Factory apos aprovacao humana.",
        }),
      });
    });

    await forceAdminBrowserProfile(page);
    await loginThroughUi(page, { browserProfileMode: "ui-harness" });
    await page.goto("/dashboard/aprovacoes", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: /Inbox de Aprovações/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Controle agentico/i })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/OpenClaw/i).first()).toBeVisible();
    await expect(page.getByText(/Hermes/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Retry/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Cancelar step/i })).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept("Reabrir para smoke"));
    await page.getByRole("button", { name: /Retry/i }).click();
    await expect(page.getByText(/Retry aguardando execucao/i)).toBeVisible();
    await expect(page.getByText(/Missoes juridicas vivas/i)).toBeVisible();
    await expect(page.getByText(/approval pendente: legal_first_draft_generate/i)).toBeVisible();
    await expect(page.getByText("Missao juridica supervisionada", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(PROCESS_NUMBER).first()).toBeVisible();
    await expect(page.getByText(/Contestacao Previdenciaria/i).first()).toBeVisible();
    await expect(page.getByText(/Gerar primeira minuta juridica/i)).toBeVisible();
    await expect(page.getByText(/Draft Factory/i).first()).toBeVisible();
    await expect(page.getByText(/Documentos esperados/i)).toBeVisible();
    await expect(page.getByText(/Fontes usadas/i)).toBeVisible();
    await expect(page.getByText(/Lacunas/i).first()).toBeVisible();
    await expect(page.getByText(/Checklist da minuta/i)).toBeVisible();
    await expect(page.getByText(/Guardrails de beta/i)).toBeVisible();
    await expect(page.getByText(/protocol_filing/i)).toBeVisible();
    await expect(page.getByText(/CNIS atualizado/i)).toBeVisible();

    await page.getByRole("button", { name: /^Aprovar$/i }).click();

    await expect(page.getByText(/Nenhuma aprovacao pendente/i)).toBeVisible();
    await expect(page.getByText(/legal_first_draft_generate/i).first()).toBeVisible();
    await expect(page.getByText(/Primeira minuta - Cliente Playwright E2E/i)).toBeVisible();
  });
});
