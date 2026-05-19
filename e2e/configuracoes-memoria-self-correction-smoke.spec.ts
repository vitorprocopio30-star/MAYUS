import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { getPlaywrightCredentials, loginThroughUi } from "./helpers/auth";

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

function memoryResponse(proposalsCount: number) {
  return {
    entries: [
      {
        id: "memory-1",
        category: "atendimento",
        key: "tom_atendimento",
        value: "Responder com clareza e sem prometer resultado juridico.",
        enforced: true,
        created_at: "2026-05-19T10:00:00.000Z",
      },
    ],
    proposals: Array.from({ length: proposalsCount }, (_, index) => ({
      id: `proposal-${index + 1}`,
      category: "compliance",
      key: `self_improvement:repair_foreign_language_leak_${index + 1}`,
      value: "Regenerar resposta antes do envio quando houver vazamento de idioma.",
      source: "self_improvement_loop",
      sourceLabel: "MAYUS detectou padrao",
      confidence: 0.6,
      createdAt: "2026-05-19T10:10:00.000Z",
      evidence: {
        correction_kind: "operating_partner_reply_repair",
        recommended_action: "Regenerar a resposta antes do envio; se a flag persistir, bloquear autoenvio.",
        evidence_events: [
          { id: "event-1", event_type: "self_correction_failed", created_at: "2026-05-19T10:00:00.000Z" },
        ],
      },
    })),
    correctionSummary: {
      total: 3,
      attempted: 1,
      corrected: 1,
      requiresApproval: 0,
      blocked: 1,
      failed: 0,
      notAvailable: 0,
      recent: [
        {
          id: "correction-1",
          eventType: "self_correction_applied",
          status: "corrected",
          sourceModule: "mayus_operating_partner",
          targetModule: "whatsapp_reply",
          correctionKind: "operating_partner_reply_repair",
          riskLevel: "low",
          recommendedAction: "Aplicar resposta reparada somente porque os validadores ficaram seguros.",
          reason: "reply_repair_validated",
          externalSideEffectsBlocked: false,
          createdAt: "2026-05-19T10:00:00.000Z",
        },
        {
          id: "correction-2",
          eventType: "self_correction_blocked",
          status: "blocked",
          sourceModule: "agent_executor",
          targetModule: "zapsign_contract",
          correctionKind: "missing_configuration",
          riskLevel: "high",
          recommendedAction: "Bloquear execucao automatica e orientar configuracao.",
          reason: "Credencial ausente.",
          externalSideEffectsBlocked: true,
          createdAt: "2026-05-19T09:00:00.000Z",
        },
      ],
    },
  };
}

test.describe("Configuracoes > Memoria self-correction smoke", () => {
  const credentials = getPlaywrightCredentials();

  test.skip(!credentials.available, "Configure PLAYWRIGHT_EMAIL e PLAYWRIGHT_PASSWORD para rodar os testes autenticados.");

  test("mostra auto-correcao e aciona revisao manual de aprendizado", async ({ page }) => {
    test.setTimeout(180_000);

    let routineRequested = false;
    let memoryLoads = 0;

    await page.route("**/api/agent/memory", async (route) => {
      if (route.request().method() !== "GET") {
        return route.continue();
      }

      memoryLoads += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(memoryResponse(memoryLoads > 1 ? 2 : 1)),
      });
    });

    await page.route("**/api/agent/routines", async (route) => {
      const body = route.request().postDataJSON() as { routineId?: string; dryRun?: boolean; force?: boolean };
      expect(body).toEqual({
        routineId: "mayus-self-improvement-review",
        dryRun: false,
        force: true,
      });
      routineRequested = true;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            status: "woken",
            routineId: "mayus-self-improvement-review",
            missionCreated: true,
            executionResult: {
              self_improvement_review: {
                proposalsCreated: 1,
                patternsDetected: [],
              },
            },
          },
        }),
      });
    });

    await loginThroughUi(page, { browserProfileMode: "ui-harness" });
    await forceAdminBrowserProfile(page);
    await page.goto("/dashboard/configuracoes/memoria", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard\/configuracoes\/memoria/);

    await expect(page.getByRole("heading", { name: /Mem.ria Institucional/i })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("memory-self-correction-panel")).toBeVisible();
    await expect(page.getByText(/Auto-correcao MAYUS/i)).toBeVisible();
    await expect(page.getByTestId("memory-correction-corrigidas")).toContainText("1");
    await expect(page.getByText(/Correcao sugerida pelo MAYUS/i)).toBeVisible();
    await expect(page.getByTestId("memory-proposals-count")).toHaveText("1");

    await page.getByTestId("memory-self-improvement-review-now").click();
    await expect.poll(() => routineRequested).toBe(true);
    await expect(page.getByTestId("memory-proposals-count")).toHaveText("2");
  });
});
