import { expect, test } from "@playwright/test";
import { getPlaywrightCredentials, loginThroughUi } from "./helpers/auth";

test.describe("Configuracoes > Agente real API smoke", () => {
  const credentials = getPlaywrightCredentials();

  test.skip(!credentials.available, "Configure PLAYWRIGHT_EMAIL e PLAYWRIGHT_PASSWORD para rodar o smoke autenticado real.");

  test("carrega readiness e rotinas pelo backend real e simula uma rotina", async ({ page }) => {
    test.setTimeout(180_000);
    const runtimeErrors: string[] = [];

    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });

    await loginThroughUi(page, { browserProfileMode: "ui-harness" });
    await page.goto("/dashboard/configuracoes/agente", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard\/configuracoes\/agente/);

    const heading = page.getByRole("heading", { name: /Skill Registry/i });
    try {
      await expect(heading).toBeVisible({ timeout: 45_000 });
    } catch (error) {
      const bodyPreview = (await page.locator("body").innerText()).slice(0, 800);
      throw new Error(`Agent page did not render. url=${page.url()} errors=${JSON.stringify(runtimeErrors)} body=${bodyPreview}`);
    }
    await expect(page.getByTestId("agentic-readiness-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("agentic-readiness-score")).toContainText(/%/);
    await expect(page.getByTestId("agentic-routines-panel")).toBeVisible();

    const firstRoutine = page.locator('[data-testid^="agentic-routine-row-"]').first();
    await expect(firstRoutine).toBeVisible();

    await firstRoutine.getByTestId("agentic-routine-run").click();

    await expect(page.getByText(/Rotina agentica analisada em dry-run/i)).toBeVisible({ timeout: 30_000 });
  });
});
