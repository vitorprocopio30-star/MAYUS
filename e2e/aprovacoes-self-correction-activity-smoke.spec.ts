import { expect, test } from "@playwright/test";
import { getPlaywrightCredentials, loginThroughUi } from "./helpers/auth";

function brainInboxResponse() {
  const createdAt = "2026-05-19T13:00:00.000Z";
  return {
    pending_count: 0,
    pending_approvals: [],
    recent_approvals: [],
    recent_tasks: [],
    recent_artifacts: [
      {
        id: "artifact-self-improvement",
        artifact_type: "self_improvement_report",
        title: "Relatorio de auto-aprendizado MAYUS",
        storage_url: null,
        mime_type: "application/json",
        source_module: "self_improvement_loop",
        created_at: createdAt,
        metadata: {
          proposals_created: 1,
          patterns_detected: [
            { patternKind: "correction_failed_operating_partner_reply_repair_timeout" },
          ],
        },
        task: null,
      },
      {
        id: "artifact-billing",
        artifact_type: "asaas_billing",
        title: "Cobranca supervisionada",
        storage_url: null,
        mime_type: "application/json",
        source_module: "finance",
        created_at: createdAt,
        metadata: {
          reply: "Plano financeiro fora da trilha de auto-correcao.",
        },
        task: null,
      },
    ],
    recent_events: [
      {
        id: "event-correction",
        event_type: "self_correction_failed",
        source_module: "mayus_operating_partner",
        created_at: createdAt,
        payload: {
          correction_status: "failed",
          correction_kind: "operating_partner_reply_repair",
          reason: "timeout",
          recommended_action: "Escalar para revisao humana antes de nova aplicacao automatica.",
          metadata: {
            institutional_memory: {
              applied_count: 2,
              applied_entries: [
                { key: "tom_consultivo", category: "atendimento" },
                { key: "self_improvement:financeiro_cobranca", category: "financeiro" },
              ],
            },
          },
        },
        task: null,
        step: null,
      },
      {
        id: "event-review",
        event_type: "self_improvement_proposals_created",
        source_module: "self_improvement_loop",
        created_at: createdAt,
        payload: {
          proposals_created: 1,
          pattern_kinds: ["correction_failed_operating_partner_reply_repair_timeout"],
          correction_kinds: ["operating_partner_reply_repair"],
        },
        task: null,
        step: null,
      },
      {
        id: "event-not-available",
        event_type: "self_correction_not_available",
        source_module: "agent_policy",
        created_at: createdAt,
        payload: {
          correction_status: "no_correction_available",
          correction_kind: "policy_preflight",
          recommended_action: "Nenhuma correcao necessaria; a policy permitiu seguir.",
        },
        task: null,
        step: null,
      },
      {
        id: "event-repair",
        event_type: "mayus_operating_partner_repair_pattern",
        source_module: "mayus_operating_partner",
        created_at: createdAt,
        payload: {
          repair_succeeded: true,
          original_risk_flags: ["foreign_language_leak"],
          repaired_risk_flags: [],
        },
        task: null,
        step: null,
      },
      {
        id: "event-chat",
        event_type: "chat_turn_processed",
        source_module: "chat",
        created_at: createdAt,
        payload: {
          summary: "Turno comum do chat fora da trilha de correcao.",
        },
        task: null,
        step: null,
      },
    ],
  };
}

test.describe("Aprovacoes > atividade de auto-correcao", () => {
  const credentials = getPlaywrightCredentials();

  test.skip(!credentials.available, "Configure PLAYWRIGHT_EMAIL e PLAYWRIGHT_PASSWORD para rodar os testes autenticados.");

  test("mostra auto-correcao e self-improvement no feed canonico do Brain", async ({ page }) => {
    test.setTimeout(180_000);

    await page.route("**/api/brain/inbox?**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(brainInboxResponse()),
      });
    });

    await page.route("**/api/juridico/movement-reviews", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reviews: [], stuck_reviews: [] }),
      });
    });

    await loginThroughUi(page, { browserProfileMode: "ui-harness" });
    await page.goto("/dashboard/aprovacoes", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard\/aprovacoes/);

    await expect(page.getByText("MAYUS Brain")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Relatorio de auto-aprendizado MAYUS")).toBeVisible();
    await expect(page.getByText(/1 proposta de memoria/)).toBeVisible();
    await expect(page.getByText(/correction_failed_operating_partner_reply_repair_timeout/).first()).toBeVisible();
    await expect(page.getByText("Cobranca supervisionada")).toBeVisible();
    await expect(page.getByText("Turno do chat processado")).toBeVisible();

    await expect(page.getByText("Auto-correcao falhou")).toBeVisible();
    await expect(page.getByText(/operating_partner_reply_repair: failed/)).toBeVisible();
    await expect(page.getByText(/memorias aplicadas: 2/)).toBeVisible();
    await expect(page.getByText(/tom_consultivo/)).toBeVisible();
    await expect(page.getByText("Auto-correcao indisponivel")).toBeVisible();
    await expect(page.getByText(/policy_preflight: no_correction_available/)).toBeVisible();
    await expect(page.getByText("MAYUS propos memoria aprendida")).toBeVisible();
    await expect(page.getByText("Padrao de reparo do Operating Partner")).toBeVisible();
    await expect(page.getByText(/flags: foreign_language_leak/)).toBeVisible();

    await expect(page.getByTestId("brain-corrections-count")).toHaveText("5");
    await page.getByTestId("brain-activity-filter-corrections").click();

    await expect(page.getByText("Relatorio de auto-aprendizado MAYUS")).toBeVisible();
    await expect(page.getByText("Auto-correcao falhou")).toBeVisible();
    await expect(page.getByText("Auto-correcao indisponivel")).toBeVisible();
    await expect(page.getByText("MAYUS propos memoria aprendida")).toBeVisible();
    await expect(page.getByText("Padrao de reparo do Operating Partner")).toBeVisible();
    await expect(page.getByText("Cobranca supervisionada")).toHaveCount(0);
    await expect(page.getByText("Turno do chat processado")).toHaveCount(0);
  });
});
