import { expect, test } from "@playwright/test";
import { getPlaywrightCredentials, loginThroughUi } from "./helpers/auth";

const PROCESS_NUMBER = "E2E-2026-0001";
const AUDIT_LOG_ID = "approval-audit-draft-1";

test.describe("Lex supervised approval smoke", () => {
  const credentials = getPlaywrightCredentials();

  test.skip(!credentials.available, "Configure PLAYWRIGHT_EMAIL e PLAYWRIGHT_PASSWORD para rodar os testes autenticados.");

  test("mostra approval juridico no inbox e aprova a geracao da minuta", async ({ page }) => {
    test.setTimeout(180_000);
    let approved = false;

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

    await page.route("**/api/brain/inbox**", async (route) => {
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
                    process_number: PROCESS_NUMBER,
                    recommended_piece_label: "Contestacao Previdenciaria",
                  },
                  created_at: "2026-05-12T18:05:00.000Z",
                  task,
                },
              ]
            : [],
          recent_events: [],
        }),
      });
    });

    await page.route("**/api/ai/approve", async (route) => {
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

    await loginThroughUi(page, { browserProfileMode: "ui-harness" });
    await page.goto("/dashboard/aprovacoes", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: /Inbox de Aprovações/i })).toBeVisible();
    await expect(page.getByText(/Missao juridica supervisionada/i)).toBeVisible();
    await expect(page.getByText(PROCESS_NUMBER).first()).toBeVisible();
    await expect(page.getByText(/Contestacao Previdenciaria/i).first()).toBeVisible();
    await expect(page.getByText(/Gerar primeira minuta juridica/i)).toBeVisible();
    await expect(page.getByText(/Draft Factory/i)).toBeVisible();

    await page.getByRole("button", { name: /^Aprovar$/i }).click();

    await expect(page.getByText(/Nenhuma aprovacao pendente/i)).toBeVisible();
    await expect(page.getByText(/legal_first_draft_generate/i).first()).toBeVisible();
    await expect(page.getByText(/Primeira minuta - Cliente Playwright E2E/i)).toBeVisible();
  });
});
