import { expect, test, type Locator, type Page } from "@playwright/test";
import { getPlaywrightCredentials, getPlaywrightSuperadminCredentials, loginThroughUi } from "./helpers/auth";
import {
  ensurePlaywrightFinanceFixture,
  PLAYWRIGHT_FINANCE_FIXTURE_LABELS,
} from "./helpers/finance-fixture";

function formatIntegerBR(value: number) {
  return Math.floor(value).toLocaleString("pt-BR");
}

function moneyAfterLabel(text: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escapedLabel}\\s*R\\$\\s*([\\d.]+)`, "i"));
  return match ? Number(match[1].replace(/\./g, "")) : null;
}

async function expectMoneyAtLeast(locator: Locator, label: string, expectedMinimum: number) {
  const text = (await locator.textContent()) || "";
  const actual = moneyAfterLabel(text, label);
  expect(actual, `valor monetario depois de "${label}"`).not.toBeNull();
  expect(actual || 0).toBeGreaterThanOrEqual(expectedMinimum);
}

async function openFinanceDashboard(page: Page) {
  const fixture = await ensurePlaywrightFinanceFixture();
  await loginThroughUi(page);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  await page.getByTestId("dashboard-module-switcher").click();
  await page.getByTestId("dashboard-module-option-financeiro").click();
  await expect(page.getByTestId("dashboard-finance-view")).toBeVisible({ timeout: 60_000 });

  return fixture;
}

test.describe("Financeiro authenticated", () => {
  const credentials = getPlaywrightCredentials();

  test.skip(!credentials.available, "Configure PLAYWRIGHT_EMAIL e PLAYWRIGHT_PASSWORD para rodar os testes autenticados.");
  test.describe.configure({ mode: "serial" });

  test("mostra financeiro do escritorio com fixture controlada", async ({ page }) => {
    test.setTimeout(240_000);
    const fixture = await openFinanceDashboard(page);

    await expect(page.getByTestId("finance-received-value")).toContainText(formatIntegerBR(fixture.dashboard.receivedRevenue), { timeout: 60_000 });
    await expect(page.getByTestId("finance-forecast-value")).toContainText(formatIntegerBR(fixture.dashboard.forecastRevenue), { timeout: 60_000 });
    await expect(page.getByTestId("finance-open-charges-value")).toContainText(formatIntegerBR(fixture.dashboard.openCharges), { timeout: 60_000 });
    await expect(page.getByTestId("finance-overdue-value")).toContainText(formatIntegerBR(fixture.dashboard.overdueRevenue), { timeout: 60_000 });

    await expect(page.getByTestId("finance-projection-followup")).toContainText(/Forecast/i);
    await expect(page.getByTestId("finance-forecast-bucket-7 dias")).toContainText("1.800");
    await expect(page.getByTestId("finance-forecast-bucket-30 dias")).toContainText("2.200");
    await expect(page.getByTestId("finance-forecast-bucket-Futuro")).toContainText("3.100");
    await expect(page.getByTestId("finance-forecast-bucket-Sem data")).toContainText("900");

    await expect(page.getByTestId("finance-overdue-bucket-1-7d")).toContainText("1.200");
    await expect(page.getByTestId("finance-overdue-bucket-8-14d")).toContainText("2.500");
    await expect(page.getByTestId("finance-overdue-bucket-15-30d")).toContainText("5.300");
    await expect(page.getByTestId("finance-overdue-bucket-31d+")).toContainText("8.500");

    await expect(page.getByTestId("finance-reconciliation-matched")).toContainText("1");
    await expect(page.getByTestId("finance-reconciliation-partial")).toContainText("1");
    await expect(page.getByTestId("finance-reconciliation-blocked")).toContainText("1");
    await expect(page.getByTestId("finance-unit-economics")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("finance-unit-margin")).toContainText("R$");
    await expect(page.getByTestId("finance-unit-legal-area").first()).toContainText(/Revenue-to-case|Sem area/i);
    await expect(page.getByTestId("finance-unit-case").first()).toContainText(/R\$/);
    await expect(page.getByTestId("finance-unit-commission-owner").first()).toContainText(/R\$/);
    await expect(page.getByTestId("finance-unit-commission-origin").first()).toContainText(/%/);

    await expect(page.getByTestId("finance-collection-plan").first()).toContainText(PLAYWRIGHT_FINANCE_FIXTURE_LABELS.highRiskClient);
    const firstRiskItem = page.getByTestId("finance-risk-item").first();
    await expect(firstRiskItem).toContainText(fixture.dashboard.highRiskClient);
    await expect(firstRiskItem).toContainText(/high/i);
    await firstRiskItem.getByTestId("finance-generate-collection-plan").click();
    await expect(firstRiskItem.getByTestId("finance-collection-action-status")).toContainText(/Plano supervisionado (criado|pronto)/i, { timeout: 60_000 });
    await expect(page.getByTestId("finance-collection-plan").first()).toContainText(fixture.dashboard.highRiskClient, { timeout: 60_000 });

    const commercialForecast = page.getByTestId("finance-commercial-forecast");
    await expect(commercialForecast).toBeVisible({ timeout: 60_000 });
    await expectMoneyAtLeast(commercialForecast, "Forecast Comercial", fixture.dashboard.commercialPipeline);
    await expect(page.getByTestId("finance-commercial-pending")).toContainText(formatIntegerBR(fixture.dashboard.commercialPendingContracts));
    await expectMoneyAtLeast(commercialForecast, "Fechados", fixture.dashboard.commercialClosedContracts);
    await expectMoneyAtLeast(commercialForecast, "Perdido", fixture.dashboard.commercialLostAmount);

    const proposalStage = page.getByTestId("finance-commercial-stage").filter({ hasText: fixture.dashboard.commercialProposalStage });
    await expect(proposalStage).toContainText("7.000");
    const topOpportunity = page.getByTestId("finance-commercial-opportunity").filter({ hasText: fixture.dashboard.commercialTopOpportunity });
    await expect(topOpportunity).toContainText("7.000");
    await expect(topOpportunity).toContainText(/follow-up humano/i);
  });

  test("mostra painel superadmin SaaS com MRR e inadimplencia por escritorio", async ({ page }) => {
    test.setTimeout(240_000);
    const fixture = await ensurePlaywrightFinanceFixture();
    const superadminCredentials = getPlaywrightSuperadminCredentials();
    test.skip(!fixture.admin.platformReady, `Schema billing SaaS indisponivel para /admin: ${fixture.admin.platformBlocker}`);
    test.skip(!superadminCredentials.available, "Configure PLAYWRIGHT_SUPERADMIN_EMAIL e PLAYWRIGHT_SUPERADMIN_PASSWORD para validar /admin.");

    await loginThroughUi(page, { credentials: superadminCredentials });
    await page.goto("/admin", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/admin(?:\/)?$/);
    await expect(page.getByTestId("admin-finance-mrr")).toContainText(`R$ ${formatIntegerBR(fixture.admin.monthlyMrr)}`, { timeout: 60_000 });
    await expect(page.getByTestId("admin-finance-received")).toContainText(/Receita recebida no mes/i);
    await expect(page.getByTestId("admin-finance-delinquency")).toContainText(/Inadimplencia SaaS/i);

    const table = page.getByTestId("admin-finance-tenants-table");
    await expect(table).toBeVisible({ timeout: 60_000 });
    await expect(table.locator("thead")).toContainText(/MRR/i);
    await expect(table.locator("thead")).toContainText(/Ultimo pagamento/i);
    await expect(table.locator("thead")).toContainText(/Vencido/i);
    await expect(table.locator("thead")).not.toContainText(/created_at|max_processos|Criado|Processos/i);

    const activeRow = table.getByRole("row", { name: new RegExp(PLAYWRIGHT_FINANCE_FIXTURE_LABELS.activeTenantName, "i") });
    await expect(activeRow).toContainText("R$ 647");
    await expect(activeRow).toContainText(/Em dia/i);

    const delinquentRow = table.getByRole("row", { name: new RegExp(PLAYWRIGHT_FINANCE_FIXTURE_LABELS.delinquentTenantName, "i") });
    await expect(delinquentRow).toContainText("R$ 647");
    await expect(delinquentRow).toContainText(`${fixture.admin.delinquentDaysOverdue} dias`);
  });
});
