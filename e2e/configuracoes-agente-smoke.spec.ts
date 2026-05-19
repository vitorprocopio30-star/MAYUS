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

test.describe("Configuracoes > Agente smoke", () => {
  const credentials = getPlaywrightCredentials();

  test.skip(!credentials.available, "Configure PLAYWRIGHT_EMAIL e PLAYWRIGHT_PASSWORD para rodar os testes autenticados.");

  test("mostra readiness, rotinas agenticas e executa dry-run supervisionado", async ({ page }) => {
    test.setTimeout(180_000);

    let routineDryRunRequested = false;

    await page.route("**/api/agent/skills", async (route) => {
      if (route.request().method() !== "GET") {
        return route.continue();
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          skills: [
            {
              id: "legal_case_brain_insights",
              name: "Case Brain 2.0",
              description: "Gera cronologia, riscos e proximos atos provaveis.",
              risk_level: "medium",
              is_active: true,
              allowed_roles: ["admin", "socio"],
              allowed_channels: ["dashboard", "chat"],
              schema_version: "1.0.0",
              requires_human_confirmation: true,
              created_at: "2026-05-15T12:00:00.000Z",
            },
          ],
        }),
      });
    });

    await page.route("**/api/setup/doctor", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          report: {
            agenticReadiness: {
              overallScore: 64,
              status: "warning",
              nextBestAction: "Ativar scheduler supervisionado de rotinas agenticas.",
              modules: [
                {
                  id: "scheduler",
                  label: "Scheduler agentico",
                  status: "warning",
                  score: 45,
                  summary: "Rotinas existem, mas precisam de smoke observado.",
                  nextAction: "Rodar dry-run e confirmar mission trace.",
                },
              ],
            },
          },
        }),
      });
    });

    await page.route("**/api/agent/routines", async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() as { routineId?: string; dryRun?: boolean };
        expect(body).toEqual({ routineId: "finance-daily-review", dryRun: true });
        routineDryRunRequested = true;

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              status: "dry_run",
              routineId: "finance-daily-review",
              reason: "Dry-run preparado sem gravar missao.",
              missionCreated: false,
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          routines: [
            {
              id: "finance-daily-review",
              label: "Revisao financeira diaria",
              module: "finance",
              enabled: true,
              paused: false,
              status: "ready",
              reason: "Pronta para dry-run supervisionado.",
              nextAction: "Preparar proximas acoes financeiras sem enviar cobranca.",
            },
          ],
        }),
      });
    });

    await loginThroughUi(page, { browserProfileMode: "ui-harness" });
    await forceAdminBrowserProfile(page);
    await page.goto("/dashboard/configuracoes/agente", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard\/configuracoes\/agente/);

    await expect(page.getByRole("heading", { name: /Skill Registry/i })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("agentic-readiness-panel")).toBeVisible();
    await expect(page.getByTestId("agentic-readiness-score")).toHaveText("64%");
    await expect(page.getByTestId("agentic-next-best-action")).toContainText(/scheduler supervisionado/i);
    await expect(page.getByTestId("agentic-readiness-module-scheduler")).toBeVisible();

    await expect(page.getByTestId("agentic-routines-panel")).toBeVisible();
    await expect(page.getByTestId("agentic-routine-row-finance-daily-review")).toBeVisible();
    await expect(page.getByTestId("agentic-routine-status")).toHaveText("ready");
    await expect(page.getByText(/Revisao financeira diaria/i)).toBeVisible();

    await page.getByTestId("agentic-routine-run").click();
    await expect.poll(() => routineDryRunRequested).toBe(true);
  });
});
