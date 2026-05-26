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

    await page.route("**/api/agent/skills**", async (route) => {
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

    await page.route("**/api/setup/doctor**", async (route) => {
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

    await page.route("**/api/agent/routines**", async (route) => {
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
              internalAgent: {
                id: "finance_agent",
                label: "Finance Agent",
                role: "Revisa recebiveis, excedentes e cobrancas supervisionadas.",
                owner: "Admin financeiro",
              },
              enabled: true,
              paused: false,
              status: "ready",
              reason: "Pronta para dry-run supervisionado.",
              nextAction: "Preparar proximas acoes financeiras sem enviar cobranca.",
            },
          ],
          agents: [
            {
              id: "finance_agent",
              label: "Finance Agent",
              role: "Revisa recebiveis, excedentes, aceite de custo e cobrancas supervisionadas.",
              module: "finance",
              owner: "Admin financeiro",
              enabled: true,
              autonomyMode: "supervised",
              allowedSurfaces: ["financeiro", "monitoramento", "aprovacoes", "brain"],
              budgetPolicy: {
                label: "Cobranca real e custo externo exigem aprovacao",
                paidExternalActions: "approval_required",
                maxAutomaticCostCents: 0,
              },
              health: {
                status: "ready",
                reason: "Agente com rotina habilitada e sem bloqueio critico.",
                lastActivityAt: "2026-05-21T12:00:00.000Z",
                nextAction: "Preparar proximas acoes financeiras sem enviar cobranca.",
              },
              routines: {
                total: 1,
                enabled: 1,
                blocked: 0,
                awaitingApproval: 0,
              },
              approvalsPending: 0,
              blockersCount: 0,
              memoryLifecycle: {
                applied: 0,
                pendingProposals: 0,
                suggestedSkills: 0,
                revocations: 0,
              },
              activity: {
                latestMission: {
                  id: "mission-control-smoke",
                  status: "planning",
                  goal: "Revisao financeira diaria",
                  lastUpdatedAt: "2026-05-21T12:00:00.000Z",
                  nextSafeAction: "Preparar proximas acoes financeiras sem enviar cobranca.",
                },
                pendingApproval: null,
                latestArtifact: null,
                latestEvent: {
                  id: "event-mission-control",
                  eventType: "agentic_routine_dry_run",
                  createdAt: "2026-05-21T12:00:00.000Z",
                },
                latestBlocker: null,
              },
              openclaw: {
                outcome: "allowed",
                surface: "internal",
                source: "openclaw_policy",
                reason: "Rotina interna sem side effects externos.",
                blockedLayer: null,
                appliedLayersCount: 1,
                precedence: ["global", "tenant", "module", "agent", "tool", "channel"],
              },
              hermes: {
                status: "completed",
                latestMemoryId: null,
                lifecycleStatus: null,
                lifecycleKind: null,
                lastEventSummary: "Dry-run revisado.",
              },
            },
          ],
          summary: {
            totalAgents: 7,
            enabledAgents: 7,
            readyAgents: 1,
            blockedAgents: 0,
            degradedAgents: 0,
            pendingApprovals: 0,
            blockers: 0,
            nextAction: "Preparar proximas acoes financeiras sem enviar cobranca.",
            policyPrecedence: ["global", "tenant", "module", "agent", "tool", "channel"],
          },
        }),
      });
    });

    await page.route("**/api/brain/inbox**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pending_count: 1,
          pending_approvals: [],
          recent_approvals: [],
          recent_tasks: [],
          recent_artifacts: [],
          recent_events: [],
          legal_operator_missions: [],
          mission_control_snapshots: [
            {
              missionId: "mission-control-smoke",
              taskId: "mission-control-smoke",
              module: "finance",
              agentSource: "paperclip",
              status: "planning",
              goal: "Revisao financeira diaria",
              currentStep: null,
              pendingApproval: null,
              blockers: [],
              policy: {
                outcome: "ok",
                surface: "internal",
                module: "finance",
                requiresApproval: false,
                canExecuteNow: true,
                credentialGate: false,
                budgetGate: "ok",
                reason: "Rotina interna sem side effects externos.",
                source: "openclaw_policy",
                debugger: {
                  precedence: ["global", "tenant", "module", "agent", "tool", "channel"],
                  blockedLayer: null,
                  blockedReasonCode: null,
                  lowerLayersCannotReopen: true,
                  appliedLayers: [
                    {
                      scope: "global",
                      key: "global",
                      enabled: true,
                      requiresApproval: false,
                      hasAllow: true,
                      hasDeny: false,
                      hasSurfaceMatrix: false,
                    },
                  ],
                },
              },
              trajectory: {
                status: "completed",
                eventsCount: 2,
                lastEventType: "result",
                lastEventSummary: "Dry-run revisado.",
                lifecycleStatus: null,
                lifecycleKind: null,
                latestMemoryId: null,
              },
              routine: {
                routineId: "finance-daily-review",
                label: "Revisao financeira diaria",
                source: "paperclip",
                agentId: "paperclip",
                internalAgentId: "finance_agent",
                internalAgentLabel: "Finance Agent",
                internalAgentRole: "Revisa recebiveis, excedentes e cobrancas supervisionadas.",
                status: "planning",
                budgetStatus: "ok",
                owner: "Admin financeiro",
              },
              latestArtifactId: null,
              latestEventId: "event-mission-control",
              timeline: [],
              nextSafeAction: "Preparar proximas acoes financeiras sem enviar cobranca.",
              legalOperatorMission: null,
              lastUpdatedAt: "2026-05-21T12:00:00.000Z",
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

    await expect(page.getByTestId("agent-control-plane-panel")).toBeVisible();
    await expect(page.getByTestId("agent-control-card-finance_agent")).toBeVisible();
    await expect(page.getByTestId("agent-health-status").first()).toHaveText("ready");
    await expect(page.getByTestId("agent-control-next-action")).toContainText(/financeiras/i);
    await expect(page.getByTestId("agent-filter-finance_agent")).toBeVisible();
    await expect(page.getByText(/Ultima missao:/i)).toBeVisible();
    await expect(page.getByText(/OpenClaw:/i)).toBeVisible();
    await expect(page.getByText(/Hermes:/i)).toBeVisible();

    await expect(page.getByTestId("agentic-mission-control-panel")).toBeVisible();
    await expect(page.getByText(/Controle agentico/i)).toBeVisible();
    await expect(page.getByText(/Revisao financeira diaria/i).first()).toBeVisible();

    await expect(page.getByTestId("agentic-routines-panel")).toBeVisible();
    await expect(page.getByTestId("agentic-routine-row-finance-daily-review")).toBeVisible();
    await expect(page.getByTestId("agentic-routine-status")).toHaveText("ready");
    await expect(page.getByText(/Revisao financeira diaria/i).first()).toBeVisible();

    await page.getByTestId("agentic-routine-run").click();
    await expect.poll(() => routineDryRunRequested).toBe(true);
  });
});
