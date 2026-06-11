import { expect, test, type Page } from "@playwright/test";
import { getPlaywrightCredentials, loginThroughUi } from "./helpers/auth";

const TASK_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const CASE_BRAIN_TASK_ID = "case-brain-source-gate-e2e";

function json(body: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

function buildVersion(status: "draft" | "approved" = "draft") {
  return {
    id: VERSION_ID,
    source_artifact_id: "artifact-source-gate-e2e",
    source_task_id: TASK_ID,
    source_case_brain_task_id: CASE_BRAIN_TASK_ID,
    version_number: 1,
    workflow_status: status,
    is_current: true,
    piece_type: "contestacao",
    piece_label: "Contestacao Previdenciaria",
    practice_area: "previdenciario",
    summary: "Minuta com fontes pendentes para validar gate e override humano.",
    draft_markdown: "# Contestacao Previdenciaria\n\nTexto com Tema STJ pendente de validacao humana.",
    metadata: {
      used_documents: [{
        name: "contestacao-previdenciaria.pdf",
        web_view_link: "https://drive.google.com/file/d/source-gate-e2e/view",
      }],
      missing_documents: ["CNIS atualizado"],
      pending_validation_count: 2,
      external_validation_gaps: ["Validar Tema STJ antes de citar"],
      warnings: ["Validacao externa pendente de jurisprudencia"],
      source_pack: {
        validated_external_sources: {
          law_references: [{ citation: "Art. 300 do CPC", source_url: "https://www.planalto.gov.br/" }],
          case_law_references: [],
        },
        external_validation_gaps: ["Validar Tema STJ antes de citar"],
      },
      citation_checklist: {
        pending_validations: ["Tema STJ"],
        ready_for_law_citations: false,
        ready_for_case_law_citations: false,
      },
      case_brain_snapshot: {
        summary: "Resumo do Case Brain usado pela minuta aponta fonte externa pendente.",
        high_risk_count: 1,
        high_contradiction_count: 1,
        grounding_gap_count: 2,
        risks: ["Risco de precedente externo pendente"],
        contradictions: ["Divergencia entre CNIS e inicial"],
        gaps: ["Validar Tema STJ antes de publicar"],
        missing_documents: ["PPP atualizado"],
        relevant_unused_documents: ["laudo-medico.pdf"],
      },
      legal_source_gate: {
        action: "approve",
        status: "blocked_pending_override",
        requires_override: true,
      },
      legal_source_gate_premium_publish: {
        override_reason: "Responsavel revisou manualmente fonte pendente antes de export premium.",
        overridden_by: "ui-harness",
      },
    },
    approved_at: status === "approved" ? "2026-06-08T12:30:00.000Z" : null,
    published_at: null,
    created_at: "2026-06-08T12:00:00.000Z",
  };
}

async function installDocumentosMocks(page: Page) {
  let approved = false;
  let overridePayload: Record<string, unknown> | null = null;
  let processTaskRequests = 0;
  let draftVersionRequests = 0;

  await page.route("**/api/documentos/draft-factory/health", async (route) => {
    await route.fulfill(json({
      health: {
        generatedAt: "2026-06-08T12:00:00.000Z",
        counts: { queued: 0, running: 0, completed: 1, failed: 0, staleCompleted: 0 },
        oldestQueuedMinutes: null,
        oldestRunningMinutes: null,
        stuckRunningCount: 0,
        repeatedFailureCount: 0,
        recentFailures: [],
        alerts: [],
      },
    }));
  });

  await page.route(`**/api/documentos/processos/${TASK_ID}/minutas**`, async (route) => {
    draftVersionRequests += 1;
    await route.fulfill(json({ success: true, versions: [buildVersion(approved ? "approved" : "draft")] }));
  });

  await page.route(`**/api/documentos/processos/${TASK_ID}/minutas/${VERSION_ID}**`, async (route) => {
    overridePayload = route.request().postDataJSON() as Record<string, unknown>;
    approved = true;
    await route.fulfill(json({ success: true, version: buildVersion("approved") }));
  });

  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/rest/v1/")) {
      await route.fallback();
      return;
    }

    if (url.includes("/profiles")) {
      await route.fallback();
      return;
    }

    if (url.includes("/process_tasks")) {
      processTaskRequests += 1;
      await route.fulfill(json([{
        id: TASK_ID,
        pipeline_id: "pipeline-source-gate-e2e",
        stage_id: "stage-source-gate-e2e",
        title: "Processo Source Gate E2E",
        client_name: "Cliente Source Gate",
        process_number: "0000001-11.2026.8.26.0100",
        drive_link: "https://drive.google.com/drive/folders/source-gate-e2e",
        drive_folder_id: "drive-source-gate-e2e",
        drive_structure_ready: true,
        created_at: "2026-06-08T11:00:00.000Z",
      }]));
      return;
    }

    if (url.includes("/process_stages")) {
      await route.fulfill(json([{ id: "stage-source-gate-e2e", name: "Contestacao" }]));
      return;
    }

    if (url.includes("/process_pipelines")) {
      await route.fulfill(json([{ id: "pipeline-source-gate-e2e", name: "Contencioso" }]));
      return;
    }

    if (url.includes("/process_document_memory")) {
      await route.fulfill(json([{
        process_task_id: TASK_ID,
        document_count: 1,
        sync_status: "synced",
        last_synced_at: "2026-06-08T11:30:00.000Z",
        summary_master: "Caso com minuta pronta, mas fontes externas pendentes.",
        missing_documents: [],
        case_brain_task_id: CASE_BRAIN_TASK_ID,
        draft_plan_summary: {
          recommended_piece_input: "Contestacao",
          recommended_piece_label: "Contestacao Previdenciaria",
          missing_documents: [],
          first_actions: ["Validar fonte externa antes de aprovar."],
          ready_for_law_citations: false,
          ready_for_case_law_citations: false,
          validated_law_reference_count: 0,
          validated_case_law_reference_count: 0,
          pending_validation_count: 2,
        },
        first_draft_status: "completed",
        first_draft_task_id: "first-draft-source-gate-e2e",
        first_draft_artifact_id: null,
        first_draft_case_brain_task_id: CASE_BRAIN_TASK_ID,
        first_draft_summary: "Primeira minuta aguardando validacao de fontes.",
        first_draft_error: null,
        first_draft_generated_at: "2026-06-08T11:45:00.000Z",
      }]));
      return;
    }

    if (url.includes("/process_documents")) {
      await route.fulfill(json([{
        process_task_id: TASK_ID,
        name: "contestacao-previdenciaria.pdf",
        document_type: "contestacao",
        extraction_status: "completed",
        folder_label: "03-Contestacao",
        web_view_link: "https://drive.google.com/file/d/source-gate-e2e/view",
        modified_at: "2026-06-08T11:25:00.000Z",
      }]));
      return;
    }

    if (url.includes("/system_event_logs") || url.includes("/brain_artifacts")) {
      await route.fulfill(json([]));
      return;
    }

    if (url.includes("/tenant_legal_profiles")) {
      await route.fulfill(json({ metadata: { auto_draft_factory_enabled: false } }));
      return;
    }

    await route.fulfill(json([]));
  });

  return {
    getOverridePayload: () => overridePayload,
    getProcessTaskRequests: () => processTaskRequests,
    getDraftVersionRequests: () => draftVersionRequests,
  };
}

test.describe("Documentos source gate override smoke", () => {
  const credentials = getPlaywrightCredentials();

  test.skip(!credentials.available, "Configure PLAYWRIGHT_EMAIL e PLAYWRIGHT_PASSWORD para rodar os testes autenticados.");

  test("bloqueia aprovacao com fonte pendente ate justificativa humana de override", async ({ page }) => {
    test.setTimeout(180_000);

    const mocks = await installDocumentosMocks(page);
    await loginThroughUi(page, { browserProfileMode: "ui-harness" });

    await page.goto(`/dashboard/documentos?taskId=${TASK_ID}`, { waitUntil: "domcontentloaded" });

    await expect.poll(() => mocks.getProcessTaskRequests(), { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId(`documents-card-${TASK_ID}`)).toBeVisible({ timeout: 60_000 });

    await expect(page.getByTestId("documents-detail-modal")).toBeVisible();
    await expect.poll(() => mocks.getDraftVersionRequests(), { timeout: 30_000 }).toBeGreaterThan(0);
    const sourceGatePanel = page.getByTestId(`documents-source-gate-${VERSION_ID}`);
    const caseBrainPanel = page.getByTestId(`documents-case-brain-evidence-${VERSION_ID}`);
    await expect(sourceGatePanel).toBeVisible({ timeout: 30_000 });
    await expect(caseBrainPanel).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Case Brain da minuta/i)).toBeVisible();
    await expect(page.getByText(new RegExp(`Atual: ${CASE_BRAIN_TASK_ID}`, "i"))).toBeVisible();
    await expect(page.getByText(new RegExp(`Usado: ${CASE_BRAIN_TASK_ID}`, "i"))).toBeVisible();
    await expect(page.getByText(/Resumo do Case Brain usado pela minuta/i)).toBeVisible();
    await expect(page.getByText(/Risco de precedente externo pendente/i)).toBeVisible();
    await expect(page.getByText(/Divergencia entre CNIS e inicial/i)).toBeVisible();
    await expect(page.getByText(/PPP atualizado/i)).toBeVisible();
    await expect(page.getByText(/laudo-medico\.pdf/i)).toBeVisible();
    await expect(page.getByText(/blocked_pending_override/i)).toBeVisible();
    await expect(page.getByText(/Override premium/i)).toBeVisible();
    await expect(page.getByText(/Controle de fontes e override humano/i)).toBeVisible();
    await expect(page.getByText(/Existem 1 lacuna\(s\) externa\(s\) de fonte/i)).toBeVisible();
    await expect(page.getByText(/Validacao externa pendente de jurisprudencia/i)).toBeVisible();
    await expect(page.getByText(/Documentos usados/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /contestacao-previdenciaria\.pdf/i })).toBeVisible();
    await expect(sourceGatePanel.getByText(/Documentos faltantes/i)).toBeVisible();
    await expect(page.getByText(/CNIS atualizado/i)).toBeVisible();
    await expect(page.getByText(/Validacoes pendentes/i)).toBeVisible();
    await expect(page.getByText("Tema STJ", { exact: true })).toBeVisible();
    await expect(page.getByText(/Leis\/sumulas\/temas validados/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Art\. 300 do CPC/i })).toBeVisible();

    const approveButton = page.getByTestId(`documents-approve-version-${VERSION_ID}`);
    await expect(approveButton).toBeDisabled();

    await page.getByTestId(`documents-source-gate-override-reason-${VERSION_ID}`).fill(
      "Responsavel revisou manualmente as fontes pendentes e autoriza o override neste smoke.",
    );

    await expect(approveButton).toBeEnabled();
    await approveButton.click();

    await expect.poll(() => mocks.getOverridePayload(), { timeout: 30_000 }).toEqual(expect.objectContaining({
      action: "approve",
      source_gate_override: true,
      source_gate_override_reason: expect.stringContaining("Responsavel revisou manualmente"),
    }));
  });
});
