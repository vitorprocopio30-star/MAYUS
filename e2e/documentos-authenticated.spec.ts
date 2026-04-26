import { test, expect, type Page } from "@playwright/test";
import { getPlaywrightCredentials, loginThroughUi } from "./helpers/auth";
import {
  ensurePlaywrightDocumentFixture,
  PLAYWRIGHT_DOCUMENT_FIXTURE_IDS,
  type PlaywrightDocumentFixtureScenario,
} from "./helpers/document-fixture";

async function waitForDocumentsHydration(page: Page) {
  const loadingState = page.getByText(/carregando acervo operacional/i);

  if (await loadingState.count()) {
    await loadingState.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => null);
  }
}

async function openDocumentosWithFixture(page: Page, scenario: PlaywrightDocumentFixtureScenario = "formal_history") {
  const fixture = await ensurePlaywrightDocumentFixture({ scenario });
  await loginThroughUi(page);
  await page.goto("/dashboard/documentos", { waitUntil: "domcontentloaded" });
  await waitForDocumentsHydration(page);
  return fixture;
}

async function mockDraftFactoryScenarioTransition(page: Page, taskId: string, nextScenario: PlaywrightDocumentFixtureScenario) {
  await page.route(`**/api/documentos/processos/${taskId}/draft-factory`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    const nextFixture = await ensurePlaywrightDocumentFixture({ scenario: nextScenario });
    if (!nextFixture.draftFactoryExecution) {
      throw new Error(`A fixture ${nextScenario} nao retornou payload de Draft Factory.`);
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        ...nextFixture.draftFactoryExecution,
      }),
    });
  });
}

async function openDocumentos(page: Page) {
  await loginThroughUi(page);
  await page.goto("/dashboard/documentos", { waitUntil: "domcontentloaded" });
  await waitForDocumentsHydration(page);
}

async function expectDraftVersionVisible(page: Page, versionId: string | null) {
  if (!versionId) throw new Error("Fixture nao retornou versao formal esperada.");
  await expect(page.getByTestId(`documents-draft-version-${versionId}`)).toBeVisible({ timeout: 45_000 });
}

test.describe("Documentos authenticated", () => {
  const credentials = getPlaywrightCredentials();

  test.skip(!credentials.available, "Configure PLAYWRIGHT_EMAIL e PLAYWRIGHT_PASSWORD para rodar os testes autenticados.");

  test("abre a area de Documentos apos login e mostra o cockpit do modulo", async ({ page }) => {
    test.setTimeout(240_000);
    await openDocumentos(page);

    await expect(page).toHaveURL(/\/dashboard\/documentos$/);
    await expect(page.getByRole("heading", { name: /reposit[oó]rio de documentos/i })).toBeVisible();
    await expect(page.getByText(/filtro da draft factory/i)).toBeVisible();
  });

  test("exibe filtros da Draft Factory e o painel de saude da fila", async ({ page }) => {
    test.setTimeout(120_000);
    await openDocumentos(page);

    await expect(page.getByPlaceholder(/buscar cliente, processo ou pipeline/i)).toBeVisible();

    const allFilterButton = page.getByRole("button", { name: /todas/i });
    const queuedFilterButton = page.getByRole("button", { name: /em fila/i });
    const runningFilterButton = page.getByRole("button", { name: /gerando/i });
    const completedFilterButton = page.getByRole("button", { name: /prontas/i });
    const failedFilterButton = page.getByRole("button", { name: /falhas/i });

    await expect(allFilterButton).toBeVisible();
    await expect(queuedFilterButton).toBeVisible();
    await expect(runningFilterButton).toBeVisible();
    await expect(completedFilterButton).toBeVisible();
    await expect(failedFilterButton).toBeVisible();

    await failedFilterButton.click();
    await expect(page.getByText(/filtro da draft factory/i)).toBeVisible();

    await completedFilterButton.click();
    await expect(page.getByText(/sa[uú]de da fila headless/i).first()).toBeVisible({ timeout: 30_000 });

    await allFilterButton.click();

    await expect(page.getByText(/telemetria operacional da draft factory/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/em fila/i).first()).toBeVisible();
    await expect(page.getByText(/gerando/i).first()).toBeVisible();
    await expect(page.getByText(/travadas/i).first()).toBeVisible();
    await expect(page.getByText(/falhas 24h/i).first()).toBeVisible();
    await expect(page.getByText(/alertas ativos/i)).toBeVisible();
    await expect(page.getByText(/falhas recentes/i)).toBeVisible();
  });

  test("abre o detalhe de um processo quando houver cards e respeita o estado vazio quando nao houver", async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = await openDocumentosWithFixture(page);

    const fixtureCard = page.getByTestId(`documents-card-${fixture.processTaskId}`);
    await expect(fixtureCard).toBeVisible();
    await fixtureCard.click();

    const detailModal = page.getByTestId("documents-detail-modal");
    await expect(detailModal).toBeVisible();
    await expect(page.getByTestId("documents-detail-title")).toContainText(fixture.processTitle);
    await expect(detailModal.getByText(/orquestrador de pe[cç]as/i)).toBeVisible();
    await expect(detailModal.getByText(/arquivos/i)).toBeVisible();
    await expect(detailModal.getByRole("link", { name: /board/i })).toBeVisible();

    await page.getByLabel(/fechar detalhes do processo/i).click();
    await expect(detailModal).toBeHidden();
  });

  test("aprova, publica e exporta a minuta formal da fixture", async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = await openDocumentosWithFixture(page);

    await page.getByTestId(`documents-card-${fixture.processTaskId}`).click();

    const detailModal = page.getByTestId("documents-detail-modal");
    await expect(detailModal).toBeVisible();
    await expect(detailModal.getByText(/revis[aã]o jur[ií]dica formal/i)).toBeVisible();
    await expect(detailModal.getByText(/valida[cç][aã]o externa: lei ok/i)).toBeVisible();

    const currentVersionButton = page.getByTestId(`documents-draft-version-${fixture.currentDraftVersionId}`);
    const publishedVersionButton = page.getByTestId(`documents-draft-version-${fixture.publishedDraftVersionId}`);

    await expectDraftVersionVisible(page, fixture.currentDraftVersionId);
    await expectDraftVersionVisible(page, fixture.publishedDraftVersionId);
    await expect(currentVersionButton).toContainText("V2 · Contestação Previdenciária");
    await expect(publishedVersionButton).toContainText("V1 · Contestação Previdenciária");

    await publishedVersionButton.click();
    await expect(detailModal.getByText(/vers[aã]o publicada anterior da minuta jur[ií]dica/i)).toBeVisible();
    await expect(detailModal.getByText(/publica[cç][aã]o vigente/i)).toBeVisible();

    await currentVersionButton.click();
    await expect(detailModal.getByText(/vers[aã]o corrente aguardando aprova[cç][aã]o e publica[cç][aã]o formal/i)).toBeVisible();

    const approveButton = page.getByTestId(`documents-approve-version-${fixture.currentDraftVersionId}`);
    await expect(approveButton).toBeVisible();
    await approveButton.click();

    const publishButton = page.getByTestId(`documents-publish-version-${fixture.currentDraftVersionId}`);
    await expect(publishButton).toBeVisible({ timeout: 30_000 });
    await publishButton.click();

    await expect(detailModal.getByText(/publica[cç][aã]o vigente/i)).toBeVisible({ timeout: 30_000 });

    await page.getByTestId(`documents-export-piece-${fixture.processTaskId}`).click();
    await expect(page.getByText(/arquivo word baixado com sucesso/i)).toBeVisible({ timeout: 30_000 });
  });

  test("salva uma revisao humana como nova versao formal auditavel", async ({ page }) => {
    test.setTimeout(180_000);
    const fixture = await openDocumentosWithFixture(page, "formal_history");

    await page.getByTestId(`documents-card-${fixture.processTaskId}`).click();

    const detailModal = page.getByTestId("documents-detail-modal");
    const currentVersionButton = page.getByTestId(`documents-draft-version-${fixture.currentDraftVersionId}`);
    const draftEditor = page.getByTestId(`documents-draft-editor-${fixture.currentDraftVersionId}`);
    const saveButton = page.getByTestId(`documents-save-reviewed-version-${fixture.currentDraftVersionId}`);

    await expect(detailModal).toBeVisible();
    await expectDraftVersionVisible(page, fixture.currentDraftVersionId);
    await currentVersionButton.click();
    await expect(draftEditor).toBeVisible();

    await draftEditor.fill("# Contestação Previdenciária\n\n## Síntese\n\nVersão corrente revisada oficialmente pelo escritório para auditoria.\n\n## Fundamentação Complementar\n\nArt. 300 do CPC e prova documental revisitada.\n\n## Pedidos\n\nRequer a improcedência integral da tese adversa.");
    await saveButton.click();

    await expect(detailModal.getByText(/V3 · Contestação Previdenciária/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/nova versao formal salva a partir da revisao humana/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(/documents-promotion-candidate-/).first()).toContainText(/candidato de padr[aã]o supervisionado/i, { timeout: 30_000 });
  });

  test("mostra o artifact premium da versao publicada e baixa o PDF formal", async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = await openDocumentosWithFixture(page, "formal_history");

    await page.getByTestId(`documents-card-${fixture.processTaskId}`).click();

    const detailModal = page.getByTestId("documents-detail-modal");
    const publishedVersionButton = page.getByTestId(`documents-draft-version-${fixture.publishedDraftVersionId}`);

    await expect(detailModal).toBeVisible();
    await expectDraftVersionVisible(page, fixture.publishedDraftVersionId);
    await publishedVersionButton.click();

    const premiumLink = page.getByTestId(`documents-open-premium-${fixture.publishedDraftVersionId}`);
    const pdfDownload = page.getByTestId(`documents-download-pdf-${fixture.publishedDraftVersionId}`);
    const learningLoopCapture = page.getByTestId(`documents-learning-loop-capture-${fixture.publishedDraftVersionId}`);

    await expect(detailModal.getByText(/artifact premium em PDF/i)).toBeVisible();
    await expect(detailModal.getByText(/09-Pecas Finais/i)).toBeVisible();
    await expect(learningLoopCapture).toBeVisible();
    await expect(learningLoopCapture).toContainText(/learning loop capture/i);
    await expect(learningLoopCapture).toContainText(/delta capturado contra a primeira minuta gerada/i);
    await expect(learningLoopCapture).toContainText(/34% de varia[cç][aã]o estimada/i);
    await expect(premiumLink).toBeVisible();

    await pdfDownload.click();
    await expect(page.getByText(/arquivo pdf baixado com sucesso/i)).toBeVisible({ timeout: 30_000 });
  });

  test("faz retry da primeira minuta falha da fixture", async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = await openDocumentosWithFixture(page, "first_draft_failed");
    await mockDraftFactoryScenarioTransition(page, fixture.processTaskId, "first_draft_retry_completed");

    const quickAction = page.getByTestId(`documents-card-quick-action-${fixture.processTaskId}`);
    await expect(quickAction).toContainText(/resolver falha/i);
    await quickAction.click();

    const detailModal = page.getByTestId("documents-detail-modal");
    const failedBanner = page.getByTestId(`documents-first-draft-error-${fixture.processTaskId}`);
    const firstDraftAction = page.getByTestId(`documents-first-draft-action-${fixture.processTaskId}`);

    await expect(detailModal).toBeVisible();
    await expect(failedBanner).toBeVisible();
    await expect(failedBanner).toContainText(/falha simulada da draft factory/i);
    await expect(firstDraftAction).toContainText(/tentar novamente primeira minuta/i);

    await firstDraftAction.click();

    const retryVersionButton = page.getByTestId(`documents-draft-version-${PLAYWRIGHT_DOCUMENT_FIXTURE_IDS.retryDraftVersionId}`);
    const retryApproveButton = page.getByTestId(`documents-approve-version-${PLAYWRIGHT_DOCUMENT_FIXTURE_IDS.retryDraftVersionId}`);
    const statusBanner = page.getByTestId(`documents-first-draft-status-${fixture.processTaskId}`);
    const exportButton = page.getByTestId(`documents-export-piece-${fixture.processTaskId}`);

    await expect(failedBanner).toBeHidden({ timeout: 30_000 });
    await expect(statusBanner).toContainText(/retry e pronta para revis[aã]o formal/i, { timeout: 30_000 });
    await expect(retryVersionButton).toBeVisible();
    await expect(retryVersionButton).toContainText("V1 · Contestação Previdenciária");
    await expect(detailModal.getByText(/primeira minuta gerada ap[oó]s retry manual da draft factory/i)).toBeVisible();
    await expect(retryApproveButton).toBeVisible();
    await expect(retryApproveButton).toBeEnabled();
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toContainText(/exportar minuta pronta/i);
    await expect(firstDraftAction).toContainText(/abrir primeira minuta/i);
  });

  test("regenera a primeira minuta stale da fixture", async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = await openDocumentosWithFixture(page, "first_draft_stale");
    await mockDraftFactoryScenarioTransition(page, fixture.processTaskId, "first_draft_regenerated");

    const quickAction = page.getByTestId(`documents-card-quick-action-${fixture.processTaskId}`);
    await expect(quickAction).toContainText(/atualizar minuta/i);
    await quickAction.click();

    const detailModal = page.getByTestId("documents-detail-modal");
    const staleBanner = page.getByTestId(`documents-first-draft-stale-${fixture.processTaskId}`);
    const statusBanner = page.getByTestId(`documents-first-draft-status-${fixture.processTaskId}`);
    const firstDraftAction = page.getByTestId(`documents-first-draft-action-${fixture.processTaskId}`);
    const staleVersionButton = page.getByTestId(`documents-draft-version-${PLAYWRIGHT_DOCUMENT_FIXTURE_IDS.staleDraftVersionId}`);
    const staleApproveButton = page.getByTestId(`documents-approve-version-${PLAYWRIGHT_DOCUMENT_FIXTURE_IDS.staleDraftVersionId}`);
    const exportButton = page.getByTestId(`documents-export-piece-${fixture.processTaskId}`);

    await expect(detailModal).toBeVisible();
    await expect(staleBanner).toBeVisible();
    await expect(statusBanner).toContainText(/ainda [eé] [uú]til para refer[eê]ncia, mas j[aá] est[aá] desatualizada/i);
    await expect(staleVersionButton).toBeVisible();
    await expect(staleApproveButton).toBeVisible();
    await expect(staleApproveButton).toBeDisabled();
    await expect(firstDraftAction).toContainText(/atualizar primeira minuta/i);
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toContainText(/exportar vers[aã]o anterior/i);

    await firstDraftAction.click();

    const regeneratedVersionButton = page.getByTestId(`documents-draft-version-${PLAYWRIGHT_DOCUMENT_FIXTURE_IDS.regeneratedDraftVersionId}`);
    const regeneratedApproveButton = page.getByTestId(`documents-approve-version-${PLAYWRIGHT_DOCUMENT_FIXTURE_IDS.regeneratedDraftVersionId}`);

    await expect(staleBanner).toBeHidden({ timeout: 30_000 });
    await expect(statusBanner).toContainText(/atualizada com o novo contexto do case brain/i, { timeout: 30_000 });
    await expect(staleVersionButton).toBeVisible();
    await expect(regeneratedVersionButton).toBeVisible();
    await expect(regeneratedVersionButton).toContainText("V2 · Contestação Previdenciária");
    await expect(regeneratedApproveButton).toBeVisible();
    await expect(regeneratedApproveButton).toBeEnabled();
    await expect(exportButton).toContainText(/exportar minuta pronta/i);
    await expect(firstDraftAction).toContainText(/abrir primeira minuta/i);
  });

  test("navega de Documentos para o Acervo MAYUS", async ({ page }) => {
    test.setTimeout(120_000);
    await openDocumentos(page);

    await page.locator('a[href="/dashboard/documentos/acervo"]').first().click();

    await page.waitForURL(/\/dashboard\/documentos\/acervo$/, { timeout: 120_000 });
    await expect(page).toHaveURL(/\/dashboard\/documentos\/acervo$/);
    await expect(page.getByText(/n[uú]cleo jur[ií]dico configur[aá]vel/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /diretrizes de/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /voltar aos processos/i })).toBeVisible();
    await expect(page.getByText(/motor jur[ií]dico ativo/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /modelos institucionais ativos/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /editar perfil jur[ií]dico/i })).toBeVisible();

    await page.getByRole("link", { name: /voltar aos processos/i }).click();

    await expect(page).toHaveURL(/\/dashboard\/documentos$/);
    await expect(page.getByRole("heading", { name: /reposit[oó]rio de documentos/i })).toBeVisible();
  });
});
