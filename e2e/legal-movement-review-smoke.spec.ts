import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { getPlaywrightCredentials, loginThroughUi } from "./helpers/auth";

const PROCESS_NUMBER = "0000001-11.2026.8.26.0100";

let cachedEnv: Record<string, string> | null = null;

function loadLocalEnv() {
  if (cachedEnv) return cachedEnv;
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    cachedEnv = {};
    return cachedEnv;
  }

  cachedEnv = Object.fromEntries(
    fs.readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      })
  );

  return cachedEnv;
}

function getSupabaseOrigin() {
  const localEnv = loadLocalEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || localEnv.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  return supabaseUrl ? new URL(supabaseUrl).origin : "";
}

async function installEmptyBrainInbox(page: Page) {
  await page.route(/\/api\/brain\/inbox/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pending_count: 0,
        pending_approvals: [],
        recent_approvals: [],
        recent_tasks: [],
        recent_artifacts: [],
        recent_events: [],
      }),
    });
  });
}

test.describe("Legal movement review smoke", () => {
  const credentials = getPlaywrightCredentials();

  test.skip(!credentials.available, "Configure PLAYWRIGHT_EMAIL e PLAYWRIGHT_PASSWORD para rodar os testes autenticados.");

  test("aprova, recupera revisao travada e mostra origem dos prazos", async ({ page }) => {
    test.setTimeout(180_000);

    let approved = false;
    let recovered = false;
    let reviewGetCount = 0;
    const pendingReview = {
      id: "review-pending-e2e",
      created_at: "2026-05-16T10:00:00.000Z",
      status: "review_required",
      numero_cnj: PROCESS_NUMBER,
      tipo_evento: "PRAZO",
      acao_sugerida: "Manifestar-se sobre peticao",
      data_vencimento_extraida: "2026-05-20T00:00:00.000Z",
      confianca_analise: "media",
      origem: "llm",
      motivo: "Exige revisao humana em beta.",
      evidencia: "Intimacao para manifestacao.",
      movimentacao_data: "2026-05-16",
      movimentacao_conteudo: "Intimacao para manifestacao sobre peticao da parte contraria.",
      cliente_nome: "Cliente Juridico E2E",
      tribunal: "TJSP",
    };
    const stuckReview = {
      ...pendingReview,
      id: "review-stuck-e2e",
      status: "approved_processing",
      review_error: "Falha ao finalizar revisao juridica.",
      review_note: "Tentativa anterior",
    };

    await installEmptyBrainInbox(page);
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.includes("/api/brain/inbox")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            pending_count: 0,
            pending_approvals: [],
            recent_approvals: [],
            recent_tasks: [],
            recent_artifacts: [],
            recent_events: [],
          }),
        });
        return;
      }

      if (url.includes("/api/juridico/movement-reviews")) {
        if (route.request().method() === "GET") {
          reviewGetCount += 1;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ok: true,
              reviews: approved ? [] : [pendingReview],
              stuck_reviews: recovered ? [] : [stuckReview],
            }),
          });
          return;
        }

        const body = route.request().postDataJSON() as Record<string, unknown>;
        if (body.decision === "approved") {
          expect(body).toEqual(expect.objectContaining({
            review_id: "review-pending-e2e",
            decision: "approved",
            acao_sugerida: "Protocolar manifestacao revisada E2E",
            data_vencimento_extraida: "2026-05-25",
            note: "Confirmado no smoke E2E.",
          }));
          approved = true;
        } else if (body.decision === "recover") {
          expect(body).toEqual(expect.objectContaining({
            review_id: "review-stuck-e2e",
            decision: "recover",
            note: "Recuperar smoke E2E",
          }));
          recovered = true;
        } else {
          throw new Error(`Decisao inesperada: ${body.decision}`);
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, result: { ok: true } }),
        });
        return;
      }

      await route.fallback();
    });

    await loginThroughUi(page, { browserProfileMode: "ui-harness" });
    const supabaseOrigin = getSupabaseOrigin();
    test.skip(!supabaseOrigin, "Configure NEXT_PUBLIC_SUPABASE_URL para mockar o Supabase REST no smoke de prazos.");

    await page.route(`${supabaseOrigin}/rest/v1/profiles**`, async (route) => {
      const url = route.request().url();
      if (url.includes("select=tenant_id")) {
        await route.fulfill({ status: 200, contentType: "application/vnd.pgrst.object+json", body: JSON.stringify({ tenant_id: "tenant-e2e" }) });
        return;
      }

      if (url.includes("select=id%2Ctenant_id") || url.includes("select=id,tenant_id")) {
        await route.fulfill({
          status: 200,
          contentType: "application/vnd.pgrst.object+json",
          body: JSON.stringify({
            id: "user-e2e",
            tenant_id: "tenant-e2e",
            full_name: "Playwright E2E",
            role: "admin",
            is_active: true,
            avatar_url: null,
            custom_permissions: [],
            email_corporativo: "playwright@example.test",
            oab_registro: null,
            is_superadmin: false,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: "user-e2e", full_name: "Playwright E2E", avatar_url: null, is_active: true }]),
      });
    });

    await page.goto("/dashboard/aprovacoes", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: /Inbox de Aprovações/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Revisão jurídica beta/i })).toBeVisible();
    await page.getByRole("button", { name: /Atualizar inbox/i }).click();
    await expect.poll(() => reviewGetCount, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByText(PROCESS_NUMBER).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Cliente Juridico E2E/i).first()).toBeVisible();

    await page.getByLabel(/Acao revisada/i).fill("Protocolar manifestacao revisada E2E");
    await page.getByLabel(/Vencimento revisado/i).fill("2026-05-25");
    await page.getByLabel(/Nota do revisor/i).fill("Confirmado no smoke E2E.");
    await page.getByRole("button", { name: /Aprovar Prazo\/Card/i }).click();

    await expect(page.getByText(/Nenhuma movimentação jurídica aguardando revisão humana/i)).toBeVisible();

    await expect(page.getByRole("heading", { name: /Revisões travadas/i })).toBeVisible();
    await expect(page.getByText(/Falha ao finalizar revisao juridica/i)).toBeVisible();
    await page.getByLabel(/Motivo da recuperação/i).fill("Recuperar smoke E2E");
    await page.getByRole("button", { name: /Voltar para revisão humana/i }).click();

    await expect(page.getByText(/Nenhuma revisão jurídica travada/i)).toBeVisible();

    let prazosGetCount = 0;
    await page.route(`${supabaseOrigin}/rest/v1/process_prazos**`, async (route) => {
      prazosGetCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "prazo-human-e2e",
            tenant_id: "tenant-e2e",
            monitored_process_id: "proc-human-e2e",
            process_task_id: "task-human-e2e",
            tipo: "prazo",
            descricao: "Prazo revisado por humano E2E",
            data_vencimento: "2026-05-25T00:00:00.000Z",
            status: "pendente",
            responsavel_id: "user-e2e",
            escavador_movimentacao_id: "mov-human-e2e",
            criado_por_ia: true,
            created_at: "2026-05-16T10:00:00.000Z",
            monitored_processes: { numero_processo: PROCESS_NUMBER, partes: { polo_ativo: "Cliente Juridico E2E" }, tribunal: "TJSP", comarca: "SP", resumo_curto: "Processo E2E", cliente_nome: "Cliente Juridico E2E", escavador_monitoramento_id: "monitor-e2e" },
            process_tasks: { id: "task-human-e2e", movimentacoes_timeline: [{ escavador_movimentacao_id: "mov-human-e2e", revisado_por_humano: true }] },
            profiles: { id: "user-e2e", full_name: "Playwright E2E", avatar_url: null },
          },
          {
            id: "prazo-ai-e2e",
            tenant_id: "tenant-e2e",
            monitored_process_id: "proc-ai-e2e",
            process_task_id: "task-ai-e2e",
            tipo: "prazo",
            descricao: "Prazo IA alta confiança E2E",
            data_vencimento: "2026-05-26T00:00:00.000Z",
            status: "pendente",
            responsavel_id: "user-e2e",
            escavador_movimentacao_id: "mov-ai-e2e",
            criado_por_ia: true,
            created_at: "2026-05-16T10:05:00.000Z",
            monitored_processes: { numero_processo: "0000002-11.2026.8.26.0100", partes: { polo_ativo: "Cliente IA E2E" }, tribunal: "TJSP", comarca: "SP", resumo_curto: "Processo IA E2E", cliente_nome: "Cliente IA E2E", escavador_monitoramento_id: "monitor-ai-e2e" },
            process_tasks: { id: "task-ai-e2e", movimentacoes_timeline: [{ escavador_movimentacao_id: "mov-ai-e2e", criado_em: "2026-05-16T10:05:00.000Z" }] },
            profiles: { id: "user-e2e", full_name: "Playwright E2E", avatar_url: null },
          },
          {
            id: "prazo-manual-e2e",
            tenant_id: "tenant-e2e",
            monitored_process_id: "proc-manual-e2e",
            process_task_id: null,
            tipo: "prazo",
            descricao: "Prazo manual sem card E2E",
            data_vencimento: "2026-05-27T00:00:00.000Z",
            status: "pendente",
            responsavel_id: null,
            escavador_movimentacao_id: null,
            criado_por_ia: false,
            created_at: "2026-05-16T10:10:00.000Z",
            monitored_processes: { numero_processo: "0000003-11.2026.8.26.0100", partes: { polo_ativo: "Cliente Manual E2E" }, tribunal: "TJSP", comarca: "SP", resumo_curto: "Processo Manual E2E", cliente_nome: "Cliente Manual E2E", escavador_monitoramento_id: null },
            process_tasks: null,
            profiles: null,
          },
        ]),
      });
    });
    await page.route(`${supabaseOrigin}/rest/v1/process_movimentacoes**`, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }));
    await page.route(`${supabaseOrigin}/rest/v1/process_movimentacoes_inbox**`, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }));
    await page.route(`${supabaseOrigin}/rest/v1/monitored_processes**`, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }));
    await page.route(`${supabaseOrigin}/rest/v1/user_tasks**`, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }));

    await page.goto("/dashboard/operacoes/prazos", { waitUntil: "domcontentloaded" });

    await expect.poll(() => prazosGetCount, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByText(/Prazo revisado por humano E2E/i)).toBeVisible();
    await expect(page.getByText("Revisado por humano", { exact: true })).toBeVisible();
    await expect(page.getByText(/Prazo IA alta confiança E2E/i)).toBeVisible();
    await expect(page.getByText("IA alta confiança", { exact: true })).toBeVisible();
    await expect(page.getByText(/Prazo manual sem card E2E/i)).toBeVisible();
    await expect(page.getByText(/^Manual$/i)).toBeVisible();
    await expect(page.getByText(/^Sem card$/i)).toBeVisible();
    await expect(page.getByText(/Prazo sem card Kanban vinculado/i)).toBeVisible();
  });
});
